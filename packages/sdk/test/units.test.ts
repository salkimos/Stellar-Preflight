import { test } from "node:test";
import assert from "node:assert/strict";
import { toUnits, fromUnits } from "../src/amount.ts";
import { parseAsset } from "../src/asset.ts";
import { simReason } from "../src/preflight.ts";

test("toUnits", () => {
  assert.equal(toUnits("1", 7), 10_000_000n);
  assert.equal(toUnits("0.0000001", 7), 1n);
  assert.equal(toUnits("12.5", 2), 1250n);
  assert.equal(toUnits("1.", 7), null);
  assert.equal(toUnits("-1", 7), null);
  assert.equal(toUnits("1e5", 7), null);
});

test("fromUnits", () => {
  assert.equal(fromUnits(50_000_000n, 7), "5");
  assert.equal(fromUnits(1n, 7), "0.0000001");
  assert.equal(fromUnits(1250n, 2), "12.5");
});

test("parseAsset", () => {
  assert.deepEqual(parseAsset("xlm"), { type: "native" });
  assert.equal(parseAsset("USDC:nope"), null);
  assert.equal(parseAsset("TOOLONGASSETCODE:GA"), null);
});

test("simReason", () => {
  assert.equal(simReason('HostError: x\n 0: [Diagnostic Event] data:["account entry is missing", G..]'), "account entry is missing");
  assert.equal(simReason("HostError: Error(Storage, MissingValue)\nmore"), "HostError: Error(Storage, MissingValue)");
});
