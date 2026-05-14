import fs from "node:fs/promises";
import localtunnel from "localtunnel";

const port = Number.parseInt(process.env.TUNNEL_PORT ?? "8787", 10);
const localHost = process.env.TUNNEL_LOCAL_HOST ?? "127.0.0.1";
const subdomain = process.env.TUNNEL_SUBDOMAIN || undefined;

const tunnel = await localtunnel({
  port,
  local_host: localHost,
  subdomain,
});

await fs.writeFile(".tunnel-url", `${tunnel.url}\n`, "utf8");

console.log(`Tunnel URL: ${tunnel.url}`);
console.log(`MCP URL: ${tunnel.url}/mcp`);

tunnel.on("close", () => {
  console.error("Tunnel closed.");
  process.exit(1);
});

tunnel.on("error", (error) => {
  console.error("Tunnel error:", error);
  process.exit(1);
});
