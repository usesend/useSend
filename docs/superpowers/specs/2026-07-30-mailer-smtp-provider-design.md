# Mailer Provider Abstraction + Outbound SMTP Support

- **Date:** 2026-07-30
- **Status:** Approved (design)
- **Scope:** `apps/web` — `src/server/mailer.ts` and new `src/server/mailer/providers/`

## Background

`src/server/mailer.ts` sends the platform's own transactional notifications: sign-up
magic-link OTPs, team invites, and billing/limit notifications. Today the transport is chosen
implicitly by deployment mode:

- **Self-hosted** (`NEXT_PUBLIC_IS_CLOUD=false`): `sendMail` calls `email-service.sendEmail`,
  which requires a team and a verified sending domain configured in-app, then routes through the
  email queue to SES using the global `AWS_*` credentials. This path assumes a single team
  (`db.team.findFirst({})`) and only fits self-hosted.
- **Cloud** (`NEXT_PUBLIC_IS_CLOUD=true`): `sendMail` is hardcoded to the useSend HTTP API via
  `UNSEND_API_KEY`/`USESEND_API_KEY` + `FROM_EMAIL`. It never uses SES, even when `AWS_*` env is
  set. There is no env toggle to change this.

Two problems follow: (1) cloud-mode operators cannot send platform notifications through their own
SES without depending on the useSend service, and (2) there is no way to send platform
notifications through a generic SMTP server (e.g. a self-hosted relay, Mailgun SMTP, Gmail).

Note: the existing `apps/smtp-server` + `SMTP_HOST`/`SMTP_USER` are an **inbound** SMTP interface
for tenants (tenants connect with their API key as password; emails are relayed to the API). This
spec is **not** about that. It adds an **outbound** transport for `mailer.ts` only.

## Goals

- Add SMTP as an outbound transport for `mailer.ts` platform notifications.
- Make SES usable as a direct, env-driven transport in any mode (decouples cloud from the useSend API).
- Introduce an explicit `MAILER_PROVIDER` selection so operators choose the transport predictably.
- Preserve existing behavior when `MAILER_PROVIDER` is unset (zero change for current deployments).

## Non-Goals

- Changing tenant email sending (`email-service.sendEmail`), which already uses SES via `AWS_*`.
- Changing the inbound tenant SMTP proxy (`apps/smtp-server`).
- Per-team/per-domain mailer configuration. The mailer is platform-level and configured via env.
- Changing the high-level notification functions (`sendSignUpEmail`, etc.) beyond delegating to the
  new `sendMail`.

## Key Decisions

1. **Scope:** outbound SMTP for `mailer.ts` platform notifications only.
2. **Selection:** explicit env flag `MAILER_PROVIDER=ses|smtp|usesend`.
3. **SES path:** a new direct SES send via `AWS_*` + `FROM_EMAIL` (no team/domain dependency),
   usable in any mode. The current team-based `sendEmail` path is retained only as the
   backward-compat default when `MAILER_PROVIDER` is unset in self-hosted mode.
4. **Structure:** provider abstraction (Approach 2), not inline branches in `sendMail`.

## Architecture

Introduce a `MailerTransport` interface. `sendMail` resolves a single transport from
`MAILER_PROVIDER` and delegates. Each transport owns its own `from` resolution (rules differ
between env-driven transports and the legacy domain-matching path).

```
sendSignUpEmail / sendTeamInviteEmail / sendSubscriptionConfirmationEmail
        |
        v
   sendMail(to, subject, text, html, replyTo?, fromOverride?)        # mailer.ts
        |
        v
   getMailerTransport()  (cached singleton)                          # providers/resolve.ts
        |
        v
   MailerTransport.send({ to, subject, text, html, replyTo, fromOverride })
```

### Components (`src/server/mailer/providers/`)

- `types.ts`
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

- `ses.ts` — `SesMailerTransport`. Direct SES send using `getSesClient(env.AWS_DEFAULT_REGION)`
  (reuses `getAwsCredentialOptions()` from `server/aws/credentials.ts`, which reads `AWS_*` env).
  Builds raw MIME via `nodemailer.createTransport({ streamTransport: true })` (the pattern already
  used in `server/aws/ses.ts`) and sends with `SendEmailCommand`. No configuration set, no
  team/domain lookup, no queue. `from = fromOverride ?? env.FROM_EMAIL`. Works in any mode.

- `smtp.ts` — `SmtpMailerTransport`. `nodemailer.createTransport({ host, port, secure, auth })`
  built from `MAILER_SMTP_*` env. `from = fromOverride ?? env.FROM_EMAIL`. Works in any mode.

- `usesend.ts` — `UseSendMailerTransport`. Extracts the current `getClient()` + `client.emails.send`
  logic from `mailer.ts`. `from = fromOverride ?? env.FROM_EMAIL`.

- `legacy-ses.ts` — `LegacySesTransport`. Wraps the current self-hosted path: `db.team.findFirst`,
  `getDomains`, the `candidateFroms` domain-matching `from` resolution, and `email-service.sendEmail`
  (queue + suppression). Used only for backward-compat when `MAILER_PROVIDER` is unset in
  self-hosted mode.

