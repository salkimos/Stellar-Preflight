/**
 * Convert a decimal string into integer units. Returns null for anything that
 * is not a positive number with at most `decimals` fractional digits.
 */
export function toUnits(amount: string, decimals: number): bigint | null {
  const s = amount.trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const [, whole, frac = ""] = m;
  if (frac.length > decimals) return null;
  const units = BigInt(whole + frac.padEnd(decimals, "0"));
  return units > 0n ? units : null;
}

export function fromUnits(units: bigint, decimals: number): string {
  const neg = units < 0n;
  const s = (neg ? -units : units).toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = decimals ? s.slice(-decimals).replace(/0+$/, "") : "";
  return (neg ? "-" : "") + whole + (frac ? "." + frac : "");
}

/** Classic assets and XLM always use 7 decimals. */
export const CLASSIC_DECIMALS = 7;
