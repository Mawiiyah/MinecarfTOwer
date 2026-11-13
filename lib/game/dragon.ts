import * as THREE from "three";

/**
 * Original voxel dragon for the DRAGON gift: violet body, gold belly, little
 * horns and big bat wings. Built in 1/16-block units, facing +x (flying right),
 * centred on its body. The scene flips it to fly left.
 */
export interface DragonRig {
  root: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  jaw: THREE.Group;
  tail: THREE.Group;
}

const U = 1 / 16;

export function buildDragon(): DragonRig {
  const mats = new Map<number, THREE.MeshLambertMaterial>();
  const mat = (c: number) => {
    let m = mats.get(c);
    if (!m) mats.set(c, (m = new THREE.MeshLambertMaterial({ color: c })));
    return m;
  };
  const cube = (p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), mat(color));
    mesh.position.set(x * U, y * U, z * U);
    mesh.castShadow = true;
    p.add(mesh);
    return mesh;
  };
  const BODY = 0x7c3aed;
  const BODY_DARK = 0x5b21b6;
  const BELLY = 0xf5c542;
  const WING = 0xa78bfa;
  const HORN = 0xf8fafc;

  const root = new THREE.Group();
  // Body and belly
  cube(root, 22, 10, 10, 0, 0, 0, BODY);
  cube(root, 18, 3, 8, 0, -4.6, 0, BELLY);
  // Spikes along the back
  for (let i = 0; i < 5; i++) cube(root, 2, 3, 2, -8 + i * 4, 6, 0, BODY_DARK);
  // Neck + head
  cube(root, 6, 8, 7, 12, 4, 0, BODY);
  const head = new THREE.Group();
  head.position.set(18 * U, 8 * U, 0);
  root.add(head);
  cube(head, 10, 7, 9, 0, 0, 0, BODY);
  cube(head, 6, 3, 7, 6, -1, 0, BODY); // snout
  cube(head, 1.6, 1.6, 0.6, 2, 1.8, 4.6, 0xffffff); // eyes
  cube(head, 0.9, 0.9, 0.6, 2.4, 1.8, 4.9, 0x111111);
  cube(head, 1.6, 1.6, 0.6, 2, 1.8, -4.6, 0xffffff);
  cube(head, 0.9, 0.9, 0.6, 2.4, 1.8, -4.9, 0x111111);
  cube(head, 1.5, 4, 1.5, -2, 5, 2.5, HORN);
  cube(head, 1.5, 4, 1.5, -2, 5, -2.5, HORN);
  const jaw = new THREE.Group();
  jaw.position.set(4 * U, -3 * U, 0);
  head.add(jaw);
  cube(jaw, 7, 2, 6, 3, -1, 0, BELLY);
  // Legs (tucked)
  for (const x of [-6, 6]) for (const z of [-3.5, 3.5]) cube(root, 3, 4, 3, x, -6.5, z, BODY_DARK);
  // Tail
  const tail = new THREE.Group();
  tail.position.set(-11 * U, 0, 0);
  root.add(tail);
  cube(tail, 10, 6, 6, -5, 0, 0, BODY);
  cube(tail, 8, 4, 4, -13, 1, 0, BODY);
  cube(tail, 4, 5, 2, -18.5, 2.5, 0, BELLY);
  // Wings pivot at the shoulders.
  const wing = (side: 1 | -1) => {
    const g = new THREE.Group();
    g.position.set(2 * U, 5 * U, side * 5 * U);
    cube(g, 12, 1.2, 14, 0, 0, side * 7, WING);
    cube(g, 8, 1.2, 10, -2, 0, side * 18, WING);
    cube(g, 14, 1.6, 1.6, 0, 0.6, side * 7, BODY_DARK); // arm bone
    root.add(g);
    return g;
  };
  const wingL = wing(1);
  const wingR = wing(-1);

  root.scale.setScalar(2.2); // a big beast: about three blocks long
  return { root, wingL, wingR, jaw, tail };
}
