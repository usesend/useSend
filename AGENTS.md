# Repository Guidelines

## Project Structure & Module Organization

- apps/web: Next.js app (primary product). Uses Prisma, TRPC, Tailwind.
- apps/marketing: Public marketing site (Next.js, static export).
- apps/docs: Mintlify docs content.
- apps/smtp-server: SMTP proxy/server (TypeScript → tsup build).
- packages/\*: Shared libraries (email-editor, ui, eslint-config, tailwind-config, typescript-config, sdk).
- docker/: Dev/compose files; .env\* at repo root define configuration.

## Build, Test, and Development Commands

- `pnpm i`: Install workspace deps (Node >= 20).
- `pnpm dev`: Turbo dev for all relevant apps (loads `.env`).
- `pnpm start:web:local`: Run only `apps/web` locally on port 3000.
- `pnpm build`: Turbo build across the monorepo.
- `pnpm dx` / `pnpm dx:up` / `pnpm dx:down`: Spin up/down local infra via Docker Compose, then run migrations.
- Database (apps/web filter): `pnpm db:generate` | `db:migrate-dev` | `db:push` | `db:studio`.

## Coding Style & Naming Conventions

- Files: React components PascalCase (e.g., `AppSideBar.tsx`); folders kebab/lowercase.
- Paths (web): use alias `~/` for src imports (e.g., `import { x } from "~/utils/x"`).

## Testing Guidelines

- Web testing is configured with Vitest in `apps/web`; add tests when changes impact logic, APIs, or behavior.
- Prefer targeted suites first: `pnpm test:web:unit`, `pnpm test:web:trpc`, `pnpm test:web:api`; use `pnpm test:web` for default non-integration coverage.
- Test file conventions: `*.unit.test.ts`, `*.trpc.test.ts`, `*.api.test.ts`, `*.integration.test.ts`.
- Integration tests require infra and env (`RUN_INTEGRATION=true` with Postgres/Redis available). Root commands `pnpm test:web:all` and `pnpm test:web:integration:full` auto-manage infra lifecycle.
- Use `pnpm test:infra:up` / `pnpm test:infra:down` when running targeted integration commands manually.
- `pnpm test:web:integration:full` and `test:integration:prepare` run Prisma migrations (`prisma migrate deploy`) against the local test database.
- Test defaults are cloud mode (`NEXT_PUBLIC_IS_CLOUD=true`); keep new tests compatible with cloud behavior unless the task says otherwise.

## Commit & Pull Request Guidelines

- Prefer Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`). Git history shows frequent feat/fix usage.
- PRs must include: clear description, linked issues, screenshots for UI changes, migration notes, and verification steps.

<!-- polylane:start -->
## Investigating production with Polylane

[Polylane](https://polylane.com/?ref=github.onboarding-pr) is an AI production engineer: it watches deploys, telemetry, incidents, and the infrastructure this repository ships to, investigates problems as they happen, and proposes fixes as pull requests. It is connected to this repository and available to coding agents through the [Polylane MCP server](https://mcp.polylane.com/mcp).

- When a question involves production behaviour (an error, a spike, a deploy, a missing signal), query Polylane through its MCP tools before reasoning from the code alone.
- When debugging a failure, start from the incident or issue Polylane recorded: it carries the evidence an investigation already gathered.
- Polylane reviews pull requests in this repository against the live infrastructure. Read its review comment before merging changes that touch production paths.
<!-- polylane:end -->
