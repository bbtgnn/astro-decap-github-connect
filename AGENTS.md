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

`bun run dev` → fixture Astro + **editorial session** (owned `decap-server` + `decap-cms`, Decap emit at config setup). Config must keep `local_backend: true`. No OAuth routes. Session lives in `packages/zod-decap-local/src/session/`; `astro.ts` is the thin Astro adapter.

- **Astro** pins fixture port **4321**; if busy, Astro takes the next free port — open `/admin` on that port.
- **`decap-server`** is a package dependency pinned at `3.11.0`, always on **`:8081`**. A stranger on 8081 → fail (no soft-adopt / free-port / YAML URL rewrite). Missing pin → reinstall workspace deps / `zod-decap-local`.
- **Admin CMS** is copied from npm `decap-cms@3.11.0` beside `config.yml` (`publishAdmin`); no unpkg CDN.
- **Schema / content-config edits need an Astro restart.** Emit runs once at `astro:config:setup` — there is no schema watch. After restart, hard-refresh `/admin` so Decap loads the new YAML.

## Do not

- Build YAML→Zod or bidirectional sync
- Add a Content Layer loader “for Decap”
- Reintroduce GitHub OAuth / SSR adapter
- Import or publish shared packages with `astro-dev-cms-gui` / `@cms/*`
- Expand widget parity beyond the boring subset without an explicit ask
- Bring back a parallel `collectionSchemas` registry
- Soft-adopt strangers on `:8081` or rewrite `local_backend.url` for free ports
- Reintroduce schema-watch / `watchExtra` without an explicit product ask

## Prove the loop

`bun run dev` → edit in `/admin` → file changes under `packages/fixture/src/content/` → site shows content via `glob()`.

CI can publish fixture `dist/` to GitHub Pages; editorial remains local-only.
