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
	test("finds pinned binary from this package", () => {
		const result = resolveDecapServer();
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.version).toBe(DECAP_SERVER_PIN);
		expect(result.bin).toContain("decap-server");
		expect(result.warn).toBeUndefined();
	});

	test("fails with reinstall hint when package is missing", () => {
		const empty = mkdtempSync(join(tmpdir(), "zod-decap-no-decap-"));
		const result = resolveDecapServer(join(empty, "package.json"));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toContain(`decap-server@${DECAP_SERVER_PIN}`);
		expect(result.message).toContain("Reinstall workspace deps");
		expect(result.message).not.toContain("bun add -d decap-server");
	});
});

describe("missingDecapServerMessage", () => {
	test("mentions pin and reinstall guidance", () => {
		const msg = missingDecapServerMessage();
		expect(msg).toContain(DECAP_SERVER_PIN);
		expect(msg).toContain("zod-decap-local");
		expect(msg).toContain("Reinstall workspace deps");
		expect(msg).not.toContain("bun add -d");
	});
});
