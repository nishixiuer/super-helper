import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Request, type Response, type NextFunction } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { createSuperHelperMcpServer } from "./mcp.js";

type Transport = SSEServerTransport | StreamableHTTPServerTransport;

const config = await loadConfig();
const app = express();
const transports: Record<string, Transport> = {};

app.use(cors());
app.use(express.json({ limit: "10mb" }));

function checkAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.authToken) {
    next();
    return;
  }

  const expected = `Bearer ${config.authToken}`;
  if (req.header("authorization") === expected) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "超级本地链接助手",
    allowedDirectories: config.allowedDirectories,
    allowWrite: config.allowWrite,
    endpoints: {
      streamableHttp: "/mcp",
      sse: "/sse",
      messages: "/messages",
    },
  });
});

app.all("/mcp", checkAuth, async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport: StreamableHTTPServerTransport;

    if (typeof sessionId === "string" && transports[sessionId]) {
      const existingTransport = transports[sessionId];
      if (!(existingTransport instanceof StreamableHTTPServerTransport)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Session exists but uses a different transport protocol.",
          },
          id: null,
        });
        return;
      }
      transport = existingTransport;
    } else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;
        },
      });

      transport.onclose = () => {
        const closedSessionId = transport.sessionId;
        if (closedSessionId) {
          delete transports[closedSessionId];
        }
      };

      await createSuperHelperMcpServer(config).connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "No valid MCP session id or initialize request provided.",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling /mcp request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/sse", checkAuth, async (_req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;

  res.on("close", () => {
    delete transports[transport.sessionId];
  });

  await createSuperHelperMcpServer(config).connect(transport);
});

app.post("/messages", checkAuth, async (req, res) => {
  const sessionId = req.query.sessionId;

  if (typeof sessionId !== "string") {
    res.status(400).send("Missing sessionId");
    return;
  }

  const transport = transports[sessionId];
  if (!(transport instanceof SSEServerTransport)) {
    res.status(400).send("No SSE transport found for sessionId");
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

const server = app.listen(config.port, config.host, () => {
  const baseUrl = `http://${config.host}:${config.port}`;
  console.log(`超级本地链接助手 MCP is running at ${baseUrl}`);
  console.log(`Streamable HTTP endpoint: ${baseUrl}/mcp`);
  console.log(`SSE endpoint: ${baseUrl}/sse`);
  console.log(`Allowed directories: ${config.allowedDirectories.length ? config.allowedDirectories.join(", ") : "(none)"}`);
  console.log(`Write tools: ${config.allowWrite ? "enabled" : "disabled"}`);
});

async function shutdown(): Promise<void> {
  for (const [sessionId, transport] of Object.entries(transports)) {
    try {
      await transport.close();
    } finally {
      delete transports[sessionId];
    }
  }

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
