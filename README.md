# Astro + Decap stopgap (local)

Monorepo:

| Path | Role |
| --- | --- |
| `packages/zod-decap-local` | fieldOptions meta, Zod→Decap emit, Astro integration, CLI |
| `packages/fixture` | Astro dogfood site (content config + schemas + content) |

Schema owner is **plain Zod 4** (optional `.meta(fieldOptions(…))`) wired through Astro’s **`content.config` `collections`**. Decap is a temporary **local** editor via `local_backend` + `decap-server`. No parallel `collectionSchemas` list, no GitHub OAuth.

## Loop

```
content.config collections (Zod + optional meta, glob loaders)
    → zodDecap emit → public/admin/config.yml
    → Decap /admin + decap-server → writes content files
    → Astro Content Layer picks up files
```

## Setup

```bash
bun install
bun run dev
```

Open:

- Site: http://127.0.0.1:4321
- Admin: http://127.0.0.1:4321/admin

The fixture pins `--port 4321`. If that port is already taken, Astro binds the next free port — use that host:port for both the site and `/admin`.

`bun run dev` runs the fixture; the integration writes config and starts `decap-server`. Edits save into the working tree — no login.

> `decap-server` is pinned to `3.11.0`. Install with `bun add -d decap-server@3.11.0` in the Astro app if missing.

## Consumer sketch

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import { zodDecap } from "zod-decap-local/astro";

export default defineConfig({
  integrations: [
    zodDecap({
      // contentConfig auto-discovered (src/content.config.ts)
      watchExtra: "src/lib/schemas.ts", // optional: regen when schemas change
    }),
  ],
});
```

```ts
// src/lib/schemas.ts
import { z } from "zod";
import { fieldOptions, collectionOptions } from "zod-decap-local";

export const postsSchema = z
  .object({
    title: z.string().meta(fieldOptions({ label: "Title" })),
    heroImage: z
      .string()
      .meta(fieldOptions({ widget: "image", label: "Hero" }))
      .optional(),
  })
  .meta(collectionOptions({ label: "Posts" }));
```

Folder/extension for Decap come from stamped `glob({ base, pattern })` in `content.config` unless overridden in `collectionOptions`.

## Scripts (repo root)

- `bun run dev` — fixture Astro + local Decap
- `bun run build` — fixture static build (regenerates YAML)
- `bun run test` — emit unit tests
- `bun run check` — `tsc` + YAML drift guard
- `bun run lint` / `bun run format` — Biome

## Deploy

CI (`.github/workflows/deploy.yml`) builds the fixture and, on `main`, publishes `packages/fixture/dist` to **GitHub Pages**.

**Admin stays local.** Use `bun run dev` for editorial.
