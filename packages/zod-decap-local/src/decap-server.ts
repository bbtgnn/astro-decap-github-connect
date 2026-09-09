/**
 * Resolve the pinned `decap-server` binary from an Astro app's node_modules.
 * Newer publishes break non-pnpm installs — keep the pin explicit in errors.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export const DECAP_SERVER_PIN = "3.11.0";

export type DecapServerResolve =
	| { ok: true; bin: string; version: string; warn?: string }
	| { ok: false; message: string };

export function missingDecapServerMessage(): string {
	return [
		`decap-server@${DECAP_SERVER_PIN} is required for local_backend but was not found.`,
		`Install it in the Astro app: bun add -d decap-server@${DECAP_SERVER_PIN}`,
		"(Newer versions use pnpm catalog: deps and break non-pnpm installs.)",
	].join(" ");
}

export function resolveDecapServer(fromDir: string): DecapServerResolve {
	try {
		const require = createRequire(join(fromDir, "package.json"));
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
				? `Found decap-server@${version}; pin ${DECAP_SERVER_PIN} (bun add -d decap-server@${DECAP_SERVER_PIN}).`
				: undefined;
		return { ok: true, bin, version, warn };
	} catch {
		return { ok: false, message: missingDecapServerMessage() };
	}
}
