import type { BlockType } from "./types";

type RGB = [number, number, number];
const SIZE = 16;

/** Block faces plus the extra faces the 3D renderer needs (grass top, TNT top/bottom). */
export type TextureName = BlockType | "bedrock" | "empty" | "glass" | "tnt" | "grassTop" | "tntTop" | "tntBottom";
export type TextureSet = Record<TextureName, HTMLCanvasElement>;

/** Representative colours per block, used for explosion debris. */
export const BLOCK_PARTICLE_COLORS: Record<BlockType, string[]> = {
  grass: ["#6aaa40", "#59963a", "#86603f", "#795539"],
  dirt: ["#86603f", "#795539", "#966c4a", "#644630"],
  stone: ["#7d7d7d", "#707070", "#8a8a8a", "#646464"],
  gold: ["#fad73c", "#ffe98a", "#c89614", "#f5c518"],
  diamond: ["#50dcdc", "#b4fffa", "#1e96a0", "#7af0ea"],
  aqua: ["#62dfe3", "#a6f4f4", "#3cbcc4", "#e2ffff"],
  kuromi_regular: ["#261d31", "#3e2e4f", "#c59ed6", "#f580b3"],
  dark_jester: ["#2d1e38", "#6a4382", "#c59ed6", "#f580b3"],
  lucky_skull_box: ["#241530", "#3d1f52", "#ff3399", "#150d1e"],
  punk_ore: ["#2b2235", "#4a355f", "#ff459e", "#ffffff"],
  spiked_castle: ["#1c1722", "#3a2d48", "#b870ad", "#f580b3"],
  space_suit: ["#ffffff", "#2e4057", "#f39c12", "#0f1b29"],
  shuttle_hull: ["#bdc3c7", "#7f8c8d", "#e67e22", "#2c3e50"],
  meteor_ore: ["#1e272e", "#00d2d3", "#ffdd59", "#485460"],
  cargo_crate: ["#d2dae2", "#e67e22", "#f1c40f", "#2f3542"],
  control_panel: ["#00d2d3", "#10ac84", "#2e86de", "#222f3e"],
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const shade = (c: RGB, f: number): RGB => [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f)];

function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

