/**
 * Built-in agent tools (P1 — makes memory/skills agent-driven + adds web_fetch).
 *
 * Importing this module registers the tools (side-effect). It is imported from
 * `features/bootstrap.ts` so they are available before the first chat turn.
 *
 *   save_memory / search_memory  — agent curates its own durable memory.
 *   list_skills / load_skill      — agent pulls procedural skills on demand.
 *   web_fetch                     — read a URL (HTTP GET), HTML stripped.
 */

import { runCommand } from "@/features/exec";
import { loadExecBackend } from "@/features/execConfig";
import { registerTool } from "@/llm/tools";
import {
  retrieveMemories as retrieveMemoriesForAgent,
  createMemoryEmbedded,
} from "@/features/memoryRetrieval";
import { listSkills, createSkill } from "@/repos/skills";
import { searchKnowledge } from "@/features/knowledge";
import type { MemoryKind } from "@/types/domain";

const MEMORY_KINDS: MemoryKind[] = ["fact", "summary", "preference"];

// ---- Memory (agent-curated) ----

registerTool({
  name: "save_memory",
  description:
    "Persist a durable fact or preference about the user/world so you can recall it in future conversations. Use for stable info worth remembering, not transient chit-chat.",
  parameters: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The fact/preference, as a self-contained sentence.",
      },
      kind: {
        type: "string",
        enum: MEMORY_KINDS,
        description: "fact | preference | summary (default: fact)",
      },
    },
    required: ["content"],
    additionalProperties: false,
  },
  autoApprove: true,
  execute: async (args, ctx) => {
    if (!ctx.agentId) return "Error: no agent context for memory.";
    const content = String(args?.content ?? "").trim();
    if (!content) return "Error: empty content.";
    const kind: MemoryKind = MEMORY_KINDS.includes(args?.kind)
      ? args.kind
      : "fact";
    await createMemoryEmbedded(
      {
        agent_id: ctx.agentId,
        conversation_id: ctx.conversationId,
        kind,
        content,
        importance: kind === "preference" ? 0.8 : 0.6,
      },
      ctx.signal,
    );
    return `Saved (${kind}): ${content}`;
  },
});

registerTool({
  name: "search_memory",
  description:
    "Search your saved memories for relevant facts/preferences before answering. Returns the top matches.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look up." },
      limit: { type: "number", description: "Max results (default 5)." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  autoApprove: true,
  execute: async (args, ctx) => {
    if (!ctx.agentId) return "Error: no agent context for memory.";
    const query = String(args?.query ?? "").trim();
    const limit = Math.max(1, Math.min(20, Number(args?.limit) || 5));
    const hits = await retrieveMemoriesForAgent(ctx.agentId, query, limit);
    if (hits.length === 0) return "No matching memories.";
    return hits.map((m) => `- (${m.kind}) ${m.content}`).join("\n");
  },
});

// ---- Skills (load procedural playbooks on demand) ----

registerTool({
  name: "list_skills",
  description:
    "List the skills (procedural playbooks) you can load. Use when a task might match a skill before improvising.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  autoApprove: true,
  execute: async () => {
    const skills = await listSkills();
    if (skills.length === 0) return "No skills available.";
    return skills
      .map((s) => `- ${s.name}: ${s.description || "(no description)"}`)
      .join("\n");
  },
});

registerTool({
  name: "load_skill",
  description:
    "Load the full instructions of a skill by name (from list_skills) and follow them.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Skill name (exact or close)." },
    },
    required: ["name"],
    additionalProperties: false,
  },
  autoApprove: true,
  execute: async (args) => {
    const name = String(args?.name ?? "").trim().toLowerCase();
    if (!name) return "Error: empty name.";
    const skills = await listSkills();
    const hit =
      skills.find((s) => s.name.toLowerCase() === name) ??
      skills.find((s) => s.name.toLowerCase().includes(name));
    if (!hit) return `No skill named "${args?.name}". Use list_skills first.`;
    return `# ${hit.name}\n\n${hit.body_markdown}`;
  },
});

// ---- Web fetch (read a URL) ----

