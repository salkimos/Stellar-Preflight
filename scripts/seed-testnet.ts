// Builds one real testnet account or contract per preflight scenario and
// writes their public addresses to examples/testnet.json.
//
//   node scripts/seed-testnet.ts
//
// Keys are generated fresh on every run and never saved. Testnet resets
// periodically; re-run this script when that happens.

import { readFileSync, writeFileSync } from "node:fs";
import {
  rpc, Keypair, Asset, Operation, TransactionBuilder, Networks, BASE_FEE,
  Address, Account, MuxedAccount, nativeToScVal, scValToNative, AuthRequiredFlag, AuthRevocableFlag,
} from "@stellar/stellar-sdk";

const RPC = "https://soroban-testnet.stellar.org";
const server = new rpc.Server(RPC);
const passphrase = Networks.TESTNET;
const wasm = readFileSync(new URL("./demo_token.wasm", import.meta.url));

async function fund(kp: Keypair) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!res.ok) throw new Error(`friendbot failed for ${kp.publicKey()}: ${res.status}`);
}

async function submit(source: Keypair, ops: ReturnType<typeof Operation.payment>[], signers: Keypair[] = [], soroban = false) {
  const acc = await server.getAccount(source.publicKey());
  let tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: passphrase });
  for (const op of ops) tx = tx.addOperation(op);
  let built = tx.setTimeout(60).build();
  if (soroban) built = await server.prepareTransaction(built);
  built.sign(source, ...signers);
  const sent = await server.sendTransaction(built);
  if (sent.status === "ERROR") throw new Error(`send failed: ${JSON.stringify(sent.errorResult)}`);
  const done = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (done.status !== "SUCCESS") throw new Error(`tx ${sent.hash} ended ${done.status}`);
  return { hash: sent.hash, returnValue: done.returnValue };
}

const step = (msg: string) => console.log(`- ${msg}`);

