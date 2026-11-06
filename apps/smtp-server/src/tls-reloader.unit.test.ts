import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { connect as netConnect, AddressInfo, Socket } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { connect as tlsConnect } from "tls";
import { SMTPServer } from "smtp-server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TLS_RELOAD_INTERVAL_MS,
  EXPIRY_WARNING_WINDOW_MS,
  MIN_TLS_RELOAD_INTERVAL_MS,
  TlsReloader,
  certificateExpiry,
  expiryWarning,
  parseReloadInterval,
} from "./tls-reloader";

// Static self-signed EC P-256 test pairs (CN=test-a/test-b.usesend.invalid),
// valid until 2126. Node can't mint X.509 certificates on its own and the repo
// has no cert-generation dependency, so these are committed as fixtures.
const FIXTURES = join(__dirname, "__fixtures__", "tls");
const pairA = {
  key: readFileSync(join(FIXTURES, "key-a.pem")),
  cert: readFileSync(join(FIXTURES, "cert-a.pem")),
};
const pairB = {
  key: readFileSync(join(FIXTURES, "key-b.pem")),
  cert: readFileSync(join(FIXTURES, "cert-b.pem")),
};
const DAY = 24 * 60 * 60 * 1000;

function makeLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeServer() {
  return { updateSecureContext: vi.fn() };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "usesend-tls-"));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Mimics certbot: live/{privkey,fullchain}.pem are relative symlinks into
 * archive/{privkeyN,fullchainN}.pem.
 */
function certbotLayout(initial: { key: Buffer; cert: Buffer }) {
  const live = join(dir, "live", "smtp.example.com");
  const archive = join(dir, "archive", "smtp.example.com");
  mkdirSync(live, { recursive: true });
  mkdirSync(archive, { recursive: true });
  writeFileSync(join(archive, "privkey1.pem"), initial.key);
  writeFileSync(join(archive, "fullchain1.pem"), initial.cert);
  const keyPath = join(live, "privkey.pem");
  const certPath = join(live, "fullchain.pem");
  symlinkSync("../../archive/smtp.example.com/privkey1.pem", keyPath);
  symlinkSync("../../archive/smtp.example.com/fullchain1.pem", certPath);

  const renew = (n: number, pair: { key: Buffer; cert: Buffer }) => {
    writeFileSync(join(archive, `privkey${n}.pem`), pair.key);
    writeFileSync(join(archive, `fullchain${n}.pem`), pair.cert);
    // Atomically repoint the symlinks, as certbot does.
    for (const [name, target] of [
      ["privkey.pem", `privkey${n}.pem`],
      ["fullchain.pem", `fullchain${n}.pem`],
    ]) {
      const tmp = join(live, `${name}.tmp`);
      symlinkSync(`../../archive/smtp.example.com/${target}`, tmp);
      renameSync(tmp, join(live, name));
    }
  };

  return { keyPath, certPath, renew };
}

function plainFiles(pair: { key: Buffer; cert: Buffer }) {
  const keyPath = join(dir, "key.pem");
  const certPath = join(dir, "cert.pem");
  writeFileSync(keyPath, pair.key);
  writeFileSync(certPath, pair.cert);
  return { keyPath, certPath };
}

