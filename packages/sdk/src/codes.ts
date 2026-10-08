import type { Severity } from "./preflight.ts";

interface CodeDef {
  severity: Severity;
  message: string;
  action?: string;
}

/**
 * Every issue preflight can report. Codes are stable and safe to match on;
 * messages and actions are for people and may change.
 */
export const codes = {
  // input
  INVALID_RECIPIENT: {
    severity: "blocking",
    message: "Recipient is not a valid G, M or C address.",
    action: "Check the address for typos. It should be 56 (G/C) or 69 (M) characters.",
  },
  INVALID_ASSET: {
    severity: "blocking",
    message: "Asset is not recognised.",
    action: 'Use "XLM", "CODE:ISSUER" for a classic asset, or a token contract id (C...).',
  },
  INVALID_AMOUNT: {
    severity: "blocking",
    message: "Amount must be a positive number with at most {decimals} decimal places.",
  },
  INVALID_SENDER: {
    severity: "blocking",
    message: "Sender is not a valid G or C address.",
  },

  // recipient account
  MUXED_RECIPIENT: {
    severity: "info",
    message: "Muxed address. Funds go to {base} with id {id}.",
  },
  ACCOUNT_NOT_FOUND: {
    severity: "blocking",
    message: "Recipient account {account} does not exist on this network.",
    action: "The recipient must create and fund the account, then add a trustline, before receiving this asset.",
  },
  ACCOUNT_NOT_FOUND_MUXED: {
    severity: "blocking",
    message: "Base account {account} behind this muxed address does not exist.",
    action: "Accounts cannot be created through a muxed address. Fund the G address with createAccount first.",
  },
  ACCOUNT_NOT_FOUND_LOW_AMOUNT: {
    severity: "blocking",
    message: "Recipient account does not exist, and the amount is below the 1 XLM needed to create it.",
    action: "Send at least 1 XLM using createAccount.",
  },
  ACCOUNT_NOT_FOUND_CREATE: {
    severity: "warning",
    message: "Recipient account {account} does not exist yet.",
    action: "A plain payment will fail. Use createAccount, which sends the XLM and creates the account.",
  },
  MEMO_REQUIRED: {
    severity: "warning",
    message: "Recipient requires a memo on incoming payments (SEP-29).",
    action: "Add the memo the recipient gave you, usually an exchange deposit id.",
  },

  // classic asset
  ISSUER_NOT_FOUND: {
    severity: "blocking",
    message: "Asset issuer {issuer} does not exist on this network.",
    action: "Check the issuer address and that you are on the right network.",
  },
  ASSET_CLAWBACK_ENABLED: {
    severity: "info",
    message: "Issuer has clawback enabled. Received funds can be taken back by the issuer.",
  },
  ASSET_AUTH_REVOCABLE: {
    severity: "info",
    message: "Issuer can revoke authorization for this asset.",
  },
  RECIPIENT_IS_ISSUER: {
    severity: "info",
    message: "Recipient is the asset issuer. Payments to the issuer burn the asset and need no trustline.",
  },
  TRUSTLINE_MISSING: {
    severity: "blocking",
    message: "Recipient has no trustline for {code}.",
    action: "The recipient must add a trustline for {code} (changeTrust) before they can receive it.",
  },
  TRUSTLINE_NOT_AUTHORIZED: {
    severity: "blocking",
    message: "Recipient's {code} trustline is not authorized by the issuer.",
    action: "The issuer must authorize the trustline. Contact the issuer or anchor.",
  },
  TRUSTLINE_LIMITED_AUTH: {
    severity: "blocking",
    message: "Recipient's {code} trustline is only authorized to maintain liabilities and cannot receive.",
    action: "The issuer must fully authorize the trustline.",
  },
  TRUSTLINE_LIMIT_EXCEEDED: {
    severity: "blocking",
    message: "Recipient can receive at most {room} {code}, less than {amount}.",
    action: "Send a smaller amount, or ask the recipient to raise their trustline limit.",
  },

  // contracts and tokens
  CONTRACT_NOT_FOUND: {
    severity: "blocking",
    message: "Contract {contract} does not exist or has been archived.",
    action: "Check the contract id and network. Archived contracts must be restored first.",
  },
  CONTRACT_NEEDS_SAC_TRANSFER: {
    severity: "info",
    message: "Contracts cannot receive classic payment operations. Send through the asset's contract (SAC) with transfer().",
  },
  SAC_NOT_DEPLOYED: {
    severity: "blocking",
    message: "No Stellar Asset Contract is deployed for {asset}, so it cannot be sent to a contract.",
    action: "Anyone can deploy it: stellar contract asset deploy --asset {asset}",
  },
  CONTRACT_BALANCE_NOT_AUTHORIZED: {
    severity: "blocking",
    message: "Contract's {code} balance is deauthorized by the issuer.",
    action: "The issuer must re-authorize the contract's balance.",
  },
  CONTRACT_BALANCE_NEEDS_AUTH: {
    severity: "blocking",
    message: "Issuer requires authorization, and this contract has no authorized {code} balance yet.",
    action: "The issuer must authorize the contract (set_authorized) before it can receive.",
  },
  TOKEN_NOT_FOUND: {
    severity: "blocking",
    message: "Token contract {contract} does not exist on this network.",
    action: "Check the contract id and network.",
  },
  SAC_UNREADABLE: {
    severity: "blocking",
    message: "Could not read which asset this Stellar Asset Contract wraps.",
  },
  NOT_A_TOKEN: {
    severity: "blocking",
    message: "Contract does not implement the SEP-41 token interface (decimals, symbol, balance).",
    action: "Check that this is a token contract.",
  },
  TOKEN_HOLDER_NO_ACCOUNT: {
    severity: "warning",
    message: "Recipient account {account} does not exist. It can hold this token but cannot move it until the account is funded.",
  },
  MUXED_CUSTOM_TOKEN: {
    severity: "warning",
    message: "Custom tokens may not support muxed ids. The token is credited to the base account and the id may be lost.",
    action: "Confirm with the recipient whether the id matters.",
  },
  CUSTOM_TOKEN_LOGIC: {
    severity: "info",
    message: "Custom token: the transfer simulated cleanly, but the contract can run its own rules at submit time.",
  },

  // simulation
  TRANSFER_NOT_SIMULATED: {
    severity: "info",
    message: "Transfer was not simulated because no sender was given.",
    action: "Pass a sender to also check balance and authorization on the sending side.",
  },
  SEP41_NOT_SIMULATED: {
    severity: "warning",
    message: "Custom token transfer was not simulated, so its own rules were not checked.",
    action: "Pass a sender to simulate the transfer.",
  },
  TRANSFER_SIMULATION_FAILED: {
    severity: "blocking",
    message: "Transfer simulation failed: {reason}",
    action: "Fix the cause above. Sender-side problems (balance, auth) also show up here.",
  },
} satisfies Record<string, CodeDef>;

export type Code = keyof typeof codes;
