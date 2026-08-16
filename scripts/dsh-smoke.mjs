import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workspace = resolve(root, ".dsh-workspace");
const child = spawn(
  process.execPath,
  [resolve(root, "node_modules/@deepseek-ai/dsh-sdk-jsonrpc-demo/lib/bin.js"), resolve(root, "dsh/cordis.yml")],
  {
    cwd: root,
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: "dummy",
      DEEPSEEK_BASE_URL: "http://127.0.0.1:9",
      DSH_SESSION_ROOT: resolve(root, ".dsh-smoke"),
      DSH_CWD: workspace,
    },
    stdio: ["pipe", "pipe", "pipe"],
  },
);

let output = "";
let stderr = "";
const timer = setTimeout(() => {
  child.kill();
  console.error(`timeout\n${stderr}`);
  process.exitCode = 1;
}, 15_000);

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr += chunk; });
child.stdout.on("data", (chunk) => {
  output += chunk;
  for (;;) {
    const newline = output.indexOf("\n");
    if (newline < 0) break;
    const line = output.slice(0, newline).trim();
    output = output.slice(newline + 1);
    if (!line) continue;
    const frame = JSON.parse(line);
    if (frame.id === "initialize") {
      if (frame.result?.serverInfo?.name !== "deepseek-harness-sdk-runtime") {
        throw new Error(`unexpected initialize response: ${line}`);
      }
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: "shutdown", method: "shutdown", params: {} })}\n`);
    }
  }
});
child.on("spawn", () => {
  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: "initialize",
    method: "initialize",
    params: { cwd: workspace, provider: "deepseek-official", model: "smoke" },
  })}\n`);
});
child.on("exit", (code) => {
  clearTimeout(timer);
  if (code !== 0) {
    console.error(stderr);
    process.exitCode = code ?? 1;
  } else {
    console.log("DeepSeek Harness JSON-RPC smoke test passed");
  }
});
