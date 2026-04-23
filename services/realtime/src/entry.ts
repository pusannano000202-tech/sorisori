import { startRealtimeGatewayServer } from "./server.js";

const host = process.env.REALTIME_HOST ?? "127.0.0.1";
const port = Number(process.env.REALTIME_PORT ?? "8787");

startRealtimeGatewayServer({ host, port })
  .then((handle) => {
    console.log(`[sorisori-realtime] listening on http://${handle.host}:${handle.port}`);
  })
  .catch((error: unknown) => {
    console.error("[sorisori-realtime] failed to start", error);
    process.exitCode = 1;
  });
