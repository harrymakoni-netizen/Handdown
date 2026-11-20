import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

let appCommit =
  process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "";
if (!appCommit) {
  try {
    appCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    appCommit = "unversioned";
  }
}

export default defineConfig({
  define: { __APP_COMMIT__: JSON.stringify(appCommit) },
  plugins: [
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      manifest: {
        name: "Handdown",
        short_name: "Handdown",
        description: "Approved practical lessons and local visual checkpoints.",
        theme_color: "#bb4329",
        background_color: "#f5f5f1",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ttf}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/__/],
        runtimeCaching: [],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@firebase/firestore")) return "firebase-firestore";
          if (id.includes("@firebase/auth")) return "firebase-auth";
          if (id.includes("@firebase/app-check")) return "firebase-app-check";
        },
      },
    },
  },
});
