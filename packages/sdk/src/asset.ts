import { Asset, StrKey } from "@stellar/stellar-sdk";

export type AssetRef =
  | { type: "native" }
  | { type: "classic"; code: string; issuer: string }
  | { type: "contract"; contractId: string };

/**
 * Accepts "XLM" / "native", "CODE:ISSUER", or a token contract id ("C...").
 * Returns null when the string matches none of these.
 */
export function parseAsset(input: string): AssetRef | null {
  const s = input.trim();
  if (/^(xlm|native)$/i.test(s)) return { type: "native" };
  if (StrKey.isValidContract(s)) return { type: "contract", contractId: s };

  const [code, issuer, ...rest] = s.split(":");
  if (rest.length || !code || !issuer) return null;
  if (!/^[a-zA-Z0-9]{1,12}$/.test(code)) return null;
  if (!StrKey.isValidEd25519PublicKey(issuer)) return null;
  return { type: "classic", code, issuer };
}

export function toStellarAsset(a: AssetRef): Asset {
  if (a.type === "native") return Asset.native();
  if (a.type === "classic") return new Asset(a.code, a.issuer);
  throw new Error("contract tokens have no classic asset");
}

/** Parses the string a SAC returns from name(): "native" or "CODE:ISSUER". */
export function assetFromSacName(name: string): AssetRef | null {
  if (name === "native") return { type: "native" };
  const a = parseAsset(name);
  return a?.type === "classic" ? a : null;
}

export function assetLabel(a: AssetRef): string {
  if (a.type === "native") return "XLM";
  if (a.type === "classic") return `${a.code}:${a.issuer}`;
  return a.contractId;
}
