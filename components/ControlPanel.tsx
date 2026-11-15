"use client";

import { useEffect, useRef, useState } from "react";
import type { BridgeState, ConnectionStatus } from "@/hooks/useTikFinity";
import { ACTION_NAMES, DEFAULT_GIFT_ACTIONS, type ActionKind, type GameSettings, type GameStats, type GiftAction, type GraphicsQuality } from "@/lib/game/types";
import { CHARACTER_NAMES, type CharacterKind } from "@/lib/game/characters";
import { BACKGROUND_OPTIONS, type BackgroundKind } from "@/lib/game/backgrounds";
import { BLOCK_THEMES, INDIVIDUAL_BLOCKS, type BlockTheme } from "@/lib/game/blockThemes";
import type { ChatTtsEngine } from "@/lib/game/tts";
import ConnectionBadge from "./ConnectionBadge";

export interface LogLine {
  id: number;
  text: string;
  kind: "gift" | "like" | "chat" | "system";
}

interface Props {
  open: boolean;
  onToggle: () => void;
  status: ConnectionStatus;
  onReconnect: () => void;
  bridge: BridgeState | null;
  onSetUsername: (username: string) => boolean;
  settings: GameSettings;
  onSettings: (s: GameSettings) => void;
  stats: GameStats | null;
  log: LogLine[];
  onSimulateGift: (tier: "rose" | "medium" | "mega") => void;
  onSimulateLikes: (n: number) => void;
  onSimulateNamedGift: (giftName: string) => void;
  onSetWins: (n: number) => void;
  onResetLikes: () => void;
  onFillBox: () => void;
  onResetRound: () => void;
  onResetLeaderboard: () => void;
  onSimulateFollow?: () => void;
  onSimulateShare?: () => void;
  onSimulateChat?: (msg?: string) => void;
  tts?: ChatTtsEngine;
}

const LOG_COLORS: Record<LogLine["kind"], string> = {
  gift: "text-orange-300",
  like: "text-pink-300",
  chat: "text-sky-300",
  system: "text-zinc-400",
};

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className="font-mono text-white">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-zinc-300">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-green-500"
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-white/10 pt-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

