# CLAUDE.md

Working notes for Claude Code agents in this repository. Keep this file short and factual.

## Repository layout

Monorepo with three Node sub-packages plus a git submodule:

- `source/server` — Express/TypeScript API + Postgres. ESM (`"type": "module"`), built with `tsc -b`. Tests are mocha + chai-as-promised, files named `*.test.ts` next to the code.
- `source/ui` — Lit + Webpack frontend. Build emits to top-level `dist/`. No tests.
- `source/e2e` — Playwright tests. They auto-start a server via `start_server.sh`, which expects pre-built artifacts.
- `source/voyager` — git submodule (Holusion/dpo-voyager, itself recursive). The UI build will not work until the submodule is initialized.

## Bootstrap

```sh
git submodule update --init --recursive   # required, the UI imports from voyager
npm install                               # root postinstall recurses into every source/* package
```

A SessionStart hook in `.claude/hooks/session-start.sh` runs both of the above (plus Postgres + Playwright setup) automatically in Claude Code on the web. It is idempotent; re-running it is safe.

## Common commands

| Goal | Command | Notes |
| --- | --- | --- |
| Build server | `npm run build-server` | output `source/server/dist/` |
| Build UI | `npm run build-ui` | output top-level `dist/`; needs voyager submodule |
| Run dev | `npm run watch` | concurrent tsc + webpack + nodemon |
| Run prod-style | `npm start` | uses pre-built `source/server/dist/` |
| Server tests | `npm test` (or `cd source/server && npm test`) | needs Postgres, see below |
| Single server test file | `cd source/server && npx mocha path/to/foo.test.ts` | mocha config is in `package.json` |
| E2E tests | `cd source/e2e && npm test` | needs Postgres + built server/UI + `npx playwright install` |
| Docker stack | `docker compose up app` | Postgres + app, healthchecks wired |
| Docker e2e | `docker compose --profile test up --exit-code-from test` | reset between runs with `docker compose down -v` |

## Postgres (required for tests)

`source/server/tests-common.ts` creates and drops a fresh database per test, so tests need a running Postgres reachable via the standard `PG*` env vars. The SessionStart hook starts the local cluster and exports:

```
PGHOST=localhost  PGPORT=5432  PGUSER=postgres  PGPASSWORD=postgres  PGDATABASE=postgres
```

If you start Postgres yourself, match those values or set the env vars before running `npm test`.

## Things that catch agents off-guard

- **Submodule.** `source/voyager` must be initialized recursively or `npm run build-ui` and a chunk of e2e fail in non-obvious ways. `git submodule status` lines starting with `-` mean "not initialized".
- **Postinstall recursion.** A single `npm install` at the repo root installs *all* sub-packages via the root `postinstall` script. Don't run `npm install` per sub-package unless you have a reason to.
- **Tests hit a real database.** Each test file calls `createIntegrationContext()` (declared globally in `tests-common.ts`) which `CREATE DATABASE`s a fresh schema. If tests hang or fail to clean up, look for leftover `eCorpus_test_*` databases.
- **E2E expects built artifacts at `ROOT_DIR`.** Default is the repo root, but CI repacks the artifact tarball with a flattened layout (see `.github/workflows/build.yml`). To reproduce CI locally, build first (`npm run build-server && npm run build-ui`) before running e2e.
- **Node version.** Server requires ≥18.17 (root package says ≥16.20.2 but server tests assume newer). CI matrix is 18/20/22; Dockerfile uses 22-slim. Stick to 22 unless reproducing a matrix failure.
- **ESM + ts-node.** Server tests load via `--loader ts-node/esm`. Imports inside server code use `.js` extensions even when the source is `.ts` — that's the ESM convention, don't "fix" it.

## CI

- `.github/workflows/build.yml` runs UI build, server tests on Node 18/20/22, packs an artifact, runs e2e against the artifact, and separately verifies the Docker build + Docker-based e2e.
- `.github/workflows/publish.yml` pushes the Docker image to `ghcr.io/holusion/e-corpus` on main and on `v*.*.*` tags.
- Concurrency groups cancel in-progress runs on the same ref, so don't expect old runs to keep going after a force-push.

## Conventions

- TypeScript strict mode, ESM throughout the server.
- Tests live next to source as `*.test.ts`; integration tests live in `source/server/integration.test.ts` and friends.
- Routes are organized by resource under `source/server/routes/`; the VFS layer lives in `source/server/vfs/`.
- No comments unless the *why* is non-obvious. Match the existing style.
