import * as THREE from "three";

/**
 * Real 3-D scenery behind the tower: a low-poly coastline seen from high up.
 * Sea on the left, sandy beaches, rolling green hills with trees, and snowy
 * mountains on the horizon, under a bright sky with fog and drifting clouds.
 *
 * It has its own perspective camera (the tower uses a long, almost flat lens),
 * so the land below has real depth. The camera rises as the tower is built and
 * slides sideways with the tower's pan, which gives the "we're up high" feel.
 *
 * Units are roughly metres; the camera looks toward -z.
 */

// ── tiny deterministic noise ──────────────────────────────────────────────
function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number) {
  let s = 0;
  let amp = 0.5;
  for (let i = 0; i < 4; i++) {
    s += vnoise(x, z) * amp;
    x *= 2.03;
    z *= 2.03;
    amp *= 0.5;
  }
  return s; // ~0..1
}
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** x where the sea ends, for a given depth z. */
const coastX = (z: number) => -15 + Math.sin(z * 0.011) * 45 + Math.sin(z * 0.037 + 1) * 18;

/** Terrain height (water level is 0). */
function heightAt(x: number, z: number): number {
  const d = x - coastX(z);
  let h: number;
  if (d < 0) {
    h = Math.max(-22, -1.5 + d * 0.12); // sea floor shelves away from the beach
  } else {
    const hills = fbm(x * 0.018 + 10, z * 0.018) * 26 * smooth(0, 70, d);
    h = 0.6 + smooth(0, 14, d) * 2.2 + hills;
  }
  // Mountain range along the horizon (also rises out of the far sea).
  const far = smooth(-460, -700, z);
  if (far > 0) {
    const ridge = 1 - Math.abs(vnoise(x * 0.012 + 3, z * 0.01) * 2 - 1); // sharp crests
    const m = far * (22 + ridge * 55 + fbm(x * 0.03, z * 0.03) * 22);
    h = Math.max(h, m - 6);
  }
  return h;
}

const C = {
  seabed: new THREE.Color("#c9b47a"),
  sand: new THREE.Color("#ecd79a"),
  grassA: new THREE.Color("#69ad45"),
  grassB: new THREE.Color("#4f8f33"),
  rock: new THREE.Color("#8b8a86"),
  rockDark: new THREE.Color("#6f706f"),
  snow: new THREE.Color("#f5f8fb"),
};

function colourFor(h: number, x: number, z: number, out: THREE.Color) {
  if (h < -0.2) return out.copy(C.seabed);
  if (h < 2.2) return out.copy(C.sand);
  if (h < 34) return out.copy(C.grassA).lerp(C.grassB, vnoise(x * 0.05, z * 0.05));
  if (h < 52) return out.copy(C.rock).lerp(C.rockDark, vnoise(x * 0.08, z * 0.08));
  return out.copy(C.snow);
}

