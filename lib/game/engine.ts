import { SfxEngine } from "./audio";
import { AvatarCache } from "./avatars";
import {
  BLAST_RADIUS,
  BORDER,
  BOX_H,
  BOX_W,
  BOX_X,
  BOX_Y,
  CELL,
  COLS,
  FUSE_SECONDS,
  GRAVITY,
  H,
  LEADERBOARD_Y,
  MAX_ACTIVE_TNT,
  MAX_PARTICLES,
  MAX_QUEUE,
  MAX_SCROLL,
  MIN_SCROLL_X,
  ROWS,
  SCROLL_ANCHOR,
  SCROLL_X_ANCHOR,
  SPAWN_STAGGER,
  TNT_SIZE,
  W,
  WIN_DURATION,
} from "./constants";
import { BLOCK_PARTICLE_COLORS, createTextures, type TextureSet } from "./textures";
import { AerialBackdrop } from "./aerial";
import { Scene3D } from "./scene3d";
import { type CharacterKind } from "./characters";
import {
  DEFAULT_SETTINGS,
  KUROMI_BLOCK_TYPES,
  ASTRONAUT_BLOCK_TYPES,
  type ActionKind,
  type BlockType,
  type GameSettings,
  type GameStats,
  type GiftDrop,
  type LeaderEntry,
  type Viewer,
} from "./types";
import { type BlockTheme } from "./blockThemes";

export interface Cell {
  type: BlockType;
  /** Pixels above its resting spot while it is still dropping into place. */
  fall: number;
  fallV: number;
}

/** Side view: blocks stack from the bottom of each column; TNT falls in from above. */
export interface Tnt {
  id: number;
  x: number; // centre
  y: number; // centre
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  age: number;
  fuse: number;
  landed: boolean;
  viewer: Viewer;
  sparkAcc: number;
}

/** Input directions: left/right walk, up jumps, down builds a block under the builder (only when landed). */
export type Dir = "up" | "down" | "left" | "right";

/** Seconds per column while the streamer steers the builder by hand. */
const MANUAL_STEP = 0.17;
/** Seconds without input before the builder walks on its own again. */
const AUTO_RESUME = 3;
/** How fast the builder is pushed up when a block appears under its feet (px/s). */
const RISE_SPEED = 1400;
/** Jump take-off speed: clears a little over one block. */
const JUMP_V = Math.sqrt(2 * GRAVITY * CELL * 1.4);

/**
 * The streamer's builder, seen from the side. Starts at the top of the box and
 * can only stand on blocks it built: every column it walks into gets a block,
 * which drops to the bottom of that column, so the box fills bottom-up.
 */
export interface Builder {
  /** Column it stands in (or is walking to). */
  col: number;
  fromCol: number;
  x: number; // centre
  y: number; // feet
  fromX: number;
  vx: number;
  vy: number;
  /** 0..1 progress of the current step; >= 1 means it has arrived on `col`. */
  step: number;
  stepDur: number;
  dir: "left" | "right";
  walkTime: number;
  stun: number;
  /** Blown into the air by TNT. */
  flung: boolean;
  buildCd: number;
}

type ParticleKind ="debris" | "smoke" | "spark" | "confetti";

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  /** Depth in game pixels: 0 is the front face of the blocks, -CELL the back wall, + toward the camera. Defaults to the block centre. */
  z?: number;
  vx: number;
  vy: number;
  vz?: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  rot: number;
  vr: number;
}

/** A DRAGON gift in flight (game pixels, centre of its body). */
export interface Dragon {
  x: number;
  y: number;
  dir: 1 | -1;
  t: number;
  lastCol: number;
  viewer: Viewer;
  /** Column being burnt right now (-1 = flying), and seconds of fire left on it. */
  burnCol: number;
  burnLeft: number;
}

export interface Ring {
  x: number;
  y: number;
  age: number;
}

interface Toast {
  text: string;
  color: string;
  age: number;
}

const BG_IMAGE_URL = "/background.png";
/** Draw public/background.png instead of the painted sky scenery (it doesn't move with the camera). */
const USE_BG_IMAGE = false;
/** Where the grass line sits in background.png (fraction of its height), and the game y it lines up with. */
const BG_GROUND_FRAC = 0.75;
const BG_GROUND_Y = BOX_Y + BOX_H; // the box floor
/** Chunky rounded display font for the HUD (loaded in app/layout.tsx); falls back to a heavy system font. */
const FONT = '"Lilita One", "Arial Black", system-ui, sans-serif';
/** Accent colours for the gift-action chips. */
/** Pictures for the default gift rows: the TikTok gift and what it does. */
const GIFT_ICONS: Record<string, { gift: string; result: string }> = {
  g1: { gift: "/gifts/rose.png", result: "/gifts/tnt.png" },
  g2: { gift: "/gifts/fingerheart.png", result: "/gifts/tntrain.png" },
  g3: { gift: "/gifts/iloveyou.png", result: "/gifts/dragon.png" },
  g4: { gift: "/gifts/doughnut.png", result: "/gifts/emptybox.png" },
  g5: { gift: "/gifts/perfume.png", result: "/gifts/fillbox.png" },
  g6: { gift: "/gifts/hat.png", result: "/gifts/win.png" },
};
const ACTION_COLORS: Record<ActionKind, string> = { tnt: "#ef4444", dragon: "#8b5cf6", clear: "#f97316", fill: "#14b8a6", win: "#eab308" };
/** Standard coin / diamond values for known TikTok gifts */
const KNOWN_GIFT_COINS: Record<string, number> = {
  rose: 1,
  rosa: 1,
  "finger heart": 5,
  "i love you": 100,
  doughnut: 30,
  perfume: 20,
  "hat and mustache": 99,
  cap: 99,
  galaxy: 1000,
  dragon: 1000,
  lion: 29999,
  tiktok: 1,
  panda: 5,
  heart: 10,
  confetti: 100,
  swan: 500,
};
/** Dragon flight speed (px/s) and how far outside the box it starts/ends. */
const DRAGON_SPEED = 520;
const DRAGON_MARGIN = 260;
const TOAST_LIFE = 3.2;
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const IDLE_LINES = [
  "Kaya pa ba?",
  "Matatalo niyo ba ako?",
  "Tara, subukan niyo ako!",
  "Ang tibay ng tower ko!",
  "Sino magpapasabog sa akin?",
  "Bakit ang tahimik niyo?",
  "Gift naman diyan!",
  "Hindi ako matitinag!",
  "Kaya ko 'to!",
  "Yan lang ba kaya niyo?",
  "Dagdagan niyo pa ang blocks!",
  "Walang makakatalo sa akin!",
];
const FULL_LINES = ["Puno na! Konting hold na lang!", "Ayan, malapit na akong manalo!", "Kaya niyo pa bang sirain to?"];
const TNT_LINES = ["Aray ko po!", "Wag na po, tama na please!", "Naku, TNT na naman!", "Maawa naman kayo!", "Ayoko na! Tama na!", "Sorry na po!", "Bakit ako lang?!"];
const DRAGON_LINES = ["May dragon?! Takbo!", "Wag po dragon, please!", "Aaah ang init!", "Ayoko ng dragon!"];
const CLEAR_LINES = ["Huwag po! Ang tower ko!", "Wag mong sirain lahat!", "Nooo! Nawala lahat!"];
const FILL_LINES = ["Wow, ang dami ng blocks!", "Ay, tulong ba yan?"];
const WIN_LINES = ["Salamat! Panalo na ako!", "Yes! Dagdag win!"];
const HIT_LINES = ["AAAAAY!", "Aray ko po!", "Nanay ko po!", "Ang sakit! Tama na!", "Susuko na ako! Joke lang!"];
/**
 * Final-seconds slow motion for the HOLD timer: from SLOW_FROM seconds left the
 * countdown runs at SLOW_START_RATE of real time, easing down to SLOW_END_RATE
 * by the last second (so 3 → 2 → 1 each take longer than the one before).
 */
const SLOW_FROM = 3;
const SLOW_START_RATE = 0.35;
const SLOW_END_RATE = 0.20;
const BLOCK_WEIGHTS: [BlockType, number][] = [
  ["grass", 34],
  ["dirt", 22],
  ["stone", 22],
  ["gold", 13],
  ["diamond", 9],
];
const BLOCK_WEIGHT_TOTAL = BLOCK_WEIGHTS.reduce((s, [, w]) => s + w, 0);

const KUROMI_BLOCK_WEIGHTS: [BlockType, number][] = [
  ["kuromi_regular", 34],
  ["dark_jester", 22],
  ["lucky_skull_box", 22],
  ["punk_ore", 13],
  ["spiked_castle", 9],
];
const KUROMI_BLOCK_WEIGHT_TOTAL = KUROMI_BLOCK_WEIGHTS.reduce((s, [, w]) => s + w, 0);

function randomKuromiBlock(): BlockType {
  let r = Math.random() * KUROMI_BLOCK_WEIGHT_TOTAL;
  for (const [type, w] of KUROMI_BLOCK_WEIGHTS) {
    r -= w;
    if (r <= 0) return type;
  }
  return "kuromi_regular";
}

const ASTRONAUT_BLOCK_WEIGHTS: [BlockType, number][] = [
  ["space_suit", 30],
  ["shuttle_hull", 25],
  ["control_panel", 20],
  ["cargo_crate", 15],
  ["meteor_ore", 10],
];
const ASTRONAUT_BLOCK_WEIGHT_TOTAL = ASTRONAUT_BLOCK_WEIGHTS.reduce((s, [, w]) => s + w, 0);

function randomAstronautBlock(): BlockType {
  let r = Math.random() * ASTRONAUT_BLOCK_WEIGHT_TOTAL;
  for (const [type, w] of ASTRONAUT_BLOCK_WEIGHTS) {
    r -= w;
    if (r <= 0) return type;
  }
  return "space_suit";
}

const CONFETTI_COLORS = ["#ffd54a", "#ff5c8a", "#4ade80", "#38bdf8", "#c084fc", "#ffffff", "#fb923c"];
const RANK_COLORS = ["#ffd54a", "#d7dde5", "#e0915a", "#9ca3af", "#9ca3af"];

function randomClassicBlock(): BlockType {
  const r = Math.random();
  if (r < 0.3) return "diamond";
  if (r < 0.55) return "gold";
  if (r < 0.75) return "grass";
  if (r < 0.9) return "stone";
  return "dirt";
}

const ALL_MIXED_BLOCKS: BlockType[] = [
  "space_suit", "shuttle_hull", "meteor_ore", "cargo_crate", "control_panel",
  "kuromi_regular", "dark_jester", "lucky_skull_box", "punk_ore", "spiked_castle",
  "diamond", "gold", "aqua", "grass", "stone", "dirt"
];

function randomMixedBlock(): BlockType {
  return ALL_MIXED_BLOCKS[Math.floor(Math.random() * ALL_MIXED_BLOCKS.length)];
}

/** Default block for non-Kuromi characters. Set to null to go back to random mixed blocks. */
const SINGLE_BLOCK: BlockType | null = "aqua";

function randomStandardBlock(): BlockType {
  if (SINGLE_BLOCK) return SINGLE_BLOCK;
  let r = Math.random() * BLOCK_WEIGHT_TOTAL;
  for (const [type, w] of BLOCK_WEIGHTS) {
    r -= w;
    if (r <= 0) return type;
  }
  return "grass";
}

