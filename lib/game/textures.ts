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
    glass: paintRGBA(glassPixel),
    bedrock: paint(6, (_x, _y, r) => pick(r, BEDROCK), 0),
    empty: paint(7, (_x, _y, r) => shade(pick(r, STONE), 0.28), 0.25),
    tnt: paint(8, (x, y) => tntPixel(x, y), 0.1),
    grassTop: paint(9, (_x, _y, r) => pick(r, GRASS), 0.08),
    tntTop: paint(10, (x, y, r) => tntTopPixel(x, y, r), 0.1),
    tntBottom: paint(11, (_x, _y, r) => shade([219, 52, 36], 0.8 + r() * 0.15), 0.1),
  };
}
