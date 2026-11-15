import type { CharacterKind } from "./characters";
import type { BackgroundKind } from "./backgrounds";
import type { BlockTheme } from "./blockThemes";

export type BlockType =
  | "grass"
  | "dirt"
  | "stone"
  | "gold"
  | "diamond"
  | "aqua"
  | "kuromi_regular"
  | "dark_jester"
  | "lucky_skull_box"
  | "punk_ore"
  | "spiked_castle"
  | "space_suit"
  | "shuttle_hull"
  | "meteor_ore"
  | "cargo_crate"
  | "control_panel";

export const KUROMI_BLOCK_TYPES: BlockType[] = [
  "kuromi_regular",
  "dark_jester",
  "lucky_skull_box",
  "punk_ore",
  "spiked_castle",
];

export const ASTRONAUT_BLOCK_TYPES: BlockType[] = [
  "space_suit",
  "shuttle_hull",
  "meteor_ore",
  "cargo_crate",
  "control_panel",
];

export interface Viewer {
  id: string;
  nickname: string;
  avatarUrl?: string;
}

export interface GiftDrop {
  viewer: Viewer;
  giftName: string;
  /** Number of gift units this event represents (streak delta). */
  count: number;
  /** Total coins (diamonds) for this event. */
  coins: number;
  /** Total TNT to drop for this event (coin rules; used when the gift has no action). */
  tnt: number;
  giftImageUrl?: string;
}

/** What a gift (or the like goal) does in the box. */
export type ActionKind = "tnt" | "dragon" | "clear" | "fill" | "win";

export const ACTION_NAMES: Record<ActionKind, string> = {
  tnt: "Drop TNT",
  dragon: "Dragon (burns the top layer)",
  clear: "Empty the box",
  fill: "Fill the box",
  win: "Add wins",
};

/** One row of the on-screen gift list: gift name → action. */
export interface GiftAction {
  id: string;
  /** TikTok gift name, matched case-insensitively. */
  giftName: string;
  /** Text shown on stream next to the gift picture. */
  label: string;
  action: ActionKind;
  /** TNT per gift for "tnt", wins per gift for "win", dragons per gift for "dragon"; ignored otherwise. */
  amount: number;
  /** Optional picture; otherwise the picture TikFinity sends with the gift is remembered. */
  imageUrl?: string;
}

/**
 * The six gifts on stream. Gift names must match TikTok's exactly (any case);
 * change them in the control panel (H) if a gift doesn't trigger.
 */
export const DEFAULT_GIFT_ACTIONS: GiftAction[] = [
  { id: "g1", giftName: "Rose", label: "TNT", action: "tnt", amount: 1 },
  { id: "g2", giftName: "Finger Heart", label: "TNT Rain", action: "tnt", amount: 15 },
  { id: "g3", giftName: "I Love You", label: "Dragon", action: "dragon", amount: 1 },
  { id: "g4", giftName: "Doughnut", label: "Empty Box", action: "clear", amount: 1 },
  { id: "g5", giftName: "Perfume", label: "Fill Box", action: "fill", amount: 1 },
  { id: "g6", giftName: "Hat and Mustache", label: "Plus 1 Win", action: "win", amount: 1 },
];

export type GraphicsQuality = "low" | "medium" | "high";