export class Landscape {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 9 / 16, 1, 2500);
  private clouds: THREE.Group[] = [];
  private water: THREE.Mesh;

  constructor() {
    const s = this.scene;
    s.background = skyTexture();
    s.fog = new THREE.Fog(0xdcefff, 260, 1100);

    s.add(new THREE.HemisphereLight(0xd6ecff, 0x5d7d3c, 1.35));
    const sun = new THREE.DirectionalLight(0xfff3dc, 2.2);
    sun.position.set(-250, 320, 180);
    s.add(sun);

    s.add(this.buildTerrain());

    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshPhongMaterial({
        color: 0x2d7fd2,
        specular: 0xbfe4ff,
        shininess: 90,
        transparent: true,
        opacity: 0.86,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    s.add(this.water);

    this.buildTrees();
    this.buildClouds();
  }

  private buildTerrain(): THREE.Mesh {
    const W = 1400;
    const D = 900;
    const geo = new THREE.PlaneGeometry(W, D, 220, 150);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -D / 2 + 140); // spans z = 140 .. -760
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      colourFor(h, x, z, col);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  }

  /** Low-poly pines and round trees on the grassy hills (instanced, a few thousand). */
  private buildTrees() {
    const MAX = 2600;
    const pine = new THREE.ConeGeometry(1.6, 5, 6);
    pine.translate(0, 3.6, 0);
    const round = new THREE.IcosahedronGeometry(2.1, 0);
    round.translate(0, 3.4, 0);
    const trunk = new THREE.CylinderGeometry(0.35, 0.45, 2, 5);
    trunk.translate(0, 1, 0);
    const leafMat = new THREE.MeshLambertMaterial({ flatShading: true });
    const pines = new THREE.InstancedMesh(pine, leafMat, MAX);
    const rounds = new THREE.InstancedMesh(round, leafMat.clone(), MAX);
    const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x6b4a2e }), MAX * 2);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const greens = ["#2f6e2e", "#3b7f33", "#2a5f28", "#4a8e3c"].map((c) => new THREE.Color(c));
    const autumn = ["#d9822b", "#e3a13a"].map((c) => new THREE.Color(c));
    let np = 0;
    let nr = 0;
    let nt = 0;
    let seed = 1;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 9000 && (np < MAX || nr < MAX); i++) {
      const x = -650 + rnd() * 1300;
      const z = -420 + rnd() * 540;
      const h = heightAt(x, z);
      if (h < 2.6 || h > 30) continue;
      // Woods grow in patches.
      if (fbm(x * 0.012 + 50, z * 0.012) < 0.42) continue;
      const s = 0.8 + rnd() * 0.9;
      q.setFromAxisAngle(up, rnd() * Math.PI * 2);
      m.compose(v.set(x, h - 0.3, z), q, sc.set(s, s * (0.9 + rnd() * 0.4), s));
      if (rnd() < 0.55 && np < MAX) {
        pines.setMatrixAt(np, m);
        pines.setColorAt(np++, greens[Math.floor(rnd() * greens.length)]);
      } else if (nr < MAX) {
        rounds.setMatrixAt(nr, m);
        rounds.setColorAt(nr++, rnd() < 0.08 ? autumn[Math.floor(rnd() * 2)] : greens[Math.floor(rnd() * greens.length)]);
      } else continue;
      trunks.setMatrixAt(nt++, m);
    }
    pines.count = np;
    rounds.count = nr;
    trunks.count = nt;
    this.scene.add(pines, rounds, trunks);
  }

  /** Puffy low-poly clouds floating at our height. */
  private buildClouds() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25, flatShading: true });
    const geo = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const n = 3 + (i % 3);
      for (let k = 0; k < n; k++) {
        const puff = new THREE.Mesh(geo, mat);
        const r = 6 + ((i * 7 + k * 3) % 6);
        puff.scale.set(r * 1.4, r * 0.7, r);
        puff.position.set(k * r * 1.3 - n * r * 0.6, (k % 2) * r * 0.3, ((k * 5) % 3) * 2);
        g.add(puff);
      }
      g.position.set(-500 + ((i * 197) % 1000), 110 + ((i * 37) % 70), -60 - ((i * 113) % 520));
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * `climb` and `pan` are the tower camera's scroll in tower blocks: climbing
   * raises this camera, panning slides it sideways a little (distant land moves slowly).
   */
  update(time: number, climb: number, pan: number) {
    const cam = this.camera;
    // High above the coast, looking down and out to the horizon; higher as the tower grows.
    const y = 120 + climb * 6;
    const x = 10 + pan * 1.4;
    cam.position.set(x, y, 150);
    cam.lookAt(x - 10, y * 0.12, -170);
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += 0.02 + (i % 4) * 0.008;
      if (c.position.x > 600) c.position.x = -600;
    }
    // Gentle shimmer on the sea.
    (this.water.material as THREE.MeshPhongMaterial).shininess = 80 + Math.sin(time * 0.8) * 20;
  }
}

function skyTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#3f8fe0");
  grad.addColorStop(0.55, "#8fc8f2");
  grad.addColorStop(1, "#e4f4ff");
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
