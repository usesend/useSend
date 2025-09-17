# Double Opt-In Implementation Plan

## Goals
- Allow teams to require email-based confirmation before a contact becomes subscribed.
- Ensure every double opt-in email uses a verified domain and a template containing a verification URL.
- Provide dashboard controls so each contact book can manage double opt-in configuration.

## Functional Requirements (from brief)
- Seed a template named "Double Opt In" via migration.
- Each contact book should be mapped to a verified domain and reference an optional double opt-in template.
- Dashboard settings must validate that the selected template exposes a `verificationUrl` placeholder.
- When double opt-in is enabled and a contact is added through the public API, automatically send a confirmation email.
- Confirmation link should mirror the existing unsubscribe hashing flow (contact + book identifiers, shared secret).
- Contacts stay unsubscribed until the verification link is consumed; confirmation toggles them back to subscribed.

## Workstreams

### 1. Schema & Data Changes
- Extend `Domain` with a nullable `defaultFrom` column.
  - When populated, double opt-in emails use `domain.defaultFrom` as the `from` address.
  - When absent, construct `from` as `hello@<domain-subdomain-or-root>` (e.g., `hello@subdomain.example.com`).
- Extend `ContactBook` with:
  - `defaultDomainId` (FK → `Domain`, required once domains exist).
  - `doubleOptInEnabled` boolean (default `false`).
  - `doubleOptInTemplateId` (FK → `Template`, nullable while feature disabled).
- Backfill existing contact books:
  - Infer `defaultDomainId` when a team has exactly one verified domain.
  - Set `doubleOptInEnabled = false` and leave template null.

### 2. Template Seeding Migration
- Add migration that:
  - Inserts a "Double Opt In" template per team (or a global seed copied to each team) with subject "Confirm your email".
  - Stores the provided editor JSON in `Template.content` and ensures `Template.html` includes a `{{verificationUrl}}` button/link.
  - Default template content:
    ```json
    {"type":"doc","content":[{"type":"paragraph","attrs":{"textAlign":null},"content":[{"type":"text","text":"Hey there,"}]},{"type":"paragraph","attrs":{"textAlign":null},"content":[{"type":"text","text":"Welcome to [Product name]. Please click the link below to verify your email address to get started."}]},{"type":"paragraph","attrs":{"textAlign":null}},{"type":"button","attrs":{"component":"button","text":"Confirm","url":"{{verificationUrl}}","alignment":"left","borderRadius":"4","borderWidth":"1","buttonColor":"rgb(0, 0, 0)","borderColor":"rgb(0, 0, 0)","textColor":"rgb(255, 255, 255)"}},{"type":"paragraph","attrs":{"textAlign":null}},{"type":"paragraph","attrs":{"textAlign":null},"content":[{"type":"text","text":"Best"}]}]}
    ```
  - Document that templates must expose `{{verificationUrl}}`; no personalization fields (e.g., name) are required or supported.

### 3. Backend Configuration API
- Update `contactBookService.getContactBookDetails` to return `defaultDomainId`, `doubleOptInEnabled`, and `doubleOptInTemplateId`.
- Extend TRPC router mutations/queries:
  - `contacts.updateContactBook` accepts the new fields and enforces:
    - When enabling double opt-in, both `defaultDomainId` and `doubleOptInTemplateId` must be present.
    - The chosen domain must be verified (status success) and expose a usable `from` (either `defaultFrom` or synthesize fallback).
    - The chosen template must contain `{{verificationUrl}}`; reject otherwise.
  - Add helper queries to surface available verified domains + templates for UI selectors.

### 4. Double Opt-In Email Generation
- Build `createDoubleOptInUrl(contactId, contactBookId)` mirroring `createUnsubUrl`:
  - Use `${contactId}-${contactBookId}` as the identifier.
  - Hash with `sha256` + `env.NEXTAUTH_SECRET` (same as unsubscribe) to produce `hash`.
  - URL shape: `${env.NEXTAUTH_URL}/confirm?id=${identifier}&hash=${hash}` (final route TBD).
- Add `sendDoubleOptInEmail({ contact, contactBook, teamId })`:
  - Resolve domain via `contactBook.defaultDomainId` and compute `from` with `domain.defaultFrom ?? hello@...`.
  - Render template content via `EmailRenderer` with replacements mapping `{{verificationUrl}}` to generated link.
  - Queue email through `EmailQueueService` and record standard `Email`/`EmailEvent` entries (no extra token storage).
  - Ensure repeated calls reuse the same link (deterministic hash), so resend logic stays idempotent.

### 5. API Flow Adjustments
- Update `contactService.addOrUpdateContact` and public API handlers:
  - Force `subscribed = false` for new or updated contacts while double opt-in is enabled.
  - After create/update, call `sendDoubleOptInEmail` if the contact is new or previously unsubscribed.
  - When double opt-in disabled, retain existing behavior.
  - Disallow `subscribed: true` payloads while double opt-in is active (reject or ignore with warning).

### 6. Confirmation Endpoint
- Add route (e.g., `/api/confirm-subscription`) accepting `id` + `hash`.
  - Split `id` into `contactId` and `contactBookId`.
  - Recompute expected hash using the same secret; reject if mismatch.
  - Verify contact still belongs to the contact book and is unsubscribed.
  - Set `subscribed = true`, clear any `unsubscribeReason`, and emit success response.
  - Subsequent requests should be idempotent (no token revocation needed); respond with already confirmed message.

### 7. Dashboard UI
- Introduce `contacts/[contactBookId]/settings` page or tab:
  - Allow selecting verified domain (show defaultFrom / fallback preview) and template.
  - Toggle for "Require double opt-in" gating template/domain selectors.
  - Surface validation messaging when template lacks `{{verificationUrl}}` or domain missing `defaultFrom`.
  - Link from contact book details to the new settings page.

### 8. Background & Notifications
- Optional follow-up: add tooling to resend confirmations manually or report pending confirmations (contacts still unsubscribed with double opt-in enabled).

### 9. Testing & Rollout
- Unit/Integration coverage targets:
  - Hash generation & validation (`createDoubleOptInUrl`, confirmation endpoint).
  - Configuration validation (domain + template requirements).
  - API flow ensuring contacts remain unsubscribed until confirmation.
- Manual QA checklist:
  1. Enable double opt-in, add contact via API → confirmation email sent using domain.defaultFrom (or fallback) and contact remains unsubscribed.
  2. Visit confirmation link → contact becomes subscribed.
  3. Revisit link → receive idempotent "already confirmed" response without altering state.
  4. Disable double opt-in → contacts can be created as subscribed immediately.
- Ensure migrations run safely in production (Domain.defaultFrom nullable with sensible fallback; template seeding idempotent).

## Open Questions
- What is the expected fallback when a domain lacks `subdomain` (use root `example.com`)?
- Do we allow dashboard CSV imports to follow the same double opt-in flow, or should they bypass it?
- Should we emit webhook/event when confirmation completes?

## Dependencies
- Teams must own at least one verified domain to enable double opt-in.
- Email template rendering relies on `@usesend/email-editor`; ensure placeholder replacement matches editor schema.
- Requires access to existing unsubscribe hashing logic and shared secret (`NEXTAUTH_SECRET`).