export interface GameSettings {
  /** Seconds the box must stay 100% full for the streamer to win. */
  timerDuration: number;
  /** Seconds the builder takes to walk one tile (it plants a block on every empty tile it steps on). */
  buildInterval: number;
  /** Master volume, 0..1. */
  volume: number;
  /** When true the timer resets to full whenever the box loses a block. */
  resetTimerOnDamage: boolean;
  /** When true the builder walks by itself after 3 s without input. Off by default: it only moves when the streamer steers. (Renamed from `autoWalk` so old saved `true` values are ignored.) */
  idleAutoWalk: boolean;
  showLeaderboard: boolean;
  showBadge: boolean;
  showGiftList: boolean;
  wsUrl: string;
  /** Shown as "WIN x / winGoal". */
  winGoal: number;
  /** Every this many likes the like goal fires (0 = off). */
  likeGoalStep: number;
  likeGoalLabel: string;
  likeGoalAction: ActionKind;
  likeGoalAmount: number;
  giftActions: GiftAction[];
  character: CharacterKind;
  /** On-screen "Change character" button (bottom-right). Turn off to keep it off stream. */
  showCharacterButton: boolean;
  /** Background scenery style. */
  background: BackgroundKind;
  /** Optional custom background image (data URL or external URL) for "custom" mode. */
  customBackgroundUrl?: string;
  /** On-screen "Change background" button (bottom-right). Turn off to keep it off stream. */
  showBackgroundButton: boolean;
  /** Active block set theme. "auto" follows the selected character. */
  blockTheme: BlockTheme;
  /** Optional single locked block type (if user wants to build with only 1 specific block). */
  specificBlock?: BlockType | null;
  /** On-screen "Change blocks" button. */
  showBlockButton: boolean;
  /** When true, the builder plays autonomously (AFK live mode). */
  autoPilot: boolean;
  /** On-screen Auto-Pilot toggle button. */
  showAutoPilotButton: boolean;
  /** Graphics quality preset for low-end to high-end PCs. */
  graphicsQuality: GraphicsQuality;
  /** Real-time 3D shadow mapping. Off by default for smooth 60 FPS on low-end PCs. */
  enableShadows: boolean;
  /** Show real-time FPS counter on screen. */
  showFps: boolean;
  /** Automatically drop TNT when a viewer follows the stream. */
  enableFollowReward: boolean;
  followTnt: number;
  /** Automatically drop TNT when a viewer shares the stream. */
  enableShareReward: boolean;
  shareTnt: number;
  /** Background Music (BGM) toggle. */
  bgmEnabled: boolean;
  /** Background Music volume (0..1). */
  bgmVolume: number;
  /** BGM Track style: "cyber_hype" | "arcade_rush" | "custom" */
  bgmTrack: "cyber_hype" | "arcade_rush" | "custom";
  /** Optional custom BGM audio URL or uploaded data URL */
  customBgmUrl?: string;
  /** Auto read chat comments aloud using AI voice (TTS). */
  ttsEnabled: boolean;
  /** Volume for AI voice reader (0..1). */
  ttsVolume: number;
  /** Speed / rate for AI voice (0.5..2.0). Default 1.05. */
  ttsRate: number;
  /** Pitch for AI voice (0.5..1.5). Default 1.0. */
  ttsPitch: number;
  /** Include commenter's nickname when reading (e.g. "Juan: hello"). */
  ttsIncludeName: boolean;
  /** Selected voice URI/name (empty string = auto/default). */
  ttsVoiceURI: string;
}

export const DEFAULT_SETTINGS: GameSettings = {
  timerDuration: 10,
  buildInterval: 0.4,
  volume: 0.7,
  resetTimerOnDamage: false,
  idleAutoWalk: false,
  showLeaderboard: true,
  showBadge: true,
  showGiftList: true,
  wsUrl: "ws://localhost:21213",
  winGoal: 15,
  likeGoalStep: 50,
  likeGoalLabel: "TNT Drop",
  likeGoalAction: "tnt",
  likeGoalAmount: 1,
  giftActions: DEFAULT_GIFT_ACTIONS,
  character: "kuromi",
  showCharacterButton: true,
  background: "purple_night",
  customBackgroundUrl: "",
  showBackgroundButton: true,
  blockTheme: "auto",
  specificBlock: null,
  showBlockButton: true,
  autoPilot: true,
  showAutoPilotButton: false,
  graphicsQuality: "medium",
  enableShadows: false,
  showFps: false,
  enableFollowReward: true,
  followTnt: 2,
  enableShareReward: true,
  shareTnt: 2,
  bgmEnabled: true,
  bgmVolume: 0.35,
  bgmTrack: "cyber_hype",
  customBgmUrl: "",
  ttsEnabled: true,
  ttsVolume: 0.9,
  ttsRate: 1.05,
  ttsPitch: 1.0,
  ttsIncludeName: true,
  ttsVoiceURI: "",
};

export interface GameStats {
  filled: number;
  total: number;
  timeLeft: number;
  activeTnt: number;
  queuedTnt: number;
  round: number;
  streamerWins: number;
  likes: number;
  phase: "playing" | "won";
}

export interface LeaderEntry {
  id: string;
  nickname: string;
  avatarUrl?: string;
  coins: number;
  tnt: number;
  blocks: number;
  gifts?: number;
}
