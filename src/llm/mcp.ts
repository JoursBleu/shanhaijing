/**
 * Minimal MCP (Model Context Protocol) client over Streamable HTTP.
 *
 * Works inside the Tauri webview with plain fetch (no subprocess), so it covers
 * remote/HTTP MCP servers. stdio MCP servers (local subprocess) need a Tauri
 * sidecar and are deferred.
 *
 * `connectAndRegisterServer` lists a server's tools and registers each into the
 * global tool registry as `mcp__<server>__<tool>` (approval required), so the
 * agent loop can call them like any other tool.
 */

import { registerTool } from "@/llm/tools";
import type { McpServer } from "@/repos/mcpServers";

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class McpHttpClient {
  private nextId = 1;
  private sessionId?: string;
  private initialized = false;

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string> = {},
  ) {}

  private baseHeaders(): Record<string, string> {
    return {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
      ...this.headers,
    };
  }

  private parseSseForId(text: string, id: number): JsonRpcResponse | null {
    for (const block of text.split(/\n\n+/)) {
      const data = block
        .split(/\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data) continue;
      try {
        const j = JSON.parse(data);
        if (j && j.id === id) return j;
      } catch {
        // ignore
      }
    }
    return null;
  }

  private async rpc(method: string, params?: unknown): Promise<any> {
    const id = this.nextId++;
    const resp = await fetch(this.url, {
      method: "POST",
      headers: this.baseHeaders(),
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(30000),
    });
    const sid = resp.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${t.slice(0, 200) || resp.statusText}`);
    }
    const ct = resp.headers.get("content-type") || "";
    let msg: JsonRpcResponse | null;
    if (ct.includes("text/event-stream")) {
      msg = this.parseSseForId(await resp.text(), id);
    } else {
      msg = (await resp.json()) as JsonRpcResponse;
    }
    if (!msg) throw new Error("no JSON-RPC response");
    if (msg.error) throw new Error(`${msg.error.message} (${msg.error.code})`);
    return msg.result;
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    await fetch(this.url, {
      method: "POST",
      headers: this.baseHeaders(),
      body: JSON.stringify({ jsonrpc: "2.0", method, params }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => {});
  }

  async initialize(): Promise<void> {
    await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "shanhaijing", version: "1.0.0" },
    });
    this.initialized = true;
    await this.notify("notifications/initialized");
  }

  async listTools(): Promise<McpToolInfo[]> {
    if (!this.initialized) await this.initialize();
    const result = await this.rpc("tools/list");
    const tools = result?.tools;
    return Array.isArray(tools) ? tools : [];
  }

  async callTool(name: string, args: unknown): Promise<string> {
    if (!this.initialized) await this.initialize();
    const result = await this.rpc("tools/call", {
      name,
      arguments: args ?? {},
    });
    const content = result?.content;
    if (Array.isArray(content)) {
      const text = content
        .map((c: any) =>
          c?.type === "text"
            ? c.text
            : c?.type
              ? `[${c.type} content]`
              : "",
        )
        .filter(Boolean)
        .join("\n");
      if (result?.isError) return `Tool error: ${text || "(no detail)"}`;
      return text || "(no text content)";
    }
    return typeof result === "string" ? result : JSON.stringify(result);
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "server";
}

export interface McpConnectResult {
  ok: boolean;
  count: number;
  error?: string;
}

/** Connect to a server, list its tools, and register them. */
export async function connectAndRegisterServer(
  server: McpServer,
): Promise<McpConnectResult> {
  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(server.headers_json) || {};
  } catch {
    headers = {};
  }
  const client = new McpHttpClient(server.url, headers);
  try {
    const tools = await client.listTools();
    const prefix = sanitize(server.name);
    for (const t of tools) {
      const params =
        t.inputSchema && typeof t.inputSchema === "object"
          ? t.inputSchema
          : { type: "object", properties: {} };
      registerTool({
        name: `mcp__${prefix}__${t.name}`,
        description: `[MCP:${server.name}] ${t.description ?? t.name}`,
        parameters: params,
        autoApprove: false,
        source: "mcp",
        execute: async (args) => client.callTool(t.name, args),
      });
    }
    return { ok: true, count: tools.length };
  } catch (e: any) {
    return { ok: false, count: 0, error: String(e?.message ?? e) };
  }
}