const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 70% 50%)`;
}

function truncate(s: string, n: number): string {
  const chars = Array.from(s);
  return chars.length > n ? chars.slice(0, n - 1).join("") + "…" : s;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The TNT Box game. Owns all mutable game state and runs its own
 * requestAnimationFrame loop, so React never re-renders per frame.
 * The constructor is DOM-free; DOM work happens in attach().
 */
export class TntBoxEngine {
  readonly audio = new SfxEngine();
  private avatars = new AvatarCache();

  /** Back canvas: the painted 2-D scenery. */
  private bgCanvas: HTMLCanvasElement | null = null;
  private bgCtx: CanvasRenderingContext2D | null = null;
  /** Middle canvas: the 3-D box, blocks, TNT, builder and effects. */
  private scene3d: Scene3D | null = null;
  /** Front canvas: the 2-D HUD (text, tags, leaderboard, confetti). */
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private tex: TextureSet | null = null;
  private pt = { x: 0, y: 0 };
  /** What the builder is saying right now (speech bubble), and the cooldown to the next idle chatter. */
  private speech: { text: string; age: number; life: number; hurt: boolean } | null = null;
  private chatCd = 4;
  private backdrop: AerialBackdrop | null = null;
  /** Camera climb in game pixels: screen y = game y + scroll. Follows the builder up the tower. */
  private scroll = 0;
  /** Camera pan in game pixels: screen x = game x + scrollX (0 or negative). */
  private scrollX = 0;
  /** Cache of loaded background images by URL. */
  private bgImages: Map<string, HTMLImageElement> = new Map();
  /** Key for current background drawing state. */
  private bgKey = "";
  private resizeObs: ResizeObserver | null = null;
  private viewKey = "";
  /** Where the 1080x1920 play area sits inside the (window-shaped) canvas. */
  private offX = 0;
  private offY = 0;
  private rafId = 0;
  private lastTs = 0;

  private settings: GameSettings = { ...DEFAULT_SETTINGS };
  private grid: (Cell | null)[] = new Array(COLS * ROWS).fill(null);
  private filled = 0;
  private tnts: Tnt[] = [];
  private builder!: Builder;
  /** Directions currently held down, most recent last. */
  private held: Dir[] = [];
  /** A press that hasn't moved the builder yet (so quick taps always count). */
  private tapped: Dir | null = null;
  private lastInput = -Infinity;
  private spawnQueue: Viewer[] = [];
  private spawnCooldown = 0;
  private particles: Particle[] = [];
  private confetti: Particle[] = [];
  private rings: Ring[] = [];
  private toasts: Toast[] = [];
  private leaderboard = new Map<string, LeaderEntry>();

  private time = 0;
  private timeLeft = DEFAULT_SETTINGS.timerDuration;
  private shake = 0;
  private phase: "playing" | "won" = "playing";
  private wonTimer = 0;
  private round = 1;
  private streamerWins = 0;
  private likes = 0;
  private viewerLikes = new Map<string, number>();
  /** Gift name (lower case) → picture URL, remembered from incoming gifts for the on-screen list. */
  private giftImages = new Map<string, string>();
  private banner: { title: string; sub: string; color: string; age: number } | null = null;
  /** The dragon currently flying across (DRAGON gift), and how many more are waiting. */
  private dragon: Dragon | null = null;
  private dragonQueue: Viewer[] = [];
  private dragonTopRow = 0;
  private nextId = 1;
  /** Last whole second shown by the HOLD timer (for the countdown tick). */
  private lastShownSecond = 0;
  /** Pauses the full-box countdown while a gift/TNT drop is in flight (until it explodes). */
  private giftPauseUntil = 0;

  private fps = 60;
  private fpsFrames = 0;
  private fpsLastTime = 0;

  private statsListener: ((s: GameStats) => void) | null = null;
  private statsAcc = 0;

  /** AI state for human-like autonomous gameplay (row sweeps, column pillars, crater repair). */
  private autoAi: {
    mode: "row" | "column" | "crater" | "wander";
    dir: "left" | "right";
    stepsLeft: number;
    pillarRemaining: number;
    targetCol: number;
    pauseTimer: number;
  } = {
    mode: "row",
    dir: "right",
    stepsLeft: 14,
    pillarRemaining: 0,
    targetCol: 0,
    pauseTimer: 0,
  };

  constructor() {
    this.builder = this.spawnBuilder();
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  /** `bg` gets the scenery, `gl` the 3-D scene, `hud` the 2-D overlay. All three are stacked full-window. */
  attach(bg: HTMLCanvasElement, gl: HTMLCanvasElement, hud: HTMLCanvasElement) {
    this.bgCanvas = bg;
    this.bgCtx = bg.getContext("2d", { alpha: false });
    this.canvas = hud;
    this.ctx = hud.getContext("2d");
    if (!this.ctx || !this.bgCtx) return;
    this.tex ??= createTextures();
    // React strict mode re-attaches the same canvas: keep its WebGL renderer.
    if (this.scene3d?.canvas !== gl) {
      try {
        this.scene3d = new Scene3D(gl, this.tex);
        this.scene3d.setCharacter(this.settings.character);
        this.scene3d.setGraphics(this.settings.enableShadows, this.settings.graphicsQuality);
      } catch (err) {
        console.error("WebGL unavailable", err);
        this.scene3d = null;
      }
    }
    this.viewKey = "";
    this.resize();
    this.resizeObs?.disconnect();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(hud);
    document.fonts?.load(`20px ${FONT}`).catch(() => {});
    this.lastTs = performance.now();
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.frame);
  }

  /**
   * Sizes the canvas to the window's aspect so the scenery fills the whole
   * window. The 1080x1920 play area is scaled to fit and centred inside it;
   * a 1080x1920 browser source (OBS) gets exactly the play area.
   */
  private resize() {
    const canvas = this.canvas;
    const c = this.ctx;
    if (!canvas || !c || !this.tex) return;
    const cw = canvas.clientWidth || W;
    const ch = canvas.clientHeight || H;
    const scale = Math.min(cw / W, ch / H);
    const vw = Math.max(W, Math.round(cw / scale));
    const vh = Math.max(H, Math.round(ch / scale));
    const key = `${vw}x${vh}@${cw}x${ch}`;
    if (key === this.viewKey) return;
    this.viewKey = key;
    for (const cv of [canvas, this.bgCanvas!]) {
      cv.width = vw;
      cv.height = vh;
    }
    this.bgKey = ""; // resizing clears the canvas
    c.imageSmoothingEnabled = false;
    this.bgCtx!.imageSmoothingEnabled = false;
    this.offX = Math.floor((vw - W) / 2);
    this.offY = Math.floor((vh - H) / 2);
    this.backdrop = new AerialBackdrop(vw, vh, this.offX, this.offY, this.tex);

    this.scene3d?.resize(cw, ch, vw, vh, this.offX, this.offY);
  }

  detach() {
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    cancelAnimationFrame(this.rafId);
    this.canvas = null;
    this.ctx = null;
    this.bgCanvas = null;
    this.bgCtx = null;
  }

  private frame = (ts: number) => {
    const dt = Math.min(0.05, Math.max(0, (ts - this.lastTs) / 1000));
    this.lastTs = ts;
    this.fpsFrames++;
    if (ts - this.fpsLastTime >= 500) {
      this.fps = Math.round((this.fpsFrames * 1000) / Math.max(1, ts - this.fpsLastTime));
      this.fpsFrames = 0;
      this.fpsLastTime = ts;
    }
    this.update(dt);
    this.render();
    this.rafId = requestAnimationFrame(this.frame);
  };

  // ───────────────────────────── public API ─────────────────────────────

  setSettings(next: GameSettings) {
    const prev = this.settings;
    this.settings = { ...next };
    this.audio.setVolume(next.volume);
    this.audio.setBgm(next.bgmEnabled, next.bgmVolume, next.bgmTrack, next.customBgmUrl);
    this.scene3d?.setCharacter(next.character);
    if (
      next.enableShadows !== prev.enableShadows ||
      next.graphicsQuality !== prev.graphicsQuality
    ) {
      this.scene3d?.setGraphics(next.enableShadows, next.graphicsQuality);
    }
    if (
      next.character !== prev.character ||
      next.blockTheme !== prev.blockTheme ||
      next.specificBlock !== prev.specificBlock
    ) {
      this.remapGridBlocks();
    }
    if (next.timerDuration !== prev.timerDuration) {
      this.timeLeft = this.isFull() ? Math.min(this.timeLeft, next.timerDuration) : next.timerDuration;
    }
    if (next.background !== prev.background || next.customBackgroundUrl !== prev.customBackgroundUrl) {
      this.bgKey = "";
      this.bgCtx?.clearRect(0, 0, this.bgCanvas?.width ?? 0, this.bgCanvas?.height ?? 0);
    }
  }

  private getActiveTheme(): BlockTheme {
    const t = this.settings.blockTheme || "auto";
    if (t === "auto") {
      if (this.settings.character === "astronaut") return "astronaut";
      if (this.settings.character === "kuromi") return "kuromi";
      return "aqua";
    }
    return t;
  }

  private remapGridBlocks() {
    for (let i = 0; i < this.grid.length; i++) {
      const cell = this.grid[i];
      if (!cell) continue;
      cell.type = this.randomBlock();
    }
  }

  private randomBlock(): BlockType {
    if (this.settings.specificBlock) {
      return this.settings.specificBlock;
    }
    const theme = this.getActiveTheme();
    if (theme === "astronaut") return randomAstronautBlock();
    if (theme === "kuromi") return randomKuromiBlock();
    if (theme === "classic") return randomClassicBlock();
    if (theme === "aqua") return "aqua";
    if (theme === "random_mix") return randomMixedBlock();
    return randomStandardBlock();
  }

  onStats(listener: (s: GameStats) => void): () => void {
    this.statsListener = listener;
    listener(this.getStats());
    return () => {
      if (this.statsListener === listener) this.statsListener = null;
    };
  }

  getStats(): GameStats {
    return {
      filled: this.filled,
      total: COLS * ROWS,
      timeLeft: this.timeLeft,
      activeTnt: this.tnts.length,
      queuedTnt: this.spawnQueue.length,
      round: this.round,
      streamerWins: this.streamerWins,
      likes: this.likes,
      phase: this.phase,
    };
  }

  /** Restores the win counter (e.g. from localStorage) or sets it by hand. */
  setWins(n: number) {
    this.streamerWins = Math.max(0, Math.floor(n));
    this.pushStats();
  }

  resetLikes() {
    this.likes = 0;
    this.pushStats();
  }

  private pushStats() {
    this.statsListener?.(this.getStats());
  }

  rememberGiftImage(giftName: string, url?: string) {
    if (!url) return;
    const key = giftName.trim().toLowerCase();
    if (this.giftImages.get(key) === url) return;
    if (this.giftImages.size > 300) this.giftImages.clear();
    this.giftImages.set(key, url);
  }

  /**
   * Runs a gift-list action (or the like-goal action) `count` times over.
   * `label` is what viewers see in the toast.
   */
  performAction(
    viewer: Viewer,
    label: string,
    action: ActionKind,
    amount: number,
    count: number,
    coins = 0,
    giftName?: string,
  ) {
    const n = Math.max(1, Math.floor(count));
    const who = truncate(viewer.nickname, 12);
    const times = n > 1 ? ` x${n}` : "";

    // Live donation tracking: credit donor on the Top Destroyer leaderboard
    const e = this.entryFor(viewer);
    let totalCoins = coins;
    if (totalCoins <= 0 && giftName) {
      const known = KNOWN_GIFT_COINS[giftName.trim().toLowerCase()] ?? 1;
      totalCoins = known * n;
    }
    if (totalCoins > 0) {
      e.coins += totalCoins;
    }
    e.gifts = (e.gifts || 0) + n;

    this.react(action);
    switch (action) {
      case "tnt": {
        const tnt = Math.max(1, Math.floor(amount)) * n;
        e.tnt += tnt;
        this.dropTnt(viewer, tnt);
        this.toast(`${who}: ${label}${times} → ${tnt} TNT`, "#ff8a65");
        break;
      }
      case "dragon": {
        const count = Math.max(1, Math.floor(amount)) * n;
        for (let i = 0; i < Math.min(count, 10); i++) this.dragonQueue.push(viewer);
        this.giftPauseUntil = Math.max(this.giftPauseUntil, this.time + 3.0);
        this.toast(`${who}: ${label}${times}!`, "#c4b5fd");
        break;
      }
      case "clear":
        this.clearBox(viewer);
        this.toast(`${who}: ${label}!`, "#ff5c5c");
        break;
      case "fill":
        this.fillBox();
        this.toast(`${who}: ${label}!`, "#5eead4");
        break;
      case "win": {
        const delta = Math.floor(amount) * n;
        this.setWins(this.streamerWins + delta);
        this.toast(`${who}: ${label}${times}`, "#ffd54a");
        this.emitConfetti(60, false);
        break;
      }
    }
  }

  handleGift(g: GiftDrop) {
    const e = this.entryFor(g.viewer);
    const c = g.coins > 0 ? g.coins : (KNOWN_GIFT_COINS[g.giftName.trim().toLowerCase()] ?? 1) * g.count;
    e.coins += c;
    e.tnt += g.tnt;
    e.gifts = (e.gifts || 0) + g.count;
    const giftLabel = g.count > 1 ? `${g.count}x ${g.giftName}` : g.giftName;
    this.toast(`${truncate(g.viewer.nickname, 12)}: ${giftLabel} → ${g.tnt} TNT`, "#ff8a65");
    this.dropTnt(g.viewer, g.tnt);
    this.react("tnt");
  }

  dropTnt(viewer: Viewer, count: number) {
    const room = MAX_QUEUE - this.spawnQueue.length;
    for (let i = 0; i < Math.min(count, room); i++) this.spawnQueue.push(viewer);
    // Pause countdown for ~3 seconds while TNT drops until it detonates
    this.giftPauseUntil = Math.max(this.giftPauseUntil, this.time + 3.0);
  }

  /**
   * Counts likes toward the like goal (running `onGoal` each time a multiple of
   * `step` is passed) and drops one block per like into the box.
   */
  handleLike(viewer: Viewer, likes: number, goal?: { step: number; onGoal: (times: number) => void }) {
    const before = this.likes;
    this.likes += Math.max(1, Math.floor(likes));
    if (goal && goal.step > 0) {
      const hits = Math.floor(this.likes / goal.step) - Math.floor(before / goal.step);
      if (hits > 0) goal.onGoal(Math.min(hits, 5));
    }
    this.pushStats();
    if (this.phase !== "playing") return;
    // Likes no longer drop blocks: every 100 likes from one viewer drops a TNT.
    const total = Math.max(1, Math.floor(likes));
    const prevV = this.viewerLikes.get(viewer.id) ?? 0;
    const nextV = prevV + total;
    this.viewerLikes.set(viewer.id, nextV);
    const tntHits = Math.floor(nextV / 100) - Math.floor(prevV / 100);
    if (tntHits > 0) {
      this.entryFor(viewer).tnt += tntHits;
      this.dropTnt(viewer, tntHits);
      this.audio.like();
      this.toast(`♥ ${truncate(viewer.nickname, 12)} 100 likes → ${tntHits} TNT`, "#ff8a65");
    }
  }

  handleFollow(viewer: Viewer, count = 2) {
    if (count <= 0) return;
    const who = truncate(viewer.nickname, 12);
    this.toast(`➕ ${who} followed! → ${count} TNT`, "#38bdf8");
    this.entryFor(viewer).tnt += count;
    this.dropTnt(viewer, count);
    this.react("tnt");
  }

  handleShare(viewer: Viewer, count = 2) {
    if (count <= 0) return;
    const who = truncate(viewer.nickname, 12);
    this.toast(`📢 ${who} shared LIVE! → ${count} TNT`, "#a78bfa");
    this.entryFor(viewer).tnt += count;
    this.dropTnt(viewer, count);
    this.react("tnt");
  }

  /** Big centred announcement (like goal reached, etc.). */
  showBanner(title: string, sub: string, color = "#7dff6a") {
    this.banner = { title, sub, color, age: 0 };
    this.audio.fanfare();
  }

  /** Blows every block out of the box. */
  clearBox(viewer?: Viewer) {
    if (this.phase !== "playing") return;
    let destroyed = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const cell = this.grid[idx];
        if (!cell) continue;
        this.grid[idx] = null;
        destroyed++;
        if (Math.random() < 0.35) {
          const colors = BLOCK_PARTICLE_COLORS[cell.type];
          this.addParticle({
            kind: "debris",
            x: BOX_X + c * CELL + CELL / 2,
            y: BOX_Y + r * CELL + CELL / 2,
            z: -CELL * 0.5,
            vx: (Math.random() - 0.5) * 900,
            vy: -400 - Math.random() * 900,
            vz: Math.random() * 900,
            life: 1.2,
            maxLife: 1.5,
            size: 14 + Math.floor(Math.random() * 3) * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            gravity: 2400,
            rot: Math.random() * Math.PI * 2,
            vr: (Math.random() - 0.5) * 18,
          });
        }
      }
    }
    this.filled = 0;
    if (viewer && destroyed) this.entryFor(viewer).blocks += destroyed;
    this.shake = Math.min(this.shake + 30, 44);
    this.audio.explosion(1);
  }

  fillBox() {
    if (this.phase !== "playing") return;
    while (this.placeBlock(false) >= 0) {
      /* fill */
    }
  }

  /** Streamer steering (arrow keys / WASD). */
  pressDir(dir: Dir) {
    if (!this.held.includes(dir)) this.held.push(dir);
    this.tapped = dir;
    this.lastInput = this.time;
  }

  releaseDir(dir: Dir) {
    this.held = this.held.filter((d) => d !== dir);
    this.lastInput = this.time;
  }

  releaseAll() {
    this.held = [];
    this.tapped = null;
  }

  /** True while the streamer is steering manually. */
  isManual(): boolean {
    if (this.settings.autoPilot) {
      return this.held.length > 0 || this.tapped !== null;
    }
    return (
      this.held.length > 0 ||
      this.tapped !== null ||
      this.time - this.lastInput < AUTO_RESUME ||
      !this.settings.idleAutoWalk
    );
  }

  resetRound() {
    this.dragon = null;
    this.dragonQueue = [];
    this.grid.fill(null);
    this.filled = 0;
    this.tnts = [];
    this.builder = this.spawnBuilder();
    this.timeLeft = this.settings.timerDuration;
    this.phase = "playing";
    this.wonTimer = 0;
    this.confetti = [];
    this.autoAi = {
      mode: "row",
      dir: Math.random() < 0.5 ? "left" : "right",
      stepsLeft: 12 + Math.floor(Math.random() * 8),
      pillarRemaining: 0,
      targetCol: 0,
      pauseTimer: 0,
    };
  }

  resetLeaderboard() {
    this.leaderboard.clear();
  }

  // ───────────────────────────── simulation ─────────────────────────────

  private isFull() {
    return this.filled === COLS * ROWS;
  }

  private entryFor(v: Viewer): LeaderEntry {
    let e = this.leaderboard.get(v.id);
    if (!e) {
      e = { id: v.id, nickname: v.nickname, avatarUrl: v.avatarUrl, coins: 0, tnt: 0, blocks: 0, gifts: 0 };
      this.leaderboard.set(v.id, e);
    } else {
      e.nickname = v.nickname;
      if (v.avatarUrl) e.avatarUrl = v.avatarUrl;
    }
    return e;
  }

  // ----------------------------- builder chatter -----------------------------

  /** Makes the builder say something. Hurt lines interrupt; idle chatter never cuts one off. */
  private say(text: string, hurt = false) {
    if (this.speech && !hurt && this.speech.hurt) return;
    this.speech = { text, age: 0, life: hurt ? 2.4 : 3, hurt };
  }

  /** The builder's reaction when a viewer sends something against (or for) the streamer. */
  private react(action: ActionKind) {
    if (this.speech?.hurt && this.speech.age < 1.2) return; // don't spam
    if (action === "tnt") this.say(pick(TNT_LINES), true);
    else if (action === "dragon") this.say(pick(DRAGON_LINES), true);
    else if (action === "clear") this.say(pick(CLEAR_LINES), true);
    else if (action === "fill") this.say(pick(FILL_LINES));
    else if (action === "win") this.say(pick(WIN_LINES));
  }

  private updateSpeech(dt: number) {
    if (this.speech && (this.speech.age += dt) > this.speech.life) this.speech = null;
    if (this.phase !== "playing") return;
    this.chatCd -= dt;
    if (this.chatCd <= 0) {
      this.chatCd = 6 + Math.random() * 6;
      if (!this.speech) this.say(pick(this.isFull() ? FULL_LINES : IDLE_LINES));
    }
  }

  /** Speech bubble above the builder's head, projected through the 3-D camera. */
  private drawSpeech(c: CanvasRenderingContext2D) {
    const sp = this.speech;
    const s3 = this.scene3d;
    if (!sp || !s3) return;
    const b = this.builder;
    s3.toScreen(b.x, b.y - CELL * 2.2, -CELL / 2, this.pt);
    const pop = easeOutBack(Math.min(1, sp.age / 0.2));
    const fade = Math.min(1, (sp.life - sp.age) / 0.3);
    c.save();
    c.globalAlpha = Math.max(0, fade);
    c.font = `34px ${FONT}`;
    const tw = Math.min(520, c.measureText(sp.text).width);
    const w = tw + 48;
    const h = 66;
    const left = this.viewLeft() + 10;
    const right = this.viewRight() - 10;
    const x = Math.max(left + w / 2, Math.min(right - w / 2, this.pt.x));
    const y = this.pt.y;
    c.translate(x, y);
    c.scale(pop, pop);
    c.fillStyle = "#ffffff";
    c.strokeStyle = sp.hurt ? "#ef4444" : "#1f2937";
    c.lineWidth = 5;
    c.beginPath();
    c.roundRect(-w / 2, -h - 14, w, h, 24);
    c.moveTo(-14 + (this.pt.x - x) * 0.3, -14);
    c.lineTo(this.pt.x - x, 6);
    c.lineTo(14 + (this.pt.x - x) * 0.3, -14);
    c.fill();
    c.stroke();
    c.fillStyle = sp.hurt ? "#b91c1c" : "#111827";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(sp.text, 0, -h / 2 - 14 + 2, tw);
    c.restore();
  }
  private toast(text: string, color: string) {
    this.toasts.unshift({ text, color, age: 0 });
    if (this.toasts.length > 4) this.toasts.length = 4;
  }

  /** Blocks currently in a column (columns are always packed from the bottom). */
  private height(col: number): number {
    let h = 0;
    for (let r = ROWS - 1; r >= 0 && this.grid[r * COLS + col]; r--) h++;
    return h;
  }

  /** Y of the top of a column's stack (the box floor when it is empty). */
  private surfaceY(col: number): number {
    return BOX_Y + (ROWS - this.height(col)) * CELL;
  }

  private colAt(x: number): number {
    return Math.min(COLS - 1, Math.max(0, Math.floor((x - BOX_X) / CELL)));
  }

  /**
   * Drops a block into a column. It lands on top of the column's stack, so the
   * bottom always fills first. `fromTop` is where the block's top edge starts.
   * Returns false when the column is already full.
   */
  private dropInto(col: number, fromTop: number): boolean {
    const h = this.height(col);
    if (h >= ROWS) return false;
    const row = ROWS - 1 - h;
    const restTop = BOX_Y + row * CELL;
    this.grid[row * COLS + col] = { type: this.randomBlock(), fall: Math.max(0, restTop - fromTop), fallV: 0 };
    this.filled++;
    return true;
  }

  /** Drops one block into a random non-full column from above the box (likes / test fill). Returns the column or -1 when full. */
  private placeBlock(fromLike: boolean): number {
    if (this.isFull()) return -1;
    const open: number[] = [];
    for (let c = 0; c < COLS; c++) if (this.height(c) < ROWS) open.push(c);
    const col = open[Math.floor(Math.random() * open.length)];
    this.dropInto(col, BOX_Y - CELL * 1.5);
    if (fromLike) {
      const cx = BOX_X + col * CELL + CELL / 2;
      for (let i = 0; i < 6; i++) {
        this.addParticle({
          kind: "spark",
          x: cx + (Math.random() - 0.5) * CELL,
          y: BOX_Y - CELL + (Math.random() - 0.5) * CELL,
          vx: (Math.random() - 0.5) * 120,
          vy: -60 - Math.random() * 160,
          life: 0.6,
          maxLife: 0.6,
          size: 10,
          color: "#ff8fc0",
          gravity: 0,
          rot: 0,
          vr: 0,
        });
      }
    }
    return col;
  }

  /** After an explosion, blocks left hanging drop down so every column is packed from the bottom. */
  private collapseColumns() {
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const cell = this.grid[r * COLS + c];
        if (!cell) continue;
        if (write !== r) {
          this.grid[write * COLS + c] = cell;
          this.grid[r * COLS + c] = null;
          cell.fall += (write - r) * CELL;
        }
        write--;
      }
    }
  }

  private updateCells(dt: number) {
    for (const cell of this.grid) {
      if (!cell || cell.fall <= 0) continue;
      cell.fallV += GRAVITY * dt;
      cell.fall -= cell.fallV * dt;
      if (cell.fall <= 0) {
        cell.fall = 0;
        cell.fallV = 0;
      }
    }
  }

  // ───────────────────────────── builder ─────────────────────────────

  /** New builder at the top of the box; its first block drops with it so it lands on something it built. */
  private spawnBuilder(): Builder {
    const col = Math.floor(COLS / 2);
    const x = BOX_X + col * CELL + CELL / 2;
    const y = BOX_Y - 10;
    this.dropInto(col, y);
    return { col, fromCol: col, x, y, fromX: x, vx: 0, vy: 0, step: 1, stepDur: MANUAL_STEP, dir: "right", walkTime: 0, stun: 0, flung: false, buildCd: 0 };
  }

  private updateBuilder(dt: number) {
    const b = this.builder;
    b.stun = Math.max(0, b.stun - dt);
    b.buildCd -= dt;

    // Blown up by TNT: fly, then land on whatever column it comes down on.
    if (b.flung) {
      b.vy += GRAVITY * dt;
      b.x = Math.min(BOX_X + BOX_W - CELL * 0.35, Math.max(BOX_X + CELL * 0.35, b.x + b.vx * dt));
      b.y += b.vy * dt;
      const col = this.colAt(b.x);
      const surf = this.surfaceY(col);
      if (b.vy > 0 && b.y >= surf) {
        b.y = surf;
        b.vx = b.vy = 0;
        b.flung = false;
        // Shuffle back to the middle of the column (no block for this step).
        b.fromCol = b.col = col;
        b.fromX = b.x;
        b.step = 0;
        b.stepDur = MANUAL_STEP;
        this.dust(b.x, b.y, "#c8c8c8");
      }
      return;
    }

    // Vertical: stand on top of the stack. Mid-step it keeps the higher of the two
    // columns, so it steps up straight away and only drops after walking off a ledge.
    const surf = b.step < 1 ? Math.min(this.surfaceY(b.fromCol), this.surfaceY(b.col)) : this.surfaceY(b.col);
    if (b.y < surf - 0.5) {
      b.vy += GRAVITY * dt;
      b.y = Math.min(surf, b.y + b.vy * dt);
      if (b.y >= surf && b.vy > 900) this.dust(b.x, b.y, "#c8c8c8");
      if (b.y >= surf) b.vy = 0;
    } else if (b.y > surf) {
      b.y = Math.max(surf, b.y - RISE_SPEED * dt);
      b.vy = 0;
    }
    const grounded = Math.abs(b.y - surf) < 1;

    if (b.stun > 0) return;

    // Human micro-pause when autopilot is active (looking at chat / natural hesitation)
    if (this.settings.autoPilot && this.autoAi.pauseTimer > 0 && !this.isManual()) {
      this.autoAi.pauseTimer -= dt;
      b.walkTime = 0;
      return;
    }

    if (b.step < 1) {
      b.step = Math.min(1, b.step + dt / b.stepDur);
      b.walkTime += dt;
      const tx = BOX_X + b.col * CELL + CELL / 2;
      b.x = b.fromX + (tx - b.fromX) * b.step;
      if (b.step < 1) return;
      b.fromCol = b.col;
    }

    // In the air: steer sideways, but no blocks until it has landed.
    if (!grounded) {
      const air = this.held.at(-1) ?? this.tapped;
      if (air === "left" || air === "right") {
        this.tapped = null;
        this.tryWalk(b, air, MANUAL_STEP, false);
      }
      return;
    }

    // It can only stand on blocks it built, never the bare floor.
    if (this.height(b.col) === 0) {
      this.buildUnder(b);
      return;
    }

    // Streamer input wins; a tap counts even if the key was already released.
    const want = this.held.at(-1) ?? this.tapped;
    this.tapped = null;
    if (want) {
      if (want === "left" || want === "right") {
        if (!this.tryWalk(b, want, MANUAL_STEP)) b.walkTime = 0; // a wall: just turn
      } else if (want === "up") {
        this.jump(b);
      } else if (want === "down" && b.buildCd <= 0) {
        this.buildUnder(b);
        b.buildCd = MANUAL_STEP;
      }
      return;
    }

    if (this.isManual() || this.isFull()) {
      b.walkTime = 0;
      return;
    }
    this.autoStep(b);
  }

  /** Hops straight up; only callable while standing on a block. */
  private jump(b: Builder) {
    b.vy = -JUMP_V;
    b.y -= 1; // leave the ground so gravity takes over
  }

  /** Places a block straight under the builder, lifting it one block (pillar up). */
  private buildUnder(b: Builder): boolean {
    if (!this.dropInto(b.col, b.y)) return false;
    this.audio.place();
    this.dust(b.x, b.y, "#b08a63");
    return true;
  }

  /**
   * Steps one column sideways. The column it walks into gets a block, which
   * drops to the bottom of that column. It can climb at most one block, so a
   * taller column is a wall. In the air (`build` false) it places nothing and
   * can only move over columns whose top is below its feet.
   */
  private tryWalk(b: Builder, dir: "left" | "right", dur: number, build = true): boolean {
    b.dir = dir;
    const next = b.col + (dir === "left" ? -1 : 1);
    if (next < 0 || next >= COLS) return false;
    if (!build) {
      if (this.surfaceY(next) < b.y - 0.5) return false;
    } else {
      const after = Math.min(ROWS, this.height(next) + 1);
      if (after - this.height(b.col) > 1) return false;
    }
    if (build && this.dropInto(next, b.y - CELL)) {
      this.audio.place();
      this.dust(BOX_X + next * CELL + CELL / 2, this.surfaceY(next), "#b08a63");
    }
    b.fromCol = b.col;
    b.col = next;
    b.fromX = b.x;
    b.step = 0;
    b.stepDur = dur;
    return true;
  }

  /**
   * Human-like Autopilot AI:
   * Alternates between sweeping rows horizontally ("pa-row"), towering up vertically ("pa-column"),
   * repairing craters from TNT explosions, and organic maneuvers with micro-pauses and bunny-hops.
   */
  private pickNextAiMode(b: Builder) {
    // 1. Check for deep craters (craters left by TNT)
    let minH = ROWS;
    let minCol = b.col;
    let maxH = 0;
    for (let c = 0; c < COLS; c++) {
      const h = this.height(c);
      if (h < minH) {
        minH = h;
        minCol = c;
      }
      if (h > maxH) maxH = h;
    }

    const hasCrater = maxH - minH >= 3 && minH < ROWS;
    const roll = Math.random();

    // 2. Crater repair if a deep hole exists
    if (hasCrater && roll < 0.35) {
      this.autoAi.mode = "crater";
      this.autoAi.targetCol = minCol;
      this.autoAi.stepsLeft = Math.abs(minCol - b.col) + 4;
      return;
    }

    // 3. Alternate between pa-row and pa-column like a human
    const prevMode = this.autoAi.mode;

    if (prevMode === "row") {
      // Finished a row sweep:
      // ~55% chance: Switch to pa-column (tower/pillar up)
      // ~30% chance: Sweep another row in the opposite direction
      // ~15% chance: Wander / casual moves
      if (roll < 0.55) {
        this.autoAi.mode = "column";
        this.autoAi.pillarRemaining = 2 + Math.floor(Math.random() * 3); // 2 to 4 blocks
      } else if (roll < 0.85) {
        this.autoAi.mode = "row";
        this.autoAi.dir = this.autoAi.dir === "left" ? "right" : "left";
        this.autoAi.stepsLeft = 10 + Math.floor(Math.random() * 12);
      } else {
        this.autoAi.mode = "wander";
        this.autoAi.dir = Math.random() < 0.5 ? "left" : "right";
        this.autoAi.stepsLeft = 3 + Math.floor(Math.random() * 5);
      }
    } else if (prevMode === "column") {
      // Finished pillaring a column:
      // ~70% chance: Switch to pa-row (sweep horizontally from here)
      // ~18% chance: Step to adjacent column and pillar again
      // ~12% chance: Wander
      if (roll < 0.7) {
        this.autoAi.mode = "row";
        const leftH = b.col > 0 ? this.height(b.col - 1) : ROWS;
        const rightH = b.col < COLS - 1 ? this.height(b.col + 1) : ROWS;
        if (leftH < rightH) this.autoAi.dir = "left";
        else if (rightH < leftH) this.autoAi.dir = "right";
        else this.autoAi.dir = b.col > COLS / 2 ? "left" : "right";
        this.autoAi.stepsLeft = 10 + Math.floor(Math.random() * 12);
      } else if (roll < 0.88) {
        this.autoAi.mode = "column";
        this.autoAi.pillarRemaining = 2 + Math.floor(Math.random() * 3);
        const stepDir = Math.random() < 0.5 ? "left" : "right";
        this.tryWalk(b, stepDir, Math.max(0.05, this.settings.buildInterval));
      } else {
        this.autoAi.mode = "wander";
        this.autoAi.dir = Math.random() < 0.5 ? "left" : "right";
        this.autoAi.stepsLeft = 3 + Math.floor(Math.random() * 4);
      }
    } else {
      // Default from crater / wander
      if (roll < 0.55) {
        this.autoAi.mode = "row";
        this.autoAi.dir = Math.random() < 0.5 ? "left" : "right";
        this.autoAi.stepsLeft = 10 + Math.floor(Math.random() * 12);
      } else if (roll < 0.9) {
        this.autoAi.mode = "column";
        this.autoAi.pillarRemaining = 2 + Math.floor(Math.random() * 3);
      } else {
        this.autoAi.mode = "wander";
        this.autoAi.dir = Math.random() < 0.5 ? "left" : "right";
        this.autoAi.stepsLeft = 4 + Math.floor(Math.random() * 4);
      }
    }
  }

  private autoStep(b: Builder) {
    if (this.isFull()) return;
    const baseDur = Math.max(0.05, this.settings.buildInterval);
    // Organic human timing variation (+/- 15%)
    const dur = baseDur * (0.85 + Math.random() * 0.3);

    // 1. TNT Evasion: Panic and flee from falling TNT with low fuse!
    const nearTnt = this.tnts.find(
      (t) => Math.abs(t.x - b.x) < CELL * 1.8 && t.y > b.y - CELL * 5 && t.fuse < 2.0
    );
    if (nearTnt) {
      const fleeDir: "left" | "right" = nearTnt.x < b.x ? "right" : "left";
      const altDir: "left" | "right" = fleeDir === "left" ? "right" : "left";
      // Panic sprint: faster step duration
      if (this.tryWalk(b, fleeDir, dur * 0.65) || this.tryWalk(b, altDir, dur * 0.65)) {
        return;
      }
      if (this.height(b.col) > 0 && Math.random() < 0.5) {
        this.jump(b);
        return;
      }
    }

    // 2. Micro-pause check (human hesitation / looking at chat)
    if (Math.random() < 0.04) {
      this.autoAi.pauseTimer = 0.12 + Math.random() * 0.16;
      return;
    }

    // 3. Check if current mode finished or needs to transition
    if (this.autoAi.mode === "column") {
      if (this.autoAi.pillarRemaining <= 0 || this.height(b.col) >= ROWS) {
        this.pickNextAiMode(b);
      }
    } else {
      if (this.autoAi.stepsLeft <= 0) {
        this.pickNextAiMode(b);
      }
    }

    // 4. Execute mode:
    if (this.autoAi.mode === "column") {
      // --- "PA-COLUMN" MODE: Pillar vertically like a tower in Minecraft ---
      if (this.height(b.col) < ROWS) {
        if (this.buildUnder(b)) {
          b.step = 0;
          b.fromX = b.x;
          b.fromCol = b.col;
          b.stepDur = dur;
          this.autoAi.pillarRemaining--;
          // Human gamer habit: 35% chance to jump while towering
          if (Math.random() < 0.35) {
            this.jump(b);
          }
          return;
        }
      }
      // If column is already full or failed, pick next mode
      this.pickNextAiMode(b);
    }

    if (this.autoAi.mode === "crater") {
      // --- CRATER REPAIR: Head toward deep hole left by TNT ---
      const target = this.autoAi.targetCol;
      if (target === b.col) {
        if (this.height(b.col) < ROWS && this.buildUnder(b)) {
          b.step = 0;
          b.fromX = b.x;
          b.fromCol = b.col;
          b.stepDur = dur;
          this.autoAi.stepsLeft--;
          return;
        }
        this.pickNextAiMode(b);
        return;
      } else {
        const stepDir: "left" | "right" = target < b.col ? "left" : "right";
        if (this.tryWalk(b, stepDir, dur)) {
          this.autoAi.stepsLeft--;
          if (Math.random() < 0.15) this.jump(b);
          return;
        }
        if (this.height(b.col) < ROWS && this.buildUnder(b)) {
          b.step = 0;
          b.fromX = b.x;
          b.fromCol = b.col;
          b.stepDur = dur;
          return;
        }
      }
    }

    if (this.autoAi.mode === "wander") {
      // --- CASUAL HUMAN WANDER / ZIG-ZAG ---
      if (Math.random() < 0.15) {
        this.autoAi.dir = this.autoAi.dir === "left" ? "right" : "left";
      }
      if (this.tryWalk(b, this.autoAi.dir, dur)) {
        this.autoAi.stepsLeft--;
        if (Math.random() < 0.2) this.jump(b);
        return;
      }
      if (this.height(b.col) < ROWS && Math.random() < 0.5 && this.buildUnder(b)) {
        b.step = 0;
        b.fromX = b.x;
        b.fromCol = b.col;
        b.stepDur = dur;
        return;
      }
      this.autoAi.dir = this.autoAi.dir === "left" ? "right" : "left";
      this.autoAi.stepsLeft--;
      return;
    }

    // --- "PA-ROW" MODE: Sweep horizontally to build full rows across ---
    let dir = this.autoAi.dir;
    const nextCol = b.col + (dir === "left" ? -1 : 1);

    // Boundary check: at the wall/border of the box
    if (nextCol < 0 || nextCol >= COLS) {
      this.autoAi.dir = dir === "left" ? "right" : "left";
      // At the wall: 40% chance to pillar up the wall before heading back!
      if (Math.random() < 0.4 && this.height(b.col) < ROWS) {
        this.autoAi.mode = "column";
        this.autoAi.pillarRemaining = 1 + Math.floor(Math.random() * 3);
        if (this.buildUnder(b)) {
          b.step = 0;
          b.fromX = b.x;
          b.fromCol = b.col;
          b.stepDur = dur;
          return;
        }
      }
      dir = this.autoAi.dir;
    }

    // Step across in current sweep direction
    if (this.tryWalk(b, dir, dur)) {
      this.autoAi.stepsLeft--;
      // Human bunny hop: 12% chance
      if (Math.random() < 0.12) {
        this.jump(b);
      }
      // 5% chance of human changing mind and turning mid-sweep
      if (Math.random() < 0.05) {
        this.autoAi.dir = dir === "left" ? "right" : "left";
      }
      return;
    }

    // If blocked by a taller wall: pillar up under feet so we can climb it!
    if (this.height(b.col) < ROWS && this.buildUnder(b)) {
      b.step = 0;
      b.fromX = b.x;
      b.fromCol = b.col;
      b.stepDur = dur;
      return;
    }

    // If blocked, try opposite direction
    const oppDir: "left" | "right" = dir === "left" ? "right" : "left";
    if (this.tryWalk(b, oppDir, dur)) {
      this.autoAi.dir = oppDir;
      this.autoAi.stepsLeft--;
      return;
    }

    // Stuck check: hop
    if (Math.random() < 0.3) {
      this.jump(b);
    }
  }

  private dust(x: number, y: number, color: string) {
    for (let i = 0; i < 5; i++) {
      this.addParticle({
        kind: "smoke",
        x: x + (Math.random() - 0.5) * 40,
        y,
        vx: (Math.random() - 0.5) * 160,
        vy: -30 - Math.random() * 50,
        life: 0.45,
        maxLife: 0.45,
        size: 18,
        color,
        gravity: 0,
        rot: 0,
        vr: 0,
      });
    }
  }

  private addParticle(p: Particle) {
    const max =
      this.settings.graphicsQuality === "low"
        ? 60
        : this.settings.graphicsQuality === "medium"
          ? 180
          : MAX_PARTICLES;
    if (this.particles.length < max) this.particles.push(p);
  }

  private update(dt: number) {
    this.time += dt;

    const isUrgent = this.isFull() && this.phase === "playing" && this.timeLeft <= 10;
    this.audio.setUrgentBgm(isUrgent);

    if (this.phase === "won") {
      this.wonTimer -= dt;
      if (this.wonTimer > WIN_DURATION - 2 && Math.random() < 0.6) this.emitConfetti(6, false);
      if (this.wonTimer <= 0) {
        this.round++;
        this.resetRound();
      }
    } else {
      this.updateCells(dt);
      this.updateBuilder(dt);

      // Timer only ticks while the box is 100% full and not paused by gift/TNT
      const tntActive =
        this.tnts.length > 0 ||
        this.spawnQueue.length > 0 ||
        this.dragon !== null ||
        this.dragonQueue.length > 0 ||
        this.time < this.giftPauseUntil;

      if (this.isFull()) {
        if (!tntActive) {
          this.timeLeft -= dt * this.countdownRate();
          const shown = Math.ceil(this.timeLeft);
          if (shown !== this.lastShownSecond) {
            this.lastShownSecond = shown;
            if (shown >= 1 && shown <= SLOW_FROM) this.audio.tick((SLOW_FROM - shown) / Math.max(1, SLOW_FROM - 1));
          }
          if (this.timeLeft <= 0) this.win();
        }
      } else {
        // Box is no longer full (TNT broke a block): the countdown always restarts from the full duration.
        this.timeLeft = this.settings.timerDuration;
        this.lastShownSecond = -1;
      }

      // Spawn queued TNT, staggered
      this.spawnCooldown -= dt;
      while (
        this.phase === "playing" &&
        this.spawnQueue.length > 0 &&
        this.spawnCooldown <= 0 &&
        this.tnts.length < MAX_ACTIVE_TNT
      ) {
        this.spawnTnt(this.spawnQueue.shift()!);
        this.spawnCooldown += SPAWN_STAGGER;
      }
      if (this.spawnQueue.length === 0 && this.spawnCooldown < 0) this.spawnCooldown = 0;

      this.updateTnts(dt);
      this.updateDragon(dt);
    }

    this.updateScroll(dt);
    this.updateParticles(this.particles, dt);
    this.updateParticles(this.confetti, dt);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < 0.4);
    if (this.banner && (this.banner.age += dt) > 3.2) this.banner = null;
    this.updateSpeech(dt);
    for (const t of this.toasts) t.age += dt;
    this.toasts = this.toasts.filter((t) => t.age < TOAST_LIFE);
    this.shake *= Math.exp(-dt * 7);
    if (this.shake < 0.3) this.shake = 0;

    this.statsAcc += dt;
    if (this.statsAcc >= 0.25 && this.statsListener) {
      this.statsAcc = 0;
      this.statsListener(this.getStats());
    }
  }

  /**
   * Climbs with the builder: keeps the top of the builder's column at SCROLL_ANCHOR
   * on screen, from the tower's foot (0) up to the full tower (MAX_SCROLL).
   */
  private updateScroll(dt: number) {
    const b = this.builder;
    const feet = b.flung ? this.surfaceY(this.colAt(b.x)) : this.surfaceY(b.col);
    const target = Math.min(MAX_SCROLL, Math.max(0, SCROLL_ANCHOR - feet));
    this.scroll += (target - this.scroll) * (1 - Math.exp(-dt * 2.5));
    const targetX = Math.min(0, Math.max(MIN_SCROLL_X, SCROLL_X_ANCHOR - b.x));
    this.scrollX += (targetX - this.scrollX) * (1 - Math.exp(-dt * 2.5));
  }

  /**
   * DRAGON: flies across the box just above the tallest stack, burning the top
   * block of every column it passes (and flinging the builder if it's in the way).
   */
  private updateDragon(dt: number) {
    if (!this.dragon) {
      const viewer = this.dragonQueue.shift();
      if (!viewer) return;
      let tallest = 0;
      for (let col = 0; col < COLS; col++) tallest = Math.max(tallest, this.height(col));
      this.dragonTopRow = Math.min(ROWS - 1, ROWS - tallest);
      const top = BOX_Y + this.dragonTopRow * CELL;
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.dragon = {
        x: dir > 0 ? BOX_X - DRAGON_MARGIN : BOX_X + BOX_W + DRAGON_MARGIN,
        y: top + CELL * 0.3,
        dir,
        t: 0,
        lastCol: -1,
        viewer,
        burnCol: -1,
        burnLeft: 0,
      };
      this.audio.fanfare();
    }
    const d = this.dragon;
    d.t += dt;
    d.y += Math.sin(d.t * 4) * 18 * dt; // gentle bob

    if (d.burnCol >= 0) {
      // Hover and breathe: the painted fireball lands on the column's blocks.
      d.burnLeft -= dt;
      const bx = BOX_X + d.burnCol * CELL + CELL / 2;
      const blockTop = BOX_Y + this.dragonTopRow * CELL;
      for (let i = 0; i < 4; i++) {
        // Flames licking the blocks being burnt.
        this.addParticle({
          kind: "spark",
          x: bx + (Math.random() - 0.5) * CELL * 0.8,
          y: blockTop + Math.random() * CELL * 0.8,
          vx: (Math.random() - 0.5) * 160,
          vy: -150 - Math.random() * 350,
          life: 0.4,
          maxLife: 0.4,
          size: 16,
          color: Math.random() < 0.5 ? "#ffd166" : "#ff4d1a",
          gravity: 200,
          rot: 0,
          vr: 0,
        });
      }
      if (d.burnLeft <= 0) {
        const col = d.burnCol;
        d.burnCol = -1;
        this.burnColumn(d, col);
      }
    } else {
      d.x += d.dir * DRAGON_SPEED * dt;
      // Stop over each column that has blocks in the burn band, and breathe on it.
      if (d.x >= BOX_X && d.x < BOX_X + BOX_W) {
        const col = this.colAt(d.x);
        if (col !== d.lastCol) {
          d.lastCol = col;
          const h = this.height(col);
          if (h > 0 && ROWS - h < this.dragonTopRow + 4) {
            d.x = BOX_X + col * CELL + CELL / 2;
            d.burnCol = col;
            d.burnLeft = 0.5;
          }
        }
      }
    }
    const out = d.dir > 0 ? d.x > BOX_X + BOX_W + DRAGON_MARGIN : d.x < BOX_X - DRAGON_MARGIN;
    if (out) this.dragon = null;
  }

  /** The dragon's fire has finished on a column: its top 4-row band explodes. */
  private burnColumn(d: Dragon, col: number) {
    const h = this.height(col);
    if (h > 0 && ROWS - h < this.dragonTopRow + 4) {
    const burnFrom = Math.max(0, ROWS - h - this.dragonTopRow);
    const burn = Math.min(4, ROWS - this.dragonTopRow);
    for (let k = burnFrom; k < burn; k++) {
      const row = this.dragonTopRow + k;
      const cell = this.grid[row * COLS + col];
      this.grid[row * COLS + col] = null;
      this.filled--;
      this.entryFor(d.viewer).blocks++;
      const bx = BOX_X + col * CELL + CELL / 2;
      const by = BOX_Y + row * CELL + CELL / 2;
      const colors = cell ? BLOCK_PARTICLE_COLORS[cell.type] : ["#ffb347"];
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 400 + Math.random() * 700;
        this.addParticle({
          kind: i < 2 ? "smoke" : "debris",
          x: bx + (Math.random() - 0.5) * CELL * 0.7,
          y: by + (Math.random() - 0.5) * CELL * 0.7,
          z: -CELL * 0.5,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 400,
          vz: Math.random() * 900,
          life: 1,
          maxLife: 1.3,
          size: i < 2 ? 40 : 14,
          color: i < 2 ? "#ff7a2b" : colors[Math.floor(Math.random() * colors.length)],
          gravity: 2400,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 14,
        });
      }
    }
    this.shake = Math.max(this.shake, 8);
    this.audio.explosion(0.6);
    const b = this.builder;
    if (!b.flung && b.col === col) {
      b.flung = true;
      this.say(pick(HIT_LINES), true);
      b.vx = d.dir * 420;
      b.vy = -800;
      b.stun = 1.2;
      b.step = 1;
      b.fromCol = b.col;
    }
    }
  }

  /** Real-time speed of the HOLD countdown (1 = normal), slowing over the last seconds. */
  private countdownRate(): number {
    if (this.timeLeft > SLOW_FROM) return 1;
    const p = (SLOW_FROM - Math.max(1, this.timeLeft)) / Math.max(1e-6, SLOW_FROM - 1);
    return SLOW_START_RATE + (SLOW_END_RATE - SLOW_START_RATE) * p;
  }

  private spawnTnt(viewer: Viewer) {
    const half = TNT_SIZE / 2;
    // Drop it somewhere on the visible part of the tower, so viewers see their TNT.
    const lo = Math.max(BOX_X + half, -this.scrollX + 40);
    const hi = Math.min(BOX_X + BOX_W - half, W - this.scrollX - 40);
    this.tnts.push({
      id: this.nextId++,
      x: hi > lo ? lo + Math.random() * (hi - lo) : BOX_X + half + Math.random() * (BOX_W - TNT_SIZE),
      // Just above the top of the screen (or the box top, when that is lower), so it is seen falling.
      y: Math.max(BOX_Y - 180, -this.scroll - 60) - Math.random() * 120,
      vx: (Math.random() - 0.5) * 80,
      vy: 0,
      rot: (Math.random() - 0.5) * 0.6,
      vr: (Math.random() - 0.5) * 6,
      age: 0,
      fuse: FUSE_SECONDS + Math.random() * 0.25,
      landed: false,
      viewer,
      sparkAcc: 0,
    });
    this.audio.fuse();
  }

  /**
   * Y of the surface directly beneath a TNT (stack tops or the box floor). TNT
   * deliberately doesn't stack on other TNT so a big gift can't pile up over the HUD.
   */
  private floorFor(t: Tnt, prevY: number): number {
    const half = TNT_SIZE / 2;
    const c0 = this.colAt(t.x - half + 4);
    const c1 = this.colAt(t.x + half - 4);
    let floor = BOX_Y + BOX_H;
    for (let c = c0; c <= c1; c++) {
      const top = this.surfaceY(c);
      // Only stacks at or below the TNT count as floor (it can't fall "up" onto a taller column).
      // Measured from where it was last frame too, so a slow frame can't tunnel it through a stack.
      if (top >= Math.min(t.y, prevY) + half - 24) floor = Math.min(floor, top);
    }
    return floor;
  }

  private updateTnts(dt: number) {
    const half = TNT_SIZE / 2;
    const exploding: Tnt[] = [];
    for (const t of this.tnts) {
      t.age += dt;
      if (t.age >= t.fuse) {
        exploding.push(t);
        continue;
      }
      const prevY = t.y;
      t.vy += GRAVITY * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      if (t.x < BOX_X + half) {
        t.x = BOX_X + half;
        t.vx = Math.abs(t.vx) * 0.4;
      } else if (t.x > BOX_X + BOX_W - half) {
        t.x = BOX_X + BOX_W - half;
        t.vx = -Math.abs(t.vx) * 0.4;
      }

      const floor = this.floorFor(t, prevY);
      if (t.y + half >= floor) {
        t.y = floor - half;
        t.vy = t.vy > 400 ? -t.vy * 0.22 : 0;
        t.vx *= Math.exp(-dt * 10);
        t.landed = true;
        t.rot *= Math.exp(-dt * 18);
      } else {
        t.landed = false;
        t.rot += t.vr * dt;
      }

      // Fuse sparks
      t.sparkAcc += dt;
      if (t.sparkAcc > 0.06) {
        t.sparkAcc = 0;
        this.addParticle({
          kind: "spark",
          x: t.x + (Math.random() - 0.5) * 10,
          y: t.y - half - 4,
          vx: (Math.random() - 0.5) * 140,
          vy: -120 - Math.random() * 120,
          life: 0.35,
          maxLife: 0.35,
          size: 6,
          color: Math.random() < 0.5 ? "#ffd54a" : "#ff8a3d",
          gravity: 600,
          rot: 0,
          vr: 0,
        });
      }
    }
    if (exploding.length) {
      this.tnts = this.tnts.filter((t) => !exploding.includes(t));
      for (const t of exploding) this.explode(t);
    }
  }

  private explode(t: Tnt) {
    const cx = t.x;
    // Blast centre sits just below the TNT's base so it bites into the block it rests on.
    const cy = t.y + TNT_SIZE / 2 + CELL * 0.45;
    let destroyed = 0;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const cell = this.grid[idx];
        if (!cell) continue;
        const bx = BOX_X + c * CELL + CELL / 2;
        const by = BOX_Y + r * CELL + CELL / 2;
        const dist = Math.hypot(bx - cx, by - cy);
        if (dist > BLAST_RADIUS) continue;
        this.grid[idx] = null;
        this.filled--;
        destroyed++;
        const colors = BLOCK_PARTICLE_COLORS[cell.type];
        const ang0 = Math.atan2(by - cy, bx - cx);
        for (let i = 0; i < 6; i++) {
          const ang = ang0 + (Math.random() - 0.5) * 1.6;
          const spd = 500 + Math.random() * 900;
          this.addParticle({
            kind: "debris",
            x: bx + (Math.random() - 0.5) * CELL * 0.7,
            y: by + (Math.random() - 0.5) * CELL * 0.7,
            z: -CELL * (0.15 + Math.random() * 0.7),
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 500,
            // Mostly out of the box toward the viewer, so chunks fly at the camera.
            vz: -100 + Math.random() * 1100,
            life: 0.9 + Math.random() * 0.6,
            maxLife: 1.5,
            size: 12 + Math.floor(Math.random() * 3) * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            gravity: 2400,
            rot: Math.random() * Math.PI * 2,
            vr: (Math.random() - 0.5) * 18,
          });
        }
      }
    }

    if (destroyed > 0) {
      this.entryFor(t.viewer).blocks += destroyed;
      this.collapseColumns();
    }

    // Nearby TNT gets knocked into the air (keeping its own fuse) and then drops into the fresh crater.
    for (const o of this.tnts) {
      const d = Math.hypot(o.x - cx, o.y - cy);
      if (d > BLAST_RADIUS * 1.1) continue;
      const nx = d > 0 ? (o.x - cx) / d : Math.random() - 0.5;
      o.vx += nx * 450;
      o.vy = -500 - Math.random() * 250;
      o.vr = (Math.random() - 0.5) * 14;
      o.landed = false;
    }

    // The builder gets blown into the air and is dizzy for a moment.
    const b = this.builder;
    const bd = Math.hypot(b.x - cx, b.y - CELL / 2 - cy);
    if (bd <= BLAST_RADIUS * 1.2) {
      const side = b.x === cx ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(b.x - cx);
      b.flung = true;
      this.say(pick(HIT_LINES), true);
      b.vx = side * (300 + Math.random() * 300);
      b.vy = -950;
      b.stun = 1.4;
      b.step = 1;
      b.fromCol = b.col;
    }

    // Fire + smoke
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 260;
      const fire = i < 8;
      this.addParticle({
        kind: "smoke",
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 80,
        vz: Math.random() * 260,
        life: fire ? 0.45 : 1.1,
        maxLife: fire ? 0.45 : 1.1,
        size: fire ? 38 : 48,
        color: fire ? (Math.random() < 0.5 ? "#ffb347" : "#ff6a2b") : "#9a9a9a",
        gravity: -120,
        rot: 0,
        vr: 0,
      });
    }
    for (let i = 0; i < 18; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 600 + Math.random() * 900;
      this.addParticle({
        kind: "spark",
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        vz: (Math.random() - 0.2) * 900,
        life: 0.4,
        maxLife: 0.4,
        size: 8,
        color: "#fff2a8",
        gravity: 900,
        rot: 0,
        vr: 0,
      });
    }

    this.rings.push({ x: cx, y: cy, age: 0 });
    this.shake = Math.min(this.shake + 16, 44);
    this.audio.explosion(Math.min(1, 0.6 + destroyed * 0.06));
  }

  private updateParticles(list: Particle[], dt: number) {
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      if (p.kind === "smoke") {
        const drag = Math.exp(-dt * 3);
        p.vx *= drag;
        p.vy *= drag;
        p.size += dt * 60;
      } else if (p.kind === "confetti") {
        const drag = Math.exp(-dt * 1.6);
        p.vx *= drag;
        p.vy = Math.min(p.vy * drag, 420);
        p.x += Math.sin(this.time * 4 + p.rot) * 30 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vz) {
        p.vz *= Math.exp(-dt * (p.kind === "debris" ? 0.8 : 2.5));
        p.z = (p.z ?? -CELL / 2) + p.vz * dt;
      }
      p.rot += p.vr * dt;
      list[w++] = p;
    }
    list.length = w;
  }

  private win() {
    this.phase = "won";
    this.wonTimer = WIN_DURATION;
    this.timeLeft = 0;
    this.streamerWins++;
    // Leftover TNT fizzles out
    for (const t of this.tnts) {
      for (let i = 0; i < 6; i++) {
        this.addParticle({
          kind: "smoke",
          x: t.x,
          y: t.y,
          vx: (Math.random() - 0.5) * 120,
          vy: -60 - Math.random() * 80,
          life: 0.8,
          maxLife: 0.8,
          size: 30,
          color: "#bbbbbb",
          gravity: -40,
          rot: 0,
          vr: 0,
        });
      }
    }
    this.tnts = [];
    this.emitConfetti(260, true);
    this.audio.fanfare();
  }

  private emitConfetti(n: number, cannons: boolean) {
    for (let i = 0; i < n; i++) {
      let x: number, y: number, vx: number, vy: number;
      if (cannons) {
        const left = i % 2 === 0;
        x = left ? 40 : W - 40;
        y = H * 0.75;
        // Fire up and inward from each bottom corner
        const ang = -Math.PI / 2 + (left ? 0.45 : -0.45) + (Math.random() - 0.5) * 0.6;
        const spd = 1400 + Math.random() * 1100;
        vx = Math.cos(ang) * spd;
        vy = Math.sin(ang) * spd;
      } else {
        x = Math.random() * W;
        y = -20;
        vx = (Math.random() - 0.5) * 100;
        vy = 100 + Math.random() * 200;
      }
      this.confetti.push({
        kind: "confetti",
        x,
        y,
        vx,
        vy,
        life: 4 + Math.random() * 1.5,
        maxLife: 5.5,
        size: 14 + Math.random() * 8,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        gravity: 900,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 14,
      });
    }
  }

  // ───────────────────────────── rendering ─────────────────────────────

  /**
   * Draws a background image to cover the canvas viewport. Returns false until loaded.
   */
  private drawBgImage(bg: CanvasRenderingContext2D, url: string): boolean {
    let img = this.bgImages.get(url);
    if (!img && typeof Image !== "undefined") {
      img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.onload = () => {
        this.bgKey = ""; // repaint once loaded
      };
      this.bgImages.set(url, img);
    }
    if (!img || !img.complete || img.naturalWidth === 0) return false;
    const vw = bg.canvas.width;
    const vh = bg.canvas.height;
    const key = `${url}@${vw}x${vh}`;
    if (key === this.bgKey) return true;
    this.bgKey = key;
    const s = Math.max(vw / img.naturalWidth, vh / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    const dx = (vw - dw) / 2;
    const dy = Math.min(0, Math.max(vh - dh, this.offY + BG_GROUND_Y - BG_GROUND_FRAC * dh));
    bg.imageSmoothingEnabled = true;
    bg.imageSmoothingQuality = "high";
    bg.fillStyle = "#000";
    bg.fillRect(0, 0, vw, vh);
    bg.drawImage(img, dx, dy, dw, dh);
    return true;
  }

  private render() {
    const c = this.ctx;
    const bg = this.bgCtx;
    if (!c || !bg || !this.backdrop) return;

    bg.setTransform(1, 0, 0, 1, 0, 0);

    const bgKind = this.settings.background || "purple_night";
    const show3d = bgKind === "landscape_3d";

    if (show3d) {
      if (this.bgKey !== "landscape_3d") {
        bg.clearRect(0, 0, bg.canvas.width, bg.canvas.height);
        this.bgKey = "landscape_3d";
      }
    } else if (bgKind === "pixel_art") {
      this.bgKey = "pixel_art";
      this.backdrop.draw(bg, this.time, this.scroll, this.scrollX);
    } else {
      let url = "/backgrounds/purple_night.jpg";
      if (bgKind === "classic_night") {
        url = "/background.png";
      } else if (bgKind === "custom" && this.settings.customBackgroundUrl) {
        url = this.settings.customBackgroundUrl;
      }
      this.drawBgImage(bg, url);
    }

    const shakeX = this.shake > 0 ? (Math.random() * 2 - 1) * this.shake : 0;
    const shakeY = this.shake > 0 ? (Math.random() * 2 - 1) * this.shake : 0;
    this.scene3d?.render({
      grid: this.grid,
      tnts: this.tnts,
      builder: this.builder,
      particles: this.particles,
      rings: this.rings,
      time: this.time,
      shakeX,
      shakeY,
      glow: this.isFull() && this.phase === "playing" ? 0.14 + 0.12 * Math.sin(this.time * 6) : 0,
      scroll: this.scroll,
      scrollX: this.scrollX,
      dragon: this.dragon,
      show3dLandscape: show3d,
    });

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas!.width, this.canvas!.height);
    c.translate(this.offX, this.offY);
    this.drawTntTags(c);
    this.drawSpeech(c);
    this.drawHud(c);
    if (this.settings.showGiftList) this.drawGiftList(c);
    this.drawToasts(c);
    if (this.settings.showLeaderboard) this.drawLeaderboard(c);
    this.drawBanner(c);
    if (this.phase === "won") this.drawWin(c);
    this.drawParticles(c, this.confetti);
  }

  private text(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign = "center",
    stroke = Math.max(4, Math.round(size / 6)),
  ) {
    const c = this.ctx!;
    c.font = `${size}px ${FONT}`;
    c.textAlign = align;
    c.textBaseline = "middle";
    c.lineJoin = "round";
    if (stroke > 0) {
      c.save();
      c.shadowColor = "rgba(0,0,0,0.45)";
      c.shadowOffsetY = Math.max(2, size / 18);
      c.lineWidth = stroke;
      c.strokeStyle = "#0b1020";
      c.strokeText(s, x, y);
      c.restore();
    }
    c.fillStyle = color;
    c.fillText(s, x, y);
  }

  private drawAvatar(url: string | undefined, name: string, cx: number, cy: number, r: number) {
    const c = this.ctx!;
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.closePath();
    const img = this.avatars.get(url);
    if (img) {
      c.clip();
      c.imageSmoothingEnabled = true;
      c.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    } else {
      c.fillStyle = colorFor(name);
      c.fill();
      this.text((Array.from(name)[0] ?? "?").toUpperCase(), cx, cy + 1, Math.round(r), "#fff", "center", 0);
    }
    c.restore();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.lineWidth = 3;
    c.strokeStyle = "#fff";
    c.stroke();
  }

  /** Every TNT wears its sender's avatar; the full name tag goes on the newest
   *  TNT per viewer only, so a 20-TNT gift doesn't bury the screen in labels. */
  private drawTntTags(c: CanvasRenderingContext2D) {
    const s3 = this.scene3d;
    if (!s3) return;
    const pt = this.pt;
    // Avatars sit on the TNT's front face; projected through the 3-D camera so they track it.
    const front = -CELL / 2 + TNT_SIZE / 2;
    const tagged = new Map<string, Tnt>();
    for (const t of this.tnts) {
      s3.toScreen(t.x, t.y - TNT_SIZE / 2 + 14, front, pt);
      this.drawAvatar(t.viewer.avatarUrl, t.viewer.nickname, pt.x, pt.y, 13);
      tagged.set(t.viewer.id, t);
    }
    for (const t of tagged.values()) {
      const name = truncate(t.viewer.nickname, 12);
      s3.toScreen(t.x, t.y - TNT_SIZE / 2 - 50, front, pt);
      const y = pt.y;
      c.font = `22px ${FONT}`;
      const tw = c.measureText(name).width;
      const w = tw + 58;
      const x0 = pt.x - w / 2;
      c.fillStyle = "rgba(0,0,0,0.65)";
      c.beginPath();
      c.roundRect(x0, y - 20, w, 40, 20);
      c.fill();
      this.drawAvatar(t.viewer.avatarUrl, t.viewer.nickname, x0 + 20, y, 16);
      this.text(name, x0 + 44, y + 1, 22, "#fff", "left", 0);
    }
  }

  /** Confetti is a screen-space celebration, so it stays on the 2-D HUD. */
  private drawParticles(c: CanvasRenderingContext2D, list: Particle[]) {
    for (const p of list) {
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      c.globalAlpha = Math.min(1, a * 2);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.scale(Math.cos(p.rot * 1.7), 1);
      c.fillStyle = p.color;
      c.fillRect(-p.size / 2, -p.size * 0.35, p.size, p.size * 0.7);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  // Edges of the visible window in play-area coordinates. In a 1080x1920 browser
  // source these are just 0..W / 0..H; in a wider window the side HUD moves out
  // to the real window edges instead of crowding the middle column.
  private viewLeft() {
    return -this.offX;
  }
  private viewRight() {
    return (this.canvas?.width ?? W) - this.offX;
  }
  private viewBottom() {
    return (this.canvas?.height ?? H) - this.offY;
  }

  // ───────────────────────────── UI kit ─────────────────────────────

  /** Glassy dark card with a coloured rim, soft drop shadow and a sheen on its top half. */
  private panel(x: number, y: number, w: number, h: number, r: number, accent = "#e9b949") {
    const c = this.ctx!;
    c.save();
    if (this.settings.graphicsQuality !== "low") {
      c.shadowColor = "rgba(0,0,0,0.45)";
      c.shadowBlur = 18;
      c.shadowOffsetY = 6;
    }
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "rgba(32,44,72,0.9)");
    g.addColorStop(1, "rgba(12,18,34,0.9)");
    c.fillStyle = g;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
    c.restore();
    const sheen = c.createLinearGradient(0, y, 0, y + h * 0.5);
    sheen.addColorStop(0, "rgba(255,255,255,0.13)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = sheen;
    c.beginPath();
    c.roundRect(x + 3, y + 3, w - 6, h * 0.5, [r - 3, r - 3, 0, 0]);
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = accent;
    c.globalAlpha = 0.85;
    c.beginPath();
    c.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, r - 1);
    c.stroke();
    c.globalAlpha = 1;
  }

  /** Rounded progress bar with a gradient fill and a highlight stripe. */
  private bar(x: number, y: number, w: number, h: number, frac: number, from: string, to: string) {
    const c = this.ctx!;
    c.fillStyle = "rgba(0,0,0,0.45)";
    c.beginPath();
    c.roundRect(x, y, w, h, h / 2);
    c.fill();
    const f = Math.max(0, Math.min(1, frac));
    if (f > 0) {
      const fw = Math.max(h, w * f);
      const g = c.createLinearGradient(x, 0, x + fw, 0);
      g.addColorStop(0, from);
      g.addColorStop(1, to);
      c.fillStyle = g;
      c.beginPath();
      c.roundRect(x, y, fw, h, h / 2);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.beginPath();
      c.roundRect(x + h / 3, y + 2, Math.max(0, fw - (h * 2) / 3), Math.max(2, h * 0.28), h / 4);
      c.fill();
    }
  }

  /** Round badge that holds an icon. */
  private iconBadge(cx: number, cy: number, r: number, ring: string, draw: (s: number) => void) {
    const c = this.ctx!;
    const g = c.createRadialGradient(cx, cy - r * 0.4, r * 0.2, cx, cy, r);
    g.addColorStop(0, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0.35)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = ring;
    c.stroke();
    c.save();
    c.translate(cx, cy);
    draw(r * 0.62);
    c.restore();
  }

  /** Gold cup, drawn around (0,0) with half-size s. */
  private trophy(s: number) {
    const c = this.ctx!;
    const gold = c.createLinearGradient(-s, -s, s, s);
    gold.addColorStop(0, "#fff1a8");
    gold.addColorStop(0.5, "#f5c542");
    gold.addColorStop(1, "#c98a12");
    c.fillStyle = gold;
    c.strokeStyle = gold;
    c.lineWidth = s * 0.18;
    c.beginPath(); // handles
    c.arc(-s * 0.62, -s * 0.35, s * 0.32, Math.PI * 0.5, Math.PI * 1.5);
    c.moveTo(s * 0.62, -s * 0.67);
    c.arc(s * 0.62, -s * 0.35, s * 0.32, -Math.PI * 0.5, Math.PI * 0.5);
    c.stroke();
    c.beginPath(); // bowl
    c.moveTo(-s * 0.62, -s * 0.8);
    c.lineTo(s * 0.62, -s * 0.8);
    c.quadraticCurveTo(s * 0.6, s * 0.15, 0, s * 0.25);
    c.quadraticCurveTo(-s * 0.6, s * 0.15, -s * 0.62, -s * 0.8);
    c.fill();
    c.fillRect(-s * 0.1, s * 0.2, s * 0.2, s * 0.4); // stem
    c.beginPath(); // base
    c.roundRect(-s * 0.45, s * 0.55, s * 0.9, s * 0.28, s * 0.08);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.55)";
    c.fillRect(-s * 0.42, -s * 0.7, s * 0.14, s * 0.55);
  }

  private heart(s: number) {
    const c = this.ctx!;
    const g = c.createLinearGradient(0, -s, 0, s);
    g.addColorStop(0, "#ff9ec7");
    g.addColorStop(1, "#e2286f");
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, s * 0.85);
    c.bezierCurveTo(-s * 1.2, -s * 0.05, -s * 0.75, -s * 1.05, 0, -s * 0.45);
    c.bezierCurveTo(s * 0.75, -s * 1.05, s * 1.2, -s * 0.05, 0, s * 0.85);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.6)";
    c.beginPath();
    c.ellipse(-s * 0.42, -s * 0.38, s * 0.16, s * 0.24, -0.6, 0, Math.PI * 2);
    c.fill();
  }

  /** Little isometric aqua block. */
  private blockIcon(s: number) {
    const c = this.ctx!;
    const top = [
      [0, -s],
      [s * 0.9, -s * 0.5],
      [0, 0],
      [-s * 0.9, -s * 0.5],
    ];
    const face = (pts: number[][], col: string) => {
      c.fillStyle = col;
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.fill();
    };
    face(top, "#b9fbfb");
    face([[-s * 0.9, -s * 0.5], [0, 0], [0, s], [-s * 0.9, s * 0.5]], "#5fd6dc");
    face([[s * 0.9, -s * 0.5], [0, 0], [0, s], [s * 0.9, s * 0.5]], "#36aeb8");
    c.strokeStyle = "rgba(255,255,255,0.7)";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-s * 0.45, s * 0.55);
    c.lineTo(-s * 0.15, -s * 0.05);
    c.stroke();
  }

  /** True when the window is wide enough to put the blocks banner top-centre. */
  private wideView() {
    return this.viewRight() - this.viewLeft() >= 1500;
  }

  // ───────────────────────────── HUD ─────────────────────────────

  /**
   * Cards: wins (top-left), like goal (under it) and the blocks counter (top-centre
   * on wide screens, under the like goal on a 9:16 source). The HOLD ring only
   * shows while the box is full, because that's when the timer runs.
   */
  private drawHud(c: CanvasRenderingContext2D) {
    const s = this.settings;
    const L = this.viewLeft();
    const cardW = 400;

    // Wins
    let y = 20;
    this.panel(L + 20, y, cardW, 116, 26);
    this.iconBadge(L + 76, y + 58, 38, "#f5c542", (k) => this.trophy(k));
    this.text("WINS", L + 132, y + 30, 26, "#ffd76a", "left", 6);
    this.text(`${this.streamerWins} / ${s.winGoal}`, L + 132, y + 66, 48, "#ffffff", "left", 9);
    this.bar(L + 132, y + 94, cardW - 156, 12, this.streamerWins / Math.max(1, s.winGoal), "#f5c542", "#fff1a8");
    y += 132;

    // Like goal
    if (s.likeGoalStep > 0) {
      const step = s.likeGoalStep;
      const target = (Math.floor(this.likes / step) + 1) * step;
      const label = (s.likeGoalLabel.trim() || "Like goal").toUpperCase();
      this.panel(L + 20, y, cardW, 116, 26, "#ff6fa8");
      this.iconBadge(L + 76, y + 58, 38, "#ff6fa8", (k) => this.heart(k));
      this.text(truncate(label, 16), L + 132, y + 30, 26, "#ff9ec7", "left", 6);
      this.text(`${this.likes.toLocaleString()} / ${target.toLocaleString()}`, L + 132, y + 66, 40, "#ffffff", "left", 8);
      this.bar(L + 132, y + 94, cardW - 156, 12, (this.likes % step) / step, "#4ade80", "#bef264");
      y += 132;
    }

    // Blocks counter
    const full = this.isFull() && this.phase === "playing";
    const total = COLS * ROWS;
    const bw = 400;
    const bx = this.wideView() ? W / 2 - bw / 2 : L + 20;
    const by = this.wideView() ? 20 : y;
    this.panel(bx, by, bw, 96, 26, full ? "#4ade80" : "#5fd6dc");
    this.iconBadge(bx + 54, by + 48, 32, full ? "#4ade80" : "#5fd6dc", (k) => this.blockIcon(k));
    this.text(full ? "BOX FULL!" : "BLOCKS", bx + 102, by + 28, 24, full ? "#86efac" : "#a5f3fc", "left", 6);
    this.text(`${this.filled} / ${total}`, bx + 102, by + 60, 38, "#ffffff", "left", 8);
    this.bar(bx + 102, by + 80, bw - 126, 8, this.filled / total, full ? "#22c55e" : "#22d3ee", full ? "#bbf7d0" : "#a5f3fc");

    // Real-time FPS counter badge (when enabled in settings)
    if (s.showFps) {
      const R = this.viewRight();
      const fpsText = `${this.fps} FPS`;
      const fpsColor = this.fps >= 50 ? "#4ade80" : this.fps >= 28 ? "#fbbf24" : "#f87171";
      this.panel(R - 146, 20, 126, 42, 14, fpsColor);
      this.text(fpsText, R - 83, 41, 20, fpsColor, "center", 4);
    }

    if (full) this.drawHoldRing(c);
  }

  /** Circular countdown in the middle while the box is full; the last seconds get big and red. */
  private drawHoldRing(c: CanvasRenderingContext2D) {
    const tntActive =
      this.tnts.length > 0 ||
      this.spawnQueue.length > 0 ||
      this.dragon !== null ||
      this.dragonQueue.length > 0 ||
      this.time < this.giftPauseUntil;
    const urgent = this.timeLeft <= 10;
    const final = this.timeLeft <= SLOW_FROM;
    const beat = Math.pow(this.timeLeft % 1, 3);
    const pop = final ? 1 + 0.4 * beat : urgent ? 1 + 0.12 * beat : 1;
    const R = 112;
    const frac = Math.max(0, this.timeLeft / Math.max(1, this.settings.timerDuration));
    const col = tntActive ? "#f59e0b" : urgent ? "#ff4d4d" : "#4ade80";
    c.save();
    // Lowered slightly (720px instead of 600px) as requested
    c.translate(W * 0.6, 720);
    c.scale(pop, pop);
    c.fillStyle = "rgba(10,15,30,0.65)";
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 16;
    c.strokeStyle = "rgba(255,255,255,0.15)";
    c.beginPath();
    c.arc(0, 0, R - 10, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = col;
    c.lineCap = "round";
    if (this.settings.graphicsQuality !== "low") {
      c.shadowColor = col;
      c.shadowBlur = 20;
    }
    c.beginPath();
    c.arc(0, 0, R - 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    c.stroke();
    c.shadowBlur = 0;
    c.lineCap = "butt";
    if (tntActive) {
      if (final) {
        this.text(String(Math.max(1, Math.ceil(this.timeLeft))), 0, -6, 115, "#fbbf24", "center", 14);
        this.text("TNT PAUSED!", 0, 52, 22, "#fde68a", "center", 6);
      } else {
        this.text("PAUSED", 0, -38, 24, "#fde68a", "center", 6);
        this.text(formatTime(this.timeLeft), 0, 14, 60, "#fbbf24", "center", 10);
      }
    } else if (final) {
      this.text(String(Math.max(1, Math.ceil(this.timeLeft))), 0, 6, 130, "#ff4d4d", "center", 14);
    } else {
      this.text("HOLD", 0, -40, 28, "#e2e8f0", "center", 6);
      this.text(formatTime(this.timeLeft), 0, 14, 64, urgent ? "#ff6b6b" : "#ffffff", "center", 10);
    }
    c.restore();
  }

  /** Right side: header, then each gift's picture slot, its label and a coloured action chip. */
  private drawGiftList(c: CanvasRenderingContext2D) {
    const list = this.settings.giftActions;
    if (!list.length) return;
    const rowH = 118;
    const w = 560;
    const x0 = this.viewRight() - w - 20;
    const y0 = 20;
    const head = 70;
    const h = head + list.length * rowH + 14;
    this.panel(x0, y0, w, h, 30);
    this.text("??", x0 + 38, y0 + 38, 36, "#fff", "center", 0);
    this.text("SEND A GIFT", x0 + 72, y0 + 38, 38, "#ffd76a", "left", 8);
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fillRect(x0 + 18, y0 + head, w - 36, 2);

    const slot = (sx: number, cy: number, url: string | undefined, size: number) => {
      c.fillStyle = "rgba(255,255,255,0.08)";
      c.beginPath();
      c.roundRect(sx, cy - size / 2, size, size, 16);
      c.fill();
      const img = this.avatars.get(url);
      if (img) {
        c.imageSmoothingEnabled = true;
        c.drawImage(img, sx + 5, cy - size / 2 + 5, size - 10, size - 10);
      } else {
        c.font = "44px system-ui, sans-serif";
        c.fillStyle = "#ffffff";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("??", sx + size / 2, cy + 2);
      }
    };

    list.forEach((g, i) => {
      const cy = y0 + head + 8 + i * rowH + rowH / 2;
      const icons = GIFT_ICONS[g.id];
      const sx = x0 + 16;
      // Gift picture, arrow, result picture
      slot(sx, cy, g.imageUrl || icons?.gift || this.giftImages.get(g.giftName.trim().toLowerCase()), 96);
      this.text("?", sx + 96 + 22, cy + 2, 34, "#ffffff", "center", 4);
      slot(sx + 96 + 44, cy, icons?.result, 96);
      // Action chip (top) and label
      const chip =
        g.action === "tnt"
          ? `${g.amount} TNT`
          : g.action === "win"
            ? `${g.amount > 0 ? "+" : ""}${g.amount} WIN`
            : g.action === "dragon"
              ? "BURN"
              : g.action === "clear"
                ? "BOOM"
                : "FILL";
      const tx = sx + 96 + 44 + 96 + 18;
      this.text(truncate(g.label.toUpperCase(), 10), tx, cy - 18, 32, "#ffffff", "left", 6);
      c.font = `22px ${FONT}`;
      const cw = c.measureText(chip).width + 24;
      c.fillStyle = ACTION_COLORS[g.action];
      c.beginPath();
      c.roundRect(tx, cy + 6, cw, 34, 17);
      c.fill();
      this.text(chip, tx + cw / 2, cy + 24, 22, "#ffffff", "center", 0);
    });
  }
  /** Big announcement in the middle (like goal reached). */
  private drawBanner(c: CanvasRenderingContext2D) {
    const b = this.banner;
    if (!b) return;
    const s = easeOutBack(Math.min(1, b.age / 0.4));
    const fade = Math.min(1, (3.2 - b.age) / 0.5);
    c.globalAlpha = Math.max(0, fade);
    c.save();
    c.translate(W / 2, 780);
    c.scale(s, s);
    this.panel(-300, -80, 600, 190, 34, b.color);
    c.save();
    c.shadowColor = b.color;
    c.shadowBlur = 30;
    this.text(truncate(b.title.toUpperCase(), 14), 0, -6, 84, b.color, "center", 14);
    c.restore();
    this.text(b.sub, 0, 70, 30, "#ffffff", "center", 6);
    c.restore();
    c.globalAlpha = 1;
  }

  /** Event toasts: pill with a coloured accent stripe; slides in from the left, fades out. */
  private drawToasts(c: CanvasRenderingContext2D) {
    this.toasts.forEach((t, i) => {
      const fadeIn = Math.min(1, t.age / 0.18);
      const fadeOut = Math.min(1, (TOAST_LIFE - t.age) / 0.4);
      const a = Math.min(fadeIn, fadeOut);
      const y = 1040 + i * 60;
      const slide = (1 - easeOutBack(fadeIn)) * -40;
      c.globalAlpha = a;
      c.font = `26px ${FONT}`;
      const w = Math.min(BOX_W - 20, c.measureText(t.text).width + 56);
      const x = W / 2 - w / 2 + slide;
      c.fillStyle = "rgba(12,18,34,0.85)";
      c.beginPath();
      c.roundRect(x, y - 24, w, 48, 24);
      c.fill();
      c.fillStyle = t.color;
      c.beginPath();
      c.roundRect(x + 6, y - 16, 8, 32, 4);
      c.fill();
      this.text(t.text, x + 28, y + 1, 26, t.color, "left", 0);
      c.globalAlpha = 1;
    });
  }

  /** Bottom-left card: Big prominent Top Destroyer leaderboard for live stream donors. */
  private drawLeaderboard(c: CanvasRenderingContext2D) {
    const x0 = this.viewLeft() + 20;
    const w = 440;
    const h = 430;
    const bottom = this.viewBottom();
    const y0 = bottom - h - 52; // leaves room for the connection badge at bottom: 12px

    // Main Card Glass Panel with warm golden/coral accent
    this.panel(x0, y0, w, h, 26, "#ff8a65");

    // Header: Fire icon + Big Title + Subtitle
    this.text("💥", x0 + 44, y0 + 40, 32, "#fff", "center", 0);
    this.text("TOP DESTROYERS", x0 + 74, y0 + 32, 28, "#ffd76a", "left", 6);
    this.text("👑 LIVE DONORS & DAMAGE", x0 + 74, y0 + 56, 16, "#ff8a65", "left", 0);

    // Header divider line
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fillRect(x0 + 18, y0 + 72, w - 36, 2);

    // Sorting: Strictly prioritize live stream donors (coins / gifts sent)
    const entries = [...this.leaderboard.values()].sort((a, b) => {
      const aDonor = a.coins > 0 || (a.gifts ?? 0) > 0;
      const bDonor = b.coins > 0 || (b.gifts ?? 0) > 0;
      if (aDonor !== bDonor) return bDonor ? 1 : -1;
      if (b.coins !== a.coins) return b.coins - a.coins;
      if (b.blocks !== a.blocks) return b.blocks - a.blocks;
      return b.tnt - a.tnt;
    });

    const donors = entries.filter((e) => e.coins > 0 || (e.gifts ?? 0) > 0);
    const displayList = donors.length > 0 ? donors : entries;
    const topEntries = displayList.slice(0, 4);

    if (topEntries.length === 0) {
      // Empty state: Welcoming & encouraging viewers to donate
      c.save();
      this.text("🎁", x0 + w / 2, y0 + 160, 46, "#fff", "center", 0);
      this.text("MAG-DONATE NG GIFTS", x0 + w / 2, y0 + 224, 24, "#ffd76a", "center", 6);
      this.text("Para maging TOP 1 Destroyer!", x0 + w / 2, y0 + 260, 18, "#ffffff", "center", 0);
      this.text("Bawat gift ay may katumbas na TNT", x0 + w / 2, y0 + 290, 15, "#94a3b8", "center", 0);
      c.restore();
      return;
    }

    const rowH = 76;
    const startY = y0 + 84;

    topEntries.forEach((e, i) => {
      const rowY = startY + i * rowH;
      const cy = rowY + rowH / 2;

      // Row Glass Pill Background
      c.save();
      if (i === 0) {
        // Rank 1: Golden glow highlight
        c.fillStyle = "rgba(245, 197, 66, 0.15)";
        c.strokeStyle = "rgba(245, 197, 66, 0.5)";
        c.lineWidth = 1.5;
        c.beginPath();
        c.roundRect(x0 + 12, rowY + 3, w - 24, rowH - 6, 18);
        c.fill();
        c.stroke();
      } else if (i === 1) {
        // Rank 2: Silver tint
        c.fillStyle = "rgba(226, 232, 240, 0.09)";
        c.strokeStyle = "rgba(226, 232, 240, 0.28)";
        c.lineWidth = 1;
        c.beginPath();
        c.roundRect(x0 + 12, rowY + 3, w - 24, rowH - 6, 18);
        c.fill();
        c.stroke();
      } else {
        // Rank 3+: Clean dark row
        c.fillStyle = "rgba(255, 255, 255, 0.05)";
        c.beginPath();
        c.roundRect(x0 + 12, rowY + 3, w - 24, rowH - 6, 18);
        c.fill();
      }
      c.restore();

      // Rank Medal Badge
      const medalColors = ["#f5c542", "#cbd5e1", "#cd7f32", "#64748b"];
      const medal = medalColors[i] ?? "#475569";
      const mx = x0 + 34;
      c.fillStyle = medal;
      c.beginPath();
      c.arc(mx, cy, 16, 0, Math.PI * 2);
      c.fill();
      this.text(`${i + 1}`, mx, cy + 1, 19, i < 3 ? "#0f172a" : "#ffffff", "center", 0);

      // Large Avatar with Rank Ring
      const ax = x0 + 82;
      this.drawAvatar(e.avatarUrl, e.nickname, ax, cy, 24);
      if (i < 3) {
        c.strokeStyle = medal;
        c.lineWidth = i === 0 ? 3 : 2;
        c.beginPath();
        c.arc(ax, cy, 24, 0, Math.PI * 2);
        c.stroke();
      }

      // Nickname
      const textX = x0 + 118;
      this.text(truncate(e.nickname, 10), textX, cy - 10, 22, "#ffffff", "left", 6);

      // Donation Info (Coins / Gifts)
      if (e.coins > 0) {
        this.text(`🪙 ${e.coins.toLocaleString()} coins`, textX, cy + 14, 16, "#fde047", "left", 0);
      } else if (e.gifts && e.gifts > 0) {
        this.text(`🎁 ${e.gifts} gifts`, textX, cy + 14, 16, "#f472b6", "left", 0);
      } else {
        this.text(`🧨 ${e.tnt} TNT`, textX, cy + 14, 16, "#fdba74", "left", 0);
      }

      // Destruction Score (Right side)
      const rightX = x0 + w - 22;
      this.text(`${e.blocks}`, rightX, cy - 8, 28, "#ff8a65", "right", 8);
      this.text("BLOCKS", rightX, cy + 14, 13, "#fdba74", "right", 0);
    });
  }

  private drawWin(c: CanvasRenderingContext2D) {
    const elapsed = WIN_DURATION - this.wonTimer;
    c.fillStyle = `rgba(0,0,0,${0.6 * Math.min(1, elapsed * 3)})`;
    c.fillRect(-this.offX, -this.offY, this.backdrop?.width ?? W, this.backdrop?.height ?? H);
    const s = easeOutBack(Math.min(1, elapsed / 0.5));
    const wobble = Math.sin(this.time * 3) * 0.03;
    c.save();
    c.translate(W / 2, 860);
    c.rotate(wobble);
    c.scale(s, s);
    c.shadowColor = "#ffd54a";
    c.shadowBlur = 40;
    this.text("STREAMER", 0, -90, 110, "#ffd54a", "center", 16);
    this.text("WINS!", 0, 70, 180, "#fff1a8", "center", 20);
    c.shadowBlur = 0;
    c.restore();
    this.text(`Next round in ${Math.max(1, Math.ceil(this.wonTimer))}`, W / 2, 1110, 40, "#ffffff", "center", 8);
  }
}
