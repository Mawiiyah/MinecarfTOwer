import * as THREE from "three";

/** Playable characters. All are original voxel designs, built in 1/16-block units. */
export type CharacterKind = "hero" | "penguin" | "knight" | "ninja" | "astronaut" | "builder";

export const CHARACTER_NAMES: Record<CharacterKind, string> = {
  hero: "⚡ Hero",
  penguin: "🐧 Penguin",
  knight: "🛡️ Knight",
  ninja: "🥷 Ninja",
  astronaut: "🧑‍🚀 Astronaut",
  builder: "👷 Builder",
};

/**
 * Animated parts the scene drives. Feet are at the origin, facing +z.
 * Legs swing around their hip pivot, arms around their shoulder pivot.
 */
export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** Dizzy stars orbiting the head (shown while stunned). */
  stars: THREE.Group;
  yaw: number;
}

const U = 1 / 16;

/** All characters are drawn a bit bigger than one block wide. */
export const CHARACTER_SCALE = 1.25;

/** Shared scaffolding: materials cache, a cube helper and limb factories. */
function kit() {
  const mats = new Map<number, THREE.MeshLambertMaterial>();
  const mat = (c: number) => {
    let m = mats.get(c);
    if (!m) mats.set(c, (m = new THREE.MeshLambertMaterial({ color: c })));
    return m;
  };
  const cube = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), mat(color));
    mesh.position.set(x * U, y * U, z * U);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  /** A limb group pivoting at (x, y); `build` adds its cubes relative to the pivot. */
  const limb = (x: number, y: number, build: (g: THREE.Group) => void) => {
    const g = new THREE.Group();
    g.position.set(x * U, y * U, 0);
    build(g);
    body.add(g);
    return g;
  };
  return { cube, root, body, limb };
}

function dizzyStars(root: THREE.Group, headTop: number): THREE.Group {
  const stars = new THREE.Group();
  stars.position.y = (headTop + 4) * U;
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    const s = new THREE.Group();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), starMat));
    s.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), starMat));
    s.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    stars.add(s);
  }
  stars.visible = false;
  root.add(stars);
  return stars;
}

/** Round penguin with a red scarf and a knitted bonnet. */
function penguin(): CharacterRig {
  const { cube, root, body, limb } = kit();
  const BLACK = 0x1f2733;
  const WHITE = 0xf3f6f8;
  const ORANGE = 0xf59e0b;
  const RED = 0xd63a3a;
  const RED_DARK = 0xa82626;

  const legL = limb(-2.2, 2, (g) => cube(g, 3, 2, 4, 0, -1, 0.8, ORANGE));
  const legR = limb(2.2, 2, (g) => cube(g, 3, 2, 4, 0, -1, 0.8, ORANGE));

  cube(body, 11, 11, 9, 0, 7.5, 0, BLACK); // body
  cube(body, 7.5, 8.5, 0.6, 0, 7, 4.6, WHITE); // belly
  cube(body, 10, 7.5, 9, 0, 16, 0, BLACK); // head
  cube(body, 7, 4.2, 0.6, 0, 15.6, 4.6, WHITE); // face
  cube(body, 1.2, 1.6, 0.4, -1.7, 16.4, 5, 0x111111); // eyes
  cube(body, 1.2, 1.6, 0.4, 1.7, 16.4, 5, 0x111111);
  cube(body, 2.4, 1.2, 2, 0, 14.6, 5.4, ORANGE); // beak
  cube(body, 11.2, 1.8, 9.6, 0, 12.4, 0, RED); // scarf
  cube(body, 2, 4.5, 0.8, 3, 9.8, 4.9, RED_DARK); // scarf tail
  cube(body, 9.4, 2.8, 8.6, 0, 20.9, 0, RED); // bonnet
  cube(body, 10.2, 1, 9.2, 0, 19.6, 0, 0xffffff); // bonnet rim
  cube(body, 2.4, 2.4, 2.4, 0, 23.4, 0, 0xffffff); // pom-pom

  // Flippers hang from the shoulders.
  const armL = limb(-6, 11, (g) => cube(g, 1.6, 7, 4, 0, -3.5, 0, BLACK));
  const armR = limb(6, 11, (g) => cube(g, 1.6, 7, 4, 0, -3.5, 0, BLACK));

  return { root, body, legL, legR, armL, armR, stars: dizzyStars(root, 24), yaw: 0 };
}

