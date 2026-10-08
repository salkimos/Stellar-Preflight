import { Asset, Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
import type { Chain, AccountInfo, TrustlineInfo, ContractInfo, ContractBalance, CallResult } from "../src/chain.ts";

type Handler = (fn: string, args: unknown[], source?: string) => CallResult;

/** In-memory chain for tests. Build the world, then pass it to preflight. */
export class FakeChain implements Chain {
  passphrase = Networks.TESTNET;
  accounts = new Map<string, AccountInfo>();
  trustlines = new Map<string, TrustlineInfo>();
  contracts = new Map<string, ContractInfo>();
  sacBalances = new Map<string, ContractBalance>();
  handlers = new Map<string, Handler>();

  addAccount(id = g(), over: Partial<AccountInfo> = {}) {
    this.accounts.set(id, {
      balance: 100_0000000n, authRequired: false, authRevocable: false,
      clawbackEnabled: false, memoRequired: false, ...over,
    });
    return id;
  }

  addTrustline(id: string, asset: Asset, over: Partial<TrustlineInfo> = {}) {
    this.trustlines.set(`${id}/${asset.toString()}`, {
      balance: 0n, limit: 922337203685_4775807n, buyingLiabilities: 0n,
      authorized: true, authorizedToMaintainLiabilities: false, ...over,
    });
  }

  addContract(id = c(), kind: ContractInfo["kind"] = "wasm", handler?: Handler) {
    this.contracts.set(id, { kind });
    if (handler) this.handlers.set(id, handler);
    return id;
  }

  /** Deploy the SAC for an asset; it answers name() like the real one. */
  deploySac(asset: Asset) {
    const id = asset.contractId(this.passphrase);
    const name = asset.isNative() ? "native" : `${asset.getCode()}:${asset.getIssuer()}`;
    this.sacHandler ??= () => ({ ok: true, value: undefined });
    return this.addContract(id, "sac", (fn, args, src) =>
      fn === "name" ? { ok: true, value: name } : this.sacHandler!(fn, args, src));
  }
  sacHandler?: Handler;
  errorName?: (contractId: string, code: number) => Promise<string | null>;

  async account(id: string) { return this.accounts.get(id) ?? null; }
  async trustline(id: string, asset: Asset) { return this.trustlines.get(`${id}/${asset.toString()}`) ?? null; }
  async contract(id: string) { return this.contracts.get(id) ?? null; }
  async sacBalance(sacId: string, holder: string) { return this.sacBalances.get(`${sacId}/${holder}`) ?? null; }
  async call(id: string, fn: string, args: unknown[], source?: string): Promise<CallResult> {
    const h = this.handlers.get(id);
    if (!h) return { ok: false, error: "HostError: Error(Storage, MissingValue)" };
    return h(fn, args, source);
  }
}

export const g = () => Keypair.random().publicKey();
export const c = () => StrKey.encodeContract(Keypair.random().rawPublicKey());

/** A SEP-41 token handler with configurable transfer behaviour. */
export function sep41(transfer: () => CallResult = () => ({ ok: true, value: undefined })): Handler {
  return (fn) => {
    if (fn === "decimals") return { ok: true, value: 6 };
    if (fn === "symbol") return { ok: true, value: "TKN" };
    if (fn === "balance") return { ok: true, value: 0n };
    if (fn === "transfer") return transfer();
    return { ok: false, error: "HostError: Error(WasmVm, MissingValue)" };
  };
}
