import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "/",
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        start: resolve(__dirname, "start.html"),
        portal: resolve(__dirname, "portal.html"),
        doctor: resolve(__dirname, "doctor.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
});