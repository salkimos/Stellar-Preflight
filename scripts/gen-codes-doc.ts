// Regenerates docs/codes.md from packages/sdk/src/codes.ts.
import { writeFileSync } from "node:fs";
import { codes } from "../packages/sdk/src/codes.ts";

const rows = Object.entries(codes).map(([code, c]) => {
  const d = c as { severity: string; message: string; action?: string };
  const esc = (s = "") => s.replace(/\|/g, "\\|");
  return `| \`${code}\` | ${d.severity} | ${esc(d.message)} | ${esc(d.action)} |`;
});

writeFileSync(new URL("../docs/codes.md", import.meta.url), `# Issue codes

Generated from \`packages/sdk/src/codes.ts\`. Codes are stable; messages may change.

Status is decided by the most severe issue: any \`blocking\` issue means
\`BLOCKED\`, otherwise any \`warning\` means \`WARNING\`, otherwise \`READY\`.
\`info\` issues never change the status.

\`{placeholders}\` are filled in with the actual values.

| Code | Severity | Message | Action |
|---|---|---|---|
${rows.join("\n")}
`);
