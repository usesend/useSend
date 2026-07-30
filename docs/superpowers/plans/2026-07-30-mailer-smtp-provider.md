# Mailer Provider Abstraction + Outbound SMTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an outbound SMTP transport and an env-driven direct SES transport to `mailer.ts` platform notifications, selected by an explicit `MAILER_PROVIDER` flag, with full backward compatibility when unset.

**Architecture:** Extract a `MailerTransport` interface behind which `ses` / `smtp` / `usesend` / legacy-self-hosted implementations live. `sendMail` resolves one transport via `MAILER_PROVIDER` and delegates. Transports are config-injected (constructor deps) so they are unit-testable in isolation without env or module mocking; `resolveMailerTransport` is a pure function over `(provider, isCloud)`.

**Tech Stack:** TypeScript, Next.js (`apps/web`), `@aws-sdk/client-sesv2`, `nodemailer`, `usesend-js`, `vitest`, `@t3-oss/env-nextjs` + `zod`.

## Global Constraints

- Env-driven and mode-agnostic: `ses`/`smtp`/`usesend` work in any mode; only the unset default branches on mode.
- Backward compatibility: `MAILER_PROVIDER` unset keeps exact current behavior (self-hosted → legacy team-based SES path; cloud → useSend API).
- SMTP env vars use the `MAILER_SMTP_` prefix to avoid collision with the existing `SMTP_HOST` / `SMTP_USER` (inbound tenant proxy).
- No database migration; no Prisma schema change.
- Unit tests only (no infra). Test file convention: `*.unit.test.ts`, matched by `vitest.unit.config.ts` (`src/**/*.unit.test.ts`).
- Test defaults are cloud mode (`NEXT_PUBLIC_IS_CLOUD=true` in `src/test/setup/setup-env.ts`).
- Imports: always top-level, no dynamic imports. Web imports use the `~/` alias for `src`.
- Run a single unit test file: `pnpm --filter=web test:unit <path-under-apps/web>`.
- Conventional Commits (`feat:`, `fix:`, etc.). Never run build/migration commands unless asked.

---

## File Structure

New (`apps/web/src/server/mailer/providers/`):
- `types.ts` — `MailerSendOptions` + `MailerTransport` interfaces.
- `ses.ts` — `SesMailerTransport` (direct SES via injected `getSesClient` + nodemailer `streamTransport`).
- `smtp.ts` — `SmtpMailerTransport` (nodemailer SMTP via injected `createTransport`).
- `usesend.ts` — `UseSendMailerTransport` (useSend HTTP API via injected client).
- `legacy-ses.ts` — `LegacySesTransport` (verbatim move of the current self-hosted `sendMail` path).
- `resolve.ts` — `resolveMailerTransport(provider, isCloud)` (pure) + `getMailerTransport()` (cached) + test reset helper.
- `ses.unit.test.ts`, `smtp.unit.test.ts`, `usesend.unit.test.ts`, `legacy-ses.unit.test.ts`, `resolve.unit.test.ts`.

Modified:
- `apps/web/src/env.js` — add `MAILER_PROVIDER` + `MAILER_SMTP_*` to server schema and `runtimeEnv`.
- `apps/web/src/server/aws/ses.ts` — `export` the existing `getSesClient` (one keyword) so `resolve.ts` can reuse it.
- `apps/web/src/server/mailer.ts` — `sendMail` delegates to `getMailerTransport()`; drop now-unused imports; high-level functions unchanged. New `mailer.unit.test.ts`.

Optional (deploy config, not required for the code change):
- `docker/prod/compose.saas.yml` + `docker/prod/.env.example-saas` — expose `MAILER_PROVIDER` + `MAILER_SMTP_*`.

---

### Task 1: MailerTransport interface + SES transport

**Files:**
- Create: `apps/web/src/server/mailer/providers/types.ts`
- Create: `apps/web/src/server/mailer/providers/ses.ts`
- Test: `apps/web/src/server/mailer/providers/ses.unit.test.ts`

