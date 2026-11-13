import { BOX_H, BOX_X, BOX_Y } from "./constants";
import type { TextureSet } from "./textures";

/**
 * Daytime "high in the sky" scenery behind the tower: a sunny coast seen from
 * far above, with sea, beaches, woods and snowy mountains on the horizon.
 *
 * Two layers, so climbing feels like height:
 *  - far: sky + distant forest. Painted once, drifts down only slightly as the camera climbs.
 *  - near: the ground at the foot of the tower. Moves 1:1 with the tower, so it
 *    falls away below the screen as the builder goes up.
 *
 * Everything is in game coordinates (1080x1920 play area) shifted by (ox, oy).
 */

const PX = 6; // chunky "pixel" size
/** Screen-y of the far horizon (play-area coordinates). */
const HORIZON = 520;
/** How much the far layer drifts per pixel of camera climb. */
const FAR_PARALLAX = 0.12;
const FAR_EXTRA = 260; // far layer is painted this much taller than the view, to drift into
const FLAKES = 90;


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

const snap = (v: number) => Math.round(v / PX) * PX;

interface Flake {
  x: number;
  y: number;
  s: number;
  v: number;
  ph: number;
}

export class AerialBackdrop {
  readonly width: number;
  readonly height: number;
  private far: HTMLCanvasElement;
  private near: HTMLCanvasElement;
  private flakes: Flake[] = [];
  private clouds: { x: number; y: number; w: number; v: number }[] = [];


  constructor(
    vw: number,
    vh: number,
    private ox: number,
    private oy: number,
    tex: TextureSet,
  ) {
    this.width = vw;
    this.height = vh;
    this.far = this.paintFar();
    this.near = this.paintNear(tex);
    const r = rng(77);
    for (let i = 0; i < FLAKES; i++) {
      this.flakes.push({ x: r() * vw, y: r() * vh, s: r() < 0.3 ? 2 : 1, v: 40 + r() * 70, ph: r() * 6.28 });
    }
    for (let i = 0; i < 4; i++) {
      this.clouds.push({ x: r() * vw, y: oy + 60 + r() * 360, w: 90 + r() * 140, v: 6 + r() * 10 });
    }
  }

