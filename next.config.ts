import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Fija la raíz de Turbopack al proyecto V3 para aislarlo del workspace padre.
  turbopack: {
    root: path.resolve(__dirname),
  },
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
};

export default nextConfig;
