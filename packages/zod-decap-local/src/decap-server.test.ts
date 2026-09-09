import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DECAP_SERVER_PIN,
	missingDecapServerMessage,
	resolveDecapServer,
} from "./decap-server";

describe("resolveDecapServer", () => {
	test("finds pinned binary from fixture workspace", () => {
		const fixtureRoot = join(import.meta.dir, "../../fixture");
		const result = resolveDecapServer(fixtureRoot);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.version).toBe(DECAP_SERVER_PIN);
		expect(result.bin).toContain("decap-server");
		expect(result.warn).toBeUndefined();
	});

	test("fails with install hint when package is missing", () => {
		const empty = mkdtempSync(join(tmpdir(), "zod-decap-no-decap-"));
		const result = resolveDecapServer(empty);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toContain(`decap-server@${DECAP_SERVER_PIN}`);
		expect(result.message).toContain("bun add -d decap-server@");
	});
});

describe("missingDecapServerMessage", () => {
	test("mentions pin and install command", () => {
		const msg = missingDecapServerMessage();
		expect(msg).toContain(DECAP_SERVER_PIN);
		expect(msg).toContain("bun add -d");
	});
});
