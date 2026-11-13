import * as THREE from "three";
import { BLAST_RADIUS, BORDER, BOX_H, BOX_W, BOX_X, BOX_Y, CELL, COLS, H, MAX_PARTICLES, ROWS, TNT_SIZE, W } from "./constants";
import type { TextureName, TextureSet } from "./textures";
import type { BlockType } from "./types";
import type { Builder, Cell, Dragon, Particle, Ring, Tnt } from "./engine";
import { buildDragon, type DragonRig } from "./dragon";
import { buildCharacter, CHARACTER_SCALE, type CharacterKind, type CharacterRig } from "./characters";
import { Landscape } from "./landscape";

/**
 * Three.js renderer for the box, blocks, TNT, builder and effects.
 *
 * The simulation still runs in 2-D game pixels (x right, y down, 1080x1920).
 * Here 1 world unit = 1 CELL, y points up, the box floor is y = 0 and the
 * front faces of the blocks sit on the z = 0 plane. The camera uses an
 * off-axis projection that keeps the z = 0 plane locked to the old 2-D layout,
 * so the HUD (drawn on a 2-D canvas on top) still lines up with the box while
 * the camera sways for parallax and you see the tops and sides of the blocks.
 */

/** Game pixels → world units. */
export const gx = (px: number) => (px - W / 2) / CELL;
export const gy = (py: number) => (BOX_Y + BOX_H - py) / CELL;
/** Centre depth of the play plane (blocks span z = -1..0). */
const CZ = -0.5;
/** World x of the box centre (the tower is off-centre, against the right edge). */
const BX = gx(BOX_X + BOX_W / 2);

/** Camera distance from the z = 0 plane, and its resting height (world units). */
/**
 * Camera distance from the z = 0 plane. Far away = a long lens = almost no
 * perspective, so the tower is seen straight on: flat front faces, no tops or
 * sides (the reference look). Lower it (e.g. 1664 / CELL) for a stronger 3-D look.
 */
const CAM_D = 3200 / CELL;
/** How far above the middle of the screen the camera sits: we look down on the tower a little. */
const CAM_LIFT = 1.6;
/** Gentle camera sway, in world units (0 = perfectly still, like the reference). */
const SWAY = 0;

const BLOCK_TYPES: BlockType[] = ["grass", "dirt", "stone", "gold", "diamond", "aqua"];
const MAX_DEBRIS = 1400;
const MAX_FX = 24;
const MAX_LIGHTS = 4;

export interface SceneView {
  grid: (Cell | null)[];
  tnts: Tnt[];
  builder: Builder;
  particles: Particle[];
  rings: Ring[];
  time: number;
  shakeX: number;
  shakeY: number;
  /** 0 = off, otherwise frame glow strength (box is full). */
  glow: number;
  /** Camera climb in game pixels (screen y = game y + scroll). */
  scroll: number;
  /** Camera pan in game pixels (screen x = game x + scrollX). */
  scrollX: number;
  dragon: Dragon | null;
}