  private canvas(w: number, h: number) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    return { c, ctx };
  }

  /**
   * Sunny coast seen from high up: bright sky, snowy mountains on the horizon,
   * sea on the left with sandy beaches, and green blocky woods running inland.
   */
  private paintFar(): HTMLCanvasElement {
    const vw = this.width;
    const vh = this.height + FAR_EXTRA;
    const { c, ctx } = this.canvas(vw, vh);
    const hy = this.oy + HORIZON + FAR_EXTRA; // horizon in this canvas
    const r = rng(11);

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, "#5aa6ec");
    sky.addColorStop(0.7, "#a9d6f5");
    sky.addColorStop(1, "#e4f3fb");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, vw, hy);

    this.mountains(ctx, hy, r);

    // Land and sea, row by row from the horizon toward us.
    // coastX(p): where the sea ends at depth p (0 = horizon, 1 = bottom of the view).
    const ox = this.ox;
    const coastX = (p: number) =>
      ox + 140 + p * 260 + Math.sin(p * 9 + 1.3) * 70 + Math.sin(p * 23) * 22;
    const rows = Math.ceil((vh - hy) / PX);
    for (let i = 0; i < rows; i++) {
      const y = hy + i * PX;
      const p = i / rows;
      const cx = coastX(p);
      const sand = 10 + p * 46;
      for (let x = 0; x < vw; x += PX) {
        let col: string;
        const d = cx - x; // > 0: in the sea
        if (d > sand + 70) col = (x + i * 3) % 37 < 2 ? "#5d9fe0" : p < 0.15 ? "#4b8fd6" : "#2f72c4"; // deep sea + glints
        else if (d > sand) col = r() < 0.15 ? "#7fc3ec" : "#5cb0e3"; // shallows
        else if (d > 0) col = r() < 0.3 ? "#f3e2a6" : "#e8d18c"; // beach
        else col = r() < 0.25 ? "#5e9e3c" : r() < 0.5 ? "#6aab45" : "#559236"; // grass
        ctx.fillStyle = col;
        ctx.fillRect(x, y, PX, PX);
      }
    }

    // A little sand islet out at sea.
    this.blob(ctx, r, ox + 70, hy + 300, 46, 14, ["#e8d18c", "#f3e2a6"]);
    this.blob(ctx, r, ox + 70, hy + 296, 28, 8, ["#6aab45", "#5e9e3c"]);

    // Woods: blocky round-topped trees, small near the horizon and big up close, drawn back-to-front.
    const rowsT = 64;
    for (let i = 0; i < rowsT; i++) {
      const p = i / (rowsT - 1);
      const y = hy + 8 + Math.pow(p, 1.5) * (vh - hy - 8);
      const size = 1 + Math.floor(p * 5);
      const n = Math.floor(12 + p * 14);
      const coast = coastX((y - hy) / (vh - hy));
      for (let k = 0; k < n; k++) {
        const x = coast + 20 + r() * (vw - coast);
        if (r() < 0.22) continue; // clearings
        this.leafyTree(ctx, x, y + r() * 8, size, r);
      }
    }

    // Haze over the horizon.
    const haze = ctx.createLinearGradient(0, hy - 30, 0, hy + 160);
    haze.addColorStop(0, "rgba(228,243,251,0)");
    haze.addColorStop(0.2, "rgba(228,243,251,0.7)");
    haze.addColorStop(1, "rgba(228,243,251,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, hy - 30, vw, 190);
    return c;
  }

  /** Jagged mountain range on the horizon, rock with snowy peaks, bigger toward the right. */
  private mountains(ctx: CanvasRenderingContext2D, hy: number, r: () => number) {
    const vw = this.width;
    const peaks = Array.from({ length: 9 }, (_, i) => ({
      x: (i / 8) * vw + (r() - 0.5) * 80,
      h: 60 + r() * 90 + (i / 8) * 80,
      w: 120 + r() * 90,
    }));
    for (let x = 0; x < vw; x += PX) {
      let top = 0;
      for (const pk of peaks) top = Math.max(top, pk.h * (1 - Math.abs(x - pk.x) / pk.w));
      top = Math.max(0, top + (r() - 0.5) * 6);
      const y0 = snap(hy - top);
      for (let y = y0; y < hy; y += PX) {
        const depth = (y - y0) / Math.max(1, top);
        const snow = depth < 0.35 && top > 70;
        ctx.fillStyle = snow ? (r() < 0.3 ? "#dfe8ef" : "#f4f8fb") : depth > 0.75 ? "#7d8f7a" : r() < 0.5 ? "#8c8a86" : "#9b968e";
        ctx.fillRect(x, y, PX, PX);
      }
    }
  }

  /** Round, blocky canopy tree seen from above (a few are autumn orange). */
  private leafyTree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, r: () => number) {
    const u = PX * Math.max(1, size) * 0.6;
    const autumn = r() < 0.06;
    const greens = autumn ? ["#d9822b", "#c56d1f", "#e89a3c"] : ["#2f6b2a", "#3a7d31", "#285c24", "#43893a"];
    const g = () => greens[Math.floor(r() * greens.length)];
    // Shadow, trunk, then a stepped canopy with a lit top-left.
    ctx.fillStyle = "rgba(20,40,15,0.35)";
    ctx.fillRect(snap(x - u * 1.2), snap(y + u * 0.4), snap(u * 3), Math.max(PX, snap(u * 0.6)));
    ctx.fillStyle = "#5b3b22";
    ctx.fillRect(snap(x), snap(y - u * 0.2), PX, Math.max(PX, snap(u * 0.8)));
    ctx.fillStyle = g();
    ctx.fillRect(snap(x - u * 1.5), snap(y - u * 2), Math.max(PX, snap(u * 3)), Math.max(PX, snap(u * 1.8)));
    ctx.fillStyle = g();
    ctx.fillRect(snap(x - u), snap(y - u * 2.7), Math.max(PX, snap(u * 2)), Math.max(PX, snap(u * 0.9)));
    ctx.fillStyle = autumn ? "#f2b45a" : "#5aa148";
    ctx.fillRect(snap(x - u * 1.2), snap(y - u * 2.6), Math.max(PX, snap(u)), PX);
  }

  /** Irregular pixel blob (lakes, rocks). */
  private blob(ctx: CanvasRenderingContext2D, r: () => number, cx: number, cy: number, rx: number, ry: number, cols: string[]) {
    for (let y = -ry; y <= ry; y += PX) {
      const span = rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))) * (0.85 + r() * 0.3);
      for (let x = -span; x <= span; x += PX) {
        ctx.fillStyle = cols[Math.floor(r() * cols.length)];
        ctx.fillRect(snap(cx + x), snap(cy + y), PX, PX);
      }
    }
  }

  /** A pine seen from slightly above: stacked dark-green tiers with snow on the tips. */
  private pine(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, r: () => number) {
    const u = PX * Math.max(1, size) * 0.5;
    const greens = ["#24502f", "#2d5f37", "#1d4428"];
    const g = greens[Math.floor(r() * greens.length)];
    const tiers = 3;
    for (let t = 0; t < tiers; t++) {
      const w = (tiers - t) * 2 * u;
      const ty = y - t * u * 1.3;
      ctx.fillStyle = g;
      ctx.fillRect(snap(x - w / 2), snap(ty - u), Math.max(PX, snap(w)), Math.max(PX, snap(u * 1.2)));
      ctx.fillStyle = "#eef3f6";
      ctx.fillRect(snap(x - w / 2), snap(ty - u), Math.max(PX, snap(w * 0.45)), PX);
    }
    ctx.fillStyle = "#4a3324";
    ctx.fillRect(snap(x - u / 3), snap(y + u * 0.1), PX, PX);
  }

  /** Small floating island: snowy grass on top, dirt and stone tapering underneath, one pine. */
  private island(ctx: CanvasRenderingContext2D, x: number, y: number, r: () => number) {
    const w = 240;
    const B = PX * 2;
    for (let row = 0; row < 9; row++) {
      const inset = row === 0 ? 0 : Math.min(w / 2 - B, row * row * 2.2 + row * 6);
      const y0 = y + row * B;
      for (let xx = x + inset; xx < x + w - inset; xx += B) {
        let col: string;
        if (row === 0) col = r() < 0.6 ? "#eef3f6" : "#d9e4ea";
        else if (row === 1) col = r() < 0.5 ? "#5e9a3a" : "#4f8a31";
        else if (row < 4) col = ["#8a6242", "#7a5438", "#97704d"][Math.floor(r() * 3)];
        else col = ["#7f7f84", "#6d6d73", "#8d8d92"][Math.floor(r() * 3)];
        ctx.fillStyle = col;
        ctx.fillRect(snap(xx), snap(y0), B, B);
      }
    }
    this.pine(ctx, x + w * 0.62, y - 2, 6, r);
    this.pine(ctx, x + w * 0.3, y - 2, 4, r);
  }

  /** Snowy ground at the foot of the tower, tiled with the dirt/stone block textures. */
  private paintNear(tex: TextureSet): HTMLCanvasElement {
    const vw = this.width;
    const h = 700;
    const { c, ctx } = this.canvas(vw, h);
    const T = 72;
    for (let ty = 0; ty < h; ty += T) {
      for (let tx = ((this.ox + BOX_X) % T) - T; tx < vw; tx += T) {
        ctx.drawImage(ty === 0 ? tex.grass : ty < T * 3 ? tex.dirt : tex.stone, tx, ty, T, T);
      }
    }
    // Darken with depth.
    const g = ctx.createLinearGradient(0, T, 0, h);
    g.addColorStop(0, "rgba(10,14,20,0)");
    g.addColorStop(1, "rgba(10,14,20,0.7)");
    ctx.fillStyle = g;
    ctx.fillRect(0, T, vw, h - T);
    return c;
  }

  draw(ctx: CanvasRenderingContext2D, time: number, scroll: number, scrollX = 0) {
    const vw = this.width;
    // Far layer drifts down a little as we climb.
    const farY = -FAR_EXTRA + Math.min(FAR_EXTRA, scroll * FAR_PARALLAX);
    this.paintedSky(ctx, time, farY);


    // Ground at the tower's foot moves 1:1 with the tower.
    const groundY = this.oy + BOX_Y + BOX_H + scroll;
    // The near ground is tiled, so panning just slides it by whole tiles' remainder.
    if (groundY < this.height) {
      const T = 72;
      const dx = Math.round(scrollX % T);
      ctx.drawImage(this.near, dx, Math.round(groundY));
      if (dx < 0) ctx.drawImage(this.near, dx + vw, Math.round(groundY));
    }

    // Sunny day: no falling snow (the flakes are kept for a winter variant).
    void this.flakes;
  }

  /** The painted fallback: sky, distant forest and drifting clouds. */
  private paintedSky(ctx: CanvasRenderingContext2D, time: number, farY: number) {
    const vw = this.width;
    ctx.drawImage(this.far, 0, farY);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (const cl of this.clouds) {
      const x = ((cl.x + time * cl.v) % (vw + cl.w * 2)) - cl.w;
      const y = cl.y + farY + FAR_EXTRA;
      ctx.fillRect(snap(x), snap(y), snap(cl.w), PX * 3);
      ctx.fillRect(snap(x + cl.w * 0.2), snap(y - PX * 2), snap(cl.w * 0.5), PX * 2);
    }
  }
}
