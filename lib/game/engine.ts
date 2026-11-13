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
import {
  DEFAULT_SETTINGS,
  type ActionKind,
  type BlockType,
  type GameSettings,
  type GameStats,
  type GiftDrop,
  type LeaderEntry,
  type Viewer,
} from "./types";

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
const FONT = '"Press Start 2P", "Courier New", monospace';
const TOAST_LIFE = 3.2;
/**
 * Final-seconds slow motion for the HOLD timer: from SLOW_FROM seconds left the
 * countdown runs at SLOW_START_RATE of real time, easing down to SLOW_END_RATE
 * by the last second (so 3 → 2 → 1 each take longer than the one before).
 */
const SLOW_FROM = 3;
const SLOW_START_RATE = 0.55;
const SLOW_END_RATE = 0.3;
const BLOCK_WEIGHTS: [BlockType, number][] = [
  ["grass", 34],
  ["dirt", 22],
  ["stone", 22],
  ["gold", 13],
  ["diamond", 9],
];
const BLOCK_WEIGHT_TOTAL = BLOCK_WEIGHTS.reduce((s, [, w]) => s + w, 0);
const CONFETTI_COLORS = ["#ffd54a", "#ff5c8a", "#4ade80", "#38bdf8", "#c084fc", "#ffffff", "#fb923c"];
const RANK_COLORS = ["#ffd54a", "#d7dde5", "#e0915a", "#9ca3af", "#9ca3af"];

/** Every block in the box uses the same aqua design. Set to null to go back to random mixed blocks. */
const SINGLE_BLOCK: BlockType | null = "aqua";

