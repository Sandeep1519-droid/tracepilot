import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config";
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
const file = path.join(config.dataDir, "local-control.json");
try {
  fs.writeFileSync(
    file,
    JSON.stringify({
      control: crypto.randomBytes(32).toString("hex"),
      demoPassword: crypto.randomBytes(18).toString("base64url"),
    }),
    { flag: "wx", mode: 0o600 },
  );
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
}
const secrets = JSON.parse(fs.readFileSync(file, "utf8")) as {
  control: string;
  demoPassword: string;
};
export const controlToken = secrets.control;
export const demoAccount = {
  email: "tester@tracepilot.local",
  password: secrets.demoPassword,
};
export function credential(
  reference: "demo" | "configured",
  field: "email" | "password",
) {
  const value =
    reference === "demo"
      ? demoAccount[field]
      : process.env[
          field === "email" ? "TEST_ACCOUNT_EMAIL" : "TEST_ACCOUNT_PASSWORD"
        ];
  if (!value)
    throw new Error("The requested account reference is not configured.");
  return value;
}
export function redact(value: string) {
  let text = value;
  for (const secret of [
    controlToken,
    demoAccount.password,
    demoAccount.email,
    process.env.OPENAI_API_KEY,
    process.env.TEST_ACCOUNT_PASSWORD,
    process.env.TEST_ACCOUNT_EMAIL,
  ])
    if (secret) text = text.split(secret).join("[REDACTED]");
  return text
    .replace(/(Bearer\s+)[\w.\-]+/gi, "$1[REDACTED]")
    .replace(
      /([?&](?:token|password|key|secret|code)=)[^&\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(/sk-[\w-]{12,}/g, "[REDACTED]");
}