/** Armoured knight: plumed helmet, blue tabard, a sword on the back. */
function knight(): CharacterRig {
  const { cube, root, body, limb } = kit();
  const STEEL = 0xb9c2cc;
  const STEEL_DARK = 0x7d8794;
  const BLUE = 0x2d5bb5;
  const GOLD = 0xe2b33c;
  const DARK = 0x1c1f24;

  const leg = (x: number) =>
    limb(x, 5, (g) => {
      cube(g, 3, 4, 3, 0, -2, 0, STEEL_DARK);
      cube(g, 3.4, 1.2, 3.8, 0, -4.4, 0.2, DARK);
    });
  const legL = leg(-1.7);
  const legR = leg(1.7);

  cube(body, 8.4, 7.4, 5, 0, 8.6, 0, STEEL); // breastplate
  cube(body, 6, 6.4, 0.6, 0, 8, 2.7, BLUE); // tabard
  cube(body, 2, 2, 0.4, 0, 9.2, 3.1, GOLD); // crest
  cube(body, 8.6, 1, 5.2, 0, 5.6, 0, 0x5a3b22); // belt
  cube(body, 10.4, 2, 5.4, 0, 11.6, 0, STEEL_DARK); // pauldrons

  // Sword on the back, angled.
  const sword = new THREE.Group();
  sword.position.set(0, 10 * U, -3.2 * U);
  sword.rotation.z = 0.5;
  cube(sword, 1, 11, 0.6, 0, 2, 0, 0xdfe6ee);
  cube(sword, 4, 0.8, 0.8, 0, -3.6, 0, GOLD);
  cube(sword, 1, 2.6, 0.8, 0, -5.3, 0, 0x5a3b22);
  body.add(sword);

  const arm = (x: number) =>
    limb(x, 12, (g) => {
      cube(g, 2.6, 5, 2.6, 0, -2.5, 0, STEEL);
      cube(g, 2.9, 1.6, 2.9, 0, -5.6, 0, STEEL_DARK);
    });
  const armL = arm(-5.4);
  const armR = arm(5.4);

  cube(body, 8.4, 8, 8.4, 0, 16.4, 0, STEEL); // helmet
  cube(body, 6.4, 0.9, 0.4, 0, 16.8, 4.3, DARK); // visor slit
  cube(body, 0.8, 4, 0.4, 0, 14.6, 4.3, STEEL_DARK); // nose guard
  cube(body, 1.4, 3, 6, 0, 21.6, -0.5, 0xd63a3a); // plume

  return { root, body, legL, legR, armL, armR, stars: dizzyStars(root, 23), yaw: 0 };
}

