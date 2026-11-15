// One command to run everything: `npm run dev` starts the Next.js app AND the TikTok bridge.
import { spawn } from "node:child_process";

const procs = [
  ["web   ", "npx", ["next", "dev"]],
  ["bridge", "node", ["scripts/bridge.mjs"]],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  const tag = (stream, out) =>
    stream.on("data", (d) =>
      String(d)
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((l) => out.write(`[${name}] ${l}\n`)),
    );
  tag(p.stdout, process.stdout);
  tag(p.stderr, process.stderr);
  p.on("exit", (code) => {
    if (name.trim() === "web") shutdown(code ?? 0);
  });
  return p;
});

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const p of procs) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"]);
    else p.kill();
  }
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