describe("TlsReloader.check", () => {
  it("does not reload when the content is unchanged", () => {
    const { keyPath, certPath } = plainFiles(pairA);
    const server = makeServer();
    const logger = makeLogger();
    const reloader = new TlsReloader({
      keyPath,
      certPath,
      initial: pairA,
      servers: [server],
      logger,
    });

    // Rewriting identical bytes (new mtime) must not count as a change.
    writeFileSync(certPath, pairA.cert);
    expect(reloader.check()).toBe("unchanged");
    expect(server.updateSecureContext).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("reloads every server when the content changes, and logs the new expiry", () => {
    const { keyPath, certPath } = plainFiles(pairA);
    const servers = [makeServer(), makeServer(), makeServer()];
    const logger = makeLogger();
    const reloader = new TlsReloader({
      keyPath,
      certPath,
      initial: pairA,
      servers,
      logger,
    });
    logger.log.mockClear();

    writeFileSync(keyPath, pairB.key);
    writeFileSync(certPath, pairB.cert);

    expect(reloader.check()).toBe("reloaded");
    for (const server of servers) {
      expect(server.updateSecureContext).toHaveBeenCalledTimes(1);
      const arg = server.updateSecureContext.mock.calls[0][0];
      expect(arg.key.equals(pairB.key)).toBe(true);
      expect(arg.cert.equals(pairB.cert)).toBe(true);
    }
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0][0]).toContain(
      certificateExpiry(pairB.cert).toISOString(),
    );

    // A second poll sees nothing new.
    expect(reloader.check()).toBe("unchanged");
    expect(servers[0].updateSecureContext).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it("picks up a certbot-style symlink swap to new archive files", () => {
    const { keyPath, certPath, renew } = certbotLayout(pairA);
    const server = makeServer();
    const reloader = new TlsReloader({
      keyPath,
      certPath,
      initial: pairA,
      servers: [server],
      logger: makeLogger(),
    });

    expect(reloader.check()).toBe("unchanged");

    renew(2, pairB);
    expect(reloader.check()).toBe("reloaded");
    expect(
      server.updateSecureContext.mock.calls[0][0].cert.equals(pairB.cert),
    ).toBe(true);

    // The old archive files are untouched, but the live symlinks moved again.
    renew(3, pairA);
    expect(reloader.check()).toBe("reloaded");
    expect(server.updateSecureContext).toHaveBeenCalledTimes(2);
  });

  it("rejects a mismatched key/cert pair and keeps the current certificate", () => {
    const { keyPath, certPath } = plainFiles(pairA);
    const server = makeServer();
    const logger = makeLogger();
    const reloader = new TlsReloader({
      keyPath,
      certPath,
      initial: pairA,
      servers: [server],
      logger,
    });

    // Renewal caught halfway: new cert, old key.
    writeFileSync(certPath, pairB.cert);
    expect(reloader.check()).toBe("failed");
    expect(server.updateSecureContext).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);

    // Once the key lands too, the next poll applies the pair.
    writeFileSync(keyPath, pairB.key);
    expect(reloader.check()).toBe("reloaded");
    expect(server.updateSecureContext).toHaveBeenCalledTimes(1);
  });

  it("rejects unreadable or garbage files and keeps the current certificate", () => {
    const { keyPath, certPath } = plainFiles(pairA);
    const server = makeServer();
    const logger = makeLogger();
    const reloader = new TlsReloader({
      keyPath,
      certPath,
      initial: pairA,
      servers: [server],
      logger,
    });

    rmSync(keyPath);
    expect(reloader.check()).toBe("failed");

    writeFileSync(keyPath, pairA.key);
    writeFileSync(certPath, "-----BEGIN CERTIFICATE-----\ntruncated");
    expect(reloader.check()).toBe("failed");

    expect(server.updateSecureContext).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(2);

    // Restoring the original content is "unchanged", not a reload.
    writeFileSync(certPath, pairA.cert);
    expect(reloader.check()).toBe("unchanged");
  });

  it("retries on the next poll if applying to a server throws", () => {
    const { keyPath, certPath } = plainFiles(pairA);
    const flaky = makeServer();
    flaky.updateSecureContext.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const reloader = new TlsReloader({
      keyPath,
      certPath,
      initial: pairA,
      servers: [flaky],
      logger: makeLogger(),
    });

    writeFileSync(keyPath, pairB.key);
    writeFileSync(certPath, pairB.cert);
    expect(reloader.check()).toBe("failed");
    expect(reloader.check()).toBe("reloaded");
    expect(flaky.updateSecureContext).toHaveBeenCalledTimes(2);
  });
});

describe("expiry warnings", () => {
  const validTo = certificateExpiry(pairA.cert);

  it("expiryWarning only fires inside the 14-day window", () => {
    expect(expiryWarning(validTo, new Date(validTo.getTime() - 15 * DAY))).toBeNull();
    expect(
      expiryWarning(validTo, new Date(validTo.getTime() - 13 * DAY)),
    ).toContain("expires in 13 day(s)");
    expect(expiryWarning(validTo, new Date(validTo.getTime() + 1000))).toContain(
      "EXPIRED",
    );
    expect(EXPIRY_WARNING_WINDOW_MS).toBe(14 * DAY);
  });

  it("warns at startup and on each poll when the cert is about to expire", () => {
    const { keyPath, certPath } = plainFiles(pairA);
    const logger = makeLogger();
    const reloader = new TlsReloader({
      keyPath,
      certPath,
      initial: pairA,
      servers: [makeServer()],
      logger,
      now: () => new Date(validTo.getTime() - 3 * DAY),
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);

    reloader.check();
    reloader.check();
    expect(logger.warn).toHaveBeenCalledTimes(3);
  });

  it("does not warn when the cert is far from expiry", () => {
    const { keyPath, certPath } = plainFiles(pairA);
    const logger = makeLogger();
    const reloader = new TlsReloader({
      keyPath,
      certPath,
      initial: pairA,
      servers: [makeServer()],
      logger,
      now: () => new Date(validTo.getTime() - 60 * DAY),
    });
    reloader.check();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe("polling timer", () => {
  it("polls on the interval and stops cleanly", () => {
    vi.useFakeTimers();
    const { keyPath, certPath } = plainFiles(pairA);
    const server = makeServer();
    const reloader = new TlsReloader({
      keyPath,
      certPath,
      initial: pairA,
      servers: [server],
      intervalMs: 60_000,
      logger: makeLogger(),
    });
    reloader.start();

    copyFileSync(join(FIXTURES, "key-b.pem"), keyPath);
    copyFileSync(join(FIXTURES, "cert-b.pem"), certPath);
    vi.advanceTimersByTime(59_999);
    expect(server.updateSecureContext).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(server.updateSecureContext).toHaveBeenCalledTimes(1);

    reloader.stop();
    writeFileSync(keyPath, pairA.key);
    writeFileSync(certPath, pairA.cert);
    vi.advanceTimersByTime(10 * 60_000);
    expect(server.updateSecureContext).toHaveBeenCalledTimes(1);
  });

  it("parseReloadInterval applies the default and the minimum", () => {
    const logger = makeLogger();
    expect(parseReloadInterval(undefined, logger)).toBe(
      DEFAULT_TLS_RELOAD_INTERVAL_MS,
    );
    expect(parseReloadInterval("", logger)).toBe(DEFAULT_TLS_RELOAD_INTERVAL_MS);
    expect(parseReloadInterval("120000", logger)).toBe(120_000);
    expect(parseReloadInterval("abc", logger)).toBe(
      DEFAULT_TLS_RELOAD_INTERVAL_MS,
    );
    expect(parseReloadInterval("5", logger)).toBe(MIN_TLS_RELOAD_INTERVAL_MS);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});

// End-to-end against real smtp-server instances: new connections must see the
// reloaded certificate on both implicit TLS and STARTTLS listeners.
describe("with real SMTPServer instances", () => {
  const started: SMTPServer[] = [];

  afterEach(async () => {
    await Promise.all(
      started.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))),
    );
  });

  async function listen(secure: boolean) {
    const server = new SMTPServer({
      secure,
      key: pairA.key,
      cert: pairA.cert,
      logger: false,
      authOptional: true,
    });
    started.push(server);
    // The test clients hang up right after the handshake; ignore those errors.
    server.on("error", () => {});
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    return {
      server,
      port: ((server as any).server.address() as AddressInfo).port as number,
    };
  }

  function implicitTlsCN(port: number) {
    return new Promise<string>((resolve, reject) => {
      const socket = tlsConnect(
        { host: "127.0.0.1", port, rejectUnauthorized: false },
        () => {
          const cn = socket.getPeerCertificate().subject.CN as string;
          socket.destroy();
          resolve(cn);
        },
      );
      socket.on("error", reject);
    });
  }

  function startTlsCN(port: number) {
    return new Promise<string>((resolve, reject) => {
      const raw: Socket = netConnect(port, "127.0.0.1");
      let buffer = "";
      let stage = 0;
      raw.on("error", reject);
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        if (!buffer.endsWith("\r\n")) return;
        const lastLine = buffer.trimEnd().split("\r\n").pop() ?? "";
        buffer = "";
        if (/^\d{3}-/.test(lastLine)) return;
        if (stage === 0) {
          stage = 1;
          raw.write("EHLO test\r\n");
        } else if (stage === 1) {
          stage = 2;
          raw.write("STARTTLS\r\n");
        } else if (stage === 2) {
          raw.off("data", onData);
          const socket = tlsConnect(
            { socket: raw, rejectUnauthorized: false },
            () => {
              const cn = socket.getPeerCertificate().subject.CN as string;
              socket.destroy();
              resolve(cn);
            },
          );
          socket.on("error", reject);
        }
      };
      raw.on("data", onData);
    });
  }

  it("serves the renewed certificate to new implicit TLS and STARTTLS connections", async () => {
    const { keyPath, certPath, renew } = certbotLayout(pairA);
    const implicit = await listen(true);
    const starttls = await listen(false);
    const reloader = new TlsReloader({
      keyPath,
      certPath,
      initial: pairA,
      servers: [implicit.server, starttls.server],
      logger: makeLogger(),
    });

    expect(await implicitTlsCN(implicit.port)).toBe("test-a.usesend.invalid");
    expect(await startTlsCN(starttls.port)).toBe("test-a.usesend.invalid");

    renew(2, pairB);
    expect(reloader.check()).toBe("reloaded");

    expect(await implicitTlsCN(implicit.port)).toBe("test-b.usesend.invalid");
    expect(await startTlsCN(starttls.port)).toBe("test-b.usesend.invalid");
  });
});