export default function ControlPanel(props: Props) {
  const { open, onToggle, status, settings, onSettings, stats, log } = props;
  const [urlDraft, setUrlDraft] = useState(settings.wsUrl);
  useEffect(() => setUrlDraft(settings.wsUrl), [settings.wsUrl]);
  const [userDraft, setUserDraft] = useState("");
  const [userErr, setUserErr] = useState("");
  const bridgeUser = props.bridge?.username;
  useEffect(() => {
    if (bridgeUser !== undefined) setUserDraft((d) => (d === "" ? bridgeUser : d));
  }, [bridgeUser]);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const bgmFileInputRef = useRef<HTMLInputElement>(null);

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (props.tts) {
      setAvailableVoices(props.tts.getVoices());
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = () => {
          setAvailableVoices(props.tts?.getVoices() ?? []);
        };
      }
    }
  }, [props.tts]);

  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) =>
    onSettings({ ...settings, [key]: value });

  return (
    <>
      {/* Near-invisible toggle so it doesn't show up on stream; hover to reveal. */}
      <button
        type="button"
        onClick={onToggle}
        className="fixed right-2 top-2 z-40 rounded-md bg-zinc-900/90 px-3 py-1.5 text-xs font-bold text-white opacity-0 transition-opacity hover:opacity-100 focus:opacity-100"
        aria-label="Toggle control panel (H)"
      >
        ☰ Panel (H)
      </button>

      <aside
        className={`fixed right-0 top-0 z-50 flex h-dvh w-[340px] max-w-[90vw] flex-col bg-zinc-950/95 text-white shadow-2xl backdrop-blur transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-base font-extrabold tracking-wide">TNT Box Control</h2>
            <p className="text-[11px] text-zinc-500">
              Press <kbd className="rounded bg-zinc-800 px-1">H</kbd> to hide · ←/→ walk · ↑/Space jump · ↓ build block
            </p>
          </div>
          <button type="button" onClick={onToggle} className="rounded px-2 py-1 text-zinc-400 hover:bg-white/10">
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <ConnectionBadge status={status} />
              <button
                type="button"
                onClick={props.onReconnect}
                className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
              >
                Reconnect
              </button>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (urlDraft.trim()) set("wsUrl", urlDraft.trim());
              }}
            >
              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-200 outline-none ring-1 ring-white/10 focus:ring-green-500"
                spellCheck={false}
              />
              <button type="submit" className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700">
                Set
              </button>
            </form>
          </div>

          <Section title="TikTok LIVE">
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const ok = props.onSetUsername(userDraft);
                setUserErr(ok ? "" : "Bridge not running. Start the game with npm run dev.");
              }}
            >
              <label className="block text-xs text-zinc-400">TikTok username (must be LIVE)</label>
              <div className="flex gap-2">
                <input
                  value={userDraft}
                  onChange={(e) => setUserDraft(e.target.value)}
                  placeholder="@yourname"
                  className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1 text-sm text-zinc-200 outline-none ring-1 ring-white/10 focus:ring-green-500"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button type="submit" className="rounded bg-green-600 px-3 py-1 text-xs font-bold hover:bg-green-500">
                  Connect
                </button>
              </div>
            </form>
            {props.bridge && (
              <p className="text-xs text-zinc-300">
                <span
                  className={`mr-1 inline-block h-2 w-2 rounded-full ${
                    props.bridge.status === "live"
                      ? "bg-green-500"
                      : props.bridge.status === "idle"
                        ? "bg-zinc-500"
                        : "bg-yellow-500"
                  }`}
                />
                {props.bridge.message || props.bridge.status}
              </p>
            )}
            {userErr && <p className="text-xs text-red-400">{userErr}</p>}
          </Section>

          {stats && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <Stat label="Filled" value={`${Math.round((stats.filled / stats.total) * 100)}%`} />
              <Stat label="Timer" value={`${Math.max(0, Math.ceil(stats.timeLeft))}s`} />
              <Stat label="Round" value={String(stats.round)} />
              <Stat label="TNT live" value={String(stats.activeTnt)} />
              <Stat label="Queued" value={String(stats.queuedTnt)} />
              <Stat label="Wins" value={String(stats.streamerWins)} />
            </div>
          )}

          <Section title="Test events">
            <div className="grid grid-cols-1 gap-2">
              {settings.giftActions.map((g) => (
                <TestButton
                  key={g.id}
                  onClick={() => props.onSimulateNamedGift(g.giftName)}
                  className="bg-zinc-700 hover:bg-zinc-600"
                >
                  ? {g.giftName || "(no name)"} - {g.label}
                  {g.action === "tnt" || g.action === "dragon" || g.action === "win" ? ` x${g.amount}` : ""}
                </TestButton>
              ))}
              <TestButton onClick={() => props.onSimulateLikes(10)} className="bg-pink-600 hover:bg-pink-500">
                ❤️ Simulate +10 Likes
              </TestButton>
              <TestButton onClick={() => props.onSimulateFollow?.()} className="bg-sky-600 hover:bg-sky-500">
                ➕ Simulate Follow (+{settings.followTnt} TNT)
              </TestButton>
              <TestButton onClick={() => props.onSimulateShare?.()} className="bg-purple-600 hover:bg-purple-500">
                📢 Simulate Share (+{settings.shareTnt} TNT)
              </TestButton>
              <TestButton onClick={() => props.onSimulateChat?.()} className="bg-indigo-600 hover:bg-indigo-500">
                💬 Simulate Comment (AI Voice Test)
              </TestButton>
            </div>
          </Section>

          <Section title="Character">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CHARACTER_NAMES) as CharacterKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set("character", k)}
                  aria-pressed={settings.character === k}
                  className={`rounded-md px-2 py-2 text-left text-sm font-bold ${
                    settings.character === k ? "bg-green-600 text-white ring-2 ring-green-300" : "bg-zinc-800 hover:bg-zinc-700"
                  }`}
                >
                  {CHARACTER_NAMES[k]}
                </button>
              ))}
            </div>
            <Toggle
              label="Show character button on screen"
              checked={settings.showCharacterButton}
              onChange={(v) => set("showCharacterButton", v)}
            />
          </Section>

          <Section title="Background / Senaryo">
            <div className="grid grid-cols-1 gap-1.5">
              {BACKGROUND_OPTIONS.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => set("background", bg.id)}
                  aria-pressed={settings.background === bg.id}
                  className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-bold transition ${
                    settings.background === bg.id
                      ? "bg-purple-600 text-white ring-2 ring-purple-300"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>{bg.name}</span>
                    <span className="text-[10px] font-normal text-zinc-400">{bg.tagline}</span>
                  </div>
                  {settings.background === bg.id && <span className="text-xs">✓</span>}
                </button>
              ))}
            </div>

            <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-zinc-900 p-2.5">
              <label className="text-[11px] font-bold text-zinc-300">Custom Image (Upload / URL):</label>
              <input
                type="file"
                ref={bgFileInputRef}
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = reader.result as string;
                    props.onSettings({
                      ...settings,
                      background: "custom",
                      customBackgroundUrl: result,
                    });
                  };
                  reader.readAsDataURL(file);
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => bgFileInputRef.current?.click()}
                className="w-full rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                📁 Mag-upload mula sa PC
              </button>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Image URL (https://...)"
                  value={settings.customBackgroundUrl || ""}
                  onChange={(e) => set("customBackgroundUrl", e.target.value)}
                  className="flex-1 rounded border border-white/10 bg-black/60 px-2 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => set("background", "custom")}
                  className="rounded bg-zinc-700 px-2.5 py-1 text-xs font-bold hover:bg-zinc-600"
                >
                  Piliin
                </button>
              </div>
            </div>

            <Toggle
              label="Show background button on screen"
              checked={settings.showBackgroundButton}
              onChange={(v) => set("showBackgroundButton", v)}
            />
          </Section>

          <Section title="Blocks / Mga Block">
            <div className="grid grid-cols-1 gap-1.5">
              {BLOCK_THEMES.map((theme) => {
                const active = !settings.specificBlock && settings.blockTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      props.onSettings({
                        ...settings,
                        blockTheme: theme.id,
                        specificBlock: null,
                      });
                    }}
                    aria-pressed={active}
                    className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-bold transition ${
                      active
                        ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span>{theme.name}</span>
                      <span className="text-[10px] font-normal text-zinc-400">{theme.tagline}</span>
                    </div>
                    {active && <span className="text-xs">✓</span>}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 space-y-1.5 rounded-lg border border-white/10 bg-zinc-900 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-300">Lock to 1 Specific Block:</span>
                {settings.specificBlock && (
                  <button
                    type="button"
                    onClick={() => set("specificBlock", null)}
                    className="text-[10px] text-amber-300 underline hover:text-amber-200"
                  >
                    Clear lock
                  </button>
                )}
              </div>
              <select
                value={settings.specificBlock || ""}
                onChange={(e) => set("specificBlock", (e.target.value as any) || null)}
                className="w-full rounded border border-white/10 bg-black/60 px-2 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="">(None - Follow active theme set)</option>
                <optgroup label="🧑‍🚀 Astronaut Blocks">
                  <option value="space_suit">Space Suit (Visor)</option>
                  <option value="shuttle_hull">Shuttle Hull</option>
                  <option value="meteor_ore">Meteor Ore</option>
                  <option value="cargo_crate">Cargo Crate</option>
                  <option value="control_panel">Control Panel</option>
                </optgroup>
                <optgroup label="🖤 Kuromi Blocks">
                  <option value="kuromi_regular">Kuromi Regular</option>
                  <option value="dark_jester">Dark Jester</option>
                  <option value="lucky_skull_box">Lucky Skull Box</option>
                  <option value="punk_ore">Punk Ore</option>
                  <option value="spiked_castle">Spiked Castle</option>
                </optgroup>
                <optgroup label="⛏️ Classic / Aqua">
                  <option value="diamond">Diamond Block</option>
                  <option value="gold">Gold Block</option>
                  <option value="aqua">Aqua Crystal</option>
                  <option value="grass">Grass Block</option>
                  <option value="stone">Stone Block</option>
                </optgroup>
              </select>
            </div>

            <Toggle
              label="Show block picker button on screen"
              checked={settings.showBlockButton}
              onChange={(v) => set("showBlockButton", v)}
            />
          </Section>

          <Section title="Wins & likes (top-left)">
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1 font-mono">
                WIN {stats?.streamerWins ?? 0} / {settings.winGoal}
              </span>
              <SmallButton onClick={() => props.onSetWins((stats?.streamerWins ?? 0) - 1)}>−1</SmallButton>
              <SmallButton onClick={() => props.onSetWins((stats?.streamerWins ?? 0) + 1)}>+1</SmallButton>
              <SmallButton
                onClick={() => {
                  if (confirm("Reset wins to 0?")) props.onSetWins(0);
                }}
              >
                Reset
              </SmallButton>
            </div>
            <NumberInput label="Win goal" value={settings.winGoal} min={1} onChange={(v) => set("winGoal", v)} />
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1 font-mono text-pink-300">♥ {stats?.likes ?? 0} likes</span>
              <SmallButton onClick={() => props.onSimulateLikes(100)}>+100</SmallButton>
              <SmallButton onClick={props.onResetLikes}>Reset</SmallButton>
            </div>
            <NumberInput label="Like goal every (0 = off)" value={settings.likeGoalStep} min={0} onChange={(v) => set("likeGoalStep", v)} />
            <TextInput label="Like goal name" value={settings.likeGoalLabel} onChange={(v) => set("likeGoalLabel", v)} />
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <ActionSelect value={settings.likeGoalAction} onChange={(v) => set("likeGoalAction", v)} />
              <AmountInput action={settings.likeGoalAction} value={settings.likeGoalAmount} onChange={(v) => set("likeGoalAmount", v)} />
            </div>
          </Section>

          <Section title="Gift list (right side)">
            <GiftActionsEditor
              list={settings.giftActions}
              onChange={(v) => set("giftActions", v)}
              onTest={props.onSimulateNamedGift}
            />
            <Toggle label="Show gift list on screen" checked={settings.showGiftList} onChange={(v) => set("showGiftList", v)} />
          </Section>

          <Section title="Follow & Share Rewards (Auto TNT)">
            <p className="text-[11px] text-zinc-400">
              Kusang nagda-drop ng TNT kapag may nag-follow o nag-share ng TikTok LIVE:
            </p>
            <div className="space-y-2.5">
              <div className="rounded-lg border border-white/10 bg-zinc-900/80 p-2.5 space-y-2">
                <Toggle
                  label="➕ Auto TNT sa bawat bagong Follow"
                  checked={settings.enableFollowReward}
                  onChange={(v) => set("enableFollowReward", v)}
                />
                {settings.enableFollowReward && (
                  <NumberInput
                    label="Dami ng TNT per Follow"
                    value={settings.followTnt}
                    min={1}
                    onChange={(v) => set("followTnt", v)}
                  />
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-zinc-900/80 p-2.5 space-y-2">
                <Toggle
                  label="📢 Auto TNT sa bawat Share ng LIVE"
                  checked={settings.enableShareReward}
                  onChange={(v) => set("enableShareReward", v)}
                />
                {settings.enableShareReward && (
                  <NumberInput
                    label="Dami ng TNT per Share"
                    value={settings.shareTnt}
                    min={1}
                    onChange={(v) => set("shareTnt", v)}
                  />
                )}
              </div>
            </div>
          </Section>

          <Section title="Background Music (Pang-Hype BGM)">
            <Toggle
              label="🎵 Enable Background Music (BGM)"
              checked={settings.bgmEnabled}
              onChange={(v) => set("bgmEnabled", v)}
            />
            {settings.bgmEnabled && (
              <div className="space-y-3 mt-1.5">
                <Slider
                  label="BGM Music Volume"
                  value={Math.round(settings.bgmVolume * 100)}
                  min={0}
                  max={100}
                  step={1}
                  format={(v) => `${v}%`}
                  onChange={(v) => set("bgmVolume", v / 100)}
                />

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-400">Piliin ang BGM Style:</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      type="button"
                      onClick={() => set("bgmTrack", "cyber_hype")}
                      className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-bold transition ${
                        settings.bgmTrack === "cyber_hype"
                          ? "bg-indigo-600 text-white ring-2 ring-indigo-300"
                          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span>⚡ Cyber Hype (Electronic Driving Beat)</span>
                        <span className="text-[10px] font-normal text-zinc-400">
                          Matinding 132 BPM electro groove na bumibilis sa countdown!
                        </span>
                      </div>
                      {settings.bgmTrack === "cyber_hype" && <span>✓</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => set("bgmTrack", "arcade_rush")}
                      className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-bold transition ${
                        settings.bgmTrack === "arcade_rush"
                          ? "bg-fuchsia-600 text-white ring-2 ring-fuchsia-300"
                          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span>🕹️ Arcade Rush (8-bit High Energy)</span>
                        <span className="text-[10px] font-normal text-zinc-400">
                          Masiglang retro arcade synth para sa hyper gameplay!
                        </span>
                      </div>
                      {settings.bgmTrack === "arcade_rush" && <span>✓</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => set("bgmTrack", "custom")}
                      className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-bold transition ${
                        settings.bgmTrack === "custom"
                          ? "bg-amber-600 text-white ring-2 ring-amber-300"
                          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span>📁 Sariling Music Track (Upload / URL)</span>
                        <span className="text-[10px] font-normal text-zinc-400">
                          Mag-upload ng paboritong MP3 o ilagay ang audio link.
                        </span>
                      </div>
                      {settings.bgmTrack === "custom" && <span>✓</span>}
                    </button>
                  </div>
                </div>

                {settings.bgmTrack === "custom" && (
                  <div className="space-y-2 rounded-lg border border-white/10 bg-zinc-900 p-2.5">
                    <input
                      type="file"
                      ref={bgmFileInputRef}
                      accept="audio/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const result = reader.result as string;
                          props.onSettings({
                            ...settings,
                            bgmTrack: "custom",
                            customBgmUrl: result,
                          });
                        };
                        reader.readAsDataURL(file);
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => bgmFileInputRef.current?.click()}
                      className="w-full rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
                    >
                      📁 Mag-upload ng MP3 / Audio mula sa PC
                    </button>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Audio URL (https://...mp3)"
                        value={settings.customBgmUrl || ""}
                        onChange={(e) => set("customBgmUrl", e.target.value)}
                        className="flex-1 rounded border border-white/10 bg-black/60 px-2 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section title="AI Voice Chat Reader (Auto-Read)">
            <p className="text-[11px] text-zinc-400">
              Awtomatikong binabasa nang malinaw ng AI voice ang mga nagko-comment sa TikTok LIVE:
            </p>
            <div className="space-y-2.5">
              <Toggle
                label="🗣️ Auto-Read Chat Comments gamit ang AI"
                checked={settings.ttsEnabled}
                onChange={(v) => set("ttsEnabled", v)}
              />

              {settings.ttsEnabled && (
                <div className="space-y-3 rounded-lg border border-white/10 bg-zinc-900/80 p-2.5">
                  <Toggle
                    label="Isama ang pangalan ng nag-comment (e.g. 'Juan says:')"
                    checked={settings.ttsIncludeName}
                    onChange={(v) => set("ttsIncludeName", v)}
                  />

                  <Slider
                    label="AI Voice Volume"
                    value={Math.round(settings.ttsVolume * 100)}
                    min={0}
                    max={100}
                    step={1}
                    format={(v) => `${v}%`}
                    onChange={(v) => set("ttsVolume", v / 100)}
                  />

                  <Slider
                    label="Voice Speed / Bilis"
                    value={Math.round(settings.ttsRate * 100)}
                    min={70}
                    max={160}
                    step={5}
                    format={(v) => `${(v / 100).toFixed(2)}x`}
                    onChange={(v) => set("ttsRate", v / 100)}
                  />

                  <Slider
                    label="Voice Pitch / Tono"
                    value={Math.round(settings.ttsPitch * 100)}
                    min={60}
                    max={140}
                    step={5}
                    format={(v) => `${(v / 100).toFixed(2)}`}
                    onChange={(v) => set("ttsPitch", v / 100)}
                  />

                  {availableVoices.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-zinc-300">Piliin ang Boses (AI Voice):</label>
                      <select
                        value={settings.ttsVoiceURI}
                        onChange={(e) => set("ttsVoiceURI", e.target.value)}
                        className="w-full rounded border border-white/10 bg-black/60 px-2 py-1.5 text-xs text-white focus:outline-none"
                      >
                        <option value="">(Auto-Select Natural / Tagalog / English Voice)</option>
                        {availableVoices.map((v) => (
                          <option key={v.voiceURI} value={v.voiceURI}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      props.tts?.speak(
                        "Hello stream! Naririnig niyo na po ang boses ng AI! Mag-comment lang kayo at babasahin ko!",
                        {
                          enabled: true,
                          volume: settings.ttsVolume,
                          rate: settings.ttsRate,
                          pitch: settings.ttsPitch,
                          includeName: false,
                          voiceURI: settings.ttsVoiceURI,
                        },
                      );
                    }}
                    className="w-full rounded bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500"
                  >
                    🔊 Subukan ang Boses ng AI (Test Voice)
                  </button>
                </div>
              )}
            </div>
          </Section>

          <Section title="Settings">
            <Slider
              label="Timer Duration"
              value={settings.timerDuration}
              min={5}
              max={180}
              step={1}
              format={(v) => `${v}s`}
              onChange={(v) => set("timerDuration", v)}
            />
            <Slider
              label="Builder Walk Speed"
              value={settings.buildInterval}
              min={0.1}
              max={2}
              step={0.05}
              format={(v) => `${v.toFixed(2)}s / tile`}
              onChange={(v) => set("buildInterval", v)}
            />
            <Slider
              label="Sound Volume"
              value={Math.round(settings.volume * 100)}
              min={0}
              max={100}
              step={1}
              format={(v) => `${v}%`}
              onChange={(v) => set("volume", v / 100)}
            />
            <Toggle
              label="🤖 Auto-Pilot (Kusang maglalaro habang AFK)"
              checked={settings.autoPilot}
              onChange={(v) => set("autoPilot", v)}
            />
            <Toggle
              label="Reset timer when box is damaged"
              checked={settings.resetTimerOnDamage}
              onChange={(v) => set("resetTimerOnDamage", v)}
            />
            <Toggle
              label="Show leaderboard on screen"
              checked={settings.showLeaderboard}
              onChange={(v) => set("showLeaderboard", v)}
            />
            <Toggle
              label="Show connection badge on screen"
              checked={settings.showBadge}
              onChange={(v) => set("showBadge", v)}
            />
          </Section>

          <Section title="Graphics & Performance (Anti-Lag)">
            <p className="text-[11px] text-zinc-400">
              Pumili ng preset depende sa specs ng PC o laptop mo para walang lag habang nagla-live:
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  props.onSettings({
                    ...settings,
                    graphicsQuality: "low",
                    enableShadows: false,
                  })
                }
                className={`flex flex-col rounded-md px-3 py-2 text-left transition ${
                  settings.graphicsQuality === "low" && !settings.enableShadows
                    ? "bg-amber-600 text-white ring-2 ring-amber-300"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs">
                  <span>⚡ Low / Potato (Super Smooth / Walang Lag)</span>
                  {settings.graphicsQuality === "low" && !settings.enableShadows && <span>✓ Active</span>}
                </div>
                <span className="text-[10px] opacity-80">
                  Para sa mahihinang laptop/PC o integrated GPU. Walang shadows, optimized resolution & particles.
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  props.onSettings({
                    ...settings,
                    graphicsQuality: "medium",
                    enableShadows: false,
                  })
                }
                className={`flex flex-col rounded-md px-3 py-2 text-left transition ${
                  settings.graphicsQuality === "medium" && !settings.enableShadows
                    ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs">
                  <span>⚖️ Balanced (Recommended)</span>
                  {settings.graphicsQuality === "medium" && !settings.enableShadows && <span>✓ Active</span>}
                </div>
                <span className="text-[10px] opacity-80">
                  Standard 1080p crisp visuals, walang mabigat na shadows. Swak sa karamihan ng streaming setup.
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  props.onSettings({
                    ...settings,
                    graphicsQuality: "high",
                    enableShadows: true,
                  })
                }
                className={`flex flex-col rounded-md px-3 py-2 text-left transition ${
                  settings.graphicsQuality === "high" && settings.enableShadows
                    ? "bg-purple-600 text-white ring-2 ring-purple-300"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs">
                  <span>🚀 High / Ultra (Malakas na PC)</span>
                  {settings.graphicsQuality === "high" && settings.enableShadows && <span>✓ Active</span>}
                </div>
                <span className="text-[10px] opacity-80">
                  3D dynamic soft shadows, max particle effects, retina DPI scaling. Para sa gaming PC na may dedicated GPU.
                </span>
              </button>
            </div>

            <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-zinc-900/80 p-2.5">
              <Toggle
                label="Enable 3D Shadows (Mabigat sa mahinang GPU)"
                checked={settings.enableShadows}
                onChange={(v) => set("enableShadows", v)}
              />
              <Toggle
                label="Show Real-Time FPS Counter sa screen"
                checked={settings.showFps}
                onChange={(v) => set("showFps", v)}
              />
            </div>
          </Section>

          <Section title="Round">
            <div className="grid grid-cols-3 gap-2">
              <SmallButton onClick={props.onFillBox}>Fill box</SmallButton>
              <SmallButton onClick={props.onResetRound}>Reset round</SmallButton>
              <SmallButton onClick={props.onResetLeaderboard}>Clear board</SmallButton>
            </div>
          </Section>

          <Section title="Event log">
            <ul className="max-h-56 space-y-1 overflow-y-auto font-mono text-[11px]">
              {log.length === 0 && <li className="text-zinc-600">Waiting for events…</li>}
              {log.map((l) => (
                <li key={l.id} className={LOG_COLORS[l.kind]}>
                  {l.text}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </aside>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-zinc-900 px-2 py-1.5">
      <div className="text-[10px] uppercase text-zinc-500">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function TestButton({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-left text-sm font-bold shadow active:scale-[0.98] ${className}`}
    >
      {children}
    </button>
  );
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded bg-zinc-800 px-2 py-2 text-xs hover:bg-zinc-700">
      {children}
    </button>
  );
}

const inputCls =
  "min-w-0 w-full rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none ring-1 ring-white/10 focus:ring-green-500";

function NumberInput({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
      {label}
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.floor(Number(e.target.value) || 0)))}
        className={`${inputCls} !w-24 text-right font-mono`}
      />
    </label>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
      {label}
      <input value={value} maxLength={20} onChange={(e) => onChange(e.target.value)} className={`${inputCls} !w-36`} />
    </label>
  );
}

function ActionSelect({ value, onChange }: { value: ActionKind; onChange: (v: ActionKind) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as ActionKind)} className={inputCls}>
      {(Object.keys(ACTION_NAMES) as ActionKind[]).map((k) => (
        <option key={k} value={k}>
          {ACTION_NAMES[k]}
        </option>
      ))}
    </select>
  );
}

/** TNT count or win count; empty/fill don't take an amount. */
function AmountInput({ action, value, onChange }: { action: ActionKind; value: number; onChange: (v: number) => void }) {
  if (action !== "tnt" && action !== "win" && action !== "dragon") return <span />;
  return (
    <input
      type="number"
      value={value}
      min={action === "win" ? -100 : 1}
      max={500}
      title={action === "tnt" ? "TNT per gift" : action === "dragon" ? "Dragons per gift" : "Wins per gift (negative removes)"}
      onChange={(e) => onChange(Math.floor(Number(e.target.value) || 0))}
      className={`${inputCls} text-right font-mono`}
    />
  );
}

function GiftActionsEditor({
  list,
  onChange,
  onTest,
}: {
  list: GiftAction[];
  onChange: (v: GiftAction[]) => void;
  onTest: (giftName: string) => void;
}) {
  const patch = (id: string, p: Partial<GiftAction>) => onChange(list.map((g) => (g.id === id ? { ...g, ...p } : g)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {list.map((g, i) => (
        <div key={g.id} className="space-y-1.5 rounded bg-zinc-900/70 p-2 ring-1 ring-white/5">
          <div className="grid grid-cols-2 gap-1.5">
            <input
              value={g.giftName}
              onChange={(e) => patch(g.id, { giftName: e.target.value })}
              placeholder="TikTok gift name"
              title="TikTok gift name (exact, any case)"
              className={inputCls}
            />
            <input
              value={g.label}
              maxLength={16}
              onChange={(e) => patch(g.id, { label: e.target.value })}
              placeholder="Shown on stream"
              className={`${inputCls} uppercase`}
            />
          </div>
          <div className="grid grid-cols-[1fr_64px] gap-1.5">
            <ActionSelect value={g.action} onChange={(v) => patch(g.id, { action: v })} />
            <AmountInput action={g.action} value={g.amount} onChange={(v) => patch(g.id, { amount: v })} />
          </div>
          <input
            value={g.imageUrl ?? ""}
            onChange={(e) => patch(g.id, { imageUrl: e.target.value.trim() || undefined })}
            placeholder="Picture URL (optional, auto-filled from TikFinity)"
            className={`${inputCls} text-[11px]`}
          />
          <div className="flex gap-1.5">
            <SmallButton onClick={() => onTest(g.giftName)}>▶ Test</SmallButton>
            <SmallButton onClick={() => move(i, -1)}>↑</SmallButton>
            <SmallButton onClick={() => move(i, 1)}>↓</SmallButton>
            <span className="flex-1" />
            <SmallButton onClick={() => onChange(list.filter((x) => x.id !== g.id))}>Remove</SmallButton>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <SmallButton
          onClick={() =>
            onChange([...list, { id: `g${Date.now().toString(36)}`, giftName: "Rose", label: "TNT", action: "tnt", amount: 1 }])
          }
        >
          + Add gift
        </SmallButton>
        <SmallButton
          onClick={() => {
            if (confirm("Replace the list with the 6 default gifts (TNT, TNT Rain, Dragon, Empty Box, Fill Box, Plus 1 Win)?"))
              onChange(DEFAULT_GIFT_ACTIONS.map((g) => ({ ...g })));
          }}
        >
          Reset to 6 default gifts
        </SmallButton>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Gifts not on this list still drop TNT by coin value (1–5c = 1, 6–29c = 5, 30c+ = 20).
      </p>
    </div>
  );
}