async function main() {
  const issuer = Keypair.random();
  const gatedIssuer = Keypair.random();
  const sender = Keypair.random();
  const ready = Keypair.random();
  const noTrust = Keypair.random();
  const unauth = Keypair.random();
  const lowLimit = Keypair.random();
  const memo = Keypair.random();
  const frozen = Keypair.random();
  const inactive = Keypair.random();

  step("funding accounts with friendbot");
  await Promise.all([issuer, gatedIssuer, sender, ready, noTrust, unauth, lowLimit, memo, frozen].map(fund));

  const OPEN = new Asset("OPEN", issuer.publicKey());
  const GATED = new Asset("GATED", gatedIssuer.publicKey());

  step("GATED issuer requires authorization");
  await submit(gatedIssuer, [Operation.setOptions({ setFlags: (AuthRequiredFlag | AuthRevocableFlag) as 3 })]);

  step("trustlines");
  await submit(ready, [Operation.changeTrust({ asset: OPEN }), Operation.changeTrust({ asset: GATED })]);
  await submit(sender, [Operation.changeTrust({ asset: OPEN })]);
  await submit(unauth, [Operation.changeTrust({ asset: GATED })]);
  await submit(lowLimit, [Operation.changeTrust({ asset: OPEN, limit: "5" })]);
  await submit(memo, [Operation.manageData({ name: "config.memo_required", value: "1" })]);

  step("authorize ready's GATED trustline, fund sender with OPEN");
  await submit(gatedIssuer, [Operation.setTrustLineFlags({ trustor: ready.publicKey(), asset: GATED, flags: { authorized: true } })]);
  await submit(issuer, [Operation.payment({ destination: sender.publicKey(), asset: OPEN, amount: "1000" })]);

  step("deploy SACs for OPEN and GATED");
  await submit(sender, [Operation.createStellarAssetContract({ asset: OPEN })], [], true);
  await submit(sender, [Operation.createStellarAssetContract({ asset: GATED })], [], true);

  step("upload and deploy the demo SEP-41 token");
  const up = await submit(sender, [Operation.uploadContractWasm({ wasm })], [], true);
  const wasmHash = scValToNative(up.returnValue!) as Buffer;
  const dep = await submit(sender, [Operation.createCustomContract({
    address: new Address(sender.publicKey()),
    wasmHash,
    constructorArgs: [nativeToScVal(sender.publicKey(), { type: "address" })],
  })], [], true);
  const token = scValToNative(dep.returnValue!) as string;

  step("deploy a second instance as a plain contract recipient");
  const dep2 = await submit(sender, [Operation.createCustomContract({
    address: new Address(sender.publicKey()),
    wasmHash,
    salt: Keypair.random().rawPublicKey(),
    constructorArgs: [nativeToScVal(sender.publicKey(), { type: "address" })],
  })], [], true);
  const vault = scValToNative(dep2.returnValue!) as string;

  step("mint demo tokens to sender, freeze one recipient");
  const call = (fn: string, args: ReturnType<typeof nativeToScVal>[]) =>
    Operation.invokeContractFunction({ contract: token, function: fn, args });
  await submit(sender, [call("mint", [nativeToScVal(sender.publicKey(), { type: "address" }), nativeToScVal(1000_000000n, { type: "i128" })])], [], true);
  await submit(sender, [call("freeze", [nativeToScVal(frozen.publicKey(), { type: "address" })])], [], true);

  const muxed = new MuxedAccount(new Account(ready.publicKey(), "0"), "1001").accountId();
  const open = OPEN.toString();
  const gated = GATED.toString();
  const openSac = OPEN.contractId(passphrase);
  const s = sender.publicKey();

  const scenarios = [
    { name: "XLM to an active account", recipient: ready.publicKey(), asset: "XLM", amount: "10", expect: "READY" },
    { name: "XLM to an inactive account", recipient: inactive.publicKey(), asset: "XLM", amount: "5", expect: "WARNING" },
    { name: "XLM below the account-creation minimum", recipient: inactive.publicKey(), asset: "XLM", amount: "0.5", expect: "BLOCKED" },
    { name: "Muxed address", recipient: muxed, asset: "XLM", amount: "10", expect: "READY" },
    { name: "Memo required (SEP-29)", recipient: memo.publicKey(), asset: "XLM", amount: "10", expect: "WARNING" },
    { name: "Classic asset with a trustline", recipient: ready.publicKey(), asset: open, amount: "10", expect: "READY" },
    { name: "Classic asset, no trustline", recipient: noTrust.publicKey(), asset: open, amount: "10", expect: "BLOCKED" },
    { name: "Classic asset, unauthorized trustline", recipient: unauth.publicKey(), asset: gated, amount: "10", expect: "BLOCKED" },
    { name: "Classic asset, authorized trustline", recipient: ready.publicKey(), asset: gated, amount: "10", expect: "READY" },
    { name: "Classic asset, trustline limit too low", recipient: lowLimit.publicKey(), asset: open, amount: "10", expect: "BLOCKED" },
    { name: "Classic asset to an inactive account", recipient: inactive.publicKey(), asset: open, amount: "10", expect: "BLOCKED" },
    { name: "XLM to a contract", recipient: vault, asset: "XLM", amount: "10", expect: "READY" },
    { name: "Classic asset to a contract", recipient: vault, asset: open, amount: "10", from: s, expect: "READY" },
    { name: "Auth-required asset to a contract", recipient: vault, asset: gated, amount: "10", expect: "BLOCKED" },
    { name: "SAC transfer to an account", recipient: ready.publicKey(), asset: openSac, amount: "10", from: s, expect: "READY" },
    { name: "SAC transfer, no trustline", recipient: noTrust.publicKey(), asset: openSac, amount: "10", from: s, expect: "BLOCKED" },
    { name: "SAC transfer, sender short of funds", recipient: ready.publicKey(), asset: openSac, amount: "5000", from: s, expect: "BLOCKED" },
    { name: "SEP-41 token, simulated", recipient: ready.publicKey(), asset: token, amount: "25", from: s, expect: "READY" },
    { name: "SEP-41 token, not simulated", recipient: ready.publicKey(), asset: token, amount: "25", expect: "WARNING" },
    { name: "SEP-41 token, recipient frozen by the token", recipient: frozen.publicKey(), asset: token, amount: "25", from: s, expect: "BLOCKED" },
    { name: "SEP-41 token to a contract", recipient: vault, asset: token, amount: "25", from: s, expect: "READY" },
  ].map((x) => ({ network: "testnet", ...x }));

  const out = {
    createdAt: new Date().toISOString().slice(0, 10),
    note: "Testnet resets periodically. Re-run scripts/seed-testnet.ts if these addresses stop resolving.",
    accounts: {
      sender: s, ready: ready.publicKey(), inactive: inactive.publicKey(), noTrustline: noTrust.publicKey(),
      unauthorized: unauth.publicKey(), lowLimit: lowLimit.publicKey(), memoRequired: memo.publicKey(),
      frozen: frozen.publicKey(), openIssuer: issuer.publicKey(), gatedIssuer: gatedIssuer.publicKey(),
    },
    contracts: { demoToken: token, vault, openSac, gatedSac: GATED.contractId(passphrase) },
    scenarios,
  };
  writeFileSync(new URL("../examples/testnet.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote examples/testnet.json (${scenarios.length} scenarios)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