/** Paints a 16x16 texture pixel by pixel, then adds a bevel so blocks read clearly in a grid. */
function paint(
  seed: number,
  fn: (x: number, y: number, r: () => number) => RGB,
  bevel = 0.12,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(SIZE, SIZE);
  const r = mulberry32(seed);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let col = fn(x, y, r);
      if (bevel > 0) {
        if (x === 0 || y === 0) col = shade(col, 1 + bevel);
        else if (x === SIZE - 1 || y === SIZE - 1) col = shade(col, 1 - bevel * 1.6);
      }
      const i = (y * SIZE + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Like paint(), but the callback also returns alpha (for see-through glass). */
function paintRGBA(fn: (x: number, y: number) => [number, number, number, number]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const [r, g, b, a] = fn(x, y);
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * The box's block, drawn smooth at 128px (not pixel art): a cool aqua gradient,
 * soft bevelled edges, faint grain and a glossy 45° sheen. The sheen repeats
 * every tile, so it runs on as long diagonal streaks across neighbouring blocks.
 */
function smoothAqua(): HTMLCanvasElement {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const base = g.createLinearGradient(0, 0, S, S);
  base.addColorStop(0, "#8ff0f0");
  base.addColorStop(0.5, "#62d8de");
  base.addColorStop(1, "#46bfc8");
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);

  // Faint horizontal grain.
  g.fillStyle = "rgba(20,110,120,0.07)";
  for (let y = 10; y < S; y += 14) g.fillRect(0, y, S, 2);

  // Glossy diagonal sheen: 45° bands that wrap at the tile edge, so neighbours line up.
  g.fillStyle = "rgba(255,255,255,0.33)";
  for (const a of [36, 36 + S]) {
    g.beginPath();
    g.moveTo(a, 0);
    g.lineTo(a + 34, 0);
    g.lineTo(a + 34 - S, S);
    g.lineTo(a - S, S);
    g.closePath();
    g.fill();
  }
  g.fillStyle = "rgba(255,255,255,0.18)";
  for (const a of [86, 86 + S]) {
    g.beginPath();
    g.moveTo(a, 0);
    g.lineTo(a + 10, 0);
    g.lineTo(a + 10 - S, S);
    g.lineTo(a - S, S);
    g.closePath();
    g.fill();
  }

  // Bevel: lit top/left, shaded bottom/right, thin dark seam.
  const edge = 7;
  const lit = g.createLinearGradient(0, 0, 0, edge);
  lit.addColorStop(0, "rgba(230,255,255,0.85)");
  lit.addColorStop(1, "rgba(230,255,255,0)");
  g.fillStyle = lit;
  g.fillRect(0, 0, S, edge);
  const litL = g.createLinearGradient(0, 0, edge, 0);
  litL.addColorStop(0, "rgba(230,255,255,0.7)");
  litL.addColorStop(1, "rgba(230,255,255,0)");
  g.fillStyle = litL;
  g.fillRect(0, 0, edge, S);
  const sh = g.createLinearGradient(0, S - edge, 0, S);
  sh.addColorStop(0, "rgba(20,100,110,0)");
  sh.addColorStop(1, "rgba(20,100,110,0.75)");
  g.fillStyle = sh;
  g.fillRect(0, S - edge, S, edge);
  const shR = g.createLinearGradient(S - edge, 0, S, 0);
  shR.addColorStop(0, "rgba(20,100,110,0)");
  shR.addColorStop(1, "rgba(20,100,110,0.7)");
  g.fillStyle = shR;
  g.fillRect(S - edge, 0, edge, S);
  g.strokeStyle = "rgba(15,80,90,0.55)";
  g.lineWidth = 2;
  g.strokeRect(1, 1, S - 2, S - 2);
  return c;
}

/** Empty cell: clear glass with a pale rim and a small glint, so the scenery shows through. */
function glassPixel(x: number, y: number): [number, number, number, number] {
  const rim = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
  if (rim) return [225, 240, 248, 95];
  const inner = x === 1 || y === 1 || x === SIZE - 2 || y === SIZE - 2;
  if (inner) return [190, 220, 235, 22];
  const d = x + y;
  if (d >= 5 && d <= 6 && x < 8) return [255, 255, 255, 120]; // glint
  return [200, 230, 245, 22];
}

const DIRT: RGB[] = [
  [134, 96, 67],
  [121, 85, 58],
  [150, 108, 74],
  [100, 70, 48],
  [160, 120, 85],
];
const GRASS: RGB[] = [
  [106, 170, 64],
  [89, 150, 52],
  [120, 190, 72],
  [78, 135, 45],
];
const STONE: RGB[] = [
  [125, 125, 125],
  [112, 112, 112],
  [138, 138, 138],
  [100, 100, 100],
];
const BEDROCK: RGB[] = [
  [85, 85, 85],
  [60, 60, 60],
  [40, 40, 40],
  [110, 110, 110],
  [25, 25, 25],
];

// 3x5 / 4x5 pixel glyphs for the TNT label
const GLYPH_T = ["111", "010", "010", "010", "010"];
const GLYPH_N = ["1001", "1101", "1011", "1001", "1001"];

function tntPixel(x: number, y: number): RGB {
  const bandTop = 5;
  const bandBottom = 11;
  if (y >= bandTop && y <= bandBottom) {
    const ly = y - 6;
    if (ly >= 0 && ly < 5) {
      // T(cols 2-4) gap N(cols 6-9) gap T(cols 11-13)
      const glyphs: [number, string[]][] = [
        [2, GLYPH_T],
        [6, GLYPH_N],
        [11, GLYPH_T],
      ];
      for (const [x0, g] of glyphs) {
        const lx = x - x0;
        if (lx >= 0 && lx < g[0].length && g[ly][lx] === "1") return [35, 35, 35];
      }
    }
    return y === bandTop || y === bandBottom ? [200, 200, 200] : [238, 238, 238];
  }
  if (x % 4 === 0) return [150, 30, 20];
  if (x % 4 === 1) return [240, 80, 60];
  return [219, 52, 36];
}

/** Top of a TNT block: red with a dark fuse hole in the middle. */
function tntTopPixel(x: number, y: number, r: () => number): RGB {
  const dx = Math.abs(x - 7.5);
  const dy = Math.abs(y - 7.5);
  if (dx < 1.5 && dy < 1.5) return [40, 30, 25];
  if (dx < 2.5 && dy < 2.5) return [120, 110, 100];
  return shade([219, 52, 36], 0.9 + r() * 0.15);
}

export function createTextures(): TextureSet {
  const grassLine = Array.from({ length: SIZE }, (_, i) => 3 + ((i * 7 + 3) % 3 === 0 ? 1 : 0) + (i % 5 === 0 ? 1 : 0));

  const stone = paint(3, (_x, _y, r) => {
    const v = r();
    if (v < 0.08) return [88, 88, 88];
    return pick(r, STONE);
  });

  return {
    grass: paint(1, (x, y, r) => (y < grassLine[x] ? pick(r, GRASS) : pick(r, DIRT))),
    dirt: paint(2, (_x, _y, r) => pick(r, DIRT)),
    stone,
    gold: paint(
      4,
      (x, y, r) => {
        const base: RGB = [250, 215, 60];
        if (x === 1 || y === 1) return [255, 245, 160];
        if (x === 14 || y === 14) return [205, 155, 25];
        if ((x + y) % 7 === 0 && r() < 0.5) return [255, 240, 140];
        return shade(base, 0.93 + r() * 0.12);
      },
      0.18,
    ),
    diamond: paint(
      5,
      (x, y, r) => {
        const base: RGB = [80, 220, 220];
        if (x === 1 || y === 1) return [190, 255, 250];
        if (x === 14 || y === 14) return [30, 150, 160];
        if ((x * 3 + y) % 9 === 0 && r() < 0.6) return [200, 255, 255];
        return shade(base, 0.92 + r() * 0.14);
      },
      0.18,
    ),
    aqua: smoothAqua(),
    kuromi_regular: paint(
      12,
      (x, y, r) => {
        // Deep purple base with skull/collar motif
        if (y < 4 && (x + y) % 3 === 0) return [197, 158, 214]; // lilac scalloped trim
        if (x >= 5 && x <= 10 && y >= 6 && y <= 11) {
          if ((x === 6 || x === 9) && y === 8) return [30, 20, 38]; // eyes
          return [245, 128, 179]; // pink skull
        }
        return shade([38, 29, 49], 0.9 + r() * 0.2);
      },
      0.15,
    ),
    dark_jester: paint(
      13,
      (x, y, r) => {
        // Harlequin diamond check
        const isLight = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
        const base: RGB = isLight ? [109, 78, 131] : [41, 30, 52];
        if (x >= 6 && x <= 9 && y >= 6 && y <= 9) return [245, 128, 179]; // small pink skull center
        return shade(base, 0.93 + r() * 0.14);
      },
      0.12,
    ),
    lucky_skull_box: paint(
      14,
      (x, y, r) => {
        // Dark purple wooden crate with bright pink skull
        const isBorder = x <= 1 || x >= 14 || y <= 1 || y >= 14;
        if (isBorder) return [24, 18, 31];
        if (x >= 5 && x <= 10 && y >= 5 && y <= 11) return [255, 51, 153]; // neon pink skull
        const plank = (y % 4 === 0) ? [28, 18, 38] : [48, 28, 65];
        return shade(plank as RGB, 0.93 + r() * 0.14);
      },
      0.15,
    ),
    punk_ore: paint(
      15,
      (x, y, r) => {
        // Dark purple ore stone with glowing pink crystals
        const isGem = ((x * 5 + y * 7) % 11 === 0 && r() < 0.45) || (x === 7 && y === 8) || (x === 11 && y === 4);
        if (isGem) {
          if (r() < 0.2) return [255, 255, 255]; // sparkle
          return r() < 0.5 ? [255, 69, 158] : [255, 138, 198];
        }
        return shade([43, 34, 53], 0.9 + r() * 0.2);
      },
      0.15,
    ),
    spiked_castle: paint(
      16,
      (x, y, r) => {
        // Obsidian brick with lavender battlement top
        if (y <= 2) return [197, 158, 214]; // lavender battlements
        const isMortar = y % 4 === 0 || (y < 8 && x % 8 === 0) || (y >= 8 && (x + 4) % 8 === 0);
        if (isMortar) return [20, 15, 25];
        if (x <= 1 || x >= 14) return [70, 45, 78]; // corner bracket
        return shade([32, 26, 40], 0.92 + r() * 0.16);
      },
      0.15,
    ),
    space_suit: paint(
      17,
      (x, y, r) => {
        // Space helmet visor & white suit
        if (x >= 4 && x <= 11 && y >= 4 && y <= 11) {
          if (x === 5 && y === 5) return [255, 255, 255]; // visor glare
          return [15, 25, 45]; // starry dark visor
        }
        if (x <= 1 || x >= 14 || y <= 1 || y >= 14) return [240, 150, 40]; // orange border
        return shade([230, 235, 245], 0.9 + r() * 0.18);
      },
      0.15,
    ),
    shuttle_hull: paint(
      18,
      (x, y, r) => {
        // Metal hull plates with hazard stripe
        if ((x + y) % 6 < 3 && (y <= 3 || y >= 12)) return [235, 140, 20]; // hazard stripes
        if (x === 7 || y === 7) return [50, 55, 65]; // panel seam
        return shade([180, 190, 200], 0.9 + r() * 0.15);
      },
      0.14,
    ),
    meteor_ore: paint(
      19,
      (x, y, r) => {
        // Deep space asteroid with glowing cyan & gold celestial ore
        const isCyan = (x * 3 + y * 7) % 9 === 0;
        const isGold = (x * 5 + y * 2) % 11 === 0;
        if (isCyan) return [0, 210, 220];
        if (isGold) return [255, 200, 50];
        return shade([35, 40, 50], 0.88 + r() * 0.22);
      },
      0.18,
    ),
    cargo_crate: paint(
      20,
      (x, y, r) => {
        // Sci-fi cargo crate with orange corner bumpers
        const isCorner = (x <= 2 || x >= 13) && (y <= 2 || y >= 13);
        if (isCorner) return [240, 120, 20];
        if (x >= 4 && x <= 7 && y >= 5 && y <= 10) return [255, 215, 60]; // keypad
        return shade([195, 205, 215], 0.92 + r() * 0.14);
      },
      0.15,
    ),
    control_panel: paint(
      21,
      (x, y, r) => {
        // Telemetry console with glowing radar & cyan waveforms
        if (y === 8 && x >= 3 && x <= 12) return [0, 230, 240]; // waveform line
        if ((x - 8) * (x - 8) + (y - 8) * (y - 8) <= 9 && (x + y) % 2 === 0) return [20, 180, 150]; // radar blip
        if (x <= 1 || x >= 14 || y <= 1 || y >= 14) return [40, 70, 95];
        return shade([25, 35, 45], 0.9 + r() * 0.2);
      },
      0.15,
    ),
    glass: paintRGBA(glassPixel),
    bedrock: paint(6, (_x, _y, r) => pick(r, BEDROCK), 0),
    empty: paint(7, (_x, _y, r) => shade(pick(r, STONE), 0.28), 0.25),
    tnt: paint(8, (x, y) => tntPixel(x, y), 0.1),
    grassTop: paint(9, (_x, _y, r) => pick(r, GRASS), 0.08),
    tntTop: paint(10, (x, y, r) => tntTopPixel(x, y, r), 0.1),
    tntBottom: paint(11, (_x, _y, r) => shade([219, 52, 36], 0.8 + r() * 0.15), 0.1),
  };
}
