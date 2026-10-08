import {
  rpc, xdr, Address, Account, Keypair, Contract, TransactionBuilder,
  BASE_FEE, Networks, contract, scValToNative, nativeToScVal, type Asset,
} from "@stellar/stellar-sdk";

export interface AccountInfo {
  balance: bigint;
  authRequired: boolean;
  authRevocable: boolean;
  clawbackEnabled: boolean;
  memoRequired: boolean;
}

export interface TrustlineInfo {
  balance: bigint;
  limit: bigint;
  buyingLiabilities: bigint;
  authorized: boolean;
  authorizedToMaintainLiabilities: boolean;
}

export interface ContractInfo {
  /** "sac" for a Stellar Asset Contract, "wasm" for anything else. */
  kind: "sac" | "wasm";
}

export interface ContractBalance {
  amount: bigint;
  authorized: boolean;
}

export type CallResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Everything preflight needs to read from the network. Swappable for tests. */
export interface Chain {
  passphrase: string;
  account(id: string): Promise<AccountInfo | null>;
  trustline(id: string, asset: Asset): Promise<TrustlineInfo | null>;
  contract(id: string): Promise<ContractInfo | null>;
  sacBalance(sacId: string, holder: string): Promise<ContractBalance | null>;
  /** Simulate a contract call. `source` is used as the transaction source when given. */
  call(contractId: string, fn: string, args: xdr.ScVal[], source?: string): Promise<CallResult>;
  /** Name of a contract error code, read from the contract's own spec. */
  errorName?(contractId: string, code: number): Promise<string | null>;
}

export type Network = "testnet" | "mainnet";

const DEFAULTS: Record<Network, { passphrase: string; rpcUrl?: string }> = {
  testnet: { passphrase: Networks.TESTNET, rpcUrl: "https://soroban-testnet.stellar.org" },
  mainnet: { passphrase: Networks.PUBLIC },
};

const MEMO_REQUIRED_KEY = "config.memo_required";

// Account flag bits (stellar-core AccountFlags)
const AUTH_REQUIRED = 0x1;
const AUTH_REVOCABLE = 0x2;
const AUTH_CLAWBACK = 0x8;
// Trustline flag bits (stellar-core TrustLineFlags)
const TL_AUTHORIZED = 0x1;
const TL_MAINTAIN_LIABILITIES = 0x2;

export function rpcChain(network: Network, rpcUrl?: string): Chain {
  const cfg = DEFAULTS[network];
  const url = rpcUrl ?? cfg.rpcUrl;
  if (!url) throw new Error(`no default RPC for ${network}; pass rpcUrl`);
  const server = new rpc.Server(url, { allowHttp: url.startsWith("http://") });

  async function entry(key: xdr.LedgerKey): Promise<xdr.LedgerEntryData | null> {
    const res = await server.getLedgerEntries(key);
    return res.entries[0]?.val ?? null;
  }

  const accountId = (id: string) => Keypair.fromPublicKey(id).xdrAccountId();

  const contractDataKey = (contract: string, key: xdr.ScVal) =>
    xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
      contract: new Address(contract).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent,
    }));

  return {
    passphrase: cfg.passphrase,

    async account(id) {
      const res = await server.getLedgerEntries(
        xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: accountId(id) })),
        xdr.LedgerKey.data(new xdr.LedgerKeyData({ accountId: accountId(id), dataName: MEMO_REQUIRED_KEY })),
      );
      let acc: xdr.AccountEntry | null = null;
      let memoRequired = false;
      for (const { val } of res.entries) {
        if (val.type === "account") acc = val.account;
        if (val.type === "data") {
          memoRequired = new TextDecoder().decode(val.data.dataValue.toXdrObject()) === "1";
        }
      }
      if (!acc) return null;
      return {
        balance: acc.balance,
        authRequired: (acc.flags & AUTH_REQUIRED) !== 0,
        authRevocable: (acc.flags & AUTH_REVOCABLE) !== 0,
        clawbackEnabled: (acc.flags & AUTH_CLAWBACK) !== 0,
        memoRequired,
      };
    },

    async trustline(id, asset) {
      const data = await entry(xdr.LedgerKey.trustline(new xdr.LedgerKeyTrustLine({
        accountId: accountId(id),
        asset: asset.toTrustLineXdrObject(),
      })));
      if (data?.type !== "trustline") return null;
      const tl = data.trustLine;
      return {
        balance: tl.balance,
        limit: tl.limit,
        buyingLiabilities: tl.ext.type === "v1" ? tl.ext.v1.liabilities.buying : 0n,
        authorized: (tl.flags & TL_AUTHORIZED) !== 0,
        authorizedToMaintainLiabilities: (tl.flags & TL_MAINTAIN_LIABILITIES) !== 0,
      };
    },

    async contract(id) {
      const data = await entry(new Contract(id).getFootprint());
      if (data?.type !== "contractData") return null;
      const v = data.contractData.val;
      if (v.type !== "scvContractInstance") return null;
      return { kind: v.value.executable.type === "contractExecutableStellarAsset" ? "sac" : "wasm" };
    },

    async sacBalance(sacId, holder) {
      const key = nativeToScVal(["Balance", holder], { type: ["symbol", "address"] });
      const data = await entry(contractDataKey(sacId, key));
      if (data?.type !== "contractData") return null;
      const v = scValToNative(data.contractData.val) as { amount: bigint; authorized: boolean };
      return { amount: BigInt(v.amount), authorized: v.authorized };
    },

    async call(contractId, fn, args, source) {
      // Simulation never checks the source sequence, so a throwaway account works.
      const src = new Account(source ?? Keypair.random().publicKey(), "0");
      const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: cfg.passphrase })
        .addOperation(new Contract(contractId).call(fn, ...args))
        .setTimeout(30)
        .build();
      const sim = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) return { ok: false, error: sim.error };
      const retval = sim.result?.retval;
      return { ok: true, value: retval ? scValToNative(retval) : undefined };
    },

    async errorName(contractId, code) {
      try {
        const spec = await contract.Spec.fromWasm(await server.getContractWasmByContractId(contractId));
        const hit = spec.errorCases().find((c) => Number(c.value) === code);
        return hit ? hit.name.toString() : null;
      } catch {
        return null;
      }
    },
  };
}
