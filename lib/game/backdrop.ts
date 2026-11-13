import { BORDER, BOX_H, BOX_W, BOX_X, BOX_Y, W } from "./constants";
import type { TextureSet } from "./textures";

/**
 * Pixel-art night scene behind the game: sky, moon, layered mountains, a tree
 * line and a ground cut-away tiled with the block textures. The static part is
 * painted once per viewport size; stars, clouds and fireflies animate per frame.
 *
 * Everything is laid out in game coordinates (the 1080x1920 play area) shifted by
 * (ox, oy), so the scenery lines up with the box at any window size.
 */

const PX = 8; // chunky "pixel" size for scenery
const HORIZON = BOX_Y + BOX_H; // game-y where the ground starts (the box floor)
const TILE = 64;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1-D value noise in [0, 1], stable for a given seed. */
function noise1(seed: number) {
  const r = rng(seed);
  const pts = Array.from({ length: 512 }, () => r());
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = pts[((i % 512) + 512) % 512];
    const b = pts[(((i + 1) % 512) + 512) % 512];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

interface Star {
  x: number;
  y: number;
  size: number;
  base: number;
  speed: number;
  phase: number;
  cross: boolean;
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  blocks: [number, number, number, number][]; // x, y, w, h in PX units
  alpha: number;
}

interface Firefly {
  x: number;
  y: number;
  phase: number;
  speed: number;
}

export class Backdrop {
  readonly width: number;
  readonly height: number;
  private readonly ox: number;
  private readonly oy: number;
  private readonly still: HTMLCanvasElement;
  private readonly stars: Star[] = [];
  private readonly clouds: Cloud[] = [];
  private readonly flies: Firefly[] = [];
  /** Highest mountain top per PX column, so stars never show in front of a ridge. */
  private readonly skyline: number[] = [];

  constructor(width: number, height: number, ox: number, oy: number, tex: TextureSet) {
    this.width = width;
    this.height = height;
    this.ox = ox;
    this.oy = oy;
    this.still = document.createElement("canvas");
    this.still.width = width;
    this.still.height = height;
    const c = this.still.getContext("2d")!;
    c.imageSmoothingEnabled = false;

    const horizon = oy + HORIZON;
    this.paintSky(c, horizon);
    this.paintMoon(c);
    this.paintMountains(c, horizon);
    this.paintGround(c, horizon, tex);
    // No dark glow slab behind the box: it is glass now, so the scenery shows through.
    this.paintVignette(c);

    const r = rng(1337);
    const skyArea = width * Math.max(0, horizon - 200);
    const nStars = Math.min(900, Math.round(skyArea / 5200));
    for (let i = 0; i < nStars; i++) {
      // Bias toward the top: fewer stars near the glowing horizon.
      const y = Math.pow(r(), 1.6) * (horizon - 260);
      const x = Math.floor((r() * width) / 4) * 4;
      if (y > (this.skyline[Math.floor(x / PX)] ?? horizon) - 16) continue;
      this.stars.push({
        x,
        y: Math.floor(y / 4) * 4,
        size: r() < 0.88 ? 4 : 8,
        base: 0.25 + r() * 0.5,
        speed: 0.6 + r() * 2.2,
        phase: r() * Math.PI * 2,
        cross: r() < 0.04,
      });
    }

    const nClouds = Math.max(4, Math.round(width / 260));
    for (let i = 0; i < nClouds; i++) {
      const blocks: Cloud["blocks"] = [];
      const len = 8 + Math.floor(r() * 10);
      blocks.push([0, 2, len, 2]);
      blocks.push([2 + Math.floor(r() * 2), 0, Math.max(3, len - 6 - Math.floor(r() * 2)), 2]);
      if (r() < 0.6) blocks.push([len - 4, 1, 3 + Math.floor(r() * 3), 2]);
      this.clouds.push({
        x: r() * width,
        y: oy + 40 + r() * 760,
        speed: 6 + r() * 14,
        blocks,
        alpha: 0.05 + r() * 0.09,
      });
    }

    const nFlies = Math.round(width / 70);
    for (let i = 0; i < nFlies; i++) {
      this.flies.push({
        x: r() * width,
        y: horizon - 30 - r() * 200,
        phase: r() * Math.PI * 2,
        speed: 0.4 + r() * 0.8,
      });
    }
  }

  draw(c: CanvasRenderingContext2D, time: number) {
    c.drawImage(this.still, 0, 0);

    // Twinkling stars (drawn over the static sky, under mountains is fine: they stop at the horizon glow).
    for (const s of this.stars) {
      const a = s.base * (0.55 + 0.45 * Math.sin(time * s.speed + s.phase));
      c.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      c.fillRect(s.x, s.y, s.size, s.size);
      if (s.cross) {
        c.fillStyle = `rgba(200,220,255,${(a * 0.6).toFixed(3)})`;
        c.fillRect(s.x - 8, s.y + 2, 20, 4);
        c.fillRect(s.x + 2, s.y - 8, 4, 20);
      }
    }

    // Drifting clouds, wrapping around the viewport.
    for (const cl of this.clouds) {
      const span = this.width + 260;
      const x = ((((cl.x + time * cl.speed) % span) + span) % span) - 200;
      c.fillStyle = `rgba(200,210,255,${cl.alpha})`;
      for (const [bx, by, bw, bh] of cl.blocks) {
        c.fillRect(Math.round(x / PX) * PX + bx * PX, Math.round(cl.y / PX) * PX + by * PX, bw * PX, bh * PX);
      }
    }

    // Fireflies over the tree line.
    for (const f of this.flies) {
      const t = time * f.speed + f.phase;
      const x = f.x + Math.sin(t * 0.7) * 40;
      const y = f.y + Math.sin(t * 1.3) * 18;
      const a = Math.max(0, Math.sin(t * 2.1)) * 0.9;
      if (a < 0.05) continue;
      c.fillStyle = `rgba(214,255,120,${(a * 0.25).toFixed(3)})`;
      c.fillRect(Math.round(x) - 4, Math.round(y) - 4, 12, 12);
      c.fillStyle = `rgba(234,255,160,${a.toFixed(3)})`;
      c.fillRect(Math.round(x), Math.round(y), 4, 4);
    }
  }

  // ───────────────────────────── static layers ─────────────────────────────

  private paintSky(c: CanvasRenderingContext2D, horizon: number) {
    const g = c.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, "#050816");
    g.addColorStop(0.35, "#0d1433");
    g.addColorStop(0.62, "#1e1d4a");
    g.addColorStop(0.82, "#3d2656");
    g.addColorStop(0.94, "#6b3358");
    g.addColorStop(1, "#8f4a4f");
    c.fillStyle = g;
    c.fillRect(0, 0, this.width, horizon);

    // Pixel dithering band so the gradient reads as pixel art, not a smooth fade.
    const r = rng(7);
    for (let y = 0; y < horizon; y += PX) {
      for (let x = 0; x < this.width; x += PX) {
        if (r() < 0.06) {
          c.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.03)";
          c.fillRect(x, y, PX, PX);
        }
      }
    }
  }

  private paintMoon(c: CanvasRenderingContext2D) {
    // Only where it won't sit behind the HUD: out in the side scenery (wide windows).
    if (this.ox < 260) return;
    const cx = Math.max(110, this.ox - 240);
    const cy = this.oy + 230;
    const R = 9; // in PX units

    // Halo
    const halo = c.createRadialGradient(cx, cy, 20, cx, cy, 260);
    halo.addColorStop(0, "rgba(255,240,200,0.28)");
    halo.addColorStop(1, "rgba(255,240,200,0)");
    c.fillStyle = halo;
    c.fillRect(cx - 260, cy - 260, 520, 520);

    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        const d = Math.hypot(i + 0.5, j + 0.5);
        if (d > R) continue;
        let col = "#f4ecd2";
        if (d > R - 1.2) col = "#d9cfae";
        // Shadow on the lower-right edge
        if (i + j > R * 0.9) col = "#cbbf98";
        c.fillStyle = col;
        c.fillRect(cx + i * PX, cy + j * PX, PX, PX);
      }
    }
    // Craters
    const craters: [number, number, number][] = [
      [-4, -3, 2],
      [2, -5, 1],
      [3, 1, 2],
      [-3, 4, 1],
      [-6, 1, 1],
    ];
    for (const [x, y, s] of craters) {
      c.fillStyle = "#c9bd96";
      c.fillRect(cx + x * PX, cy + y * PX, s * PX, s * PX);
      c.fillStyle = "#b7aa82";
      c.fillRect(cx + x * PX, cy + (y + s - 1) * PX + PX / 2, s * PX, PX / 2);
    }
  }

  private paintMountains(c: CanvasRenderingContext2D, horizon: number) {
    // Far range (with snow caps), near range, then a blocky tree line.
    this.ridge(c, horizon, 11, 0.004, 520, 260, "#2a2552", "#3a3468", "#9aa3c9");
    this.ridge(c, horizon, 23, 0.007, 330, 170, "#1b1838", "#272250", null);
    this.trees(c, horizon);
  }

  private ridge(
    c: CanvasRenderingContext2D,
    horizon: number,
    seed: number,
    freq: number,
    amp: number,
    base: number,
    fill: string,
    light: string,
    snow: string | null,
  ) {
    const n = noise1(seed);
    const n2 = noise1(seed + 100);
    const snowLine = horizon - base - amp * 0.72;
    let prev = 0;
    for (let x = 0; x < this.width; x += PX) {
      const gx = x - this.ox;
      const h = base + amp * (0.65 * n(gx * freq) + 0.35 * n2(gx * freq * 2.7));
      const top = Math.round((horizon - h) / PX) * PX;
      c.fillStyle = fill;
      c.fillRect(x, top, PX, horizon - top);
      // Lit edge on slopes that face the moon (left).
      if (top < prev) {
        c.fillStyle = light;
        c.fillRect(x, top, PX, Math.min(prev - top + PX, 5 * PX));
      }
      if (snow && top < snowLine) {
        c.fillStyle = snow;
        c.fillRect(x, top, PX, Math.min(snowLine - top, 3 * PX));
      }
      prev = top;
      const k = x / PX;
      this.skyline[k] = Math.min(this.skyline[k] ?? Infinity, top);
    }
  }

  private trees(c: CanvasRenderingContext2D, horizon: number) {
    const r = rng(99);
    const n = noise1(55);
    // Rolling hill under the trees
    for (let x = 0; x < this.width; x += PX) {
      const h = 40 + 50 * n((x - this.ox) * 0.01);
      const top = Math.round((horizon - h) / PX) * PX;
      c.fillStyle = "#13261f";
      c.fillRect(x, top, PX, horizon - top);
    }
    // Blocky trees
    for (let x = -40; x < this.width; x += 40 + Math.floor(r() * 70)) {
      const h = 40 + 50 * n((x - this.ox) * 0.01);
      const ground = Math.round((horizon - h) / PX) * PX;
      const trunkH = (3 + Math.floor(r() * 3)) * PX;
      const crown = (4 + Math.floor(r() * 3)) * PX;
      const tx = Math.round(x / PX) * PX;
      c.fillStyle = "#1a1410";
      c.fillRect(tx, ground - trunkH, PX, trunkH);
      c.fillStyle = r() < 0.5 ? "#173524" : "#1c3d2a";
      c.fillRect(tx - crown / 2 + PX / 2, ground - trunkH - crown + PX, crown, crown);
      c.fillRect(tx - crown / 2 + PX * 1.5, ground - trunkH - crown, crown - 2 * PX, PX);
      c.fillStyle = "rgba(160,200,255,0.10)";
      c.fillRect(tx - crown / 2 + PX / 2, ground - trunkH - crown + PX, PX, crown - PX);
    }
  }

  private paintGround(c: CanvasRenderingContext2D, horizon: number, tex: TextureSet) {
    const r = rng(2024);
    const top = horizon;
    // Align tiles to the box grid so they line up with the game blocks.
    const startX = ((this.ox + BOX_X) % TILE) - TILE;
    for (let y = top, row = 0; y < this.height; y += TILE, row++) {
      for (let x = startX; x < this.width; x += TILE) {
        let t: keyof TextureSet = row === 0 ? "grass" : row < 3 ? "dirt" : "stone";
        if (row >= 3) {
          const v = r();
          if (v < 0.03) t = "diamond";
          else if (v < 0.08) t = "gold";
        } else if (row > 0 && r() < 0.15) t = "stone";
        c.drawImage(tex[t], x, y, TILE, TILE);
      }
    }
    // Darken with depth so the ground sits behind the game, plus a horizon fog line.
    const g = c.createLinearGradient(0, top, 0, this.height);
    g.addColorStop(0, "rgba(10,8,24,0.35)");
    g.addColorStop(0.25, "rgba(10,8,24,0.6)");
    g.addColorStop(1, "rgba(5,4,12,0.88)");
    c.fillStyle = g;
    c.fillRect(0, top, this.width, this.height - top);
    const fog = c.createLinearGradient(0, top - 80, 0, top + 24);
    fog.addColorStop(0, "rgba(143,74,79,0)");
    fog.addColorStop(1, "rgba(143,74,79,0.35)");
    c.fillStyle = fog;
    c.fillRect(0, top - 80, this.width, 104);
  }

  private paintVignette(c: CanvasRenderingContext2D) {
    const cx = this.ox + W / 2;
    const cy = this.height / 2;
    const R = Math.hypot(this.width, this.height) / 2;
    const g = c.createRadialGradient(cx, cy, R * 0.45, cx, cy, R);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    c.fillStyle = g;
    c.fillRect(0, 0, this.width, this.height);
  }
}