/** Ninja in charcoal, with a red headband whose tails stream out behind. */
function ninja(): CharacterRig {
  const { cube, root, body, limb } = kit();
  const SUIT = 0x23262e;
  const SUIT_LIGHT = 0x2f333d;
  const RED = 0xd63a3a;
  const SKIN = 0xe8b98a;

  const leg = (x: number) =>
    limb(x, 5, (g) => {
      cube(g, 3, 4, 3, 0, -2, 0, SUIT);
      cube(g, 3.1, 1, 3.4, 0, -4.5, 0.1, 0x15171c);
    });
  const legL = leg(-1.7);
  const legR = leg(1.7);

  cube(body, 8, 7, 5, 0, 8.5, 0, SUIT); // torso
  cube(body, 4, 6, 0.5, -1, 9, 2.6, SUIT_LIGHT); // wrap fold
  cube(body, 8.2, 1.2, 5.2, 0, 6, 0, RED); // belt
  cube(body, 1.4, 2.4, 0.6, 2.4, 4.6, 2.6, RED); // belt knot tail

  const arm = (x: number) =>
    limb(x, 12, (g) => {
      cube(g, 2.5, 5, 2.5, 0, -2.5, 0, SUIT);
      cube(g, 2.6, 1.2, 2.6, 0, -5.6, 0, SUIT_LIGHT);
    });
  const armL = arm(-5.25);
  const armR = arm(5.25);

  cube(body, 8, 7, 8, 0, 15.5, 0, SUIT); // hood
  cube(body, 6.4, 2, 0.4, 0, 16.2, 4.1, SKIN); // eye strip
  cube(body, 1.2, 1.2, 0.3, -1.6, 16.2, 4.35, 0x111111); // eyes
  cube(body, 1.2, 1.2, 0.3, 1.6, 16.2, 4.35, 0x111111);
  cube(body, 8.6, 1.3, 8.6, 0, 18.2, 0, RED); // headband
  // Tails flow back and down.
  const tails = new THREE.Group();
  tails.position.set(0, 18 * U, -4.6 * U);
  tails.rotation.x = -0.7;
  cube(tails, 1, 0.8, 5, -0.8, 0, -2.4, RED);
  cube(tails, 1, 0.8, 4, 0.9, -0.6, -2, RED);
  body.add(tails);

  return { root, body, legL, legR, armL, armR, stars: dizzyStars(root, 22), yaw: 0 };
}

/** Astronaut: white suit, big helmet with a gold visor, backpack. */
function astronaut(): CharacterRig {
  const { cube, root, body, limb } = kit();
  const SUIT = 0xf1f3f6;
  const SUIT_SHADE = 0xc9ced6;
  const GREY = 0x8c939e;
  const VISOR = 0xe9b949;

  const leg = (x: number) =>
    limb(x, 5, (g) => {
      cube(g, 3.4, 4, 3.4, 0, -2, 0, SUIT);
      cube(g, 3.6, 1.4, 4, 0, -4.3, 0.2, GREY);
    });
  const legL = leg(-1.9);
  const legR = leg(1.9);

  cube(body, 9, 7.4, 6, 0, 8.7, 0, SUIT); // torso
  cube(body, 4, 2.6, 0.5, 0, 9.4, 3.2, SUIT_SHADE); // chest panel
  cube(body, 0.9, 0.9, 0.3, -1, 9.4, 3.5, 0xe23d3d); // buttons
  cube(body, 0.9, 0.9, 0.3, 0.2, 9.4, 3.5, 0x3d8be2);
  cube(body, 0.9, 0.9, 0.3, 1.4, 9.4, 3.5, 0x4cd964);
  cube(body, 9.2, 1, 6.2, 0, 5.4, 0, GREY); // waist ring
  cube(body, 7, 8, 3, 0, 10, -4.4, SUIT_SHADE); // backpack
  cube(body, 1, 2.4, 1, 2.4, 15.2, -4.4, GREY); // antenna

  const arm = (x: number) =>
    limb(x, 12, (g) => {
      cube(g, 2.8, 5, 2.8, 0, -2.5, 0, SUIT);
      cube(g, 3, 1.6, 3, 0, -5.6, 0, GREY);
    });
  const armL = arm(-5.9);
  const armR = arm(5.9);

  cube(body, 9.6, 9, 9.6, 0, 16.6, 0, SUIT); // helmet
  cube(body, 7.4, 5.4, 0.5, 0, 16.6, 4.9, VISOR); // visor
  cube(body, 2.2, 1.2, 0.3, -2, 18, 5.2, 0xfff4c8); // visor glint
  cube(body, 10, 1, 10, 0, 12.4, 0, GREY); // neck ring

  return { root, body, legL, legR, armL, armR, stars: dizzyStars(root, 22), yaw: 0 };
}

/**
 * Original anime-style hero: spiky silver hair, red headband with a gold star,
 * black knee-length coat with a short capelet, all trimmed in gold.
 */
