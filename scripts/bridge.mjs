// TikTok LIVE -> local WebSocket bridge (TikFinity-compatible messages).
// The game connects to ws://localhost:21213 and receives { event, data } frames.
//
// Config (env or .env.local):  TIKTOK_USERNAME=yourname   BRIDGE_PORT=21213
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

let username = (process.env.TIKTOK_USERNAME || process.argv[2] || "").replace(/^@/, "");
const port = Number(process.env.BRIDGE_PORT || 21213);

const wss = new WebSocketServer({ port });
wss.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? `Port ${port} is already in use (is TikFinity running?). Bridge not started.`
      : `WebSocket error: ${e.message}`,
  );
  process.exit(0);
});
wss.on("listening", () => console.log(`WebSocket listening on ws://localhost:${port}`));

const send = (event, data) => {
  const msg = JSON.stringify({ event, data });
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
};


// ---- Live TikTok connection, switchable at runtime from the game UI ----
let state = { username, status: username ? "connecting" : "idle", message: username ? "" : "Enter your TikTok username in the panel." };
const publish = (patch = {}) => {
  state = { ...state, ...patch, username };
  send("bridge", state);
};
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ event: "bridge", data: state }));
  ws.on("message", (raw) => {
    try {
      const m = JSON.parse(String(raw));
      if (m.event === "setUsername") setUsername(String(m.data?.username ?? ""));
    } catch {
      /* ignore */
    }
  });
});

// Defensive mapping: works with both nested (d.user / d.giftDetails) and flat payloads.
const user = (d) => {
  const u = d.user ?? d;
  const pic = u.profilePicture?.url ?? u.profilePicture?.urls?.[0] ?? u.profilePictureUrl ?? "";
  return {
    userId: String(u.userId ?? ""),
    uniqueId: u.uniqueId ?? "",
    nickname: u.nickname ?? u.uniqueId ?? "",
    profilePictureUrl: pic,
  };
};

let tt = null;
let timer;
let retry = 0;
let gen = 0; // invalidates callbacks from old connections

function stop() {
  gen++;
  clearTimeout(timer);
  if (tt) {
    try {
      tt.removeAllListeners?.();
      tt.on?.(ControlEvent.ERROR, () => {});
      tt.disconnect?.();
    } catch {
      /* ignore */
    }
    tt = null;
  }
}

function start() {
  stop();
  retry = 0;
  if (!username) return publish({ status: "idle", message: "Enter your TikTok username in the panel." });
  const my = gen;
  tt = new TikTokLiveConnection(username, {});

  tt.on(WebcastEvent.GIFT, (d) => {
    const g = d.giftDetails ?? d;
    send("gift", {
      ...user(d),
      giftId: d.giftId ?? g.id,
      giftName: g.giftName ?? d.giftName,
      giftType: g.giftType ?? d.giftType,
      diamondCount: g.diamondCount ?? d.diamondCount ?? 0,
      repeatCount: d.repeatCount ?? 1,
      repeatEnd: d.repeatEnd,
      giftPictureUrl: g.giftImage?.imageUrl ?? g.giftImage?.urlList?.[0] ?? g.giftPictureUrl ?? d.giftPictureUrl,
    });
  });
  tt.on(WebcastEvent.LIKE, (d) => send("like", { ...user(d), likeCount: d.likeCount }));
  tt.on(WebcastEvent.CHAT, (d) => send("chat", { ...user(d), comment: d.comment }));
  tt.on(WebcastEvent.FOLLOW, (d) => send("follow", user(d)));
  tt.on(WebcastEvent.SHARE, (d) => send("share", user(d)));

  const connect = async () => {
    if (my !== gen) return;
    clearTimeout(timer);
    publish({ status: "connecting", message: `Connecting to @${username}...` });
    try {
      const s = await tt.connect();
      if (my !== gen) return;
      retry = 0;
      console.log(`Connected to @${username} LIVE (room ${s.roomId})`);
      publish({ status: "live", message: `Connected to @${username} LIVE` });
    } catch (e) {
      if (my !== gen) return;
      const wait = Math.min(3000 + 1000 * retry++, 10000);
      const why = e?.message || String(e);
      console.error(`Could not connect to @${username}: ${why}. Retrying in ${wait / 1000}s`);
      publish({ status: "waiting", message: `${why} Retrying in ${wait / 1000}s (go LIVE on TikTok).` });
      timer = setTimeout(connect, wait);
    }
  };
  tt.on(ControlEvent.DISCONNECTED, () => {
    if (my !== gen) return;
    console.log("TikTok disconnected, retrying...");
    publish({ status: "waiting", message: "Disconnected, retrying..." });
    clearTimeout(timer);
    timer = setTimeout(connect, 3000);
  });
  tt.on(ControlEvent.ERROR, (e) => {
    if (my === gen) console.error("TikTok error:", e?.info || e?.message || e);
  });
  connect();
}

function setUsername(raw) {
  const next = raw.trim().replace(/^@/, "");
  username = next;
  // Persist so it survives restarts.
  try {
    const f = ".env.local";
    const lines = existsSync(f) ? readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("TIKTOK_USERNAME=")) : [];
    lines.push(`TIKTOK_USERNAME=${next}`);
    writeFileSync(f, lines.join("\n") + "\n");
  } catch (e) {
    console.error("Could not save .env.local:", e.message);
  }
  start();
}

start();
