import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { format } from "../src/format.ts";

const run = promisify(execFile);
const cli = new URL("../src/cli.ts", import.meta.url).pathname;

test("format: blocked result with an action", () => {
  const out = format({
    status: "BLOCKED",
    recipient: { kind: "account", address: "G..." },
    asset: { kind: "classic", label: "USDC:G..." },
    issues: [{ code: "TRUSTLINE_MISSING", severity: "blocking", message: "Recipient has no trustline for USDC.", action: "Add one." }],
  });
  assert.equal(out, [
    "BLOCKED",
    "recipient account",
    "asset     classic USDC:G...",
    "",
    "x TRUSTLINE_MISSING  Recipient has no trustline for USDC.",
    "  -> Add one.",
  ].join("\n"));
});

test("usage error exits 2", async () => {
  await assert.rejects(run("node", [cli, "--to", "G"]), (e: { code: number }) => e.code === 2);
});

test("invalid input exits 1 with JSON", async () => {
  // Input validation happens before any network call.
  const err = await run("node", [cli, "--to", "nope", "--asset", "XLM", "--amount", "1", "--json"]).catch((e) => e);
  assert.equal(err.code, 1);
  assert.equal(JSON.parse(err.stdout).issues[0].code, "INVALID_RECIPIENT");
});
