import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Strip `crossorigin` from the injected <script>/<link> tags. Under Tauri's
// custom asset protocol (http://tauri.localhost) some WebView2 builds refuse to
// execute/apply crossorigin-tagged assets, leaving a blank white window.
function stripCrossorigin() {
  return {
    name: "strip-crossorigin",
    transformIndexHtml(html: string) {
      return html.replace(/\s+crossorigin\b/g, "");
    },
  };
}

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), stripCrossorigin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
