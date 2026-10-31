import { createServer, type Server } from "node:http";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { mockDnsLookup, mockEnv } = vi.hoisted(() => ({
  mockDnsLookup: vi.fn(),
  mockEnv: { WEBHOOK_ALLOW_PRIVATE_URLS: false },
}));

vi.mock("node:dns", () => ({ lookup: mockDnsLookup }));

vi.mock("~/env", () => ({ env: mockEnv }));

import {
  assertOutboundUrlAllowed,
  fetchOutbound,
  isNonPublicIpAddress,
  OutboundUrlNotAllowedError,
  publicOnlyLookup,
} from "~/server/utils/outbound-url-guard";

const publicAddress = { address: "93.184.216.34", family: 4 };

function resolveTo(...addresses: Array<{ address: string; family: number }>) {
  mockDnsLookup.mockImplementation(
    (_hostname: string, _options: unknown, callback: Function) =>
      callback(null, addresses),
  );
}

beforeEach(() => {
  mockEnv.WEBHOOK_ALLOW_PRIVATE_URLS = false;
  resolveTo(publicAddress);
});

describe("isNonPublicIpAddress", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fec0::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "2001:db8::1",
    "not-an-address",
  ])("treats %s as non-public", (address) => {
    expect(isNonPublicIpAddress(address)).toBe(true);
  });

  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "172.32.0.1",
    "192.88.100.1",
    "2606:4700:10::6814:179a",
    "::ffff:93.184.216.34",
    "2001:4860:4860::8888",
  ])("treats %s as public", (address) => {
    expect(isNonPublicIpAddress(address)).toBe(false);
  });
});

describe("assertOutboundUrlAllowed", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a non-http scheme", async () => {
    await expect(
      assertOutboundUrlAllowed("file:///etc/passwd"),
    ).rejects.toThrow(OutboundUrlNotAllowedError);
  });

  it("rejects an unparsable URL", async () => {
    await expect(assertOutboundUrlAllowed("not a url")).rejects.toThrow(
      OutboundUrlNotAllowedError,
    );
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://127.0.0.1:3000/admin",
    "http://10.0.0.5/hook",
    "http://[::1]:3000/hook",
    "http://[::ffff:169.254.169.254]/latest/meta-data/",
    "http://192.88.99.1/hook",
    "http://[fec0::1]/hook",
    "http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/hook",
  ])("rejects the internal target %s", async (url) => {
    await expect(assertOutboundUrlAllowed(url)).rejects.toThrow(
      OutboundUrlNotAllowedError,
    );
    expect(mockDnsLookup).not.toHaveBeenCalled();
  });

  it("rejects a hostname that resolves to a private address", async () => {
    resolveTo({ address: "10.0.0.5", family: 4 });

    await expect(
      assertOutboundUrlAllowed("https://hooks.internal.example.com/event"),
    ).rejects.toThrow(OutboundUrlNotAllowedError);
  });

  it("rejects a hostname when any resolved address is private", async () => {
    resolveTo(publicAddress, { address: "169.254.169.254", family: 4 });

    await expect(
      assertOutboundUrlAllowed("https://hooks.example.com/event"),
    ).rejects.toThrow(OutboundUrlNotAllowedError);
  });

  it("allows a hostname that resolves to public addresses", async () => {
    await expect(
      assertOutboundUrlAllowed("https://hooks.example.com/event"),
    ).resolves.toBeUndefined();
  });

  it("allows a public address literal", async () => {
    await expect(
      assertOutboundUrlAllowed("https://93.184.216.34/hook"),
    ).resolves.toBeUndefined();
  });

  it("does not reject when the lookup fails", async () => {
    mockDnsLookup.mockImplementation(
      (_hostname: string, _options: unknown, callback: Function) =>
        callback(Object.assign(new Error("EAI_AGAIN"), { code: "EAI_AGAIN" })),
    );

    await expect(
      assertOutboundUrlAllowed("https://hooks.example.com/event"),
    ).resolves.toBeUndefined();
  });

  it("does not wait forever for a slow lookup", async () => {
    vi.useFakeTimers();
    mockDnsLookup.mockImplementation(() => undefined);

    const result = assertOutboundUrlAllowed("https://hooks.example.com/event");
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(result).resolves.toBeUndefined();
  });

  it("allows internal targets when private addresses are allowed", async () => {
    mockEnv.WEBHOOK_ALLOW_PRIVATE_URLS = true;
    resolveTo({ address: "172.18.0.4", family: 4 });

    await expect(
      assertOutboundUrlAllowed("http://169.254.169.254/latest/meta-data/"),
    ).resolves.toBeUndefined();
    await expect(
      assertOutboundUrlAllowed("http://n8n:5678/webhook"),
    ).resolves.toBeUndefined();
    await expect(assertOutboundUrlAllowed("ftp://n8n/")).rejects.toThrow(
      OutboundUrlNotAllowedError,
    );
  });
});

