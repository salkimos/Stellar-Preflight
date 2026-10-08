import { Asset, nativeToScVal } from "@stellar/stellar-sdk";
import { parseRecipient, accountOf, type Recipient } from "./address.ts";
import { parseAsset, toStellarAsset, assetFromSacName, assetLabel, type AssetRef } from "./asset.ts";
import { toUnits, fromUnits, CLASSIC_DECIMALS } from "./amount.ts";
import { rpcChain, type Chain, type Network } from "./chain.ts";
import { codes, type Code } from "./codes.ts";

export type Status = "READY" | "WARNING" | "BLOCKED";
export type Severity = "info" | "warning" | "blocking";

export interface Issue {
  code: Code;
  severity: Severity;
  message: string;
  action?: string;
}

/** How the payment would be made if it goes ahead. */
export type Route = "payment" | "create_account" | "contract_transfer";

export interface PreflightInput {
  network: Network;
  recipient: string;
  asset: string;
  amount: string;
  /** Optional sender. When given, contract transfers are simulated from it. */
  from?: string;
}

export interface PreflightResult {
  status: Status;
  route?: Route;
  recipient?: Recipient;
  asset?: {
    kind: "native" | "classic" | "sac" | "sep41";
    label: string;
    contractId?: string;
    decimals?: number;
  };
  issues: Issue[];
}

export interface PreflightOptions {
  rpcUrl?: string;
  /** Inject a chain reader. Defaults to Stellar RPC for the given network. */
  chain?: Chain;
}

export async function preflight(input: PreflightInput, opts: PreflightOptions = {}): Promise<PreflightResult> {
  const r = new Run(input, opts.chain ?? rpcChain(input.network, opts.rpcUrl));
  await r.run();
  return r.result();
}

class Run {
  input: PreflightInput;
  chain: Chain;
  issues: Issue[] = [];
  route?: Route;
  recipient?: Recipient;
  assetInfo?: PreflightResult["asset"];

  constructor(input: PreflightInput, chain: Chain) {
    this.input = input;
    this.chain = chain;
  }

  add(code: Code, vars: Record<string, string> = {}) {
    const c: { severity: Severity; message: string; action?: string } = codes[code];
    const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
    this.issues.push({
      code,
      severity: c.severity,
      message: fill(c.message),
      ...(c.action ? { action: fill(c.action) } : {}),
    });
  }

  result(): PreflightResult {
    const sev = new Set(this.issues.map((i) => i.severity));
    const status: Status = sev.has("blocking") ? "BLOCKED" : sev.has("warning") ? "WARNING" : "READY";
    return {
      status,
      ...(this.route && status !== "BLOCKED" ? { route: this.route } : {}),
      ...(this.recipient ? { recipient: this.recipient } : {}),
      ...(this.assetInfo ? { asset: this.assetInfo } : {}),
      issues: this.issues,
    };
  }

  async run() {
    const recipient = parseRecipient(this.input.recipient);
    const asset = parseAsset(this.input.asset);
    if (!recipient) this.add("INVALID_RECIPIENT");
    if (!asset) this.add("INVALID_ASSET");
    if (this.input.from && !parseRecipient(this.input.from)) this.add("INVALID_SENDER");
    if (!recipient || !asset || this.issues.length) return;

    this.recipient = recipient;
    if (recipient.kind === "muxed") this.add("MUXED_RECIPIENT", { base: recipient.base, id: recipient.id });

    if (asset.type === "contract") return this.contractToken(recipient, asset.contractId);
    return this.classic(recipient, asset, false);
  }

  // XLM or a classic asset, sent either as a classic payment or through its SAC.
  async classic(recipient: Recipient, asset: AssetRef, viaSac: boolean) {
    const sacId = toStellarAsset(asset).contractId(this.chain.passphrase);
    const kind = viaSac ? "sac" : asset.type === "native" ? "native" : "classic";
    this.assetInfo = { kind, label: assetLabel(asset), decimals: CLASSIC_DECIMALS, ...(viaSac ? { contractId: sacId } : {}) };

    const amount = toUnits(this.input.amount, CLASSIC_DECIMALS);
    if (amount === null) return this.add("INVALID_AMOUNT", { decimals: String(CLASSIC_DECIMALS) });

    if (asset.type === "classic") {
      const issuer = await this.chain.account(asset.issuer);
      if (!issuer) return this.add("ISSUER_NOT_FOUND", { issuer: asset.issuer });
      if (issuer.clawbackEnabled) this.add("ASSET_CLAWBACK_ENABLED");
      else if (issuer.authRevocable) this.add("ASSET_AUTH_REVOCABLE");
    }

    if (recipient.kind === "contract") {
      this.route = "contract_transfer";
      await this.contractRecipient(recipient.address, asset, sacId, amount);
    } else {
      this.route = viaSac ? "contract_transfer" : "payment";
      await this.accountRecipient(recipient, asset, amount);
    }

    if (this.route === "contract_transfer") await this.simulateTransfer(sacId, amount);
  }

