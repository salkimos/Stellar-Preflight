import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHandler } from "../src/app.ts";

let server: Server;
let base: string;
const seen: unknown[] = [];

before(async () => {
  server = createServer(createHandler({
    run: async (input) => {
      seen.push(input);
      return { status: "READY", issues: [] };
    },
  }));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const post = (body: unknown) =>
  fetch(`${base}/preflight`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

test("health", async () => {
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { ok: true });
});

test("valid request defaults to testnet", async () => {
  const res = await post({ recipient: "G", asset: "XLM", amount: "1" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "READY");
  assert.deepEqual(seen.at(-1), { network: "testnet", recipient: "G", asset: "XLM", amount: "1" });
});

test("missing field", async () => {
  const res = await post({ recipient: "G", asset: "XLM" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /amount/);
});

test("bad JSON", async () => {
  assert.equal((await post("{nope")).status, 400);
});

test("mainnet without a configured RPC", async () => {
  const res = await post({ network: "mainnet", recipient: "G", asset: "XLM", amount: "1" });
  assert.equal(res.status, 400);
});

test("GET on /preflight", async () => {
  assert.equal((await fetch(`${base}/preflight`)).status, 405);
});

test("CORS headers", async () => {
  const res = await fetch(`${base}/preflight`, { method: "OPTIONS" });
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});