describe("publicOnlyLookup", () => {
  function runLookup(options: { all?: boolean }) {
    return new Promise<{ error: unknown; address: unknown; family: unknown }>(
      (resolve) =>
        publicOnlyLookup(
          "hooks.example.com",
          options,
          (error, address, family) => resolve({ error, address, family }),
        ),
    );
  }

  it("returns the checked address", async () => {
    await expect(runLookup({})).resolves.toEqual({
      error: null,
      address: publicAddress.address,
      family: 4,
    });
    await expect(runLookup({ all: true })).resolves.toMatchObject({
      error: null,
      address: [publicAddress],
    });
  });

  it("refuses a hostname that resolves to a private address", async () => {
    resolveTo({ address: "127.0.0.1", family: 4 });

    const { error } = await runLookup({});
    expect(error).toBeInstanceOf(OutboundUrlNotAllowedError);
  });
});

describe("fetchOutbound", () => {
  let server: Server;
  let port = 0;
  let received: Array<{ method?: string; body: string }> = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        received.push({ method: request.method, body });
        if (request.url === "/redirect") {
          response.statusCode = 302;
          response.setHeader("Location", "http://169.254.169.254/");
          response.end();
          return;
        }
        response.statusCode = 200;
        response.setHeader("content-type", "text/plain");
        response.end("ok");
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    received = [];
  });

  it("refuses a loopback literal without a lookup", async () => {
    await expect(
      fetchOutbound(`http://127.0.0.1:${port}/`, { method: "GET" }),
    ).rejects.toThrow(OutboundUrlNotAllowedError);

    expect(mockDnsLookup).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("refuses at connect time a hostname that resolves to loopback", async () => {
    resolveTo({ address: "127.0.0.1", family: 4 });

    await expect(
      fetchOutbound(`http://hooks.example.com:${port}/`, { method: "GET" }),
    ).rejects.toThrow(OutboundUrlNotAllowedError);

    expect(mockDnsLookup).toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("refuses a hostname that rebinds to loopback after the save-time check", async () => {
    await assertOutboundUrlAllowed(`http://hooks.example.com:${port}/`);
    resolveTo({ address: "127.0.0.1", family: 4 });

    await expect(
      fetchOutbound(`http://hooks.example.com:${port}/`, { method: "GET" }),
    ).rejects.toThrow(OutboundUrlNotAllowedError);

    expect(received).toHaveLength(0);
  });

  it("lets the request signal cut short a hanging lookup", async () => {
    mockDnsLookup.mockImplementation(() => undefined);

    const error = await fetchOutbound(`http://hooks.example.com:${port}/`, {
      method: "GET",
      signal: AbortSignal.timeout(50),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(OutboundUrlNotAllowedError);
    expect(mockDnsLookup).toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("reaches internal targets when private addresses are allowed", async () => {
    mockEnv.WEBHOOK_ALLOW_PRIVATE_URLS = true;

    const response = await fetchOutbound(`http://127.0.0.1:${port}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"hello":"world"}',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    await expect(response.text()).resolves.toBe("ok");
    expect(received).toEqual([{ method: "POST", body: '{"hello":"world"}' }]);
  });

  it("does not follow redirects", async () => {
    mockEnv.WEBHOOK_ALLOW_PRIVATE_URLS = true;

    const response = await fetchOutbound(`http://127.0.0.1:${port}/redirect`, {
      method: "GET",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://169.254.169.254/");
    expect(received).toHaveLength(1);
  });
});
