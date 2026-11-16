import { loadEnv } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function productionCsp(connectSources: string[]) {
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src ${connectSources.join(" ")}`,
  ].join("; ");

  return {
    name: "sigil-production-csp",
    apply: "build" as const,
    transformIndexHtml(html: string) {
      return html.replace(
        "</head>",
        `  <meta http-equiv="Content-Security-Policy" content="${policy}" />\n  </head>`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const configuredConnectSources = env.SIGIL_CSP_CONNECT_SRC?.trim();
  const connectSources = configuredConnectSources
    ? configuredConnectSources.split(/\s+/)
    : ["'self'"];

  if (
    connectSources.some(
      (source) =>
        !/^'self'$/.test(source) &&
        !/^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(source),
    )
  ) {
    throw new Error(
      "SIGIL_CSP_CONNECT_SRC must contain only 'self' and explicit HTTP(S) origins.",
    );
  }

  return {
    plugins: [react(), productionCsp(connectSources)],
  };
});
