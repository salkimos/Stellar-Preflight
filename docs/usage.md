# Using Stellar Preflight

A short guide for wallets and payment apps.

## When to call it

Call preflight after the user has entered a recipient, asset and amount, and
before you build the transaction. It answers one question: will this payment
fail for a reason we can see in advance?

- `READY`: build and send as usual.
- `WARNING`: the payment can work, but something needs attention first
  (use createAccount instead of payment, add a memo, the transfer was not
  simulated). Show the issues to the user.
- `BLOCKED`: the payment will fail. Show the issue and its action, and don't
  let the user submit.

## Input

| Field | Required | Format |
|---|---|---|
| `network` | yes | `testnet` or `mainnet` |
| `recipient` | yes | `G...`, `M...` or `C...` |
| `asset` | yes | `XLM`, `CODE:ISSUER`, or a token contract id `C...` |
| `amount` | yes | decimal string, e.g. `"10"` or `"0.25"` |
| `from` | no | sender address; turns on transfer simulation for contract routes |

Amounts are strings so nothing is lost to floating point. Classic assets and XLM
accept up to 7 decimal places; SEP-41 tokens use the token's own `decimals()`.

## Result

```json
{
  "status": "BLOCKED",
  "route": "payment",
  "recipient": { "kind": "account", "address": "G..." },
  "asset": { "kind": "classic", "label": "USDC:G...", "decimals": 7 },
  "issues": [
    {
      "code": "TRUSTLINE_MISSING",
      "severity": "blocking",
      "message": "Recipient has no trustline for USDC.",
      "action": "The recipient must add a trustline for USDC (changeTrust) before they can receive it."
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `status` | `READY`, `WARNING` or `BLOCKED` |
| `route` | how to send it: `payment`, `create_account` or `contract_transfer`. Omitted when blocked. |
| `recipient.kind` | `account`, `muxed` (with `base` and `id`) or `contract` |
| `asset.kind` | `native`, `classic`, `sac` or `sep41` |
| `asset.contractId` | the token contract to call for contract transfers |
| `issues[]` | everything found, in the order it was checked |
| `issues[].code` | stable identifier, safe to match on in code |
| `issues[].severity` | `blocking`, `warning` or `info` |
| `issues[].action` | what to do about it, when there is something to do |

All codes are listed in [codes.md](codes.md).

## Routes

- **payment**: a classic `payment` operation.
- **create_account**: the recipient does not exist yet. Use `createAccount`
  with at least 1 XLM.
- **contract_transfer**: call `transfer(from, to, amount)` on
  `asset.contractId`. This applies to every contract recipient (they cannot
  receive classic payments), and to any asset given as a contract id.

## What a simulation adds

Without a sender, preflight reads ledger state: accounts, trustlines, contract
instances, SAC balances. That covers everything on the receiving side for XLM
and classic assets.

Custom SEP-41 tokens can run arbitrary logic in `transfer`, and some problems
are on the sending side. With `from` set, preflight simulates the transfer on
the network. Nothing is signed; the simulation only needs addresses. If the
token fails with a numbered error, preflight looks up its name in the token's
contract spec, e.g. `token returned Frozen (error #3)`.

## Errors

If the network cannot be reached, the SDK throws, the CLI exits with code 2,
and the API answers `502`. Invalid input is not an error: it comes back as a
`BLOCKED` result with an `INVALID_*` code, so callers handle both the same way.

## Custom chain reader

`preflight(input, { chain })` accepts anything implementing the `Chain`
interface in `packages/sdk/src/chain.ts`. The tests use this to run every
scenario against an in-memory ledger; you can use it to add caching or point at
your own infrastructure.
