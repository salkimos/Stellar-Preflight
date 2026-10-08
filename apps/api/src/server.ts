import { createServer } from "node:http";
import { createHandler } from "./app.ts";

const port = Number(process.env.PORT ?? 8787);
const handler = createHandler({
  rpc: {
    testnet: process.env.TESTNET_RPC_URL,
    mainnet: process.env.MAINNET_RPC_URL,
  },
});

createServer(handler).listen(port, () => {
  console.log(`stellar-preflight api on http://localhost:${port}`);
});
