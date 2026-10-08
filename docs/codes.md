# Issue codes

Generated from `packages/sdk/src/codes.ts`. Codes are stable; messages may change.

Status is decided by the most severe issue: any `blocking` issue means
`BLOCKED`, otherwise any `warning` means `WARNING`, otherwise `READY`.
`info` issues never change the status.

`{placeholders}` are filled in with the actual values.

| Code | Severity | Message | Action |
|---|---|---|---|
| `INVALID_RECIPIENT` | blocking | Recipient is not a valid G, M or C address. | Check the address for typos. It should be 56 (G/C) or 69 (M) characters. |
| `INVALID_ASSET` | blocking | Asset is not recognised. | Use "XLM", "CODE:ISSUER" for a classic asset, or a token contract id (C...). |
| `INVALID_AMOUNT` | blocking | Amount must be a positive number with at most {decimals} decimal places. |  |
| `INVALID_SENDER` | blocking | Sender is not a valid G or C address. |  |
| `MUXED_RECIPIENT` | info | Muxed address. Funds go to {base} with id {id}. |  |
| `ACCOUNT_NOT_FOUND` | blocking | Recipient account {account} does not exist on this network. | The recipient must create and fund the account, then add a trustline, before receiving this asset. |
| `ACCOUNT_NOT_FOUND_MUXED` | blocking | Base account {account} behind this muxed address does not exist. | Accounts cannot be created through a muxed address. Fund the G address with createAccount first. |
| `ACCOUNT_NOT_FOUND_LOW_AMOUNT` | blocking | Recipient account does not exist, and the amount is below the 1 XLM needed to create it. | Send at least 1 XLM using createAccount. |
| `ACCOUNT_NOT_FOUND_CREATE` | warning | Recipient account {account} does not exist yet. | A plain payment will fail. Use createAccount, which sends the XLM and creates the account. |
| `MEMO_REQUIRED` | warning | Recipient requires a memo on incoming payments (SEP-29). | Add the memo the recipient gave you, usually an exchange deposit id. |
| `ISSUER_NOT_FOUND` | blocking | Asset issuer {issuer} does not exist on this network. | Check the issuer address and that you are on the right network. |
| `ASSET_CLAWBACK_ENABLED` | info | Issuer has clawback enabled. Received funds can be taken back by the issuer. |  |
| `ASSET_AUTH_REVOCABLE` | info | Issuer can revoke authorization for this asset. |  |
| `RECIPIENT_IS_ISSUER` | info | Recipient is the asset issuer. Payments to the issuer burn the asset and need no trustline. |  |
| `TRUSTLINE_MISSING` | blocking | Recipient has no trustline for {code}. | The recipient must add a trustline for {code} (changeTrust) before they can receive it. |
| `TRUSTLINE_NOT_AUTHORIZED` | blocking | Recipient's {code} trustline is not authorized by the issuer. | The issuer must authorize the trustline. Contact the issuer or anchor. |
| `TRUSTLINE_LIMITED_AUTH` | blocking | Recipient's {code} trustline is only authorized to maintain liabilities and cannot receive. | The issuer must fully authorize the trustline. |
| `TRUSTLINE_LIMIT_EXCEEDED` | blocking | Recipient can receive at most {room} {code}, less than {amount}. | Send a smaller amount, or ask the recipient to raise their trustline limit. |
| `CONTRACT_NOT_FOUND` | blocking | Contract {contract} does not exist or has been archived. | Check the contract id and network. Archived contracts must be restored first. |
| `CONTRACT_NEEDS_SAC_TRANSFER` | info | Contracts cannot receive classic payment operations. Send through the asset's contract (SAC) with transfer(). |  |
| `SAC_NOT_DEPLOYED` | blocking | No Stellar Asset Contract is deployed for {asset}, so it cannot be sent to a contract. | Anyone can deploy it: stellar contract asset deploy --asset {asset} |
| `CONTRACT_BALANCE_NOT_AUTHORIZED` | blocking | Contract's {code} balance is deauthorized by the issuer. | The issuer must re-authorize the contract's balance. |
| `CONTRACT_BALANCE_NEEDS_AUTH` | blocking | Issuer requires authorization, and this contract has no authorized {code} balance yet. | The issuer must authorize the contract (set_authorized) before it can receive. |
| `TOKEN_NOT_FOUND` | blocking | Token contract {contract} does not exist on this network. | Check the contract id and network. |
| `SAC_UNREADABLE` | blocking | Could not read which asset this Stellar Asset Contract wraps. |  |
| `NOT_A_TOKEN` | blocking | Contract does not implement the SEP-41 token interface (decimals, symbol, balance). | Check that this is a token contract. |
| `TOKEN_HOLDER_NO_ACCOUNT` | warning | Recipient account {account} does not exist. It can hold this token but cannot move it until the account is funded. |  |
| `MUXED_CUSTOM_TOKEN` | warning | Custom tokens may not support muxed ids. The token is credited to the base account and the id may be lost. | Confirm with the recipient whether the id matters. |
| `CUSTOM_TOKEN_LOGIC` | info | Custom token: the transfer simulated cleanly, but the contract can run its own rules at submit time. |  |
| `TRANSFER_NOT_SIMULATED` | info | Transfer was not simulated because no sender was given. | Pass a sender to also check balance and authorization on the sending side. |
| `SEP41_NOT_SIMULATED` | warning | Custom token transfer was not simulated, so its own rules were not checked. | Pass a sender to simulate the transfer. |
| `TRANSFER_SIMULATION_FAILED` | blocking | Transfer simulation failed: {reason} | Fix the cause above. Sender-side problems (balance, auth) also show up here. |
