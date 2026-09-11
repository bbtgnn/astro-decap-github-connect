# Astro + Decap (local)

Monorepo:

| Path | Role |
| --- | --- |
| `packages/zod-decap-local` | Field helpers, Zod→Decap codegen, Astro integration, CLI |
| `packages/fixture` | Astro dogfood site (schemas + content) |

Schema owner is **Zod 4** + FieldUi `.meta()` in the **app**. Decap is the **local** editor via `local_backend` + `decap-server`. Astro loads content with Content Layer `glob()` — no Decap loader, no GitHub OAuth.

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

`bun run dev` runs the fixture; the integration writes config (`local_backend: true`) and starts a local Decap session on **8081**. Edits save into the working tree — no login.

> `decap-server` is pinned to `3.11.0` as a dependency of `zod-decap-local` (newer publishes use pnpm `catalog:` deps that break non-pnpm installs). Consumer apps do not declare it; if resolution fails, reinstall workspace deps / `zod-decap-local`. Proxy requires port `8081`; if that port is busy and not owned by our session, startup fails (no free-port pick, no YAML URL rewrite). The Decap CMS UI script is **vendored** at the same pin (no CDN) and synced into `public/admin/`.

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

CI (`.github/workflows/deploy.yml`) builds the fixture and, on `main`, publishes `packages/fixture/dist` to **GitHub Pages** (project site: `https://<owner>.github.io/<repo>/`).

Build env (set in the workflow):

- `PUBLIC_SITE_URL` — canonical site URL
- `PUBLIC_BASE_PATH` — Astro `base` (e.g. `/<repo>` for project Pages)

**Admin stays local.** A static host may serve `/admin` assets, but Decap write-back needs `decap-server` next to the working tree — use `bun run dev` for editorial.

Nav links and frontmatter `heroImage` paths respect `base`. Markdown body images that use root-absolute `/images/...` still resolve from the host root (prefer a custom domain, or keep media relative, if you rely on project-site subpaths).

After the first successful deploy, set the repo Pages source to **GitHub Actions** (Settings → Pages).

## Rules

1. Edit schemas in the app — never hand-edit `config.yml`
2. Do not add YAML→Zod or bidirectional sync
3. Do not add a Content Layer “Decap loader”
4. Do not reintroduce GitHub OAuth unless product scope changes
5. Keep this package separate from `@cms/*`

See `CONTEXT.md` and `AGENTS.md`.
