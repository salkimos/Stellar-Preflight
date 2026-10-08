# Stellar Preflight

Check whether a Stellar payment can succeed before you build it.

Give it a recipient, an asset, an amount and a network. It returns `READY`,
`WARNING` or `BLOCKED`, the reason for every problem it finds, and what to do
about it.

```
$ stellar-preflight --to GDPR...OXAC --asset OPEN:GDS5...OM2N --amount 10
BLOCKED
recipient account
asset     classic OPEN:GDS5...OM2N

x TRUSTLINE_LIMIT_EXCEEDED  Recipient can receive at most 5 OPEN, less than 10.
  -> Send a smaller amount, or ask the recipient to raise their trustline limit.
```

Live demo: https://salkimos.github.io/Stellar-Preflight/

Preflight is read-only. It never signs, submits, or creates anything.

## What it checks

| Recipient | Asset | Checks |
|---|---|---|
| `G...` account | XLM | account exists; createAccount needed (and 1 XLM minimum); SEP-29 memo required |
| `M...` muxed | any | decodes the base account and id, then runs the account checks on the base |
| `G...` / `M...` | classic `CODE:ISSUER` | issuer exists; trustline exists; trustline authorized; room under the trustline limit (limit - balance - buying liabilities); clawback and revocable flags |
| `C...` contract | XLM / classic | contract exists; asset's Stellar Asset Contract (SAC) is deployed; contract balance authorized when the issuer requires auth |
| any | SAC contract id | resolves the SAC to its classic asset and runs the checks above |
| any | SEP-41 token id | contract exists and implements decimals, symbol, balance; amount fits the token's decimals; transfer simulated |

When a sender is given (`--from` / `from`), contract transfers are simulated on
the network. That catches sender-side problems (balance, authorization) and
custom token rules that cannot be read any other way. Contract error codes are
translated to names using the token's own contract spec.

Every issue has a stable code. See [docs/codes.md](docs/codes.md) for the full list.

## Use it

Requires Node 22.18 or newer and pnpm.

```sh
pnpm install
```

**CLI**

```sh
pnpm preflight --to <address> --asset XLM --amount 10
pnpm preflight --to <address> --asset USDC:G... --amount 10 --json
pnpm preflight --to C... --asset C... --amount 10 --from G...
```

Exit code is 0 for ready, 1 for blocked, 2 for bad input or a network error.
`--strict` also exits 1 on warnings.

**SDK**

```ts
import { preflight } from "@stellar-preflight/sdk";

const result = await preflight({
  network: "testnet",
  recipient: "G...",
  asset: "USDC:G...",
  amount: "25",
});

if (result.status === "BLOCKED") {
  for (const issue of result.issues) console.log(issue.code, issue.action);
}
```

**REST API**

```sh
pnpm api            # http://localhost:8787
curl -X POST localhost:8787/preflight \
  -d '{"network":"testnet","recipient":"G...","asset":"XLM","amount":"10"}'
```

The response body is the same result object the SDK returns.

**Web demo**

```sh
pnpm web            # http://localhost:5178
```

Pick one of the testnet examples, or enter your own values. Every check gets a
shareable link with the inputs in the URL.

Mainnet works with any Stellar RPC: pass `--rpc`, `rpcUrl`, or set
`MAINNET_RPC_URL` for the API. Testnet uses `https://soroban-testnet.stellar.org`
by default.

## Testnet examples

`scripts/seed-testnet.ts` builds one real account or contract per scenario on
testnet: issuers, trustlines, an auth-required asset, a low-limit trustline,
SACs, and a small SEP-41 token ([contracts/demo-token](contracts/demo-token))
that can freeze addresses. The addresses are in
[examples/testnet.json](examples/testnet.json) and every result is saved in
[examples/results](examples/results).

| # | Scenario | Result | Main issue |
|---|---|---|---|
| 1 | XLM to an active account | `READY` |  | 
| 2 | XLM to an inactive account | `WARNING` | `ACCOUNT_NOT_FOUND_CREATE` | 
| 3 | XLM below the account-creation minimum | `BLOCKED` | `ACCOUNT_NOT_FOUND_LOW_AMOUNT` | 
| 4 | Muxed address | `READY` | `MUXED_RECIPIENT` | 
| 5 | Memo required (SEP-29) | `WARNING` | `MEMO_REQUIRED` | 
| 6 | Classic asset with a trustline | `READY` |  | 
| 7 | Classic asset, no trustline | `BLOCKED` | `TRUSTLINE_MISSING` | 
| 8 | Classic asset, unauthorized trustline | `BLOCKED` | `TRUSTLINE_NOT_AUTHORIZED` | 
| 9 | Classic asset, authorized trustline | `READY` | `ASSET_AUTH_REVOCABLE` | 
| 10 | Classic asset, trustline limit too low | `BLOCKED` | `TRUSTLINE_LIMIT_EXCEEDED` | 
| 11 | Classic asset to an inactive account | `BLOCKED` | `ACCOUNT_NOT_FOUND` | 
| 12 | XLM to a contract | `READY` |  | 
| 13 | Classic asset to a contract | `READY` |  | 
| 14 | Auth-required asset to a contract | `BLOCKED` | `CONTRACT_BALANCE_NEEDS_AUTH` | 
| 15 | SAC transfer to an account | `READY` |  | 
| 16 | SAC transfer, no trustline | `BLOCKED` | `TRUSTLINE_MISSING` | 
| 17 | SAC transfer, sender short of funds | `BLOCKED` | `TRANSFER_SIMULATION_FAILED` | 
| 18 | SEP-41 token, simulated | `READY` | `CUSTOM_TOKEN_LOGIC` | 
| 19 | SEP-41 token, not simulated | `WARNING` | `SEP41_NOT_SIMULATED` | 
| 20 | SEP-41 token, recipient frozen by the token | `BLOCKED` | `TRANSFER_SIMULATION_FAILED` | 
| 21 | SEP-41 token to a contract | `READY` | `CUSTOM_TOKEN_LOGIC` | 

```sh
pnpm test:live      # runs all of these against testnet
pnpm seed           # rebuild them after a testnet reset
pnpm examples       # refresh examples/results
```

## Tests

```sh
pnpm test           # offline: SDK, CLI, API
pnpm test:live      # testnet scenarios
```

The offline suite runs the SDK against an in-memory ledger, so every scenario
above is also covered without network access.

## Layout

```
packages/sdk          core checks
apps/cli              command line
apps/api              REST API
apps/web              web demo
contracts/demo-token  SEP-41 token used by the examples
scripts               testnet setup and example generation
examples              testnet addresses and saved results
docs                  usage guide and issue codes
```

## Not in scope

Preflight does not hold funds, sign or submit transactions, create accounts or
trustlines, or sponsor reserves. It has not had a security audit.

## License

MIT
