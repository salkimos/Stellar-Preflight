import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Asset, MuxedAccount, Account } from "@stellar/stellar-sdk";
import { preflight, type PreflightInput, type PreflightResult } from "../src/index.ts";
import { FakeChain, g, c, sep41 } from "./fake.ts";

const run = (chain: FakeChain, input: Partial<PreflightInput>) =>
  preflight({ network: "testnet", recipient: "", asset: "XLM", amount: "10", ...input }, { chain });

const codesOf = (r: PreflightResult) => r.issues.map((i) => i.code);

function muxed(base: string, id = "42") {
  return new MuxedAccount(new Account(base, "0"), id).accountId();
}

function issuerWith(chain: FakeChain, flags = {}) {
  const issuer = chain.addAccount(g(), flags);
  return new Asset("USDC", issuer);
}

describe("input", () => {
  test("rejects a bad recipient", async () => {
    const r = await run(new FakeChain(), { recipient: "GABC" });
    assert.equal(r.status, "BLOCKED");
    assert.deepEqual(codesOf(r), ["INVALID_RECIPIENT"]);
  });

  test("rejects a bad asset", async () => {
    const r = await run(new FakeChain(), { recipient: g(), asset: "USDC" });
    assert.deepEqual(codesOf(r), ["INVALID_ASSET"]);
  });

  test("rejects too many decimals", async () => {
    const chain = new FakeChain();
    const r = await run(chain, { recipient: chain.addAccount(), amount: "1.12345678" });
    assert.deepEqual(codesOf(r), ["INVALID_AMOUNT"]);
  });

  test("rejects zero", async () => {
    const chain = new FakeChain();
    const r = await run(chain, { recipient: chain.addAccount(), amount: "0" });
    assert.deepEqual(codesOf(r), ["INVALID_AMOUNT"]);
  });
});

describe("XLM to G", () => {
  test("ready when the account exists", async () => {
    const chain = new FakeChain();
    const r = await run(chain, { recipient: chain.addAccount() });
    assert.equal(r.status, "READY");
    assert.equal(r.route, "payment");
    assert.equal(r.recipient?.kind, "account");
  });

  test("inactive account: warns and suggests createAccount for >= 1 XLM", async () => {
    const r = await run(new FakeChain(), { recipient: g(), amount: "5" });
    assert.equal(r.status, "WARNING");
    assert.equal(r.route, "create_account");
    assert.deepEqual(codesOf(r), ["ACCOUNT_NOT_FOUND_CREATE"]);
  });

  test("inactive account: blocked below 1 XLM", async () => {
    const r = await run(new FakeChain(), { recipient: g(), amount: "0.5" });
    assert.equal(r.status, "BLOCKED");
    assert.deepEqual(codesOf(r), ["ACCOUNT_NOT_FOUND_LOW_AMOUNT"]);
  });

  test("memo required (SEP-29)", async () => {
    const chain = new FakeChain();
    const r = await run(chain, { recipient: chain.addAccount(g(), { memoRequired: true }) });
    assert.equal(r.status, "WARNING");
    assert.deepEqual(codesOf(r), ["MEMO_REQUIRED"]);
  });
});

describe("muxed recipients", () => {
  test("decodes the base account and id", async () => {
    const chain = new FakeChain();
    const base = chain.addAccount();
    const r = await run(chain, { recipient: muxed(base, "9001") });
    assert.equal(r.status, "READY");
    assert.equal(r.recipient?.kind, "muxed");
    assert.ok(r.recipient?.kind === "muxed" && r.recipient.base === base && r.recipient.id === "9001");
    assert.deepEqual(codesOf(r), ["MUXED_RECIPIENT"]);
  });

  test("blocked when the base account is missing, even for XLM", async () => {
    const r = await run(new FakeChain(), { recipient: muxed(g()), amount: "5" });
    assert.equal(r.status, "BLOCKED");
    assert.ok(codesOf(r).includes("ACCOUNT_NOT_FOUND_MUXED"));
  });

  test("muxed satisfies memo-required", async () => {
    const chain = new FakeChain();
    const base = chain.addAccount(g(), { memoRequired: true });
    const r = await run(chain, { recipient: muxed(base) });
    assert.equal(r.status, "READY");
  });

  test("classic asset checks run against the base account", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const base = chain.addAccount();
    const r = await run(chain, { recipient: muxed(base), asset: usdc.toString() });
    assert.ok(codesOf(r).includes("TRUSTLINE_MISSING"));
  });
});

