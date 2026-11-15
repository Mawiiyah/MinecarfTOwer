import * as THREE from "three";

/**
 * Fire-breathing 3D dragon for the DRAGON gift: a chunky red body, long neck,
 * horned head with a moving jaw, spiny back, clawed legs, a swishing tail and
 * two membrane wings. Built from smooth primitives (in blocks), facing +x
 * (flying right), centred on its body. The scene flips it to fly left.
 */
export interface DragonRig {
  root: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  jaw: THREE.Group;
  tail: THREE.Group;
}

const SCALE = 1.15;

export function buildDragon(): DragonRig {
  const mats = new Map<string, THREE.Material>();
  const lambert = (c: number, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const key = c + JSON.stringify(extra);
    let m = mats.get(key);
    if (!m) mats.set(key, (m = new THREE.MeshLambertMaterial({ color: c, ...extra })));
    return m;
  };
  const SKIN = 0xb8402a;
  const DARK = 0x7a2417;
  const BELLY = 0xf2a94e;
  const HORN = 0xf3e6c0;
  const MEMBRANE = 0xd2582f;

  const add = (p: THREE.Object3D, geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, extra: THREE.MeshLambertMaterialParameters = {}) => {
    const mesh = new THREE.Mesh(geo, lambert(color, extra));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    p.add(mesh);
    return mesh;
  };
  const ball = (p: THREE.Object3D, sx: number, sy: number, sz: number, x: number, y: number, z: number, color: number) => {
    const m = add(p, new THREE.SphereGeometry(1, 20, 14), color, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  /** Cylinder between two points (bones, claws). */
  const bone = (p: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, color: number) => {
    const len = a.distanceTo(b);
    const m = add(p, new THREE.CylinderGeometry(r * 0.7, r, len, 8), color);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Torso (fat) and belly
  ball(body, 1.55, 0.95, 0.95, 0, 0, 0, SKIN);
  ball(body, 1.3, 0.62, 0.8, 0.05, -0.38, 0, BELLY);

  // Neck curving up to the head
  ball(body, 0.75, 0.6, 0.6, 1.35, 0.35, 0, SKIN);
  ball(body, 0.65, 0.52, 0.52, 1.9, 0.85, 0, SKIN);
  ball(body, 0.55, 0.45, 0.45, 2.3, 1.2, 0, SKIN);

  // Head, snout, jaw, horns, eyes
  const head = new THREE.Group();
  head.position.set(2.65, 1.3, 0);
  head.rotation.z = -0.15;
  body.add(head);
  ball(head, 0.6, 0.45, 0.48, 0, 0, 0, SKIN);
  ball(head, 0.6, 0.27, 0.34, 0.65, -0.03, 0, SKIN); // snout
  ball(head, 0.1, 0.07, 0.06, 1.1, 0.08, 0.14, DARK); // nostrils
  ball(head, 0.1, 0.07, 0.06, 1.1, 0.08, -0.14, DARK);
  for (const s of [1, -1]) {
    ball(head, 0.1, 0.1, 0.1, 0.22, 0.2, s * 0.38, 0xffd23a); // eyes
    ball(head, 0.04, 0.07, 0.04, 0.27, 0.2, s * 0.46, 0x111111);
    const horn = add(head, new THREE.ConeGeometry(0.1, 0.75, 8), HORN, -0.3, 0.5, s * 0.25);
    horn.rotation.z = Math.PI / 2 + 0.7;
    horn.rotation.x = s * 0.3;
    const horn2 = add(head, new THREE.ConeGeometry(0.06, 0.4, 8), HORN, 0.15, 0.45, s * 0.3);
    horn2.rotation.z = -0.25;
  }
  const jaw = new THREE.Group();
  jaw.position.set(0.3, -0.2, 0);
  head.add(jaw);
  ball(jaw, 0.55, 0.14, 0.28, 0.35, -0.02, 0, BELLY);

  // Spines along the back and neck
  const spine = (x: number, y: number, size: number, tilt: number) => {
    const c = add(body, new THREE.ConeGeometry(size * 0.55, size * 1.6, 6), DARK, x, y, 0);
    c.rotation.z = tilt;
  };
  for (let i = 0; i < 6; i++) spine(-1.1 + i * 0.45, 0.95 - i * 0.01, 0.28, -0.2);
  spine(1.35, 0.9, 0.25, -0.45);
  spine(1.85, 1.35, 0.22, -0.55);
  spine(2.2, 1.65, 0.2, -0.6);

  // Legs with claws
  for (const x of [-0.8, 0.8]) {
    for (const z of [-0.6, 0.6]) {
      const leg = new THREE.Group();
      leg.position.set(x, -0.6, z);
      body.add(leg);
      add(leg, new THREE.CylinderGeometry(0.2, 0.3, 0.75, 10), SKIN, 0, -0.25, 0);
      ball(leg, 0.32, 0.14, 0.26, 0.1, -0.68, 0, DARK);
      for (const cz of [-0.12, 0, 0.12]) {
        const claw = add(leg, new THREE.ConeGeometry(0.04, 0.2, 6), HORN, 0.38, -0.7, cz);
        claw.rotation.z = -Math.PI / 2;
      }
    }
  }

  // Tail: tapering chain that swishes as a unit
  const tail = new THREE.Group();
  tail.position.set(-1.35, 0.05, 0);
  body.add(tail);
  const segs = [
    { x: -0.45, y: 0, r: 0.72 },
    { x: -1.15, y: 0.05, r: 0.58 },
    { x: -1.8, y: 0.15, r: 0.46 },
    { x: -2.4, y: 0.3, r: 0.34 },
    { x: -2.95, y: 0.5, r: 0.24 },
  ];
  for (const s of segs) ball(tail, s.r * 1.1, s.r, s.r, s.x, s.y, 0, SKIN);
  const tip = add(tail, new THREE.ConeGeometry(0.25, 0.7, 4), DARK, -3.45, 0.75, 0);
  tip.rotation.z = Math.PI / 2 + 0.6;
  tip.scale.set(1, 1, 0.5);

  // Wings: arm bone + finger bones + membrane. Pivot at the shoulder; side = +1 / -1 (z).
  const wing = (side: 1 | -1) => {
    const g = new THREE.Group();
    g.position.set(0.35, 0.75, side * 0.5);
    body.add(g);
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, side * z);
    const shoulder = P(0, 0, 0);
    const wrist = P(0.3, 1.3, 1.1);
    const tips = [P(1.5, 2.7, 2.5), P(-0.2, 3.2, 2.9), P(-1.6, 2.6, 2.5), P(-2.2, 1.4, 1.5)];
    const back = P(-1.3, 0.1, 0.3);
    bone(g, shoulder, wrist, 0.1, DARK);
    for (const t of tips) bone(g, wrist, t, 0.055, DARK);
    // membrane triangles fanned around the wrist
    const ring = [...tips, back];
    const verts: number[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < ring.length - 1; i++) tri(wrist, ring[i], ring[i + 1]);
    tri(wrist, back, shoulder);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const mem = add(g, geo, MEMBRANE, 0, 0, 0, { side: THREE.DoubleSide });
    mem.castShadow = false;
    return g;
  };
  const wingL = wing(1);
  const wingR = wing(-1);

  root.scale.setScalar(SCALE);
  return { root, wingL, wingR, jaw, tail };
}
