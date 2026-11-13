"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TntBoxEngine, type Dir } from "@/lib/game/engine";
import { DEFAULT_SETTINGS, type GameSettings, type GameStats, type GiftDrop } from "@/lib/game/types";
import { useTikFinity, type ChatEvent, type LikeEvent } from "@/hooks/useTikFinity";
import TntBoxGame from "./TntBoxGame";
import ControlPanel, { type LogLine } from "./ControlPanel";
import CharacterPicker from "./CharacterPicker";

const STORAGE_KEY = "tnt-box-settings-v1";
const WINS_KEY = "tnt-box-wins";

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  " ": "up",
};

function dirForKey(key: string): Dir | undefined {
  return KEY_DIRS[key] ?? KEY_DIRS[key.toLowerCase()];
}

const FAKE_VIEWERS = ["CreeperFan99", "DiamondDigger", "BlockBuster", "PixelPanda", "TNT_Tina", "NoobMaster", "SteveJr", "LavaLarry"];

const SIM_GIFTS = {
  rose: { giftName: "Rose", diamondCount: 1, giftType: 1, giftId: 5655 },
  medium: { giftName: "Perfume", diamondCount: 20, giftType: 1, giftId: 5658 },
  mega: { giftName: "Galaxy", diamondCount: 1000, giftType: 2, giftId: 11046 },
} as const;

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<GameSettings>) };
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_SETTINGS;
}

function fakeUser() {
  const nickname = FAKE_VIEWERS[Math.floor(Math.random() * FAKE_VIEWERS.length)];
  return { userId: `sim-${nickname}`, uniqueId: nickname.toLowerCase(), nickname, profilePictureUrl: "" };
}

export default function GameShell() {
  const [engine] = useState(() => new TntBoxEngine());
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Closed by default so it never appears on stream; press H (or hover top-right) to open.
  const [panelOpen, setPanelOpen] = useState(false);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const logId = useRef(0);

  // Settings: load once, persist on change, push to engine.
  useEffect(() => {
    setSettings(loadSettings());
    setSettingsLoaded(true);
  }, []);
  useEffect(() => {
    engine.setSettings(settings);
    if (!settingsLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
  }, [engine, settings, settingsLoaded]);

  // Wins survive a page reload.
  useEffect(() => {
    try {
      engine.setWins(Number(localStorage.getItem(WINS_KEY)) || 0);
    } catch {
      /* storage unavailable */
    }
    return engine.onStats(setStats);
  }, [engine]);
  useEffect(() => {
    if (stats == null) return;
    try {
      localStorage.setItem(WINS_KEY, String(stats.streamerWins));
    } catch {
      /* storage unavailable */
    }
  }, [stats?.streamerWins]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handlers read the latest settings without re-subscribing the socket.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const addLog = useCallback((text: string, kind: LogLine["kind"]) => {
    const line = { id: ++logId.current, text: `${new Date().toLocaleTimeString()} ${text}`, kind };
    setLog((prev) => [line, ...prev].slice(0, 40));
  }, []);

  const onGift = useCallback(
    (g: GiftDrop) => {
      engine.rememberGiftImage(g.giftName, g.giftImageUrl);
      const key = g.giftName.trim().toLowerCase();
      const rule = settingsRef.current.giftActions.find((a) => a.giftName.trim().toLowerCase() === key);
      if (rule) {
        engine.performAction(g.viewer, rule.label, rule.action, rule.amount, g.count);
        addLog(`${g.viewer.nickname} → ${g.count}x ${g.giftName} = ${rule.label}`, "gift");
        return;
      }
      engine.handleGift(g);
      addLog(`${g.viewer.nickname} → ${g.count}x ${g.giftName} (${g.coins}c) = ${g.tnt} TNT`, "gift");
    },
    [engine, addLog],
  );
  const onLike = useCallback(
    (l: LikeEvent) => {
      const s = settingsRef.current;
      engine.handleLike(l.viewer, l.likeCount, {
        step: s.likeGoalStep,
        onGoal: (times) => {
          const label = s.likeGoalLabel.trim() || "Like goal";
          engine.showBanner(`${label}!`, "LIKE GOAL REACHED");
          engine.performAction(l.viewer, label, s.likeGoalAction, s.likeGoalAmount, times);
          addLog(`Like goal reached → ${label}${times > 1 ? ` x${times}` : ""}`, "like");
        },
      });
      addLog(`${l.viewer.nickname} ♥ x${l.likeCount}`, "like");
    },
    [engine, addLog],
  );
  const onChat = useCallback((c: ChatEvent) => addLog(`${c.viewer.nickname}: ${c.comment}`, "chat"), [addLog]);

  const { status, reconnect, inject } = useTikFinity({ url: settings.wsUrl, onGift, onLike, onChat });

  useEffect(() => {
    addLog(`TikFinity ${status} (${settings.wsUrl})`, "system");
  }, [status, settings.wsUrl, addLog]);

  // H toggles the panel; any interaction unlocks Web Audio.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      engine.audio.unlock();
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      // Space on a focused panel button should still click it.
      if (e.key === " " && el?.tagName === "BUTTON") return;
      if (e.key === "h" || e.key === "H") setPanelOpen((o) => !o);
      if (e.key === "Escape") setPanelOpen(false);
      const dir = dirForKey(e.key);
      if (dir && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (!e.repeat) engine.pressDir(dir);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const dir = dirForKey(e.key);
      if (dir) engine.releaseDir(dir);
    };
    // Keys released while the window is unfocused never fire keyup.
    const onBlur = () => engine.releaseAll();
    const onPointer = () => engine.audio.unlock();
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [engine]);

  // Test buttons go through the real TikFinity parser.
  const simulateGift = useCallback(
    (tier: keyof typeof SIM_GIFTS) => {
      inject({ event: "gift", data: { ...fakeUser(), ...SIM_GIFTS[tier], repeatCount: 1, repeatEnd: true } });
    },
    [inject],
  );
  const simulateNamedGift = useCallback(
    (giftName: string) => {
      inject({ event: "gift", data: { ...fakeUser(), giftName, diamondCount: 1, giftType: 2, giftId: `sim-${giftName}`, repeatCount: 1, repeatEnd: true } });
    },
    [inject],
  );
  const simulateLikes = useCallback(
    (n: number) => inject({ event: "like", data: { ...fakeUser(), likeCount: n } }),
    [inject],
  );

  return (
    <main className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-black">
      <TntBoxGame engine={engine} status={status} showBadge={settings.showBadge} />
      {settings.showCharacterButton && (
        <CharacterPicker value={settings.character} onChange={(character) => setSettings((p) => ({ ...p, character }))} />
      )}
      <ControlPanel
        open={panelOpen}
        onToggle={() => setPanelOpen((o) => !o)}
        status={status}
        onReconnect={reconnect}
        settings={settings}
        onSettings={setSettings}
        stats={stats}
        log={log}
        onSimulateGift={simulateGift}
        onSimulateLikes={simulateLikes}
        onSimulateNamedGift={simulateNamedGift}
        onSetWins={(n) => engine.setWins(n)}
        onResetLikes={() => engine.resetLikes()}
        onFillBox={() => engine.fillBox()}
        onResetRound={() => engine.resetRound()}
        onResetLeaderboard={() => engine.resetLeaderboard()}
      />
    </main>
  );
}