function pixelTexture(src: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.Texture {
  const t = new THREE.CanvasTexture(src);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.anisotropy = 4;
  if (repeatX !== 1 || repeatY !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
  }
  return t;
}

/** High-res texture with normal (smooth) filtering, for non-pixel-art faces. */
function smoothTexture(src: HTMLCanvasElement, renderer: THREE.WebGLRenderer): THREE.Texture {
  const t = new THREE.CanvasTexture(src);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

/** Box whose UVs repeat the texture every `tile` world units on every face (no stretching). */
function tiledBox(w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z; 4 vertices each.
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  return g;
}

const PARTICLE_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vColor = aColor;
  }
`;
const SOFT_FRAG = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * smoothstep(0.5, 0.25, r));
  }
`;
const SQUARE_FRAG = /* glsl */ `
  varying vec4 vColor;
  void main() { gl_FragColor = vColor; }
`;

/** A batch of camera-facing point sprites (smoke or sparks). */
class PointBatch {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private geo: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  n = 0;

  constructor(capacity: number, frag: string, additive: boolean) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: frag,
      uniforms: { uScale: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  push(x: number, y: number, z: number, c: THREE.Color, a: number, size: number) {
    if (this.n * 3 >= this.pos.length) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 4] = c.r;
    this.col[i * 4 + 1] = c.g;
    this.col[i * 4 + 2] = c.b;
    this.col[i * 4 + 3] = a;
    this.size[i] = size;
  }

  commit() {
    for (const name of ["position", "aColor", "aSize"]) (this.geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
    this.n = 0;
  }
}

interface TntMesh {
  mesh: THREE.Mesh;
  mats: THREE.MeshLambertMaterial[];
  spinY: number;
}

type BuilderRig = CharacterRig;

interface Fx {
  flash: THREE.Mesh;
  ring: THREE.Mesh;
}

export class Scene3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 9 / 16, CAM_D * 0.5, CAM_D * 2);
  /** Everything that shakes. */
  private world = new THREE.Group();
  private blocks = new Map<BlockType, THREE.InstancedMesh>();
  private frameMats: THREE.MeshLambertMaterial[] = [];
  private tntGeo: THREE.BoxGeometry;
  private tntTex: { side: THREE.Texture; top: THREE.Texture; bottom: THREE.Texture };
  private tntPool: TntMesh[] = [];
  private tntLive = new Map<number, TntMesh>();
  private rig: BuilderRig;
  /** 3-D scenery drawn behind the tower with its own camera. */
  private landscape = new Landscape();
  private dragonRig: DragonRig;
  private characterKind: CharacterKind = "penguin";
  private debris: THREE.InstancedMesh;
  private smoke = new PointBatch(MAX_PARTICLES, SOFT_FRAG, false);
  private sparks = new PointBatch(MAX_PARTICLES, SQUARE_FRAG, true);
  private fx: Fx[] = [];
  private lights: THREE.PointLight[] = [];
  private colorCache = new Map<string, THREE.Color>();
  private rawColorCache = new Map<string, THREE.Color>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  // Viewport (game pixels) as set by resize().
  private vw = W;
  private vh = 1920;
  private offX = 0;
  private offY = 0;
  private camX = 0;
  private camY = 0;
  private scroll = 0;
  private scrollX = 0;

  constructor(canvas: HTMLCanvasElement, tex: TextureSet) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false; // landscape first, then the tower on top
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.add(this.world);

    this.addLights();
    this.buildBox(tex);
    this.buildBlocks(tex);

    this.tntGeo = new THREE.BoxGeometry(TNT_SIZE / CELL, TNT_SIZE / CELL, TNT_SIZE / CELL);
    this.tntTex = { side: pixelTexture(tex.tnt), top: pixelTexture(tex.tntTop), bottom: pixelTexture(tex.tntBottom) };

    this.rig = buildCharacter(this.characterKind);
    this.world.add(this.rig.root);
    this.dragonRig = buildDragon();
    this.dragonRig.root.visible = false;
    this.world.add(this.dragonRig.root);

    const debrisMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), debrisMat, MAX_DEBRIS);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.setColorAt(0, new THREE.Color());
    this.debris.count = 0;
    this.debris.frustumCulled = false;
    this.debris.castShadow = true;
    this.world.add(this.debris, this.smoke.points, this.sparks.points);

    for (let i = 0; i < MAX_FX; i++) {
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 1, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      flash.renderOrder = ring.renderOrder = 4;
      flash.visible = ring.visible = false;
      this.world.add(flash, ring);
      this.fx.push({ flash, ring });
    }
  }

  // ───────────────────────────── setup ─────────────────────────────

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xc9d8ff, 0x5a4632, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.1);
    sun.target.position.set(BX, ROWS / 2, CZ);
    sun.position.set(BX - 9, ROWS / 2 + 23, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -(COLS / 2 + 4);
    sc.right = COLS / 2 + 4;
    sc.top = ROWS / 2 + 6;
    sc.bottom = -(ROWS / 2 + 6);
    sc.near = 5;
    sc.far = 80;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);

    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffa24a, 0, 9, 1.4);
      this.world.add(l);
      this.lights.push(l);
    }
  }

  /** Open box: a bedrock floor and see-through glass side walls; nothing behind the blocks. */
  private buildBox(tex: TextureSet) {
    const t = BORDER / CELL;
    const bedrock = pixelTexture(tex.bedrock);
    bedrock.wrapS = bedrock.wrapT = THREE.RepeatWrapping;
    const glass = pixelTexture(tex.glass);
    glass.wrapS = glass.wrapT = THREE.RepeatWrapping;
    const mat = (map: THREE.Texture, seeThrough: boolean) => {
      const m = new THREE.MeshLambertMaterial({
        map,
        emissive: 0xffd54a,
        emissiveIntensity: 0,
        transparent: seeThrough,
        depthWrite: !seeThrough,
      });
      this.frameMats.push(m);
      return m;
    };
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, tile: number, m: THREE.Material, shadow: boolean) => {
      const mesh = new THREE.Mesh(tiledBox(w, h, d, tile), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.world.add(mesh);
    };
    const depth = 1.2;
    const zMid = -1.05 + depth / 2; // spans z = -1.05 .. 0.15
    add(COLS + 2 * t, t, depth, BX, -t / 2, zMid, t, mat(bedrock, false), true); // floor
    const wall = mat(glass, true);
    add(t, ROWS + t, depth, BX - COLS / 2 - t / 2, (ROWS - t) / 2, zMid, 1, wall, false); // left wall
    add(t, ROWS + t, depth, BX + COLS / 2 + t / 2, (ROWS - t) / 2, zMid, 1, wall, false); // right wall

    // No back wall: empty cells are fully open, so the scenery shows through unobstructed.
  }

  private buildBlocks(tex: TextureSet) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const lam = (name: TextureName) =>
      new THREE.MeshLambertMaterial({ map: name === "aqua" ? smoothTexture(tex[name], this.renderer) : pixelTexture(tex[name]) });
    for (const type of BLOCK_TYPES) {
      let material: THREE.Material | THREE.Material[];
      if (type === "grass") {
        const side = lam("grass");
        material = [side, side, lam("grassTop"), lam("dirt"), side, side];
      } else {
        material = lam(type);
      }
      const mesh = new THREE.InstancedMesh(geo, material, COLS * ROWS);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.world.add(mesh);
      this.blocks.set(type, mesh);
    }
  }

  /** Swaps the player character (keeps where it is and which way it faces). */
  setCharacter(kind: CharacterKind) {
    if (kind === this.characterKind) return;
    const old = this.rig;
    const next = buildCharacter(kind);
    next.yaw = old.yaw;
    next.root.position.copy(old.root.position);
    this.world.remove(old.root);
    old.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.world.add(next.root);
    this.rig = next;
    this.characterKind = kind;
  }

  // ───────────────────────────── viewport ─────────────────────────────

  /** `vw`/`vh` is the visible area in game pixels; the play area sits at (offX, offY) inside it. */
  resize(cssW: number, cssH: number, vw: number, vh: number, offX: number, offY: number) {
    this.vw = vw;
    this.vh = vh;
    this.offX = offX;
    this.offY = offY;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssW, cssH, false);
    this.landscape.resize(cssW / Math.max(1, cssH));
    const scale = ((cssH * dpr) / vh) * CAM_D;
    this.smoke.material.uniforms.uScale.value = scale;
    this.sparks.material.uniforms.uScale.value = scale;
  }

  /** Off-axis projection: the camera moves, but the z = 0 plane stays where the 2-D layout put it. */
  private updateCamera() {
    const cam = this.camera;
    cam.position.set(this.camX, this.camY, CAM_D);
    cam.rotation.set(0, 0, 0);
    cam.updateMatrixWorld();
    const k = cam.near / CAM_D;
    const left = (gx(-this.offX - this.scrollX) - this.camX) * k;
    const right = (gx(this.vw - this.offX - this.scrollX) - this.camX) * k;
    const top = (gy(-this.offY - this.scroll) - this.camY) * k;
    const bottom = (gy(this.vh - this.offY - this.scroll) - this.camY) * k;
    cam.projectionMatrix.makePerspective(left, right, top, bottom, cam.near, cam.far);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }

  /** Projects a game-pixel point (z in pixels, 0 = front face of the blocks) to play-area pixels for the HUD. */
  toScreen(x: number, y: number, z: number, out: { x: number; y: number }) {
    this.v.set(gx(x) + this.world.position.x, gy(y) + this.world.position.y, z / CELL).project(this.camera);
    out.x = ((this.v.x + 1) / 2) * this.vw - this.offX;
    out.y = ((1 - this.v.y) / 2) * this.vh - this.offY;
    return out;
  }

  // ───────────────────────────── frame ─────────────────────────────

  render(view: SceneView) {
    const t = view.time;
    this.scroll = view.scroll;
    this.scrollX = view.scrollX;
    this.camX = gx(W / 2 - view.scrollX) + Math.sin(t * 0.21) * 1.6 * SWAY;
    // Stay level with the middle of what is on screen, a little above it, as the camera climbs.
    this.camY = gy(H / 2 - view.scroll) + CAM_LIFT + Math.sin(t * 0.13) * 0.6 * SWAY;
    this.updateCamera();
    this.world.position.set(view.shakeX / CELL, -view.shakeY / CELL, 0);

    for (const m of this.frameMats) m.emissiveIntensity = view.glow;
    this.syncBlocks(view.grid);
    this.syncTnts(view.tnts);
    this.syncBuilder(view.builder, t);
    this.syncDragon(view.dragon, t);
    this.syncParticles(view.particles);
    this.syncRings(view.rings);

    this.landscape.update(t, view.scroll / CELL, -view.scrollX / CELL);
    this.renderer.clear();
    this.renderer.render(this.landscape.scene, this.landscape.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  }

  private syncBlocks(grid: (Cell | null)[]) {
    for (const mesh of this.blocks.values()) mesh.count = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r * COLS + c];
        if (!cell) continue;
        const mesh = this.blocks.get(cell.type)!;
        this.m.makeTranslation(BX + c - COLS / 2 + 0.5, ROWS - r - 0.5 + cell.fall / CELL, CZ);
        mesh.setMatrixAt(mesh.count++, this.m);
      }
    }
    for (const mesh of this.blocks.values()) mesh.instanceMatrix.needsUpdate = true;
  }

  private syncTnts(tnts: Tnt[]) {
    const seen = new Set<number>();
    for (const t of tnts) {
      seen.add(t.id);
      let tm = this.tntLive.get(t.id);
      if (!tm) {
        tm = this.tntPool.pop() ?? this.makeTnt();
        tm.spinY = (Math.random() - 0.5) * 2;
        tm.mesh.visible = true;
        this.tntLive.set(t.id, tm);
      }
      const p = t.age / t.fuse;
      const swell = p > 0.85 ? 1 + ((p - 0.85) / 0.15) * 0.2 : 1;
      const flash = Math.sin(t.age * (2 + p * 9) * Math.PI * 2) > 0 ? 0.55 : 0;
      for (const m of tm.mats) m.emissiveIntensity = flash;
      tm.mesh.position.set(gx(t.x), gy(t.y), CZ);
      // Tumbles in 3-D while falling; `rot` settles to 0 on landing, so it sits flat.
      tm.mesh.rotation.set(t.rot * 0.6, t.rot * tm.spinY, -t.rot);
      tm.mesh.scale.setScalar(swell);
    }
    for (const [id, tm] of this.tntLive) {
      if (seen.has(id)) continue;
      tm.mesh.visible = false;
      this.tntLive.delete(id);
      this.tntPool.push(tm);
    }
  }

  private makeTnt(): TntMesh {
    const mk = (map: THREE.Texture) => new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveIntensity: 0 });
    const side = mk(this.tntTex.side);
    const top = mk(this.tntTex.top);
    const bottom = mk(this.tntTex.bottom);
    const mesh = new THREE.Mesh(this.tntGeo, [side, side, top, bottom, side, side]);
    mesh.castShadow = mesh.receiveShadow = true;
    this.world.add(mesh);
    return { mesh, mats: [side, top, bottom], spinY: 0 };
  }

  private syncBuilder(b: Builder, time: number) {
    const rig = this.rig;
    const walking = b.step < 1 && b.stun <= 0 && !b.flung;
    const phase = walking ? Math.sin((b.walkTime / Math.max(0.12, b.stepDur)) * Math.PI * 2) : 0;
    const bob = walking ? Math.abs(phase) * 5 : 0;

    rig.root.position.set(gx(b.x), gy(b.y - bob), CZ);
    rig.root.scale.setScalar(CHARACTER_SCALE);
    // Face the viewer; only a slight turn toward the walking direction while moving.
    const targetYaw = walking ? (b.dir === "right" ? 0.35 : -0.35) : 0;
    rig.yaw += (targetYaw - rig.yaw) * 0.3;
    rig.root.rotation.y = rig.yaw;

    rig.legL.rotation.x = phase * 0.7;
    rig.legR.rotation.x = -phase * 0.7;
    rig.armL.rotation.x = -phase * 0.8;
    rig.armR.rotation.x = phase * 0.8;

    if (b.flung) {
      rig.body.rotation.set(Math.sin(time * 14) * 0.6, 0, Math.sin(time * 18) * 0.5);
      rig.armL.rotation.z = -2.4;
      rig.armR.rotation.z = 2.4;
    } else {
      rig.body.rotation.set(0, 0, 0);
      rig.armL.rotation.z = 0;
      rig.armR.rotation.z = 0;
    }

    rig.stars.visible = b.stun > 0 && !b.flung;
    rig.stars.rotation.y = time * 6;
  }

  private syncDragon(d: Dragon | null, time: number) {
    const r = this.dragonRig;
    r.root.visible = !!d;
    if (!d) return;
    r.root.position.set(gx(d.x), gy(d.y), CZ + 0.6);
    r.root.rotation.set(0, d.dir > 0 ? -0.35 : Math.PI + 0.35, Math.sin(time * 4) * 0.06);
    const flap = Math.sin(time * 10);
    r.wingL.rotation.x = flap * 0.7;
    r.wingR.rotation.x = -flap * 0.7;
    r.jaw.rotation.z = -0.25 - Math.abs(Math.sin(time * 12)) * 0.2;
    r.tail.rotation.y = Math.sin(time * 5) * 0.3;
  }

  private parsed(hex: string, raw: boolean): THREE.Color {
    const cache = raw ? this.rawColorCache : this.colorCache;
    let c = cache.get(hex);
    if (!c) {
      // Point sprites use a raw ShaderMaterial (no colour-space conversion), so they take sRGB values as-is.
      c = new THREE.Color().setStyle(hex, raw ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace);
      cache.set(hex, c);
    }
    return c;
  }

  private syncParticles(list: Particle[]) {
    let d = 0;
    for (const p of list) {
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      const x = gx(p.x);
      const y = gy(p.y);
      const z = (p.z ?? -CELL / 2) / CELL;
      if (p.kind === "debris") {
        if (d >= MAX_DEBRIS) continue;
        const s = (p.size / CELL) * Math.min(1, a * 2.5);
        this.e.set(p.rot, p.rot * 0.7, p.rot * 0.4);
        this.q.setFromEuler(this.e);
        this.m.compose(this.v.set(x, y, z), this.q, this.s.set(s, s, s));
        this.debris.setMatrixAt(d, this.m);
        this.debris.setColorAt(d, this.parsed(p.color, false));
        d++;
      } else if (p.kind === "smoke") {
        this.smoke.push(x, y, z, this.parsed(p.color, true), a * 0.6, p.size);
      } else if (p.kind === "spark") {
        this.sparks.push(x, y, z, this.parsed(p.color, true), a, p.size);
      }
    }
    this.debris.count = d;
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    this.smoke.commit();
    this.sparks.commit();
  }

  private syncRings(rings: Ring[]) {
    const R = BLAST_RADIUS / CELL;
    for (let i = 0; i < MAX_FX; i++) {
      const fx = this.fx[i];
      const r = rings[rings.length - 1 - i]; // newest first
      if (!r) {
        fx.flash.visible = fx.ring.visible = false;
        continue;
      }
      const p = r.age / 0.4;
      const x = gx(r.x);
      const y = gy(r.y);
      fx.flash.visible = p < 0.35;
      if (fx.flash.visible) {
        fx.flash.position.set(x, y, CZ);
        fx.flash.scale.setScalar(R * (0.4 + p));
        (fx.flash.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - p / 0.35);
      }
      fx.ring.visible = true;
      fx.ring.position.set(x, y, 0.2);
      fx.ring.scale.setScalar(R * (0.3 + p * 1.1));
      (fx.ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - p);
    }
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = this.lights[i];
      const r = rings[rings.length - 1 - i];
      if (!r) {
        l.intensity = 0;
        continue;
      }
      const p = r.age / 0.4;
      l.position.set(gx(r.x), gy(r.y), 0.8);
      l.intensity = 60 * (1 - p) * (1 - p);
    }
  }
}