function hero(): CharacterRig {
  const { cube, root, body, limb } = kit();
  const SKIN = 0xf2c9a0;
  const COAT = 0x1b1c22;
  const COAT_LIGHT = 0x272933;
  const GOLD = 0xd4a93c;
  const HAIR = 0xc9ccd2;
  const HAIR_DARK = 0x9a9ea7;
  const RED = 0xc62f2f;
  const DARK = 0x111111;

  const leg = (x: number) =>
    limb(x, 5, (g) => {
      cube(g, 3, 4, 3, 0, -2, 0, COAT_LIGHT); // trousers
      cube(g, 3.4, 1.6, 3.8, 0, -4.3, 0.2, DARK); // boots
    });
  const legL = leg(-1.7);
  const legR = leg(1.7);

  // Coat: torso, then a skirt that opens at the front, gold trim down both edges.
  cube(body, 8.2, 6.6, 5, 0, 9.4, 0, COAT);
  cube(body, 8.6, 3.6, 5.4, 0, 4.4, -0.2, COAT); // coat skirt
  cube(body, 0.6, 9.4, 0.4, -1, 6.6, 2.75, GOLD); // front trim
  cube(body, 0.6, 9.4, 0.4, 1, 6.6, 2.75, GOLD);
  cube(body, 8.8, 0.5, 5.6, 0, 2.6, -0.2, GOLD); // hem
  // Capelet over the shoulders with a gold edge, plus a high collar.
  cube(body, 11, 3, 6.4, 0, 11.6, 0, COAT);
  cube(body, 11.2, 0.6, 6.6, 0, 10, 0, GOLD);
  cube(body, 6.4, 1.6, 5.6, 0, 13.4, -0.2, COAT_LIGHT);
  cube(body, 1.4, 1.4, 0.4, -2.6, 11.4, 3.3, GOLD); // star pin

  const arm = (x: number) =>
    limb(x, 12, (g) => {
      cube(g, 2.6, 5, 2.6, 0, -2.5, 0, COAT);
      cube(g, 2.8, 0.5, 2.8, 0, -4.9, 0, GOLD); // cuff
      cube(g, 2.4, 1.4, 2.4, 0, -5.8, 0, SKIN); // hand
    });
  const armL = arm(-5.5);
  const armR = arm(5.5);

  // Head
  cube(body, 8, 7, 8, 0, 17.4, 0, SKIN);
  cube(body, 1.4, 1.8, 0.4, -1.8, 17.2, 4.1, 0x6b4a1e); // amber eyes
  cube(body, 1.4, 1.8, 0.4, 1.8, 17.2, 4.1, 0x6b4a1e);
  cube(body, 0.6, 0.6, 0.45, -1.5, 17.7, 4.15, 0xffffff);
  cube(body, 0.6, 0.6, 0.45, 2.1, 17.7, 4.15, 0xffffff);
  cube(body, 2.4, 0.5, 0.4, 0.2, 14.8, 4.1, 0x9a5a3a); // grin

  // Headband with a gold star in front.
  cube(body, 8.6, 1.4, 8.6, 0, 19.8, 0, RED);
  cube(body, 1.6, 1.6, 0.4, 1.8, 19.8, 4.4, GOLD);

  // Spiky hair: a cap, side tufts, and spikes fanning up and back.
  cube(body, 8.6, 2.6, 8.6, 0, 21.6, -0.2, HAIR);
  cube(body, 8.4, 4, 1.2, 0, 18.6, -3.9, HAIR);
  cube(body, 1, 3, 3, -4.3, 18.2, 1.4, HAIR_DARK);
  cube(body, 1, 3, 3, 4.3, 18.2, 1.4, HAIR_DARK);
  cube(body, 1.8, 1.6, 0.8, -2.2, 18.6, 4.2, HAIR); // fringe
  cube(body, 1.8, 2, 0.8, 0.4, 18.4, 4.2, HAIR);
  const spikes: [number, number, number, number, number][] = [
    // x, y, z, tilt sideways, tilt back
    [-3.2, 24, 1, 0.55, 0.1],
    [-1.2, 25, 0.5, 0.2, 0.15],
    [1.2, 25.2, 0.2, -0.2, 0.2],
    [3.3, 24, 0.8, -0.6, 0.1],
    [-2, 24, -2.6, 0.35, 0.6],
    [1.6, 24.2, -2.8, -0.3, 0.6],
    [0, 23.4, -4, 0, 1],
  ];
  for (const [x, y, z, rz, rx] of spikes) {
    const g = new THREE.Group();
    g.position.set(x / 16, y / 16, z / 16);
    g.rotation.set(-rx, 0, rz);
    cube(g, 2, 4, 2, 0, 0, 0, HAIR);
    cube(g, 1, 2, 1, 0, 2.8, 0, HAIR_DARK);
    body.add(g);
  }

  return { root, body, legL, legR, armL, armR, stars: dizzyStars(root, 27), yaw: 0 };
}

