// Runs every scenario in examples/testnet.json against the live testnet.
// Skipped unless PREFLIGHT_LIVE=1, so the default test run stays offline.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preflight, type PreflightInput } from "../src/index.ts";

const live = process.env.PREFLIGHT_LIVE === "1";
const fixtures = JSON.parse(readFileSync(new URL("../../../examples/testnet.json", import.meta.url), "utf8"));

for (const s of fixtures.scenarios as (PreflightInput & { name: string; expect: string })[]) {
  test(s.name, { skip: !live && "set PREFLIGHT_LIVE=1" }, async () => {
    const { name, expect, ...input } = s;
    const r = await preflight(input);
    assert.equal(r.status, expect, `${name}: ${JSON.stringify(r.issues, null, 2)}`);
  });
}