registerTool({
  name: "web_fetch",
  description:
    "Fetch a web page or API URL (HTTP GET) and return its text content (HTML stripped). Use to read docs/articles/APIs the user references.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Absolute http(s) URL." },
      max_chars: {
        type: "number",
        description: "Max characters to return (default 8000).",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  autoApprove: false,
  execute: async (args, ctx) => {
    const url = String(args?.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return "Error: url must start with http:// or https://";
    }
    const maxChars = Math.max(500, Math.min(40000, Number(args?.max_chars) || 8000));
    let resp: Response;
    try {
      resp = await fetch(url, {
        signal: ctx.signal,
        headers: { "user-agent": "shanhaijing/1.0 (+agent web_fetch)" },
      });
    } catch (e: any) {
      return `Error fetching: ${e?.message ?? e}`;
    }
    if (!resp.ok) return `HTTP ${resp.status} ${resp.statusText}`;
    const ct = resp.headers.get("content-type") || "";
    const raw = await resp.text();
    let text = raw;
    if (ct.includes("html")) {
      text = raw
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
    }
    return text.length > maxChars ? text.slice(0, maxChars) + "\n…[truncated]" : text;
  },
});

// ---- Knowledge base (RAG) ----

registerTool({
  name: "search_knowledge",
  description:
    "Search the user's knowledge bases (RAG) for relevant passages before answering. Returns the top matching chunks with their source knowledge base. Use when the question may be answered by uploaded documents.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look up." },
      kb: {
        type: "string",
        description: "Optional: restrict to one knowledge base by name.",
      },
      limit: { type: "number", description: "Max passages (default 5)." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  autoApprove: true,
  execute: async (args, ctx) => {
    const query = String(args?.query ?? "").trim();
    if (!query) return "Error: empty query.";
    const kb = args?.kb ? String(args.kb) : undefined;
    const limit = Math.max(1, Math.min(20, Number(args?.limit) || 5));
    let hits;
    try {
      hits = await searchKnowledge(query, {
        kb,
        limit,
        signal: ctx.signal,
        allowedKbIds: ctx.knowledgeBaseIds,
      });
    } catch (e: any) {
      return `Error searching knowledge: ${e?.message ?? e}`;
    }
    if (hits.length === 0) {
      return "No relevant passages found (or no knowledge base configured).";
    }
    return hits
      .map(
        (h, i) =>
          `[${i + 1}] (${h.kbName}, score ${h.score.toFixed(3)})\n${h.content}`,
      )
      .join("\n\n");
  },
});

// ---- Web search (DuckDuckGo, keyless) ----

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function decodeDdgHref(href: string): string {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]!);
    } catch {
      /* fall through */
    }
  }
  if (href.startsWith("//")) return "https:" + href;
  return href;
}

registerTool({
  name: "web_search",
  description:
    "Search the web (DuckDuckGo) and return the top results as title/URL/snippet. Use to find current information or sources, then optionally web_fetch a result URL to read it in full.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query." },
      max_results: {
        type: "number",
        description: "How many results to return (1–10, default 5).",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  autoApprove: false,
  execute: async (args, ctx) => {
    const q = String(args?.query ?? "").trim();
    if (!q) return "Error: empty query.";
    const maxResults = Math.max(1, Math.min(10, Number(args?.max_results) || 5));
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        signal: ctx.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) shanhaijing/1.0",
        },
      });
    } catch (e: any) {
      return `Error searching: ${e?.message ?? e}`;
    }
    if (!resp.ok) return `Search HTTP ${resp.status} ${resp.statusText}`;
    const html = await resp.text();

    const linkRe =
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snipRe =
      /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const links = [...html.matchAll(linkRe)];
    const snips = [...html.matchAll(snipRe)];
    if (links.length === 0) {
      return "No results (search may be blocked or rate-limited).";
    }

    const out: string[] = [];
    for (let i = 0; i < Math.min(maxResults, links.length); i++) {
      const title = stripHtml(links[i]![2]!);
      const href = decodeDdgHref(links[i]![1]!);
      const snippet = snips[i] ? stripHtml(snips[i]![1]!) : "";
      out.push(`${i + 1}. ${title}\n   ${href}${snippet ? `\n   ${snippet}` : ""}`);
    }
    return out.join("\n\n");
  },
});

// ---- Skill authoring ----

