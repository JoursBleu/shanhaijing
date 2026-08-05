import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Signal to the boot diagnostic (index.html) that the JS bundle executed.
(window as any).__moduleRan = true;

function reportDiag(tag: string, e: unknown) {
  const w = window as any;
  w.__diagErrors = w.__diagErrors || [];
  const err = e as any;
  w.__diagErrors.push(`[${tag}] ${err?.stack || err?.message || String(err)}`);
  if (typeof w.__diagRender === "function") w.__diagRender();
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    reportDiag("react", error);
  }
  render() {
    if (this.state.error) {
      return (
        <pre
          style={{
            margin: 0,
            padding: 16,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "#f23f42",
            fontFamily: "ui-monospace, Consolas, monospace",
            fontSize: 12,
          }}
        >
          {"山海经 渲染出错 (render error):\n\n" +
            (this.state.error.stack || this.state.error.message)}
        </pre>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
} catch (e) {
  reportDiag("mount", e);
}