/** The original hard-hat builder. */
function builder(): CharacterRig {
  const { cube, root, body, limb } = kit();
  const SKIN = 0xf1c27d;
  const SHIRT = 0xe8732c;
  const OVERALLS = 0x2f5fbf;
  const BOOTS = 0x4a3020;
  const HAT = 0xffcc33;
  const HAT_DARK = 0xd9a400;
  const HAIR = 0x6b4423;
  const DARK = 0x1a1a1a;

  const leg = (x: number) =>
    limb(x, 5, (g) => {
      cube(g, 3, 4, 3, 0, -2, 0, OVERALLS);
      cube(g, 3.2, 1, 3.6, 0, -4.5, 0.2, BOOTS);
    });
  const legL = leg(-1.7);
  const legR = leg(1.7);

  cube(body, 8, 3, 5, 0, 6.5, 0, OVERALLS);
  cube(body, 8, 4, 5, 0, 10, 0, SHIRT);
  cube(body, 6, 2.5, 0.6, 0, 8.6, 2.6, OVERALLS);
  cube(body, 1, 2, 0.6, -2.5, 10.8, 2.6, OVERALLS);
  cube(body, 1, 2, 0.6, 2.5, 10.8, 2.6, OVERALLS);
  cube(body, 1.6, 1, 0.4, 0, 8.6, 3, HAT);

  const arm = (x: number) =>
    limb(x, 12, (g) => {
      cube(g, 2.5, 5, 2.5, 0, -2.5, 0, SHIRT);
      cube(g, 2.5, 1.2, 2.5, 0, -5.6, 0, SKIN);
    });
  const armL = arm(-5.25);
  const armR = arm(5.25);

  cube(body, 8, 7, 8, 0, 15.5, 0, SKIN);
  cube(body, 8.4, 3.5, 8.4, 0, 17.4, -0.4, HAIR);
  cube(body, 8.2, 7, 1, 0, 15.5, -3.7, HAIR);
  cube(body, 1.2, 1.6, 0.4, -1.8, 15.6, 4.1, DARK);
  cube(body, 1.2, 1.6, 0.4, 1.8, 15.6, 4.1, DARK);
  cube(body, 1.2, 1.2, 0.8, 0, 14.2, 4.2, 0xe0a46a);
  cube(body, 2.6, 0.6, 0.4, 0, 12.9, 4.1, 0x9a5a3a);

  cube(body, 8.4, 2.6, 8.4, 0, 20.3, 0, HAT);
  cube(body, 9.4, 0.7, 9.4, 0, 19.1, 0, HAT_DARK);
  cube(body, 9.4, 0.6, 2, 0, 19.2, 5.2, HAT_DARK);
  cube(body, 1.2, 3, 8.8, 0, 20.5, 0, HAT_DARK);

  return { root, body, legL, legR, armL, armR, stars: dizzyStars(root, 22), yaw: 0 };
}

const BUILDERS: Record<CharacterKind, () => CharacterRig> = { hero, penguin, knight, ninja, astronaut, builder };

export function buildCharacter(kind: CharacterKind): CharacterRig {
  return (BUILDERS[kind] ?? penguin)();
}