**Interfaces:**
- Produces: `MailerSendOptions` and `MailerTransport` in `types.ts` (consumed by every later task); `SesMailerTransport` class in `ses.ts` with constructor `new SesMailerTransport({ getSesClient, createTransport, region, fromDefault })` and `send(opts: MailerSendOptions): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/mailer/providers/ses.unit.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { SesMailerTransport } from "~/server/mailer/providers/ses";

function fakeMessage(...chunks: Buffer[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

describe("SesMailerTransport", () => {
  it("sends raw email via SES client with resolved from", async () => {
    const send = vi.fn().mockResolvedValue({});
    const getSesClient = vi.fn(() => ({ send }));
    const sendMail = vi
      .fn()
      .mockResolvedValue({ message: fakeMessage(Buffer.from("RAW")) });
    const createTransport = vi.fn(() => ({ sendMail }));

    const transport = new SesMailerTransport({
      getSesClient,
      createTransport,
      region: "us-east-1",
      fromDefault: "hello@example.com",
    });

    await transport.send({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "<b>h</b>",
    });

    expect(createTransport).toHaveBeenCalledWith({ streamTransport: true });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "hello@example.com", to: "to@x.com" }),
    );
    expect(getSesClient).toHaveBeenCalledWith("us-east-1");
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(SendEmailCommand);
    expect((command as SendEmailCommand).input.Content?.Raw?.Data).toBeInstanceOf(
      Buffer,
    );
  });

  it("uses fromOverride when provided", async () => {
    const sendMail = vi
      .fn()
      .mockResolvedValue({ message: fakeMessage(Buffer.from("R")) });
    const transport = new SesMailerTransport({
      getSesClient: () => ({ send: vi.fn().mockResolvedValue({}) }),
      createTransport: () => ({ sendMail }),
      region: "us-east-1",
      fromDefault: "hello@example.com",
    });

    await transport.send({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "h",
      fromOverride: "other@example.com",
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "other@example.com" }),
    );
  });

  it("throws when no from address is available", async () => {
    const transport = new SesMailerTransport({
      getSesClient: () => ({ send: vi.fn() }),
      createTransport: () => ({ sendMail: vi.fn() }),
      region: "us-east-1",
    });

    await expect(
      transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" }),
    ).rejects.toThrow("FROM_EMAIL is required for mailer");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=web test:unit src/server/mailer/providers/ses.unit.test.ts`
Expected: FAIL — `Cannot find module '~/server/mailer/providers/ses'`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/server/mailer/providers/types.ts`:
```ts
export interface MailerSendOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  fromOverride?: string;
}

export interface MailerTransport {
  send(opts: MailerSendOptions): Promise<void>;
}
```

`apps/web/src/server/mailer/providers/ses.ts`:
```ts
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { MailerSendOptions, MailerTransport } from "./types";

interface SesSender {
  send(command: SendEmailCommand): Promise<unknown>;
}

interface SesMailerConfig {
  getSesClient: (region: string) => SesSender;
  createTransport: (opts: { streamTransport: boolean }) => {
    sendMail: (mail: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
      replyTo?: string;
    }) => Promise<{ message: AsyncIterable<Buffer | string> }>;
  };
  region: string;
  fromDefault?: string;
}

export class SesMailerTransport implements MailerTransport {
  constructor(private readonly cfg: SesMailerConfig) {}

  async send({
    to,
    subject,
    text,
    html,
    replyTo,
    fromOverride,
  }: MailerSendOptions): Promise<void> {
    const from = fromOverride ?? this.cfg.fromDefault;
    if (!from) {
      throw new Error("FROM_EMAIL is required for mailer");
    }

    const { message } = await this.cfg
      .createTransport({ streamTransport: true })
      .sendMail({ from, to, subject, text, html, replyTo });

    const chunks: Buffer[] = [];
    for await (const chunk of message) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const data = Buffer.concat(chunks);

    await this.cfg
      .getSesClient(this.cfg.region)
      .send(new SendEmailCommand({ Content: { Raw: { Data: data } } }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter=web test:unit src/server/mailer/providers/ses.unit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mailer/providers/types.ts apps/web/src/server/mailer/providers/ses.ts apps/web/src/server/mailer/providers/ses.unit.test.ts
git commit -m "feat(mail): add SES mailer transport"
```

---

### Task 2: SMTP transport

**Files:**
- Create: `apps/web/src/server/mailer/providers/smtp.ts`
- Test: `apps/web/src/server/mailer/providers/smtp.unit.test.ts`

**Interfaces:**
- Consumes: `MailerSendOptions`, `MailerTransport` from `./types`.
- Produces: `SmtpMailerTransport` with constructor `new SmtpMailerTransport({ createTransport, host, port, secure, user?, pass?, fromDefault? })` and `send(opts)`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/mailer/providers/smtp.unit.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { SmtpMailerTransport } from "~/server/mailer/providers/smtp";

describe("SmtpMailerTransport", () => {
  it("creates transport with host/port/secure/auth and sends", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const createTransport = vi.fn(() => ({ sendMail }));

    const transport = new SmtpMailerTransport({
      createTransport,
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "u",
      pass: "p",
      fromDefault: "hello@example.com",
    });

    await transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: { user: "u", pass: "p" },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "hello@example.com", to: "to@x.com" }),
    );
  });

  it("omits auth when no user provided", async () => {
    const createTransport = vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({}),
    }));

    const transport = new SmtpMailerTransport({
      createTransport,
      host: "h",
      port: 587,
      secure: false,
      fromDefault: "hello@example.com",
    });

    await transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: undefined }),
    );
  });

  it("throws when no from address is available", async () => {
    const transport = new SmtpMailerTransport({
      createTransport: () => ({ sendMail: vi.fn() }),
      host: "h",
      port: 587,
      secure: false,
    });

    await expect(
      transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" }),
    ).rejects.toThrow("FROM_EMAIL is required for mailer");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=web test:unit src/server/mailer/providers/smtp.unit.test.ts`
Expected: FAIL — `Cannot find module '~/server/mailer/providers/smtp'`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/server/mailer/providers/smtp.ts`:
```ts
import type { MailerSendOptions, MailerTransport } from "./types";

interface SmtpTransporter {
  sendMail(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
  }): Promise<unknown>;
}

interface SmtpMailerConfig {
  createTransport: (opts: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  }) => SmtpTransporter;
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromDefault?: string;
}

export class SmtpMailerTransport implements MailerTransport {
  private readonly transporter: SmtpTransporter;

  constructor(private readonly cfg: SmtpMailerConfig) {
    this.transporter = cfg.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
    });
  }