- `resolve.ts` — `getMailerTransport(): MailerTransport` (cached singleton). Reads
  `env.MAILER_PROVIDER` and returns the matching transport; on unset, returns the backward-compat
  transport.

### `mailer.ts` refactor

`sendMail` becomes: resolve transport, call `transport.send({ to: email, subject, text, html,
replyTo, fromOverride })`. The high-level functions (`sendSignUpEmail`,
`sendTeamInviteEmail`, `sendSubscriptionConfirmationEmail`) are unchanged except they keep
calling `sendMail`. The `NODE_ENV === "development"` short-circuit in `sendSignUpEmail` (log only,
no send) is preserved.

## Environment Variables

New (added to `src/env.js`, all optional):

| Variable | Schema | Purpose |
|---|---|---|
| `MAILER_PROVIDER` | `z.enum(["ses","smtp","usesend"]).optional()` | Selects the transport. Unset = backward-compat default. |
| `MAILER_SMTP_HOST` | `z.string().optional()` | SMTP server host. |
| `MAILER_SMTP_PORT` | `z.string().optional()` | SMTP port (parsed to number; default 587). |
| `MAILER_SMTP_USER` | `z.string().optional()` | SMTP auth user. |
| `MAILER_SMTP_PASS` | `z.string().optional()` | SMTP auth password. |
| `MAILER_SMTP_SECURE` | `z.string().optional()` | `"true"` forces TLS; if unset, derived from port (465 = secure). |

The `MAILER_SMTP_` prefix is intentional to avoid collision with the existing `SMTP_HOST` /
`SMTP_USER` (inbound tenant proxy).

Reused (no schema change): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`
(ses), `UNSEND_API_KEY` / `USESEND_API_KEY` (usesend), `FROM_EMAIL` (all).

## Resolution & Default

```
MAILER_PROVIDER=ses      -> SesMailerTransport
MAILER_PROVIDER=smtp     -> SmtpMailerTransport
MAILER_PROVIDER=usesend  -> UseSendMailerTransport
unset                    -> self-hosted: LegacySesTransport (current behavior)
                          cloud:      UseSendMailerTransport (current behavior)
```

Unset = zero behavior change for existing deployments. Operators opt in by setting
`MAILER_PROVIDER`.

## Error Handling

- Missing required env for the chosen provider throws a descriptive error, e.g.
  `MAILER_PROVIDER=smtp requires MAILER_SMTP_HOST, MAILER_SMTP_USER, MAILER_SMTP_PASS`.
- `FROM_EMAIL` empty and no `fromOverride` for `ses`/`smtp`/`usesend` throws
  `FROM_EMAIL is required for mailer`.
- SMTP/SES send failures are logged and re-thrown with the original error. This also fixes the
  current misleading `"USESEND_API_KEY/UNSEND_API_KEY not found"` message that surfaces when a
  useSend send fails (today a failed `client.emails.send` falls through to that generic throw).
- `LegacySesTransport` preserves the current no-throw-on-missing-team/domain behavior (logs and
  returns) to avoid changing self-hosted default semantics.

## Testing

Unit tests only (no infra required), following repo convention `*.unit.test.ts`:

- `providers/ses.unit.test.ts` — mock the SES client; assert `SendEmailCommand` is called with the
  resolved `from` and `AWS_DEFAULT_REGION`; assert `FROM_EMAIL`-missing throws.
- `providers/smtp.unit.test.ts` — mock `nodemailer.createTransport`; assert transport options
  come from `MAILER_SMTP_*`; assert send is called; assert missing creds throws.
- `providers/usesend.unit.test.ts` — mock the useSend client; assert `emails.send` is called; assert
  failure throws a proper error.
- `providers/resolve.unit.test.ts` — for each `MAILER_PROVIDER` value and for unset in both modes,
  assert the correct transport class is returned; assert the singleton is cached.

## Files

New:
- `apps/web/src/server/mailer/providers/types.ts`
- `apps/web/src/server/mailer/providers/ses.ts`
- `apps/web/src/server/mailer/providers/smtp.ts`
- `apps/web/src/server/mailer/providers/usesend.ts`
- `apps/web/src/server/mailer/providers/legacy-ses.ts`
- `apps/web/src/server/mailer/providers/resolve.ts`
- matching `*.unit.test.ts` for each above

Modified:
- `apps/web/src/server/mailer.ts` — refactor `sendMail` to delegate; keep high-level functions.
- `apps/web/src/env.js` — add `MAILER_PROVIDER` and `MAILER_SMTP_*` to the server schema and
  `runtimeEnv`.

Optional follow-up (not required for the code change):
- Expose `MAILER_PROVIDER` and `MAILER_SMTP_*` in `docker/prod/compose.saas.yml` and
  `docker/prod/.env.example-saas`.

## Backward Compatibility

- `MAILER_PROVIDER` unset keeps exact current behavior in both modes.
- `LegacySesTransport` reproduces the current self-hosted `sendMail` path verbatim, so self-hosted
  deployments that rely on the in-app domain + queue continue to work unchanged.
- No database migration; no schema change.

## Open Questions

None. All design decisions resolved during brainstorming.
