#!/usr/bin/env node
import { parseArgs } from "node:util";
import { preflight, type PreflightResult } from "@stellar-preflight/sdk";
import { format } from "./format.ts";

const USAGE = `usage: stellar-preflight --to <address> --asset <asset> --amount <n> [options]

  --to        recipient: G..., M... or C...
  --asset     XLM, CODE:ISSUER, or a token contract id (C...)
  --amount    decimal amount, e.g. 10 or 0.5
  --from      sender address; enables transfer simulation for contract routes
  --network   testnet (default) or mainnet
  --rpc       RPC url (required for mainnet)
  --json      print the raw result as JSON
  --strict    exit non-zero on WARNING too

exit codes: 0 ready, 1 blocked (or warning with --strict), 2 usage or network error`;

async function main(argv: string[]): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      options: {
        to: { type: "string" },
        asset: { type: "string" },
        amount: { type: "string" },
        from: { type: "string" },
        network: { type: "string", default: "testnet" },
        rpc: { type: "string" },
        json: { type: "boolean", default: false },
        strict: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }).values;
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }

  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (!args.to || !args.asset || !args.amount) {
    console.error(USAGE);
    return 2;
  }
  if (args.network !== "testnet" && args.network !== "mainnet") {
    console.error(`unknown network: ${args.network}`);
    return 2;
  }

  let result: PreflightResult;
  try {
    result = await preflight(
      { network: args.network, recipient: args.to, asset: args.asset, amount: args.amount, from: args.from },
      { rpcUrl: args.rpc },
    );
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    return 2;
  }

  console.log(args.json ? JSON.stringify(result, null, 2) : format(result, process.stdout.isTTY));
  if (result.status === "BLOCKED") return 1;
  if (result.status === "WARNING" && args.strict) return 1;
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