describe("classic assets to G", () => {
  test("ready with an authorized trustline", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const to = chain.addAccount();
    chain.addTrustline(to, usdc);
    const r = await run(chain, { recipient: to, asset: usdc.toString() });
    assert.equal(r.status, "READY");
    assert.equal(r.asset?.kind, "classic");
  });

  test("missing trustline", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const r = await run(chain, { recipient: chain.addAccount(), asset: usdc.toString() });
    assert.equal(r.status, "BLOCKED");
    assert.deepEqual(codesOf(r), ["TRUSTLINE_MISSING"]);
  });

  test("unauthorized trustline", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain, { authRequired: true });
    const to = chain.addAccount();
    chain.addTrustline(to, usdc, { authorized: false });
    const r = await run(chain, { recipient: to, asset: usdc.toString() });
    assert.deepEqual(codesOf(r), ["TRUSTLINE_NOT_AUTHORIZED"]);
  });

  test("authorized to maintain liabilities only", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const to = chain.addAccount();
    chain.addTrustline(to, usdc, { authorized: false, authorizedToMaintainLiabilities: true });
    const r = await run(chain, { recipient: to, asset: usdc.toString() });
    assert.deepEqual(codesOf(r), ["TRUSTLINE_LIMITED_AUTH"]);
  });

  test("insufficient capacity counts balance and buying liabilities", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const to = chain.addAccount();
    chain.addTrustline(to, usdc, { limit: 100_0000000n, balance: 80_0000000n, buyingLiabilities: 15_0000000n });
    const r = await run(chain, { recipient: to, asset: usdc.toString(), amount: "10" });
    assert.equal(r.status, "BLOCKED");
    assert.deepEqual(codesOf(r), ["TRUSTLINE_LIMIT_EXCEEDED"]);
    assert.match(r.issues[0].message, /at most 5 USDC/);
  });

  test("exact capacity is fine", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const to = chain.addAccount();
    chain.addTrustline(to, usdc, { limit: 100_0000000n, balance: 90_0000000n });
    const r = await run(chain, { recipient: to, asset: usdc.toString(), amount: "10" });
    assert.equal(r.status, "READY");
  });

  test("inactive recipient", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const r = await run(chain, { recipient: g(), asset: usdc.toString() });
    assert.deepEqual(codesOf(r), ["ACCOUNT_NOT_FOUND"]);
  });

  test("missing issuer", async () => {
    const chain = new FakeChain();
    const r = await run(chain, { recipient: chain.addAccount(), asset: `USDC:${g()}` });
    assert.deepEqual(codesOf(r), ["ISSUER_NOT_FOUND"]);
  });

  test("paying the issuer needs no trustline", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const r = await run(chain, { recipient: usdc.getIssuer(), asset: usdc.toString() });
    assert.equal(r.status, "READY");
    assert.deepEqual(codesOf(r), ["RECIPIENT_IS_ISSUER"]);
  });

  test("clawback is reported as info", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain, { clawbackEnabled: true, authRevocable: true });
    const to = chain.addAccount();
    chain.addTrustline(to, usdc);
    const r = await run(chain, { recipient: to, asset: usdc.toString() });
    assert.equal(r.status, "READY");
    assert.deepEqual(codesOf(r), ["ASSET_CLAWBACK_ENABLED"]);
  });
});

describe("contract recipients", () => {
  test("XLM to a contract goes through the native SAC", async () => {
    const chain = new FakeChain();
    chain.deploySac(Asset.native());
    const to = chain.addContract();
    const r = await run(chain, { recipient: to });
    assert.equal(r.status, "READY");
    assert.equal(r.route, "contract_transfer");
    assert.equal(r.asset?.contractId, Asset.native().contractId(chain.passphrase));
    assert.deepEqual(codesOf(r), ["CONTRACT_NEEDS_SAC_TRANSFER", "TRANSFER_NOT_SIMULATED"]);
  });

  test("missing contract", async () => {
    const chain = new FakeChain();
    chain.deploySac(Asset.native());
    const r = await run(chain, { recipient: c() });
    assert.deepEqual(codesOf(r), ["CONTRACT_NOT_FOUND"]);
  });

  test("classic asset without a deployed SAC", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const r = await run(chain, { recipient: chain.addContract(), asset: usdc.toString() });
    assert.equal(r.status, "BLOCKED");
    assert.deepEqual(codesOf(r), ["SAC_NOT_DEPLOYED"]);
    assert.match(r.issues[0].action!, /stellar contract asset deploy/);
  });

  test("classic asset with SAC, no auth required", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    chain.deploySac(usdc);
    const r = await run(chain, { recipient: chain.addContract(), asset: usdc.toString() });
    assert.equal(r.status, "READY");
  });

  test("auth-required asset, contract has no balance yet", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain, { authRequired: true });
    chain.deploySac(usdc);
    const r = await run(chain, { recipient: chain.addContract(), asset: usdc.toString() });
    assert.ok(codesOf(r).includes("CONTRACT_BALANCE_NEEDS_AUTH"));
  });

  test("deauthorized contract balance", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const sac = chain.deploySac(usdc);
    const to = chain.addContract();
    chain.sacBalances.set(`${sac}/${to}`, { amount: 0n, authorized: false });
    const r = await run(chain, { recipient: to, asset: usdc.toString() });
    assert.ok(codesOf(r).includes("CONTRACT_BALANCE_NOT_AUTHORIZED"));
  });

  test("with a sender, the transfer is simulated", async () => {
    const chain = new FakeChain();
    chain.deploySac(Asset.native());
    chain.sacHandler = () => ({ ok: false, error: 'HostError: Error(Contract, #10)\n  0: [Diagnostic Event] data:["balance is not sufficient to spend", 0, 100]' });
    const r = await run(chain, { recipient: chain.addContract(), from: g() });
    assert.equal(r.status, "BLOCKED");
    assert.equal(r.issues.at(-1)!.code, "TRANSFER_SIMULATION_FAILED");
    assert.match(r.issues.at(-1)!.message, /balance is not sufficient/);
  });
});

