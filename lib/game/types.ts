import type { CharacterKind } from "./characters";

export type BlockType = "grass" | "dirt" | "stone" | "gold" | "diamond" | "aqua";

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
  { id: "g2", giftName: "Rosa", label: "TNT Rain", action: "tnt", amount: 15 },
  { id: "g3", giftName: "Finger Heart", label: "Dragon", action: "dragon", amount: 1 },
  { id: "g4", giftName: "Perfume", label: "Empty Box", action: "clear", amount: 1 },
  { id: "g5", giftName: "Doughnut", label: "Fill Box", action: "fill", amount: 1 },
  { id: "g6", giftName: "Galaxy", label: "Plus 1 Win", action: "win", amount: 1 },
];

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
}

export const DEFAULT_SETTINGS: GameSettings = {
  timerDuration: 60,
  buildInterval: 0.4,
  volume: 0.7,
  resetTimerOnDamage: false,
  idleAutoWalk: false,
  showLeaderboard: true,
  showBadge: true,
  showGiftList: true,
  wsUrl: "ws://localhost:21213",
  winGoal: 15,
  likeGoalStep: 1000,
  likeGoalLabel: "Mega TNT",
  likeGoalAction: "tnt",
  likeGoalAmount: 10,
  giftActions: DEFAULT_GIFT_ACTIONS,
  character: "penguin",
  showCharacterButton: true,
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
}
