// Runs every testnet scenario and saves the SDK result to examples/results/.
//   node scripts/write-examples.ts
import { readFileSync, writeFileSync } from "node:fs";
import { preflight } from "../packages/sdk/src/index.ts";

const fixtures = JSON.parse(readFileSync(new URL("../examples/testnet.json", import.meta.url), "utf8"));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

for (const [i, s] of fixtures.scenarios.entries()) {
  const { name, expect, ...input } = s;
  const result = await preflight(input);
  const file = `${String(i + 1).padStart(2, "0")}-${slug(name)}.json`;
  writeFileSync(new URL(`../examples/results/${file}`, import.meta.url), JSON.stringify({ name, input, result }, null, 2) + "\n");
  console.log(`${result.status.padEnd(8)} ${result.status === expect ? "  " : "!!"} ${name}`);
}
