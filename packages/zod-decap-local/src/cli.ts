/**
 * CLI for CI drift checks. Prefer the Astro integration for normal writes.
 * Built to `dist/cli.js` (bin + process.execPath); monorepo may run `bun src/cli.ts`.
 *
 *   zod-decap-local --check --root .
 *   zod-decap-local --root . --content-config ./src/content.config.ts
 */
import { resolve } from "node:path";
import { emitFromContentConfig } from "./emit";

function argValue(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	if (idx === -1) return undefined;
	return process.argv[idx + 1];
}

const check = process.argv.includes("--check");
const root = resolve(argValue("--root") ?? process.cwd());
const contentConfig = argValue("--content-config") ?? argValue("--from");

try {
	const result = await emitFromContentConfig({
		root,
		contentConfig,
		check,
		outFile: argValue("--out"),
		mediaFolder: argValue("--media-folder"),
		publicFolder: argValue("--public-folder"),
	});
	if (result.wrote) {
		console.log(`Wrote config.yml under ${root}`);
	} else {
		console.log("config.yml is up to date");
	}
} catch (err) {
	const msg = err instanceof Error ? err.message : String(err);
	console.error(msg);
	process.exit(1);
}