  async accountRecipient(recipient: Recipient, asset: AssetRef, amount: bigint) {
    const id = accountOf(recipient)!;
    const acc = await this.chain.account(id);

    if (!acc) {
      if (asset.type !== "native") {
        return this.add("ACCOUNT_NOT_FOUND", { account: id });
      }
      if (recipient.kind === "muxed") return this.add("ACCOUNT_NOT_FOUND_MUXED", { account: id });
      if (amount < 10_000_000n) return this.add("ACCOUNT_NOT_FOUND_LOW_AMOUNT");
      if (this.route === "payment") this.route = "create_account";
      return this.add("ACCOUNT_NOT_FOUND_CREATE", { account: id });
    }

    if (acc.memoRequired && recipient.kind !== "muxed") this.add("MEMO_REQUIRED");

    if (asset.type !== "classic") return;
    if (asset.issuer === id) return this.add("RECIPIENT_IS_ISSUER");

    const tl = await this.chain.trustline(id, toStellarAsset(asset));
    if (!tl) return this.add("TRUSTLINE_MISSING", { code: asset.code });
    if (!tl.authorized) {
      return this.add(tl.authorizedToMaintainLiabilities ? "TRUSTLINE_LIMITED_AUTH" : "TRUSTLINE_NOT_AUTHORIZED", { code: asset.code });
    }
    const room = tl.limit - tl.balance - tl.buyingLiabilities;
    if (room < amount) {
      this.add("TRUSTLINE_LIMIT_EXCEEDED", {
        code: asset.code,
        room: fromUnits(room < 0n ? 0n : room, CLASSIC_DECIMALS),
        amount: this.input.amount,
      });
    }
  }

  async contractRecipient(contractId: string, asset: AssetRef, sacId: string, amount: bigint) {
    const target = await this.chain.contract(contractId);
    if (!target) return this.add("CONTRACT_NOT_FOUND", { contract: contractId });

    const sac = await this.chain.contract(sacId);
    if (!sac) return this.add("SAC_NOT_DEPLOYED", { asset: assetLabel(asset) });
    this.assetInfo = { ...this.assetInfo!, contractId: sacId };

    this.add("CONTRACT_NEEDS_SAC_TRANSFER");
    if (asset.type !== "classic") return;

    const bal = await this.chain.sacBalance(sacId, contractId);
    if (bal && !bal.authorized) return this.add("CONTRACT_BALANCE_NOT_AUTHORIZED", { code: asset.code });
    if (!bal) {
      const issuer = await this.chain.account(asset.issuer);
      if (issuer?.authRequired) this.add("CONTRACT_BALANCE_NEEDS_AUTH", { code: asset.code });
    }
    // SAC contract balances are i128, so there is no trustline-style limit to hit.
    void amount;
  }

  // A token contract id: either a SAC (resolve to its classic asset) or a custom SEP-41 token.
  async contractToken(recipient: Recipient, contractId: string) {
    const info = await this.chain.contract(contractId);
    if (!info) {
      this.assetInfo = { kind: "sep41", label: contractId, contractId };
      return this.add("TOKEN_NOT_FOUND", { contract: contractId });
    }

    if (info.kind === "sac") {
      const name = await this.chain.call(contractId, "name", []);
      const asset = name.ok && typeof name.value === "string" ? assetFromSacName(name.value) : null;
      if (!asset) return this.add("SAC_UNREADABLE");
      return this.classic(recipient, asset, true);
    }

    return this.sep41(recipient, contractId);
  }

  async sep41(recipient: Recipient, contractId: string) {
    this.assetInfo = { kind: "sep41", label: contractId, contractId };
    this.route = "contract_transfer";

    const [dec, sym] = await Promise.all([
      this.chain.call(contractId, "decimals", []),
      this.chain.call(contractId, "symbol", []),
    ]);
    if (!dec.ok || typeof dec.value !== "number" || !sym.ok) return this.add("NOT_A_TOKEN");
    this.assetInfo = { kind: "sep41", label: String(sym.value), contractId, decimals: dec.value };

    const amount = toUnits(this.input.amount, dec.value);
    if (amount === null) return this.add("INVALID_AMOUNT", { decimals: String(dec.value) });

    const holder = recipient.kind === "muxed" ? recipient.base : recipient.address;
    if (recipient.kind === "contract") {
      if (!(await this.chain.contract(holder))) return this.add("CONTRACT_NOT_FOUND", { contract: holder });
    } else if (!(await this.chain.account(holder))) {
      this.add("TOKEN_HOLDER_NO_ACCOUNT", { account: holder });
    }
    if (recipient.kind === "muxed") this.add("MUXED_CUSTOM_TOKEN");

    const bal = await this.chain.call(contractId, "balance", [nativeToScVal(holder, { type: "address" })]);
    if (!bal.ok) return this.add("NOT_A_TOKEN");

    await this.simulateTransfer(contractId, amount);
    if (this.input.from && !this.issues.some((i) => i.severity === "blocking")) this.add("CUSTOM_TOKEN_LOGIC");
  }

  async simulateTransfer(tokenId: string, amount: bigint) {
    if (this.issues.some((i) => i.severity === "blocking")) return;
    const from = this.input.from;
    if (!from) return this.add(this.assetInfo?.kind === "sep41" ? "SEP41_NOT_SIMULATED" : "TRANSFER_NOT_SIMULATED");

    const to = this.recipient!.kind === "muxed" ? this.recipient!.base : this.recipient!.address;
    const res = await this.chain.call(tokenId, "transfer", [
      nativeToScVal(from, { type: "address" }),
      nativeToScVal(to, { type: "address" }),
      nativeToScVal(amount, { type: "i128" }),
    ], from.startsWith("G") ? from : undefined);
    if (res.ok) return;

    let reason = simReason(res.error);
    const code = /Error\(Contract, #(\d+)\)/.exec(res.error);
    if (code && this.assetInfo?.kind === "sep41" && this.chain.errorName) {
      const name = await this.chain.errorName(tokenId, Number(code[1]));
      if (name) reason = `token returned ${name} (error #${code[1]})`;
    }
    this.add("TRANSFER_SIMULATION_FAILED", { reason });
  }
}

/** Pull the human-readable part out of a host error, if there is one. */
export function simReason(error: string): string {
  const m = /data:\["([^"]+)"/.exec(error);
  if (m) return m[1];
  return error.split("\n")[0].trim();
}

export { Asset };
