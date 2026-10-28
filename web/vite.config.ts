import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Relative base so the build works from any path (GitHub Pages, an artifact, a file server).
export default defineConfig({ base: "./", plugins: [preact()] });
