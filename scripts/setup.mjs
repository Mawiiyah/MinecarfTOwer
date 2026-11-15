// Interactive setup: asks for your TikTok username and saves it to .env.local
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const file = ".env.local";
const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean) : [];
const get = (k) => lines.find((l) => l.startsWith(k + "="))?.slice(k.length + 1) ?? "";
const set = (k, v) => {
  const i = lines.findIndex((l) => l.startsWith(k + "="));
  if (i >= 0) lines[i] = `${k}=${v}`;
  else lines.push(`${k}=${v}`);
};

const rl = createInterface({ input: process.stdin, output: process.stdout });
const curUser = get("TIKTOK_USERNAME");
const curPort = get("BRIDGE_PORT") || "21213";

console.log("\n=== TikTok LIVE setup ===");
console.log("Note: you must be LIVE on TikTok for the connection to succeed.\n");

let user = (await rl.question(`TikTok username${curUser ? ` [${curUser}]` : ""} (without @): `)).trim().replace(/^@/, "");
if (!user) user = curUser;
if (!user) {
  console.log("No username given. Nothing saved.");
  rl.close();
  process.exit(1);
}
const port = (await rl.question(`Bridge port [${curPort}]: `)).trim() || curPort;
rl.close();

set("TIKTOK_USERNAME", user);
set("BRIDGE_PORT", port);
writeFileSync(file, lines.join("\n") + "\n");
console.log(`\nSaved to ${file}: @${user} (port ${port})`);
console.log("Go LIVE on TikTok, then run:  npm run dev\n");
