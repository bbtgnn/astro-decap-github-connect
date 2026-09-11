# Agent notes

## Monorepo

- **Package:** `packages/zod-decap-local` — `fieldOptions` / `collectionOptions`, Zod→Decap emit, Astro integration, CLI
- **Fixture:** `packages/fixture` — Astro dogfood site (content config + schemas + content)
- **Tooling:** Bun workspaces + catalog, Biome (tabs). Mirror `astro-dev-cms-gui` style.
- **Never hand-edit** `packages/fixture/public/admin/config.yml`. CI runs `codegen:check`.
- **Emit runtime:** `bun run build` in `zod-decap-local` writes `dist/`; integration spawns Decap emit with `process.execPath` + `dist/cli.js`. Root `dev` / `build` / `check` build the package first. Bun is monorepo-default for tests (`bun test src`); consumers need the compiled `dist/`, not Bun.

## Source of truth (per app)

- **Registry:** `src/content.config.ts` `export const collections` (Astro Content Layer)
- **Schemas:** plain Zod (+ optional `.meta(fieldOptions|collectionOptions)`) in the app
- **Generate:** `zodDecap` on `astro dev` / `astro build`, or CLI `--check`
- See `docs/adr/0001-content-config-registry-and-boot-proxies.md`

## Local editorial

`bun run dev` → fixture Astro + integration-spawned `decap-server`. Config must keep `local_backend: true`. No OAuth routes.

Fixture pins port **4321**; if busy, Astro takes the next free port — open `/admin` on that port. Missing `decap-server@3.11.0` should fail with an install hint (`bun add -d decap-server@3.11.0`). Default watch regenerates YAML when `content.config` / `watchExtra` modules change.

## Do not

- Build YAML→Zod or bidirectional sync
- Add a Content Layer loader “for Decap”
- Reintroduce GitHub OAuth / SSR adapter for this stopgap
- Import or publish shared packages with `astro-dev-cms-gui` / `@cms/*`
- Expand widget parity beyond the boring subset without an explicit ask
- Bring back a parallel `collectionSchemas` registry

## Prove the loop

`bun run dev` → edit in `/admin` → file changes under `packages/fixture/src/content/` → site shows content via `glob()`.

CI can publish fixture `dist/` to GitHub Pages; editorial remains local-only.
