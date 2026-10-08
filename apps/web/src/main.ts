import { preflight, type PreflightInput, type PreflightResult } from "@stellar-preflight/sdk";
import fixtures from "../../../examples/testnet.json" with { type: "json" };

type Scenario = PreflightInput & { name: string; expect: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("form");
const example = $<HTMLSelectElement>("example");
const network = $<HTMLSelectElement>("network");
const result = $<HTMLElement>("result");
const run = $<HTMLButtonElement>("run");
const busy = $<HTMLElement>("busy");
const FIELDS = ["network", "recipient", "asset", "amount", "from"] as const;

const scenarios = fixtures.scenarios as Scenario[];
scenarios.forEach((s, i) => example.add(new Option(`${s.name}  (${s.expect.toLowerCase()})`, String(i))));

function field(name: string) {
  return form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
}

function fill(input: Partial<PreflightInput>) {
  for (const f of FIELDS) field(f).value = input[f] ?? (f === "network" ? "testnet" : "");
  syncRpc();
}

function read(): PreflightInput {
  const v = (f: string) => field(f).value.trim();
  return {
    network: v("network") as PreflightInput["network"],
    recipient: v("recipient"),
    asset: v("asset"),
    amount: v("amount"),
    ...(v("from") ? { from: v("from") } : {}),
  };
}

function syncRpc() {
  $("rpc-row").hidden = network.value !== "mainnet";
}

const el = (tag: string, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const SUMMARY = {
  READY: "No problems found. The payment should go through.",
  WARNING: "The payment can work, but read the notes below first.",
  BLOCKED: "This payment would fail as described.",
};

function render(r: PreflightResult) {
  result.replaceChildren();
  result.append(el("div", `status ${r.status}`, r.status), el("p", "summary", SUMMARY[r.status]));

  const dl = el("dl");
  const row = (k: string, v?: string) => { if (v) dl.append(el("dt", "", k), el("dd", "", v)); };
  if (r.recipient) {
    row("recipient", r.recipient.kind);
    if (r.recipient.kind === "muxed") row("base account", `${r.recipient.base}  id ${r.recipient.id}`);
  }
  if (r.asset) {
    row("asset", `${r.asset.kind}  ${r.asset.label}`);
    if (r.asset.contractId && r.asset.contractId !== r.asset.label) row("token contract", r.asset.contractId);
  }
  row("route", r.route?.replace("_", " "));
  if (dl.children.length) result.append(dl);

  if (r.issues.length) {
    const ul = el("ul", "issues");
    for (const i of r.issues) {
      const li = el("li", i.severity);
      li.append(el("div", "code", `${i.severity}  ${i.code}`), el("div", "", i.message));
      if (i.action) li.append(el("div", "action", i.action));
      ul.append(li);
    }
    result.append(ul);
  }

  const raw = el("details");
  raw.append(el("summary", "", "raw result"), el("pre", "", JSON.stringify(r, null, 2)));
  result.append(raw);
  result.hidden = false;
}

async function check() {
  const input = read();
  const rpcUrl = (field("rpc").value.trim() || undefined);
  history.replaceState(null, "", "?" + new URLSearchParams(input as unknown as Record<string, string>));
  run.disabled = true;
  busy.hidden = false;
  try {
    render(await preflight(input, { rpcUrl }));
  } catch (e) {
    result.replaceChildren(el("p", "error", `Could not reach the network: ${(e as Error).message}`));
    result.hidden = false;
  } finally {
    run.disabled = false;
    busy.hidden = true;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  check();
});

example.addEventListener("change", () => {
  const s = scenarios[Number(example.value)];
  if (!s) return;
  const { name: _n, expect: _e, ...input } = s;
  fill(input);
  check();
});

network.addEventListener("change", syncRpc);
form.addEventListener("input", (e) => { if (e.target !== example) example.value = ""; });

// Prefilled links: ?network=testnet&recipient=...&asset=...&amount=...
const q = new URLSearchParams(location.search);
if (q.get("recipient")) {
  fill(Object.fromEntries(q) as Partial<PreflightInput>);
  check();
}
