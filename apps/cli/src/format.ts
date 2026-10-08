import type { PreflightResult, Severity } from "@stellar-preflight/sdk";

const COLORS = { READY: 32, WARNING: 33, BLOCKED: 31 } as const;
const MARK: Record<Severity, string> = { blocking: "x", warning: "!", info: "-" };

export function format(r: PreflightResult, color = false): string {
  const paint = (code: number, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const dim = (s: string) => paint(2, s);
  const lines: string[] = [paint(COLORS[r.status], r.status)];

  if (r.recipient) {
    const extra = r.recipient.kind === "muxed" ? ` (base ${r.recipient.base}, id ${r.recipient.id})` : "";
    lines.push(`${dim("recipient")} ${r.recipient.kind}${extra}`);
  }
  if (r.asset) lines.push(`${dim("asset    ")} ${r.asset.kind} ${r.asset.label}`);
  if (r.asset?.contractId && r.asset.contractId !== r.asset.label) lines.push(`${dim("contract ")} ${r.asset.contractId}`);
  if (r.route) lines.push(`${dim("route    ")} ${r.route}`);

  if (r.issues.length) lines.push("");
  for (const i of r.issues) {
    lines.push(`${MARK[i.severity]} ${i.code}  ${i.message}`);
    if (i.action) lines.push(`  ${dim("->")} ${i.action}`);
  }
  return lines.join("\n");
}
