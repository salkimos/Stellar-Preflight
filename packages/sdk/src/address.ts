import { StrKey, MuxedAccount } from "@stellar/stellar-sdk";

export type Recipient =
  | { kind: "account"; address: string }
  | { kind: "muxed"; address: string; base: string; id: string }
  | { kind: "contract"; address: string };

/** Classify a recipient string, or return null if it is not a valid address. */
export function parseRecipient(input: string): Recipient | null {
  const address = input.trim();
  if (StrKey.isValidEd25519PublicKey(address)) return { kind: "account", address };
  if (StrKey.isValidContract(address)) return { kind: "contract", address };
  if (StrKey.isValidMed25519PublicKey(address)) {
    const muxed = MuxedAccount.fromAddress(address, "0");
    return { kind: "muxed", address, base: muxed.baseAccount().accountId(), id: muxed.id() };
  }
  return null;
}

/** The G address that holds balances for a recipient, if it has one. */
export function accountOf(r: Recipient): string | null {
  if (r.kind === "account") return r.address;
  if (r.kind === "muxed") return r.base;
  return null;
}