  async send({
    to,
    subject,
    text,
    html,
    replyTo,
    fromOverride,
  }: MailerSendOptions): Promise<void> {
    const from = fromOverride ?? this.cfg.fromDefault;
    if (!from) {
      throw new Error("FROM_EMAIL is required for mailer");
    }
    await this.transporter.sendMail({ from, to, subject, text, html, replyTo });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter=web test:unit src/server/mailer/providers/smtp.unit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mailer/providers/smtp.ts apps/web/src/server/mailer/providers/smtp.unit.test.ts
git commit -m "feat(mail): add SMTP mailer transport"
```

---

### Task 3: UseSend transport

**Files:**
- Create: `apps/web/src/server/mailer/providers/usesend.ts`
- Test: `apps/web/src/server/mailer/providers/usesend.unit.test.ts`

**Interfaces:**
- Consumes: `MailerSendOptions`, `MailerTransport` from `./types`.
- Produces: `UseSendMailerTransport` with constructor `new UseSendMailerTransport({ client, fromDefault? })` and `send(opts)`. `client.emails.send(args)` returns `{ data?, error? }`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/mailer/providers/usesend.unit.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { UseSendMailerTransport } from "~/server/mailer/providers/usesend";

describe("UseSendMailerTransport", () => {
  it("sends via useSend client with resolved from", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "1" } });

    const transport = new UseSendMailerTransport({
      client: { emails: { send } },
      fromDefault: "hello@example.com",
    });

    await transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "to@x.com", from: "hello@example.com" }),
    );
  });

  it("throws on useSend failure with error details", async () => {
    const send = vi.fn().mockResolvedValue({
      error: { code: "ERR", message: "boom" },
    });

    const transport = new UseSendMailerTransport({
      client: { emails: { send } },
      fromDefault: "hello@example.com",
    });

    await expect(
      transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" }),
    ).rejects.toThrow(/boom/);
  });

  it("throws when no from address is available", async () => {
    const transport = new UseSendMailerTransport({
      client: { emails: { send: vi.fn() } },
    });

    await expect(
      transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" }),
    ).rejects.toThrow("FROM_EMAIL is required for mailer");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=web test:unit src/server/mailer/providers/usesend.unit.test.ts`
Expected: FAIL — `Cannot find module '~/server/mailer/providers/usesend'`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/server/mailer/providers/usesend.ts`:
```ts
import type { MailerSendOptions, MailerTransport } from "./types";

interface UseSendSendResponse {
  data?: unknown;
  error?: { code?: string; message?: string };
}

interface UseSendMailerConfig {
  client: {
    emails: {
      send: (args: {
        to: string;
        from: string;
        subject: string;
        text: string;
        html: string;
        replyTo?: string;
      }) => Promise<UseSendSendResponse>;
    };
  };
  fromDefault?: string;
}

export class UseSendMailerTransport implements MailerTransport {
  constructor(private readonly cfg: UseSendMailerConfig) {}

  async send({
    to,
    subject,
    text,
    html,
    replyTo,
    fromOverride,
  }: MailerSendOptions): Promise<void> {
    const from = fromOverride ?? this.cfg.fromDefault;
    if (!from) {
      throw new Error("FROM_EMAIL is required for mailer");
    }

    const resp = await this.cfg.client.emails.send({
      to,
      from,
      subject,
      text,
      html,
      replyTo,
    });

    if (!resp.data) {
      throw new Error(
        `useSend mailer failed: ${resp.error?.code ?? ""} ${resp.error?.message ?? ""}`.trim(),
      );
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter=web test:unit src/server/mailer/providers/usesend.unit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mailer/providers/usesend.ts apps/web/src/server/mailer/providers/usesend.unit.test.ts
git commit -m "feat(mail): add useSend mailer transport"
```

---

### Task 4: Legacy SES transport (move current self-hosted path)

**Files:**
- Create: `apps/web/src/server/mailer/providers/legacy-ses.ts`
- Test: `apps/web/src/server/mailer/providers/legacy-ses.unit.test.ts`

**Interfaces:**
- Consumes: `MailerSendOptions`, `MailerTransport` from `./types`; `env`, `db`, `getDomains`, `sendEmail`, `logger`.
- Produces: `LegacySesTransport` (no constructor args) with `send(opts)`. Reproduces the current self-hosted `sendMail` block verbatim (team lookup, domain matching, `sendEmail`), including the no-throw-on-missing-team/domain behavior (logs and returns).

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/mailer/providers/legacy-ses.unit.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGetDomains, mockSendEmail, mockLogger, mockEnv } =
  vi.hoisted(() => ({
    mockDb: { team: { findFirst: vi.fn() } },
    mockGetDomains: vi.fn(),
    mockSendEmail: vi.fn(),
    mockLogger: { info: vi.fn(), error: vi.fn() },
    mockEnv: { FROM_EMAIL: "hello@example.com" } as Record<
      string,
      string | undefined
    >,
  }));

vi.mock("~/server/db", () => ({ db: mockDb }));
vi.mock("~/server/service/domain-service", () => ({
  getDomains: mockGetDomains,
}));
vi.mock("~/server/service/email-service", () => ({ sendEmail: mockSendEmail }));
vi.mock("~/server/logger/log", () => ({ logger: mockLogger }));
vi.mock("~/env", () => ({
  env: new Proxy(
    {},
    { get: (_t, k) => mockEnv[k as string] },
  ),
}));

import { LegacySesTransport } from "~/server/mailer/providers/legacy-ses";

describe("LegacySesTransport", () => {
  beforeEach(() => {
    mockDb.team.findFirst.mockReset();
    mockGetDomains.mockReset();
    mockSendEmail.mockReset();
    mockLogger.info.mockReset();
    mockLogger.error.mockReset();
    mockEnv.FROM_EMAIL = "hello@example.com";
  });

  it("returns without sending when no team exists", async () => {
    mockDb.team.findFirst.mockResolvedValue(null);

    await new LegacySesTransport().send({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "h",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith("No team found");
  });

  it("returns without sending when no domains exist", async () => {
    mockDb.team.findFirst.mockResolvedValue({ id: 7 });
    mockGetDomains.mockResolvedValue([]);

    await new LegacySesTransport().send({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "h",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith("No domains found");
  });

  it("sends via sendEmail with domain-matched from", async () => {
    mockDb.team.findFirst.mockResolvedValue({ id: 7 });
    mockGetDomains.mockResolvedValue([{ name: "example.com" }]);
    mockSendEmail.mockResolvedValue({});

    await new LegacySesTransport().send({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "h",
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 7,
        to: "to@x.com",
        from: "hello@example.com",
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=web test:unit src/server/mailer/providers/legacy-ses.unit.test.ts`
Expected: FAIL — `Cannot find module '~/server/mailer/providers/legacy-ses'`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/server/mailer/providers/legacy-ses.ts`:
```ts
import { env } from "~/env";
import { db } from "~/server/db";
import { getDomains } from "~/server/service/domain-service";
import { sendEmail } from "~/server/service/email-service";
import { logger } from "~/server/logger/log";
import type { MailerSendOptions, MailerTransport } from "./types";

export class LegacySesTransport implements MailerTransport {
  async send({
    to,
    subject,
    text,
    html,
    replyTo,
    fromOverride,
  }: MailerSendOptions): Promise<void> {
    logger.info("Sending email using self hosted");
    /*
      Self hosted so checking if we can send using one of the available domain
      Assuming self hosted will have only one team
    */
    const team = await db.team.findFirst({});
    if (!team) {
      logger.error("No team found");
      return;
    }

    const domains = await getDomains(team.id);

    if (domains.length === 0 || !domains[0]) {
      logger.error("No domains found");
      return;
    }

    const availableDomains = domains.map((d) => d.name);
    const domain = domains[0];

    const candidateFroms = [
      fromOverride,
      env.FROM_EMAIL,
      `hello@${domain.name}`,
    ].filter((value): value is string => Boolean(value));

    const selectedFrom =
      candidateFroms.find((address) => {
        const domainPart = address.split("@")[1];
        return domainPart ? availableDomains.includes(domainPart) : false;
      }) ?? `hello@${domain.name}`;

    await sendEmail({
      teamId: team.id,
      to,
      from: selectedFrom,
      subject,
      text,
      html,
      replyTo,
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter=web test:unit src/server/mailer/providers/legacy-ses.unit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mailer/providers/legacy-ses.ts apps/web/src/server/mailer/providers/legacy-ses.unit.test.ts
git commit -m "feat(mail): add legacy self-hosted SES transport"
```

---

### Task 5: env.js additions, ses.ts export, and resolver

**Files:**
- Modify: `apps/web/src/env.js` (server schema + `runtimeEnv`)
- Modify: `apps/web/src/server/aws/ses.ts` (add `export` to `getSesClient`)
- Create: `apps/web/src/server/mailer/providers/resolve.ts`
- Test: `apps/web/src/server/mailer/providers/resolve.unit.test.ts`

**Interfaces:**
- Consumes: `SesMailerTransport`, `SmtpMailerTransport`, `UseSendMailerTransport`, `LegacySesTransport` (Tasks 1-4); `getSesClient` from `~/server/aws/ses`; `nodemailer.createTransport`; `UseSend` from `usesend-js`; `env`.
- Produces: `resolveMailerTransport(provider: string | undefined, isCloud: boolean): MailerTransport` (pure); `getMailerTransport(): MailerTransport` (cached); `__resetMailerTransportForTests()`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/mailer/providers/resolve.unit.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEnv,
  SesMailerTransport,
  SmtpMailerTransport,
  UseSendMailerTransport,
  LegacySesTransport,
  mockGetSesClient,
  mockCreateTransport,
  MockUseSend,
} = vi.hoisted(() => ({
  mockEnv: {} as Record<string, string | boolean | undefined>,
  SesMailerTransport: vi.fn(),
  SmtpMailerTransport: vi.fn(),
  UseSendMailerTransport: vi.fn(),
  LegacySesTransport: vi.fn(),
  mockGetSesClient: vi.fn(),
  mockCreateTransport: vi.fn(),
  MockUseSend: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: new Proxy({}, { get: (_t, k) => mockEnv[k as string] }),
}));
vi.mock("~/server/aws/ses", () => ({ getSesClient: mockGetSesClient }));
vi.mock("nodemailer", () => ({ default: { createTransport: mockCreateTransport } }));
vi.mock("usesend-js", () => ({ UseSend: MockUseSend }));
vi.mock("~/server/mailer/providers/ses", () => ({ SesMailerTransport }));
vi.mock("~/server/mailer/providers/smtp", () => ({ SmtpMailerTransport }));
vi.mock("~/server/mailer/providers/usesend", () => ({
  UseSendMailerTransport,
}));
vi.mock("~/server/mailer/providers/legacy-ses", () => ({ LegacySesTransport }));

import { resolveMailerTransport } from "~/server/mailer/providers/resolve";

beforeEach(() => {
  SesMailerTransport.mockClear();
  SmtpMailerTransport.mockClear();
  UseSendMailerTransport.mockClear();
  LegacySesTransport.mockClear();
  MockUseSend.mockClear();
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  mockEnv.AWS_DEFAULT_REGION = "us-east-1";
  mockEnv.FROM_EMAIL = "hello@example.com";
});

describe("resolveMailerTransport", () => {
  it("returns SesMailerTransport for provider=ses", () => {
    resolveMailerTransport("ses", true);
    expect(SesMailerTransport).toHaveBeenCalledTimes(1);
  });

  it("returns SmtpMailerTransport for provider=smtp with creds and secure port", () => {
    mockEnv.MAILER_SMTP_HOST = "smtp.example.com";
    mockEnv.MAILER_SMTP_USER = "u";
    mockEnv.MAILER_SMTP_PASS = "p";
    mockEnv.MAILER_SMTP_PORT = "465";

    resolveMailerTransport("smtp", true);

    expect(SmtpMailerTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 465,
        secure: true,
        user: "u",
        pass: "p",
      }),
    );
  });

  it("defaults smtp port to 587 and secure false when not 465", () => {
    mockEnv.MAILER_SMTP_HOST = "h";
    mockEnv.MAILER_SMTP_USER = "u";
    mockEnv.MAILER_SMTP_PASS = "p";

    resolveMailerTransport("smtp", true);

    expect(SmtpMailerTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false }),
    );
  });

  it("throws for provider=smtp missing creds", () => {
    expect(() => resolveMailerTransport("smtp", true)).toThrow(/MAILER_SMTP_HOST/);
  });

  it("returns UseSendMailerTransport for provider=usesend with key", () => {
    mockEnv.UNSEND_API_KEY = "key";

    resolveMailerTransport("usesend", true);

    expect(MockUseSend).toHaveBeenCalledWith("key");
    expect(UseSendMailerTransport).toHaveBeenCalledTimes(1);
  });

  it("throws for provider=usesend missing key", () => {
    expect(() => resolveMailerTransport("usesend", true)).toThrow(/USESEND_API_KEY/);
  });

  it("returns LegacySesTransport when unset and self-hosted", () => {
    resolveMailerTransport(undefined, false);
    expect(LegacySesTransport).toHaveBeenCalledTimes(1);
  });

  it("returns UseSendMailerTransport when unset and cloud with key", () => {
    mockEnv.UNSEND_API_KEY = "key";
    resolveMailerTransport(undefined, true);
    expect(UseSendMailerTransport).toHaveBeenCalledTimes(1);
  });

  it("throws when unset, cloud, and no useSend key", () => {
    expect(() => resolveMailerTransport(undefined, true)).toThrow(/USESEND_API_KEY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=web test:unit src/server/mailer/providers/resolve.unit.test.ts`
Expected: FAIL — `Cannot find module '~/server/mailer/providers/resolve'`.

- [ ] **Step 3: Write minimal implementation**

First, export `getSesClient` in `apps/web/src/server/aws/ses.ts`. Change:
```ts
function getSesClient(region: string) {
```
to:
```ts
export function getSesClient(region: string) {
```

Then add env vars to `apps/web/src/env.js`. In the `server` object, after the `EMAIL_CLEANUP_DAYS` entry:
```js
    MAILER_PROVIDER: z.enum(["ses", "smtp", "usesend"]).optional(),
    MAILER_SMTP_HOST: z.string().optional(),
    MAILER_SMTP_PORT: z.string().optional(),
    MAILER_SMTP_USER: z.string().optional(),
    MAILER_SMTP_PASS: z.string().optional(),
    MAILER_SMTP_SECURE: z.string().optional(),
```
In the `runtimeEnv` object, after the `EMAIL_CLEANUP_DAYS` entry:
```js
    MAILER_PROVIDER: process.env.MAILER_PROVIDER,
    MAILER_SMTP_HOST: process.env.MAILER_SMTP_HOST,
    MAILER_SMTP_PORT: process.env.MAILER_SMTP_PORT,
    MAILER_SMTP_USER: process.env.MAILER_SMTP_USER,
    MAILER_SMTP_PASS: process.env.MAILER_SMTP_PASS,
    MAILER_SMTP_SECURE: process.env.MAILER_SMTP_SECURE,
```

`apps/web/src/server/mailer/providers/resolve.ts`:
```ts
import nodemailer from "nodemailer";
import { UseSend } from "usesend-js";
import { env } from "~/env";
import { getSesClient } from "~/server/aws/ses";
import { SesMailerTransport } from "./ses";
import { SmtpMailerTransport } from "./smtp";
import { UseSendMailerTransport } from "./usesend";
import { LegacySesTransport } from "./legacy-ses";
import type { MailerTransport } from "./types";

export function resolveMailerTransport(
  provider: string | undefined,
  isCloud: boolean,
): MailerTransport {
  if (provider === "ses") {
    return new SesMailerTransport({
      getSesClient,
      createTransport: nodemailer.createTransport,
      region: env.AWS_DEFAULT_REGION,
      fromDefault: env.FROM_EMAIL,
    });
  }

  if (provider === "smtp") {
    if (!env.MAILER_SMTP_HOST || !env.MAILER_SMTP_USER || !env.MAILER_SMTP_PASS) {
      throw new Error(
        "MAILER_PROVIDER=smtp requires MAILER_SMTP_HOST, MAILER_SMTP_USER, MAILER_SMTP_PASS",
      );
    }
    const port = env.MAILER_SMTP_PORT ? Number(env.MAILER_SMTP_PORT) : 587;
    const secure = env.MAILER_SMTP_SECURE === "true" || port === 465;
    return new SmtpMailerTransport({
      createTransport: nodemailer.createTransport,
      host: env.MAILER_SMTP_HOST,
      port,
      secure,
      user: env.MAILER_SMTP_USER,
      pass: env.MAILER_SMTP_PASS,
      fromDefault: env.FROM_EMAIL,
    });
  }

  if (provider === "usesend") {
    const apiKey = env.USESEND_API_KEY ?? env.UNSEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "MAILER_PROVIDER=usesend requires USESEND_API_KEY or UNSEND_API_KEY",
      );
    }
    return new UseSendMailerTransport({
      client: new UseSend(apiKey),
      fromDefault: env.FROM_EMAIL,
    });
  }

  // MAILER_PROVIDER unset -> backward-compatible default
  if (!isCloud) {
    return new LegacySesTransport();
  }

  const apiKey = env.USESEND_API_KEY ?? env.UNSEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MAILER_PROVIDER=usesend requires USESEND_API_KEY or UNSEND_API_KEY",
    );
  }
  return new UseSendMailerTransport({
    client: new UseSend(apiKey),
    fromDefault: env.FROM_EMAIL,
  });
}

let cached: MailerTransport | undefined;

export function getMailerTransport(): MailerTransport {
  if (!cached) {
    cached = resolveMailerTransport(env.MAILER_PROVIDER, env.NEXT_PUBLIC_IS_CLOUD);
  }
  return cached;
}

export function __resetMailerTransportForTests(): void {
  cached = undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter=web test:unit src/server/mailer/providers/resolve.unit.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/env.js apps/web/src/server/aws/ses.ts apps/web/src/server/mailer/providers/resolve.ts apps/web/src/server/mailer/providers/resolve.unit.test.ts
git commit -m "feat(mail): add MAILER_PROVIDER resolver and env vars"
```

---

### Task 6: Refactor mailer.ts to delegate

**Files:**
- Modify: `apps/web/src/server/mailer.ts`
- Test: `apps/web/src/server/mailer.unit.test.ts`

**Interfaces:**
- Consumes: `getMailerTransport()` from `./mailer/providers/resolve` (Task 5).
- Produces: unchanged public API `sendMail(email, subject, text, html, replyTo?, fromOverride?)`, `sendSignUpEmail`, `sendTeamInviteEmail`, `sendSubscriptionConfirmationEmail`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/server/mailer.unit.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockTransport,
  mockGetMailerTransport,
  mockRenderOtp,
  mockRenderInvite,
  mockEnv,
  mockLogger,
} = vi.hoisted(() => ({
  mockTransport: { send: vi.fn() },
  mockGetMailerTransport: vi.fn(() => mockTransport),
  mockRenderOtp: vi.fn(),
  mockRenderInvite: vi.fn(),
  mockEnv: {
    NODE_ENV: "test",
    FOUNDER_EMAIL: "founder@example.com",
    FROM_EMAIL: "hello@example.com",
  } as Record<string, string | undefined>,
  mockLogger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("~/server/mailer/providers/resolve", () => ({
  getMailerTransport: mockGetMailerTransport,
}));
vi.mock("~/email-templates", () => ({
  renderOtpEmail: mockRenderOtp,
  renderTeamInviteEmail: mockRenderInvite,
}));
vi.mock("~/env", () => ({
  env: new Proxy({}, { get: (_t, k) => mockEnv[k as string] }),
}));
vi.mock("~/server/logger/log", () => ({ logger: mockLogger }));

import {
  sendMail,
  sendSignUpEmail,
  sendSubscriptionConfirmationEmail,
} from "~/server/mailer";

describe("mailer", () => {
  beforeEach(() => {
    mockTransport.send.mockReset();
    mockGetMailerTransport.mockClear();
    mockRenderOtp.mockReset();
    mockRenderInvite.mockReset();
  });

  it("sendMail delegates to the resolved transport", async () => {
    await sendMail("to@x.com", "s", "t", "h", "r@x.com", "from@x.com");

    expect(mockTransport.send).toHaveBeenCalledWith({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "h",
      replyTo: "r@x.com",
      fromOverride: "from@x.com",
    });
  });

  it("sendSignUpEmail renders OTP and sends via transport", async () => {
    mockRenderOtp.mockResolvedValue("<p>otp</p>");

    await sendSignUpEmail("to@x.com", "ABCDE", "https://app.example.com/verify");

    expect(mockRenderOtp).toHaveBeenCalled();
    expect(mockTransport.send).toHaveBeenCalledTimes(1);
    expect(mockTransport.send.mock.calls[0]?.[0].to).toBe("to@x.com");
  });

  it("sendSubscriptionConfirmationEmail sends with founder fromOverride", async () => {
    await sendSubscriptionConfirmationEmail("sub@x.com");

    expect(mockTransport.send).toHaveBeenCalledTimes(1);
    expect(mockTransport.send.mock.calls[0]?.[0].fromOverride).toBe(
      "founder@example.com",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=web test:unit src/server/mailer.unit.test.ts`
Expected: FAIL — `sendMail` still runs the old branches and does not call `mockTransport.send`.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/server/mailer.ts`, replace the imports and `sendMail`. Remove the now-unused imports (`UseSend`, `isSelfHosted`, `db`, `getDomains`, `sendEmail`) and the `getClient` helper. Add the resolver import. The new top of the file and `sendMail`:

```ts
import { env } from "~/env";
import { logger } from "./logger/log";
import { renderOtpEmail, renderTeamInviteEmail } from "./email-templates";
import { getMailerTransport } from "./mailer/providers/resolve";

export async function sendSignUpEmail(
  email: string,
  token: string,
  url: string
) {
  const { host } = new URL(url);

  if (env.NODE_ENV === "development") {
    logger.info({ email, url, token }, "Sending sign in email");
    return;
  }

  const subject = "Sign in to useSend";

  const html = await renderOtpEmail({
    otpCode: token.toUpperCase(),
    loginUrl: url,
    hostName: host,
  });

  const text = `Hey,\n\nYou can sign in to useSend by clicking the below URL:\n${url}\n\nYou can also use this OTP: ${token}\n\nThanks,\nuseSend Team`;

  await sendMail(email, subject, text, html);
}

export async function sendTeamInviteEmail(
  email: string,
  url: string,
  teamName: string
) {
  const { host } = new URL(url);

  if (env.NODE_ENV === "development") {
    logger.info({ email, url, teamName }, "Sending team invite email");
    return;
  }

  const subject = "You have been invited to join useSend";

  const html = await renderTeamInviteEmail({
    teamName,
    inviteUrl: url,
  });

  const text = `Hey,\n\nYou have been invited to join the team ${teamName} on useSend.\n\nYou can accept the invitation by clicking the below URL:\n${url}\n\nThanks,\nuseSend Team`;

  await sendMail(email, subject, text, html);
}

export async function sendSubscriptionConfirmationEmail(email: string) {
  if (!env.FOUNDER_EMAIL) {
    logger.error("FOUNDER_EMAIL not configured");
    return;
  }

  const subject = "Thanks for subscribing to useSend";
  const text = `Hey,\n\nThanks for subscribing to useSend, just wanted to let you know you can join the discord server to have a dedicated support channel for your team. So that we can address your queries / bugs asap.\n\nYou can join over using the link: https://discord.com/invite/BU8n8pJv8S\n\nIf you prefer slack, please let me know\n\ncheers,\nkoushik - useSend`;
  const html = text.replace(/\n/g, "<br />");

  await sendMail(email, subject, text, html, undefined, env.FOUNDER_EMAIL);
}

export async function sendMail(
  email: string,
  subject: string,
  text: string,
  html: string,
  replyTo?: string,
  fromOverride?: string
) {
  await getMailerTransport().send({
    to: email,
    subject,
    text,
    html,
    replyTo,
    fromOverride,
  });
}
```

Keep `sendSignUpEmail`, `sendTeamInviteEmail`, and `sendSubscriptionConfirmationEmail` byte-for-byte identical to the originals (only the imports above and `sendMail` change).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter=web test:unit src/server/mailer.unit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full mailer provider suite**

Run: `pnpm --filter=web test:unit src/server/mailer`
Expected: PASS — all provider + mailer tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/mailer.ts apps/web/src/server/mailer.unit.test.ts
git commit -m "refactor(mail): delegate sendMail to resolved transport"
```

---

### Task 7 (optional): Expose mailer env in SaaS deploy config

**Files:**
- Modify: `docker/prod/compose.saas.yml`
- Modify: `docker/prod/.env.example-saas`

This task has no automated test; it is deploy documentation. Skip if not deploying via these files.

- [ ] **Step 1: Add to compose.saas.yml**

In the `usesend` service `environment`, add (e.g. after the `FROM_EMAIL` line in the Authentication section):
```yaml
      # Outbound transport for platform notifications: ses | smtp | usesend.
      # Unset = backward-compatible default (self-hosted -> SES via app; cloud -> useSend API).
      MAILER_PROVIDER: ${MAILER_PROVIDER}
      # Required only when MAILER_PROVIDER=smtp. Prefixed to avoid clashing with the inbound SMTP_HOST/SMTP_USER.
      MAILER_SMTP_HOST: ${MAILER_SMTP_HOST}
      MAILER_SMTP_PORT: ${MAILER_SMTP_PORT}
      MAILER_SMTP_USER: ${MAILER_SMTP_USER}
      MAILER_SMTP_PASS: ${MAILER_SMTP_PASS}
      MAILER_SMTP_SECURE: ${MAILER_SMTP_SECURE}
```

- [ ] **Step 2: Add to .env.example-saas**

Add a new section (e.g. after the Email Login section):
```ini
#################################################
# Mailer Provider (platform notifications)
#################################################

# Outbound transport for magic-link / invite / billing emails.
# ses | smtp | usesend. Unset = backward-compatible default
# (self-hosted -> SES via app domain; cloud -> useSend API).
MAILER_PROVIDER=

# Required only when MAILER_PROVIDER=smtp.
# Uses MAILER_SMTP_ prefix (NOT SMTP_HOST/SMTP_USER, which are the inbound tenant proxy).
MAILER_SMTP_HOST=
MAILER_SMTP_PORT=587
MAILER_SMTP_USER=
MAILER_SMTP_PASS=
# "true" forces TLS; if unset, derived from port (465 = secure).
MAILER_SMTP_SECURE=
```

- [ ] **Step 3: Commit**

```bash
git add docker/prod/compose.saas.yml docker/prod/.env.example-saas
git commit -m "docs(saas): expose MAILER_PROVIDER and MAILER_SMTP env"
```

---

## Self-Review

**Spec coverage:**
- Outbound SMTP for `mailer.ts` -> Task 2 (transport) + Task 5 (resolve) + Task 6 (delegation). ✓
- Explicit `MAILER_PROVIDER=ses|smtp|usesend` -> Task 5 env + resolve. ✓
- SES direct via env, mode-agnostic -> Task 1 (transport) + Task 5 (resolve constructs from `AWS_*`/`FROM_EMAIL`). ✓
- Backward-compat default (unset -> current behavior) -> Task 5 resolve `default` branch + Task 4 legacy transport. ✓
- `MAILER_SMTP_*` prefix avoiding `SMTP_HOST` collision -> Task 5 env + Task 7 docs. ✓
- Error handling (missing creds, missing FROM_EMAIL, useSend failure) -> Tasks 1-3 send throws + Task 5 resolve throws. ✓
- Unit tests per transport + resolve -> Tasks 1-5 tests. ✓
- Files list matches spec. ✓

**Placeholder scan:** No TBD/TODO/placeholder text. All steps contain complete code and exact commands.

**Type consistency:** `MailerSendOptions` fields (`to`, `subject`, `text`, `html`, `replyTo?`, `fromOverride?`) are identical across `types.ts`, every transport `send` signature, `resolve.ts` construction, and `mailer.ts` delegation. Constructor config field names (`getSesClient`, `createTransport`, `region`, `fromDefault` for SES; `createTransport`, `host`, `port`, `secure`, `user`, `pass`, `fromDefault` for SMTP; `client`, `fromDefault` for useSend) match between transport classes and `resolve.ts`. `resolveMailerTransport(provider, isCloud)` signature matches the test calls.

No issues found.
