import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { visualizer } from "rollup-plugin-visualizer"
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js"

export default defineConfig(({ mode }) => {
  const isAnalyze = mode === "analyze"

  return {
    plugins: [
      react(),
      tailwindcss(),
      cssInjectedByJsPlugin(),
      isAnalyze &&
        visualizer({
          filename: "dist/stats.html",
          open: true,
          gzipSize: true,
          brotliSize: true,
          template: "treemap", // 'treemap' | 'sunburst' | 'network'
        }),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },

    build: {
      target: "esnext",
      // Removes minify: "esbuild" (Vite 8 uses its native engine)
      cssCodeSplit: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // In the build.rollupOptions.output.manualChunks section of vite.config.ts:
          manualChunks(id) {
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/")
            ) {
              return "vendor-react"
            }
            if (
              id.includes("node_modules/react-router") ||
              id.includes("node_modules/react-router-dom/")
            ) {
              return "vendor-router"
            }
            if (
              id.includes("node_modules/@radix-ui/") ||
              id.includes("node_modules/@base-ui/")
            ) {
              return "vendor-primitives"
            }
            if (id.includes("node_modules/lucide-react")) {
              return "vendor-icons"
            }
            if (id.includes("node_modules/zustand/")) {
              return "vendor-state"
            }
          },
          chunkFileNames: "assets/js/[name]-[hash].js",
          entryFileNames: "assets/js/[name]-[hash].js",
          assetFileNames: "assets/[ext]/[name]-[hash].[ext]",
        },
      },
    },
  }
})