describe("SAC transfers (asset given as a contract id)", () => {
  test("resolves the SAC to its classic asset and checks the trustline", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const sac = chain.deploySac(usdc);
    const r = await run(chain, { recipient: chain.addAccount(), asset: sac });
    assert.equal(r.asset?.kind, "sac");
    assert.equal(r.asset?.label, usdc.toString());
    assert.deepEqual(codesOf(r), ["TRUSTLINE_MISSING"]);
  });

  test("ready with trustline and a passing simulation", async () => {
    const chain = new FakeChain();
    const usdc = issuerWith(chain);
    const sac = chain.deploySac(usdc);
    const to = chain.addAccount();
    chain.addTrustline(to, usdc);
    const r = await run(chain, { recipient: to, asset: sac, from: g() });
    assert.equal(r.status, "READY");
    assert.equal(r.route, "contract_transfer");
  });
});

describe("SEP-41 tokens", () => {
  test("warns when the transfer cannot be simulated", async () => {
    const chain = new FakeChain();
    const token = chain.addContract(c(), "wasm", sep41());
    const r = await run(chain, { recipient: chain.addAccount(), asset: token });
    assert.equal(r.status, "WARNING");
    assert.equal(r.asset?.label, "TKN");
    assert.equal(r.asset?.decimals, 6);
    assert.deepEqual(codesOf(r), ["SEP41_NOT_SIMULATED"]);
  });

  test("ready when the simulation passes", async () => {
    const chain = new FakeChain();
    const token = chain.addContract(c(), "wasm", sep41());
    const r = await run(chain, { recipient: chain.addAccount(), asset: token, from: g() });
    assert.equal(r.status, "READY");
    assert.deepEqual(codesOf(r), ["CUSTOM_TOKEN_LOGIC"]);
  });

  test("blocked when the simulation fails", async () => {
    const chain = new FakeChain();
    const token = chain.addContract(c(), "wasm", sep41(() => ({ ok: false, error: 'x data:["recipient is frozen"]' })));
    const r = await run(chain, { recipient: chain.addAccount(), asset: token, from: g() });
    assert.equal(r.status, "BLOCKED");
    assert.match(r.issues[0].message, /recipient is frozen/);
  });

  test("uses the token's decimals for the amount", async () => {
    const chain = new FakeChain();
    const token = chain.addContract(c(), "wasm", sep41());
    const r = await run(chain, { recipient: chain.addAccount(), asset: token, amount: "1.1234567" });
    assert.deepEqual(codesOf(r), ["INVALID_AMOUNT"]);
  });

  test("contract recipient", async () => {
    const chain = new FakeChain();
    const token = chain.addContract(c(), "wasm", sep41());
    const r = await run(chain, { recipient: chain.addContract(), asset: token, from: g() });
    assert.equal(r.status, "READY");
  });

  test("not a token", async () => {
    const chain = new FakeChain();
    const notToken = chain.addContract(c(), "wasm", () => ({ ok: false, error: "no such function" }));
    const r = await run(chain, { recipient: chain.addAccount(), asset: notToken });
    assert.deepEqual(codesOf(r), ["NOT_A_TOKEN"]);
  });

  test("missing token contract", async () => {
    const r = await run(new FakeChain(), { recipient: g(), asset: c() });
    assert.deepEqual(codesOf(r), ["TOKEN_NOT_FOUND"]);
  });

  test("muxed recipient warns that the id may be lost", async () => {
    const chain = new FakeChain();
    const token = chain.addContract(c(), "wasm", sep41());
    const r = await run(chain, { recipient: muxed(chain.addAccount()), asset: token, from: g() });
    assert.ok(codesOf(r).includes("MUXED_CUSTOM_TOKEN"));
    assert.equal(r.status, "WARNING");
  });
});


test("SEP-41 contract errors are named from the token's spec", async () => {
  const chain = new FakeChain();
  const token = chain.addContract(c(), "wasm", sep41(() => ({ ok: false, error: 'HostError: Error(Contract, #3)\n data:["failing with contract error", 3]' })));
  chain.errorName = async (_id, code) => (code === 3 ? "Frozen" : null);
  const r = await run(chain, { recipient: chain.addAccount(), asset: token, from: g() });
  assert.match(r.issues[0].message, /token returned Frozen \(error #3\)/);
});
