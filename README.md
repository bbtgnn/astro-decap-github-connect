# Astro + Decap stopgap (local)

Monorepo:

| Path | Role |
| --- | --- |
| `packages/zod-decap-local` | Field helpers, Zod→Decap codegen, Astro integration, CLI |
| `packages/fixture` | Astro dogfood site (schemas + content) |

Schema owner is **Zod 4** + FieldUi `.meta()` in the **app**. Decap is a temporary **local** editor via `local_backend` + `decap-server`. Astro loads content with Content Layer `glob()` — no Decap loader, no GitHub OAuth.

## Loop

```
App schemas (Zod + FieldUi)
    → zodDecap integration → public/admin/config.yml
    → Decap /admin + decap-server → writes src/content/**
    → Astro glob() picks up files
```

## Setup

```bash
bun install
bun run dev
```

Open:

- Site: http://127.0.0.1:4321
- Admin: http://127.0.0.1:4321/admin

The fixture pins `--port 4321`. If that port is already taken, Astro binds the next free port (e.g. 4322) — use that host:port for both the site and `/admin`. The integration logs the admin URL on startup (and calls out when it had to leave 4321).

`bun run dev` runs the fixture; the integration writes config and starts `decap-server`. Edits save into the working tree — no login.

> `decap-server` is pinned to `3.11.0` (newer publishes use pnpm `catalog:` deps that break non-pnpm installs). Install with `bun add -d decap-server@3.11.0` in the Astro app; the integration errors clearly if it is missing.

Optional: `watchSchemas: true` (with `schemaOwnerHint` pointing at the schemas module) regenerates `config.yml` on schema edits without waiting for a full Astro restart.

## Consumer sketch

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import { zodDecap } from "zod-decap-local/astro";
import { collectionSchemas } from "./src/lib/schemas.ts";

export default defineConfig({
  integrations: [
    zodDecap({
      collections: collectionSchemas,
      schemaOwnerHint: "src/lib/schemas.ts",
      watchSchemas: true, // optional: regen config.yml on schema edits
    }),
  ],
});
```

## Scripts (repo root)

- `bun run dev` — fixture Astro + local Decap
- `bun run build` — fixture static build (regenerates YAML)
- `bun run test` — codegen unit tests
- `bun run check` — `tsc` + YAML drift guard
- `bun run lint` / `bun run format` — Biome

## Deploy

Static `dist/` is fine for the public site. **Do not expect `/admin` editing on a static host** — Decap local proxy only works next to `decap-server`.

## Rules

1. Edit schemas in the app — never hand-edit `config.yml`
2. Do not add YAML→Zod or bidirectional sync
3. Do not add a Content Layer “Decap loader”
4. Do not reintroduce GitHub OAuth unless product scope changes
5. Not `@cms/*` — disposable when the authoring shell lands

See `CONTEXT.md` and `AGENTS.md`.
