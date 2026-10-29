import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: ".env.local", quiet: true } as any);
dotenv.config({ quiet: true } as any);
export const config = {
  port: Number(process.env.PORT || 4310),
  demoPort: Number(process.env.DEMO_PORT || 4311),
  dataDir: path.resolve(process.env.DATA_DIR || "data"),
  provider: process.env.MODEL_PROVIDER || "ollama",
  modelBase: process.env.MODEL_BASE_URL || "http://127.0.0.1:11434/v1",
  model: process.env.MODEL_NAME || "qwen3:4b",
};
export const demoOrigin = `http://127.0.0.1:${config.demoPort}`;
export const allowedOrigins = [
  demoOrigin,
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
];