registerTool({
  name: "create_skill",
  description:
    "Author a new reusable skill (a procedural playbook in Markdown) so you or other agents can load it later with load_skill. Use when you've worked out a repeatable procedure worth saving.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short skill name." },
      description: { type: "string", description: "One-line summary." },
      body_markdown: {
        type: "string",
        description: "Full step-by-step instructions in Markdown.",
      },
    },
    required: ["name", "body_markdown"],
    additionalProperties: false,
  },
  autoApprove: false,
  execute: async (args) => {
    const name = String(args?.name ?? "").trim();
    const body = String(args?.body_markdown ?? "").trim();
    if (!name || !body) return "Error: name and body_markdown are required.";
    const description = String(args?.description ?? "").trim();
    await createSkill({ name, description, body_markdown: body });
    return `Saved skill "${name}".`;
  },
});

// ---- Image generation (provider /v1/images/generations) ----

registerTool({
  name: "generate_image",
  description:
    "Generate an image from a text prompt via the current provider's OpenAI-compatible /v1/images/generations endpoint. Requires an image model available on that provider (pass its name in `model`, e.g. a FLUX or Stable-Diffusion model). Returns Markdown that renders the image.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "What to draw." },
      model: {
        type: "string",
        description:
          "Image model name available on the provider (e.g. black-forest-labs/FLUX.1-schnell).",
      },
      size: {
        type: "string",
        description: "Optional image size WxH, e.g. 1024x1024.",
      },
    },
    required: ["prompt", "model"],
    additionalProperties: false,
  },
  autoApprove: false,
  execute: async (args, ctx) => {
    const prompt = String(args?.prompt ?? "").trim();
    const model = String(args?.model ?? "").trim();
    if (!prompt || !model) return "Error: prompt and model are required.";
    if (!ctx.provider) return "Error: no provider available in this turn.";
    const size = args?.size ? String(args.size) : undefined;
    const base = ctx.provider.base_url.replace(/\/+$/, "");
    const url =
      base.endsWith("/v1") || base.endsWith("/v1beta")
        ? `${base}/images/generations`
        : `${base}/v1/images/generations`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (ctx.provider.api_key) {
      headers["authorization"] = `Bearer ${ctx.provider.api_key}`;
    }
    const body: any = { model, prompt, n: 1 };
    if (size) body.size = size;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: ctx.signal,
      });
    } catch (e: any) {
      return `Error generating image: ${e?.message ?? e}`;
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return `Image HTTP ${resp.status}: ${t.slice(0, 300)}`;
    }
    const j: any = await resp.json();
    const d = j?.data?.[0];
    const cap = prompt.slice(0, 60);
    if (d?.url) return `![${cap}](${d.url})`;
    if (d?.b64_json) return `![${cap}](data:image/png;base64,${d.b64_json})`;
    return "Image generated but response had no url/b64_json.";
  },
});

// ---- Command execution ----

/**
 * Disabled until a backend is configured. There is no sensible default: the
 * safe choice depends on what the machine has (WSL / docker / a remote host),
 * and defaulting to the user's own shell would make every knowledge-base
 * document a potential RCE.
 */
registerTool({
  name: "run_command",
  description:
    "Run a shell command in the configured execution environment and return " +
    "its stdout/stderr and exit code. Only available once the user has " +
    "configured an execution backend. Prefer one self-contained command; " +
    "state what you are about to run and why before calling.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to run." },
      cwd: {
        type: "string",
        description: "Optional working directory inside the backend.",
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
  execute: async (args, ctx) => {
    const command = String(args?.command ?? "").trim();
    if (!command) return "Error: empty command.";

    const backend = await loadExecBackend();
    if (!backend) {
      return (
        "Error: no execution backend configured. The user must pick one in " +
        "Settings → Execution (WSL / Docker / SSH / local) before commands can run."
      );
    }

    let r;
    try {
      r = await runCommand(
        { ...backend, cwd: args?.cwd ? String(args.cwd) : backend.cwd },
        command,
        ctx.signal,
      );
    } catch (e: any) {
      return `Error running command: ${e?.message ?? e}`;
    }

    const parts = [`[${backend.kind}] exit=${r.timedOut ? "timeout" : r.code}`];
    if (r.stdout.trim()) parts.push(`stdout:\n${r.stdout.trim()}`);
    if (r.stderr.trim()) parts.push(`stderr:\n${r.stderr.trim()}`);
    if (!r.stdout.trim() && !r.stderr.trim()) parts.push("(no output)");
    return parts.join("\n\n");
  },
});