function randomBlock(): BlockType {
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
  private backdrop: AerialBackdrop | null = null;
  /** Camera climb in game pixels: screen y = game y + scroll. Follows the builder up the tower. */
  private scroll = 0;
  /** Camera pan in game pixels: screen x = game x + scrollX (0 or negative). */
  private scrollX = 0;
  /** Background picture (public/background.png). Until it loads, the painted Backdrop shows instead. */
  private bgImg: HTMLImageElement | null = null;
  /** Viewport the picture was last drawn for; it is static, so it is only redrawn on resize. */
  private bgImgKey = "";
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
  /** Gift name (lower case) → picture URL, remembered from incoming gifts for the on-screen list. */
  private giftImages = new Map<string, string>();
  private banner: { title: string; sub: string; color: string; age: number } | null = null;
  private nextId = 1;
  /** Last whole second shown by the HOLD timer (for the countdown tick). */
  private lastShownSecond = 0;

  private statsListener: ((s: GameStats) => void) | null = null;
  private statsAcc = 0;

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
    this.bgImgKey = ""; // resizing clears the canvas
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
    this.update(dt);
    this.render();
    this.rafId = requestAnimationFrame(this.frame);
  };

  // ───────────────────────────── public API ─────────────────────────────

  setSettings(next: GameSettings) {
    const prev = this.settings;
    this.settings = { ...next };
    this.audio.setVolume(next.volume);
    this.scene3d?.setCharacter(next.character);
    if (next.timerDuration !== prev.timerDuration) {
      this.timeLeft = this.isFull() ? Math.min(this.timeLeft, next.timerDuration) : next.timerDuration;
    }
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
  performAction(viewer: Viewer, label: string, action: ActionKind, amount: number, count: number) {
    const n = Math.max(1, Math.floor(count));
    const who = truncate(viewer.nickname, 12);
    const times = n > 1 ? ` x${n}` : "";
    switch (action) {
      case "tnt": {
        const tnt = Math.max(1, Math.floor(amount)) * n;
        this.entryFor(viewer).tnt += tnt;
        this.dropTnt(viewer, tnt);
        this.toast(`${who}: ${label}${times} → ${tnt} TNT`, "#ff8a65");
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
    e.coins += g.coins;
    e.tnt += g.tnt;
    const giftLabel = g.count > 1 ? `${g.count}x ${g.giftName}` : g.giftName;
    this.toast(`${truncate(g.viewer.nickname, 12)}: ${giftLabel} → ${g.tnt} TNT`, "#ff8a65");
    this.dropTnt(g.viewer, g.tnt);
  }

  dropTnt(viewer: Viewer, count: number) {
    const room = MAX_QUEUE - this.spawnQueue.length;
    for (let i = 0; i < Math.min(count, room); i++) this.spawnQueue.push(viewer);
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
    const n = Math.max(1, Math.min(50, Math.floor(likes)));
    let added = 0;
    for (let i = 0; i < n; i++) {
      const idx = this.placeBlock(true);
      if (idx < 0) break;
      added++;
    }
    if (added > 0) {
      this.audio.like();
      this.toast(`♥ ${truncate(viewer.nickname, 12)} +${added} block${added > 1 ? "s" : ""}`, "#ff6fa8");
    }
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

  /** True while the streamer is steering (or recently was). */
  isManual(): boolean {
    return this.held.length > 0 || this.tapped !== null || this.time - this.lastInput < AUTO_RESUME || !this.settings.idleAutoWalk;
  }

  resetRound() {
    this.grid.fill(null);
    this.filled = 0;
    this.tnts = [];
    this.builder = this.spawnBuilder();
    this.timeLeft = this.settings.timerDuration;
    this.phase = "playing";
    this.wonTimer = 0;
    this.confetti = [];
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
      e = { id: v.id, nickname: v.nickname, avatarUrl: v.avatarUrl, coins: 0, tnt: 0, blocks: 0 };
      this.leaderboard.set(v.id, e);
    } else {
      e.nickname = v.nickname;
      if (v.avatarUrl) e.avatarUrl = v.avatarUrl;
    }
    return e;
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
    this.grid[row * COLS + col] = { type: randomBlock(), fall: Math.max(0, restTop - fromTop), fallV: 0 };
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

  /** Autopilot: head for the lowest column (bottom first), building up whenever a wall is in the way. */
  private autoStep(b: Builder) {
    const dur = Math.max(0.05, this.settings.buildInterval);
    let target = b.col;
    let best = this.height(b.col);
    for (let c = 0; c < COLS; c++) {
      const h = this.height(c);
      if (h < best || (h === best && Math.abs(c - b.col) < Math.abs(target - b.col))) {
        best = h;
        target = c;
      }
    }

    if (target === b.col) {
      // Standing on a lowest column: keep sweeping sideways, turning at walls.
      const back = b.dir === "left" ? "right" : "left";
      if (this.tryWalk(b, b.dir, dur) || this.tryWalk(b, back, dur)) return;
    } else if (this.tryWalk(b, target < b.col ? "left" : "right", dur)) {
      return;
    }
    if (this.buildUnder(b)) {
      b.step = 0;
      b.fromX = b.x;
      b.fromCol = b.col;
      b.stepDur = dur; // pause like a step so it builds at walking pace
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
    if (this.particles.length < MAX_PARTICLES) this.particles.push(p);
  }

  private update(dt: number) {
    this.time += dt;

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

      // Timer only ticks while the box is 100% full
      if (this.isFull()) {
        this.timeLeft -= dt * this.countdownRate();
        const shown = Math.ceil(this.timeLeft);
        if (shown !== this.lastShownSecond) {
          this.lastShownSecond = shown;
          if (shown >= 1 && shown <= SLOW_FROM) this.audio.tick((SLOW_FROM - shown) / Math.max(1, SLOW_FROM - 1));
        }
        if (this.timeLeft <= 0) this.win();
      } else if (this.settings.resetTimerOnDamage) {
        this.timeLeft = this.settings.timerDuration;
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
    }

    this.updateScroll(dt);
    this.updateParticles(this.particles, dt);
    this.updateParticles(this.confetti, dt);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < 0.4);
    if (this.banner && (this.banner.age += dt) > 3.2) this.banner = null;
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
   * Draws public/background.png to cover the whole window, with its grass line
   * at the game's ground height (game y = BG_GROUND_Y). Returns false until it has loaded.
   */
  private drawBackgroundImage(bg: CanvasRenderingContext2D): boolean {
    if (!this.bgImg && typeof Image !== "undefined") {
      this.bgImg = new Image();
      this.bgImg.src = BG_IMAGE_URL;
    }
    const img = this.bgImg;
    if (!img || !img.complete || img.naturalWidth === 0) return false;
    const vw = bg.canvas.width;
    const vh = bg.canvas.height;
    const key = `${vw}x${vh}`;
    if (key === this.bgImgKey) return true;
    this.bgImgKey = key;
    const s = Math.max(vw / img.naturalWidth, vh / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    const dx = (vw - dw) / 2;
    // Line the picture's ground up with the game's, but never leave a gap at the top or bottom.
    const dy = Math.min(0, Math.max(vh - dh, this.offY + BG_GROUND_Y - BG_GROUND_FRAC * dh));
    bg.imageSmoothingEnabled = false; // pixel art: keep it crisp when scaled up
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
    // The painted sky scenery scrolls with the camera; public/background.png is static, so it is only
    // used when USE_BG_IMAGE is on.
    // With WebGL the 3-D landscape (in Scene3D) is the scenery; the painted 2-D one is only a fallback.
    if (!this.scene3d && !(USE_BG_IMAGE && this.drawBackgroundImage(bg))) this.backdrop.draw(bg, this.time, this.scroll, this.scrollX);

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
    });

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas!.width, this.canvas!.height);
    c.translate(this.offX, this.offY);
    this.drawTntTags(c);
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
      c.lineWidth = stroke;
      c.strokeStyle = "#000";
      c.strokeText(s, x, y);
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
      c.font = `18px ${FONT}`;
      const tw = c.measureText(name).width;
      const w = tw + 58;
      const x0 = pt.x - w / 2;
      c.fillStyle = "rgba(0,0,0,0.65)";
      c.beginPath();
      c.roundRect(x0, y - 20, w, 40, 20);
      c.fill();
      this.drawAvatar(t.viewer.avatarUrl, t.viewer.nickname, x0 + 20, y, 16);
      this.text(name, x0 + 44, y + 1, 18, "#fff", "left", 0);
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

  /** Left-aligned run of differently coloured text pieces on one line. */
  private textRun(parts: [string, string][], x: number, y: number, size: number, stroke: number) {
    const c = this.ctx!;
    c.font = `${size}px ${FONT}`;
    let cx = x;
    for (const [str, color] of parts) {
      this.text(str, cx, y, size, color, "left", stroke);
      cx += c.measureText(str).width;
    }
  }

  /**
   * Top-left: "WIN x / goal" and the like goal. Above the box: blocks filled.
   * The round timer only shows while the box is full (that's when it runs).
   */
  private drawHud(c: CanvasRenderingContext2D) {
    const s = this.settings;
    this.text(`WIN ${this.streamerWins} / ${s.winGoal}`, 30, 66, 52, "#ffffff", "left", 14);
    if (s.likeGoalStep > 0) {
      const target = (Math.floor(this.likes / s.likeGoalStep) + 1) * s.likeGoalStep;
      const label = s.likeGoalLabel.trim();
      this.textRun(
        [
          [label ? `${label.toUpperCase()} - ` : "", "#ffffff"],
          [String(this.likes), "#7dff6a"],
          [" / ", "#ffffff"],
          [String(target), "#7dff6a"],
          [" LIKES", "#ffffff"],
        ],
        34,
        128,
        20,
        7,
      );
    }

    // Blocks counter, under the like goal (clear of the builder walking on top).
    const full = this.isFull() && this.phase === "playing";
    const counter = `${this.filled} / ${COLS * ROWS}`;
    // Sits just above the tower's top as it comes into view, never higher than under the like goal.
    // Floats above the builder's head (~1.6 blocks tall) once the tower top is on screen.
    const counterY = Math.max(196, BOX_Y + this.scroll - CELL * 2.9);
    const counterX = Math.max(30, BOX_X + this.scrollX + 40);
    this.text(counter, counterX, counterY, 40, full ? "#7dff6a" : "#ffd84a", "left", 10);

    if (full) {
      const urgent = this.timeLeft <= 10;
      const final = this.timeLeft <= SLOW_FROM;
      // Each second "beats": big right as it appears, settling as it slowly runs out.
      const beat = Math.pow(this.timeLeft % 1, 3);
      const pop = final ? 1 + 0.45 * beat : urgent ? 1 + 0.18 * beat : 1;
      c.save();
      c.translate(W * 0.6, final ? 560 : 600);
      c.scale(pop, pop);
      if (final) this.text(String(Math.max(1, Math.ceil(this.timeLeft))), 0, 0, 150, "#ff4d4d", "center", 22);
      else this.text(`HOLD ${formatTime(this.timeLeft)}`, 0, 0, 56, urgent ? "#ff4d4d" : "#ffffff", "center", 14);
      c.restore();
    }
  }

  /** Right side: gift picture + what it does, on a dark see-through panel. */
  private drawGiftList(c: CanvasRenderingContext2D) {
    const list = this.settings.giftActions;
    if (!list.length) return;
    const rowH = 66;
    const w = 330;
    const x0 = W - w - 18;
    const y0 = 168;
    const h = list.length * rowH + 20;
    c.fillStyle = "rgba(20,24,32,0.55)";
    c.beginPath();
    c.roundRect(x0, y0, w, h, 22);
    c.fill();
    list.forEach((g, i) => {
      const cy = y0 + 10 + i * rowH + rowH / 2;
      const url = g.imageUrl || this.giftImages.get(g.giftName.trim().toLowerCase());
      const img = this.avatars.get(url);
      const ix = x0 + 22;
      if (img) {
        c.imageSmoothingEnabled = true;
        c.drawImage(img, ix, cy - 26, 52, 52);
        c.imageSmoothingEnabled = false;
      } else {
        c.font = "40px system-ui, sans-serif";
        c.textAlign = "left";
        c.textBaseline = "middle";
        c.fillText("🎁", ix + 2, cy + 2);
      }
      this.text(truncate(g.label.toUpperCase(), 13), x0 + 92, cy + 2, 22, "#ffffff", "left", 6);
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
    c.translate(W / 2, 760);
    c.scale(s, s);
    this.text(truncate(b.title.toUpperCase(), 14), 0, 0, 72, b.color, "center", 16);
    this.text(b.sub, 0, 80, 26, "#ffffff", "center", 8);
    c.restore();
    c.globalAlpha = 1;
  }

  private drawToasts(c: CanvasRenderingContext2D) {
    this.toasts.forEach((t, i) => {
      const fadeIn = Math.min(1, t.age / 0.15);
      const fadeOut = Math.min(1, (TOAST_LIFE - t.age) / 0.4);
      const a = Math.min(fadeIn, fadeOut);
      const y = 1040 + i * 54; // over the tower, clear of the counter and HOLD timer
      c.globalAlpha = a;
      c.font = `20px ${FONT}`;
      const w = Math.min(BOX_W - 20, c.measureText(t.text).width + 40);
      c.fillStyle = "rgba(0,0,0,0.7)";
      c.beginPath();
      c.roundRect(W / 2 - w / 2, y - 22, w, 44, 22);
      c.fill();
      this.text(t.text, W / 2, y + 1, 20, t.color, "center", 0);
      c.globalAlpha = 1;
    });
  }

  /** Compact board in the bottom-left corner (the scenery side, clear of the tower). */
  private drawLeaderboard(c: CanvasRenderingContext2D) {
    const x0 = 16;
    const w = BOX_X - BORDER - 32;
    const y0 = LEADERBOARD_Y;
    const h = H - y0 - 60; // leave room for the connection badge
    c.fillStyle = "rgba(0,0,0,0.55)";
    c.beginPath();
    c.roundRect(x0, y0, w, h, 16);
    c.fill();

    this.text("TOP DESTROYERS", x0 + w / 2, y0 + 26, 16, "#ffd54a", "center", 5);

    const entries = [...this.leaderboard.values()]
      .sort((a, b) => b.blocks - a.blocks || b.coins - a.coins)
      .slice(0, Math.max(1, Math.floor((h - 56) / 38)));

    if (entries.length === 0) {
      this.text("SEND GIFTS!", x0 + w / 2, y0 + 90, 16, "#e2e8f0", "center", 5);
      return;
    }

    entries.forEach((e, i) => {
      const y = y0 + 66 + i * 38;
      this.text(`${i + 1}`, x0 + 16, y, 16, RANK_COLORS[i], "left", 4);
      this.drawAvatar(e.avatarUrl, e.nickname, x0 + 56, y, 14);
      this.text(truncate(e.nickname, 8), x0 + 78, y + 1, 14, "#ffffff", "left", 4);
      this.text(`${e.blocks}`, x0 + w - 14, y + 1, 14, "#ff8a65", "right", 4);
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
    this.text("STREAMER", 0, -90, 96, "#ffd54a", "center", 18);
    this.text("WINS!", 0, 60, 150, "#ffd54a", "center", 22);
    c.restore();
    this.text(`NEXT ROUND IN ${Math.max(1, Math.ceil(this.wonTimer))}`, W / 2, 1100, 30, "#ffffff");
  }
}
