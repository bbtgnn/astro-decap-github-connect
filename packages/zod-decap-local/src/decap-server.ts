/**
 * Resolve the pinned `decap-server` binary from this package's own dependencies.
 * Newer publishes break non-pnpm installs — keep the pin explicit in errors.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { DECAP_SERVER_PIN } from "./pins";

export { DECAP_SERVER_PIN };

export type DecapServerResolve =
	| { ok: true; bin: string; version: string; warn?: string }
	| { ok: false; message: string };

export function missingDecapServerMessage(): string {
	return [
		`zod-decap-local could not find its pinned dependency decap-server@${DECAP_SERVER_PIN}.`,
		"Reinstall workspace deps (e.g. bun install) or reinstall zod-decap-local.",
		"(Newer versions use pnpm catalog: deps and break non-pnpm installs.)",
	].join(" ");
}

/**
 * Resolve `decap-server` from the library package (default: this module).
 * Optional `requireFrom` is for tests that simulate a broken install.
 */
export function resolveDecapServer(
	requireFrom: string | URL = import.meta.url,
): DecapServerResolve {
	try {
		const require = createRequire(requireFrom);
		const pkgJsonPath = require.resolve("decap-server/package.json");
		const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
			version?: string;
			bin?: string | Record<string, string>;
		};
		const version = pkg.version ?? "unknown";
		const binRel =
			typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["decap-server"];
		if (!binRel) {
			return { ok: false, message: missingDecapServerMessage() };
		}
		const bin = join(dirname(pkgJsonPath), binRel);
		if (!existsSync(bin)) {
			return { ok: false, message: missingDecapServerMessage() };
		}
		const warn =
			version !== DECAP_SERVER_PIN
				? `Found decap-server@${version}; expected ${DECAP_SERVER_PIN} (reinstall zod-decap-local / workspace deps).`
				: undefined;
		return { ok: true, bin, version, warn };
	} catch {
		return { ok: false, message: missingDecapServerMessage() };
	}
}
