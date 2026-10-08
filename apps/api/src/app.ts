import type { IncomingMessage, ServerResponse } from "node:http";
import { preflight, type PreflightInput, type PreflightOptions } from "@stellar-preflight/sdk";

const MAX_BODY = 16 * 1024;
const FIELDS = ["recipient", "asset", "amount"] as const;

export interface AppOptions {
  /** RPC url per network. Mainnet is disabled unless one is set. */
  rpc?: Partial<Record<PreflightInput["network"], string>>;
  /** Test hook: override how preflight is called. */
  run?: (input: PreflightInput, opts: PreflightOptions) => ReturnType<typeof preflight>;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body, null, 2));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validate(body: unknown): PreflightInput | string {
  if (!body || typeof body !== "object") return "body must be a JSON object";
  const b = body as Record<string, unknown>;
  for (const f of FIELDS) if (typeof b[f] !== "string") return `"${f}" is required and must be a string`;
  const network = b.network ?? "testnet";
  if (network !== "testnet" && network !== "mainnet") return `"network" must be "testnet" or "mainnet"`;
  if (b.from !== undefined && typeof b.from !== "string") return `"from" must be a string`;
  return {
    network,
    recipient: b.recipient as string,
    asset: b.asset as string,
    amount: b.amount as string,
    ...(b.from ? { from: b.from as string } : {}),
  };
}

export function createHandler(opts: AppOptions = {}) {
  const run = opts.run ?? preflight;

  return async (req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;

    if (req.method === "OPTIONS") return send(res, 204, null);
    if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true });
    if (path !== "/preflight") return send(res, 404, { error: "not found" });
    if (req.method !== "POST") return send(res, 405, { error: "use POST" });

    let body: unknown;
    try {
      body = await readJson(req);
    } catch (e) {
      return send(res, 400, { error: `invalid request body: ${(e as Error).message}` });
    }

    const input = validate(body);
    if (typeof input === "string") return send(res, 400, { error: input });

    const rpcUrl = opts.rpc?.[input.network];
    if (input.network === "mainnet" && !rpcUrl) {
      return send(res, 400, { error: "mainnet is not configured on this server" });
    }

    try {
      return send(res, 200, await run(input, { rpcUrl }));
    } catch (e) {
      return send(res, 502, { error: `network error: ${(e as Error).message}` });
    }
  };
}
