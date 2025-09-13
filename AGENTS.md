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
- `pnpm lint`: Run ESLint via shared config; fail on warnings.
- `pnpm format`: Prettier over ts/tsx/md.
- `pnpm dx` / `pnpm dx:up` / `pnpm dx:down`: Spin up/down local infra via Docker Compose, then run migrations.
- Database (apps/web filter): `pnpm db:generate` | `db:migrate-dev` | `db:push` | `db:studio`.
- Never run migrations unless users explicitly asked

## Coding Style & Naming Conventions

- TypeScript-first; 2-space indent; semicolons enabled by Prettier.
- Linting: `@usesend/eslint-config`; run `pnpm lint` before PRs.
- Formatting: Prettier 3; run `pnpm format`.
- Files: React components PascalCase (e.g., `AppSideBar.tsx`); folders kebab/lowercase.
- Paths (web): use alias `~/` for src imports (e.g., `import { x } from "~/utils/x"`).
- Never use dynamic imports

## Testing Guidelines

- No repo-wide test runner is configured yet. do not add any tests unless required

## Commit & Pull Request Guidelines

- Prefer Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`). Git history shows frequent feat/fix usage.
- PRs must include: clear description, linked issues, screenshots for UI changes, migration notes, and verification steps.
- CI hygiene: ensure `pnpm lint` and `pnpm build` pass; run relevant `db:*` scripts if schema changes.
