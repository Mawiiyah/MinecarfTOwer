"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TntBoxEngine, type Dir } from "@/lib/game/engine";
import { DEFAULT_SETTINGS, type GameSettings, type GameStats, type GiftDrop } from "@/lib/game/types";
import { useTikFinity, type ChatEvent, type LikeEvent } from "@/hooks/useTikFinity";
import { ChatTtsEngine } from "@/lib/game/tts";
import TntBoxGame from "./TntBoxGame";
import ControlPanel, { type LogLine } from "./ControlPanel";
import CharacterPicker from "./CharacterPicker";
import BackgroundPicker from "./BackgroundPicker";
import BlockPicker from "./BlockPicker";

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
    if (raw) {
      const saved = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<GameSettings>) };
      // Upgrade the old untouched 5-gift default list to the 6-gift one (adds DRAGON).
      const ids = saved.giftActions.map((g) => g.id).join(",");
      if (ids === "g1,g2,g3,g4,g5" && !saved.giftActions.some((g) => g.action === "dragon")) {
        saved.giftActions = DEFAULT_SETTINGS.giftActions;
      }
      // Panatilihing nakatago ang Auto-Pilot button sa screen (hidden by default)
      saved.showAutoPilotButton = false;
      return saved;
    }
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
  const [tts] = useState(() => new ChatTtsEngine());
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
        engine.performAction(g.viewer, rule.label, rule.action, rule.amount, g.count, g.coins, g.giftName);
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
  const onChat = useCallback(
    (c: ChatEvent) => {
      addLog(`${c.viewer.nickname}: ${c.comment}`, "chat");
      const s = settingsRef.current;
      tts.speak(
        c.comment,
        {
          enabled: s.ttsEnabled,
          volume: s.ttsVolume,
          rate: s.ttsRate,
          pitch: s.ttsPitch,
          includeName: s.ttsIncludeName,
          voiceURI: s.ttsVoiceURI,
        },
        c.viewer.nickname,
      );
    },
    [addLog, tts],
  );

  const onFollow = useCallback(
    (viewer: { id: string; nickname: string; avatarUrl?: string }) => {
      const s = settingsRef.current;
      if (!s.enableFollowReward) return;
      const count = s.followTnt ?? 2;
      engine.handleFollow(viewer, count);
      addLog(`${viewer.nickname} followed → ${count} TNT`, "system");
    },
    [engine, addLog],
  );

  const onShare = useCallback(
    (viewer: { id: string; nickname: string; avatarUrl?: string }) => {
      const s = settingsRef.current;
      if (!s.enableShareReward) return;
      const count = s.shareTnt ?? 2;
      engine.handleShare(viewer, count);
      addLog(`${viewer.nickname} shared LIVE → ${count} TNT`, "system");
    },
    [engine, addLog],
  );

  const { status, reconnect, inject, bridge, setUsername } = useTikFinity({
    url: settings.wsUrl,
    onGift,
    onLike,
    onChat,
    onFollow,
    onShare,
  });

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
      if (e.key === "p" || e.key === "P") setSettings((s) => ({ ...s, autoPilot: !s.autoPilot }));
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
      const lower = giftName.trim().toLowerCase();
      const diamondCount =
        lower === "rose" ? 1 :
        lower === "finger heart" ? 5 :
        lower === "i love you" ? 100 :
        lower === "doughnut" ? 30 :
        lower === "perfume" ? 20 :
        lower === "hat and mustache" ? 99 :
        lower === "galaxy" ? 1000 : 10;
      inject({ event: "gift", data: { ...fakeUser(), giftName, diamondCount, giftType: 2, giftId: `sim-${giftName}`, repeatCount: 1, repeatEnd: true } });
    },
    [inject],
  );
  const simulateLikes = useCallback(
    (n: number) => inject({ event: "like", data: { ...fakeUser(), likeCount: n } }),
    [inject],
  );
  const simulateFollow = useCallback(
    () => inject({ event: "follow", data: { ...fakeUser() } }),
    [inject],
  );
  const simulateShare = useCallback(
    () => inject({ event: "share", data: { ...fakeUser() } }),
    [inject],
  );
  const simulateChat = useCallback(
    (text = "Pa-drop naman po ng TNT dyan!") => inject({ event: "chat", data: { ...fakeUser(), comment: text } }),
    [inject],
  );

  return (
    <main className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-black">
      <TntBoxGame engine={engine} status={status} showBadge={settings.showBadge} />
      <div className="fixed bottom-3 right-3 z-40 flex items-center gap-2">
        {settings.showBlockButton && (
          <BlockPicker
            theme={settings.blockTheme}
            specificBlock={settings.specificBlock}
            onChangeTheme={(theme) =>
              setSettings((p) => ({ ...p, blockTheme: theme, specificBlock: null }))
            }
            onSelectSpecificBlock={(b) => setSettings((p) => ({ ...p, specificBlock: b }))}
          />
        )}
        {settings.showBackgroundButton && (
          <BackgroundPicker
            value={settings.background}
            customUrl={settings.customBackgroundUrl}
            onChange={(bg, customUrl) =>
              setSettings((p) => ({
                ...p,
                background: bg,
                ...(customUrl !== undefined ? { customBackgroundUrl: customUrl } : {}),
              }))
            }
          />
        )}
        {settings.showCharacterButton && (
          <CharacterPicker value={settings.character} onChange={(character) => setSettings((p) => ({ ...p, character }))} />
        )}
      </div>
      <ControlPanel
        open={panelOpen}
        onToggle={() => setPanelOpen((o) => !o)}
        status={status}
        onReconnect={reconnect}
        bridge={bridge}
        onSetUsername={setUsername}
        settings={settings}
        onSettings={setSettings}
        stats={stats}
        log={log}
        onSimulateGift={simulateGift}
        onSimulateLikes={simulateLikes}
        onSimulateNamedGift={simulateNamedGift}
        onSimulateFollow={simulateFollow}
        onSimulateShare={simulateShare}
        onSimulateChat={simulateChat}
        tts={tts}
        onSetWins={(n) => engine.setWins(n)}
        onResetLikes={() => engine.resetLikes()}
        onFillBox={() => engine.fillBox()}
        onResetRound={() => engine.resetRound()}
        onResetLeaderboard={() => engine.resetLeaderboard()}
      />
    </main>
  );
}
