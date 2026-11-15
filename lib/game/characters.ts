import * as THREE from "three";

/** Playable characters. All are original voxel designs, built in 1/16-block units. */
export type CharacterKind = "hero" | "penguin" | "knight" | "ninja" | "astronaut" | "builder" | "kuromi";

export const CHARACTER_NAMES: Record<CharacterKind, string> = {
  hero: "⚡ Hero",
  penguin: "🐧 Penguin",
  knight: "🛡️ Knight",
  ninja: "🥷 Ninja",
  astronaut: "🧑‍🚀 Astronaut",
  builder: "👷 Builder",
  kuromi: "🖤 Kuromi",
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

/**
 * Cute Astronaut Hero: blocky white suit, big stepped helmet with dark midnight-blue
 * star-sparkle visor, orange/blue mission stripes, chest panel, laser gadget, and
 * PLSS jetpack with telemetry screens and thruster rockets.
 */
function astronaut(): CharacterRig {
  const { cube, root, body, limb } = kit();
  const WHITE = 0xf4f7fb;
  const SUIT_SHADE = 0xd1d7e2;
  const GREY_DARK = 0x3d4452;
  const GREY_MID = 0x778296;
  const VISOR_DARK = 0x14203b;
  const VISOR_MID = 0x223d72;
  const ORANGE = 0xf37121;
  const BLUE = 0x3462d4;
  const RED = 0xeb3b5a;
  const CYAN = 0x2bcbba;
  const YELLOW = 0xf7b731;
  const JET_FIRE = 0xfffa65;

  // 1. Legs & Boots (pivot at y=5)
  const leg = (x: number) =>
    limb(x, 5, (g) => {
      // Boot sole & foot
      cube(g, 3.8, 1.2, 4.4, 0, -4.4, 0.4, GREY_DARK);
      cube(g, 3.6, 2.0, 4.2, 0, -3.2, 0.3, WHITE);
      cube(g, 3.6, 1.2, 1.2, 0, -2.8, 2.0, SUIT_SHADE);
      // Double mission stripes: Orange + Blue
      cube(g, 3.8, 0.7, 3.8, 0, -1.9, 0, ORANGE);
      cube(g, 3.8, 0.7, 3.8, 0, -1.2, 0, BLUE);
      // Thigh
      cube(g, 3.4, 3.2, 3.4, 0, 0.4, 0, WHITE);
    });
  const legL = leg(-2.0);
  const legR = leg(2.0);

  // 2. Torso
  cube(body, 8.8, 1.2, 6.2, 0, 5.8, 0, SUIT_SHADE); // waist belt
  cube(body, 2.4, 1.0, 0.6, 0, 5.8, 3.2, GREY_DARK); // belt buckle
  cube(body, 8.8, 6.8, 6.0, 0, 9.4, 0, WHITE); // main suit torso
  cube(body, 9.2, 4.4, 5.4, 0, 9.4, 0, SUIT_SHADE); // side ribbing

  // Chest Control Panel (front)
  cube(body, 4.6, 3.6, 0.8, 0, 9.8, 3.3, SUIT_SHADE); // housing
  cube(body, 4.0, 3.0, 0.3, 0, 9.8, 3.8, WHITE); // faceplate
  // 4 Square Buttons (2x2 grid: top cyan, bottom red)
  cube(body, 1.0, 0.9, 0.3, -1.0, 10.5, 4.0, CYAN);
  cube(body, 1.0, 0.9, 0.3, 1.0, 10.5, 4.0, CYAN);
  cube(body, 1.0, 0.9, 0.3, -1.0, 9.1, 4.0, RED);
  cube(body, 1.0, 0.9, 0.3, 1.0, 9.1, 4.0, RED);

  // 3. Arms (pivot at y=11.5)
  const arm = (x: number, isRight: boolean) =>
    limb(x, 11.5, (g) => {
      cube(g, 3.2, 2.0, 3.2, 0, -0.4, 0, WHITE); // shoulder
      // Double mission stripes: Orange + Blue
      cube(g, 3.4, 0.7, 3.4, 0, -1.8, 0, ORANGE);
      cube(g, 3.4, 0.7, 3.4, 0, -2.5, 0, BLUE);
      cube(g, 3.0, 2.8, 3.0, 0, -4.2, 0, WHITE); // forearm
      cube(g, 3.2, 2.0, 3.2, 0, -6.2, 0, SUIT_SHADE); // glove
      cube(g, 1.2, 1.2, 1.4, isRight ? -1.4 : 1.4, -6.0, 0.6, GREY_DARK); // thumb

      // Hand-held laser blaster / scanner on right hand
      if (isRight) {
        cube(g, 1.6, 3.0, 2.4, 0.2, -7.0, 1.4, GREY_DARK); // gadget body
        cube(g, 1.2, 1.2, 0.8, 0.2, -7.0, 2.8, CYAN); // scanner lens
        cube(g, 1.4, 0.8, 1.2, 0.2, -6.0, 1.4, ORANGE); // orange power cell
      }
    });
  const armL = arm(-5.8, false);
  const armR = arm(5.8, true);

  // 4. Helmet (chunky stepped white helmet with huge dark visor & star sparkle)
  cube(body, 8.4, 1.2, 8.4, 0, 13.0, 0, GREY_DARK); // neck collar
  cube(body, 8.0, 0.6, 8.0, 0, 13.6, 0, ORANGE); // neck seal

  // Main Helmet Cube & beveled top layers
  cube(body, 12.0, 10.0, 11.0, 0, 18.5, 0.4, WHITE);
  cube(body, 12.8, 8.4, 9.8, 0, 18.5, 0.4, WHITE); // side curve
  cube(body, 10.6, 1.4, 9.6, 0, 24.0, 0.4, WHITE); // step 1
  cube(body, 9.0, 1.2, 8.0, 0, 25.2, 0.4, SUIT_SHADE); // step 2
  cube(body, 7.2, 0.8, 6.4, 0, 26.0, 0.4, WHITE); // step 3 top cap

  // Midnight Blue Curved Visor
  cube(body, 9.8, 7.4, 0.8, 0, 18.5, 5.9, GREY_DARK); // visor rim frame
  cube(body, 9.0, 6.6, 0.6, 0, 18.5, 6.4, VISOR_DARK); // midnight blue base
  cube(body, 7.6, 5.4, 0.4, 0, 18.5, 6.7, VISOR_MID); // rich blue glow

  // 4-pointed Star Sparkle (Upper Right of Visor)
  cube(body, 1.2, 1.2, 0.3, 2.2, 20.2, 7.0, 0xffffff); // sparkle center
  cube(body, 0.6, 2.6, 0.25, 2.2, 20.2, 7.0, 0xffffff); // vertical beam
  cube(body, 2.6, 0.6, 0.25, 2.2, 20.2, 7.0, 0xffffff); // horizontal beam

  // Helmet Comms Pod & Antenna
  cube(body, 1.4, 3.2, 3.2, -6.6, 18.5, 0.4, SUIT_SHADE); // left comms pod
  cube(body, 0.8, 1.2, 0.8, -6.6, 20.4, 0.4, ORANGE); // antenna joint
  cube(body, 0.6, 4.0, 0.6, -6.6, 22.8, 0.4, GREY_MID); // antenna rod
  cube(body, 1.2, 1.2, 1.2, -6.6, 25.2, 0.4, ORANGE); // orange antenna tip
  cube(body, 1.4, 3.2, 3.2, 6.6, 18.5, 0.4, SUIT_SHADE); // right comms pod
  cube(body, 1.0, 1.0, 1.2, 6.5, 17.5, -0.6, ORANGE); // cable connector

  // 5. Backpack (PLSS Jetpack unit on back)
  cube(body, 8.4, 8.0, 3.6, 0, 10.5, -4.6, WHITE); // main pack
  cube(body, 8.8, 6.8, 3.0, 0, 10.5, -4.6, SUIT_SHADE); // pack rim
  // Top Orange Antennas (as seen in back view)
  cube(body, 0.6, 4.4, 0.6, -2.4, 16.4, -4.6, ORANGE); // left rod
  cube(body, 0.6, 6.2, 0.6, 1.4, 17.2, -4.6, ORANGE); // center tall rod

  // Connecting Air Tube / Hose (from helmet right side to backpack)
  cube(body, 0.8, 0.8, 3.2, 6.2, 16.5, -2.4, GREY_DARK);
  cube(body, 0.8, 4.2, 0.8, 5.8, 14.5, -4.0, GREY_DARK);
  cube(body, 2.0, 0.8, 0.8, 4.4, 12.6, -4.0, ORANGE);

  // Back Telemetry & Controls
  cube(body, 2.2, 2.0, 0.5, -2.0, 12.2, -6.6, RED); // red panel
  cube(body, 2.2, 2.0, 0.5, 1.8, 12.2, -6.6, BLUE); // blue telemetry panel
  cube(body, 1.8, 1.2, 0.5, -2.0, 9.4, -6.6, YELLOW); // yellow fuel gauge L
  cube(body, 1.8, 1.2, 0.5, 1.8, 9.4, -6.6, YELLOW); // yellow fuel gauge R

  // Dual Rocket Thrusters
  cube(body, 1.8, 0.8, 1.8, -2.2, 6.2, -4.6, GREY_DARK); // nozzle mount L
  cube(body, 2.2, 1.2, 2.2, -2.2, 5.2, -4.6, ORANGE); // nozzle bell L
  cube(body, 1.8, 0.8, 1.8, 2.2, 6.2, -4.6, GREY_DARK); // nozzle mount R
  cube(body, 2.2, 1.2, 2.2, 2.2, 5.2, -4.6, ORANGE); // nozzle bell R
  // Thruster jet glow
  cube(body, 1.4, 1.4, 1.4, -2.2, 3.8, -4.6, JET_FIRE);
  cube(body, 1.4, 1.4, 1.4, 2.2, 3.8, -4.6, JET_FIRE);

  return { root, body, legL, legR, armL, armR, stars: dizzyStars(root, 28), yaw: 0 };
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

/**
 * Cute Kuromi Hero: black jester hood with pointy ears and pink pom-poms,
 * pink skull emblem on forehead, cute chibi face with lashes, lavender jester
 * collar with pink bells, lavender trimmed dress, sword on the back, and devil tail.
 */
function kuromi(): CharacterRig {
  const { cube, root, body, limb } = kit();
  const BLACK = 0x221c27;        // Kuromi's dark hood & dress (deep charcoal black with purple undertone)
  const WHITE = 0xfcfbfc;        // Soft white face and cute paws
  const LILAC = 0xc59ed6;        // Signature pastel lavender / lilac
  const LILAC_DARK = 0xa37bb5;   // Shaded lavender
  const PINK = 0xf580b3;         // Sanrio bright pastel pink (skull, pom-poms, nose)
  const PINK_DARK = 0xd95d93;    // Shaded pink
  const DARK = 0x141019;         // Deep black for eyes, lashes, mouth
  const BLUSH = 0xf8b4ce;        // Cute rosy blush
  const SWORD_STEEL = 0xd2d7e0;  // Sword blade
  const SWORD_EDGE = 0xedf0f5;   // Blade spine
  const SWORD_HILT = 0x7a4d35;   // Brown hilt
  const SWORD_GUARD = 0xa8714b;  // Guard / pommel

  // Legs: lilac tights with dark boots
  const leg = (x: number) =>
    limb(x, 5, (g) => {
      cube(g, 2.8, 3.6, 2.8, 0, -1.8, 0, LILAC);
      cube(g, 3.0, 0.8, 3.0, 0, -0.6, 0, LILAC_DARK);
      cube(g, 3.2, 1.8, 3.6, 0, -4.1, 0.4, BLACK);
      cube(g, 3.2, 0.6, 1.0, 0, -4.7, 1.9, BLACK);
    });
  const legL = leg(-1.8);
  const legR = leg(1.8);

  // Dress: flared lower hem with lavender band, and dark torso
  cube(body, 8.6, 2.8, 6.2, 0, 5.8, 0, BLACK); // skirt
  cube(body, 9.0, 0.8, 6.6, 0, 6.6, 0, LILAC); // lilac trim band
  cube(body, 7.8, 4.4, 5.4, 0, 9.2, 0, BLACK); // torso
  cube(body, 8.2, 0.8, 5.8, 0, 8.0, 0, LILAC); // waist belt

  // Jester Collar: lilac ring with pointed flaps and pink pom-poms
  cube(body, 8.8, 1.4, 6.8, 0, 11.7, 0, LILAC);
  // Front flaps
  cube(body, 1.8, 2.0, 0.8, -1.8, 10.4, 3.6, LILAC);
  cube(body, 1.2, 1.2, 1.2, -1.8, 9.2, 3.8, PINK);
  cube(body, 1.8, 2.0, 0.8, 1.8, 10.4, 3.6, LILAC);
  cube(body, 1.2, 1.2, 1.2, 1.8, 9.2, 3.8, PINK);
  // Shoulder flaps
  cube(body, 0.8, 1.8, 1.8, -4.6, 10.6, 0, LILAC);
  cube(body, 1.2, 1.2, 1.2, -5.0, 9.5, 0, PINK);
  cube(body, 0.8, 1.8, 1.8, 4.6, 10.6, 0, LILAC);
  cube(body, 1.2, 1.2, 1.2, 5.0, 9.5, 0, PINK);
  // Back flaps
  cube(body, 1.8, 1.8, 0.8, -1.8, 10.6, -3.6, LILAC);
  cube(body, 1.2, 1.2, 1.2, -1.8, 9.5, -3.8, PINK);
  cube(body, 1.8, 1.8, 0.8, 1.8, 10.6, -3.6, LILAC);
  cube(body, 1.2, 1.2, 1.2, 1.8, 9.5, -3.8, PINK);

  // Arms: lilac puff shoulders, black sleeves, white paws
  const arm = (x: number, isLeft: boolean) =>
    limb(x, 11.5, (g) => {
      cube(g, 2.8, 2.0, 2.8, 0, -0.8, 0, LILAC);
      cube(g, 1.0, 1.0, 1.0, isLeft ? -1.4 : 1.4, -0.8, 0, PINK); // shoulder bobble
      cube(g, 2.4, 3.0, 2.4, 0, -2.8, 0, BLACK);
      cube(g, 2.6, 0.6, 2.6, 0, -4.2, 0, LILAC); // wrist cuff
      cube(g, 2.2, 1.6, 2.2, 0, -5.1, 0, WHITE); // paw
    });
  const armL = arm(-4.9, true);
  const armR = arm(4.9, false);

  // Sword slung across the back diagonally
  const sword = new THREE.Group();
  sword.position.set(-0.2 * U, 9.6 * U, -3.5 * U);
  sword.rotation.set(-0.15, 0.1, 0.62);
  cube(sword, 1.1, 10.5, 0.5, 0, -1.8, 0, SWORD_STEEL);
  cube(sword, 0.5, 10.0, 0.65, 0, -1.8, 0, SWORD_EDGE);
  cube(sword, 0.7, 1.4, 0.5, 0, -7.3, 0, SWORD_STEEL);
  cube(sword, 3.8, 0.9, 0.9, 0, 3.8, 0, SWORD_GUARD);
  cube(sword, 1.1, 2.8, 0.8, 0, 5.5, 0, SWORD_HILT);
  cube(sword, 1.6, 1.0, 1.0, 0, 7.2, 0, SWORD_GUARD);
  body.add(sword);

  // Devil tail on lower back
  const tail = new THREE.Group();
  tail.position.set(0, 6.2 * U, -3.0 * U);
  cube(tail, 0.8, 0.8, 2.0, 0, 0, -0.8, BLACK);
  cube(tail, 2.2, 0.8, 0.8, -1.2, -0.4, -1.6, BLACK);
  cube(tail, 2.0, 0.8, 0.8, -2.8, 0.2, -1.6, BLACK);
  cube(tail, 0.8, 1.8, 0.8, -3.8, 1.2, -1.6, BLACK);
  cube(tail, 1.6, 0.8, 0.8, -3.8, 2.2, -1.6, BLACK);
  cube(tail, 2.8, 0.8, 0.8, -3.8, 2.8, -1.6, BLACK);
  cube(tail, 1.6, 0.8, 0.8, -3.8, 3.6, -1.6, BLACK);
  cube(tail, 0.8, 0.8, 0.8, -3.8, 4.2, -1.6, BLACK);
  body.add(tail);

  // Head: big rounded cubic black hood
  cube(body, 10.4, 9.4, 9.8, 0, 17.6, 0, BLACK);
  cube(body, 10.6, 8.2, 9.0, 0, 17.6, 0, BLACK);
  cube(body, 9.6, 9.6, 9.0, 0, 17.6, 0, BLACK);

  // White face cutout
  cube(body, 8.4, 6.2, 0.7, 0, 16.2, 4.85, WHITE);
  cube(body, 8.8, 3.4, 0.7, 0, 15.2, 4.85, WHITE);
  cube(body, 7.0, 1.2, 0.7, 0, 19.4, 4.85, WHITE);

  // Eyes (big anime eyes with lashes & shine)
  // Left eye
  cube(body, 1.3, 2.0, 0.4, -2.1, 16.6, 5.25, DARK);
  cube(body, 0.8, 0.6, 0.4, -3.0, 17.4, 5.25, DARK); // upper lash
  cube(body, 0.6, 0.5, 0.4, -3.0, 16.1, 5.25, DARK); // lower lash
  cube(body, 1.2, 0.4, 0.4, -2.1, 17.8, 5.25, DARK); // lash top
  cube(body, 0.6, 0.7, 0.45, -1.8, 17.2, 5.3, WHITE); // shine
  // Right eye
  cube(body, 1.3, 2.0, 0.4, 2.1, 16.6, 5.25, DARK);
  cube(body, 0.8, 0.6, 0.4, 3.0, 17.4, 5.25, DARK); // upper lash
  cube(body, 0.6, 0.5, 0.4, 3.0, 16.1, 5.25, DARK); // lower lash
  cube(body, 1.2, 0.4, 0.4, 2.1, 17.8, 5.25, DARK); // lash top
  cube(body, 0.6, 0.7, 0.45, 2.4, 17.2, 5.3, WHITE); // shine

  // Cute nose & mouth
  cube(body, 0.6, 0.5, 0.4, 0, 15.4, 5.25, PINK);
  cube(body, 1.8, 0.4, 0.35, 0, 14.4, 5.25, DARK);
  cube(body, 0.4, 0.4, 0.35, -0.8, 14.7, 5.25, DARK);
  cube(body, 0.4, 0.4, 0.35, 0.8, 14.7, 5.25, DARK);

  // Rosy cheeks
  cube(body, 1.2, 0.6, 0.35, -3.1, 15.1, 5.23, BLUSH);
  cube(body, 1.2, 0.6, 0.35, 3.1, 15.1, 5.23, BLUSH);

  // Skull emblem on forehead
  cube(body, 3.4, 2.4, 0.7, 0, 20.6, 5.0, PINK);
  cube(body, 3.8, 1.4, 0.6, 0, 20.4, 4.95, PINK);
  cube(body, 2.0, 1.0, 0.7, 0, 19.1, 5.0, PINK);
  cube(body, 0.8, 0.9, 0.75, -0.8, 20.4, 5.1, DARK); // left eye socket
  cube(body, 0.8, 0.9, 0.75, 0.8, 20.4, 5.1, DARK);  // right eye socket
  cube(body, 0.4, 0.4, 0.75, 0, 19.7, 5.1, DARK);     // nose
  cube(body, 0.3, 0.6, 0.75, -0.4, 18.9, 5.1, DARK);  // tooth
  cube(body, 0.3, 0.6, 0.75, 0.4, 18.9, 5.1, DARK);   // tooth

  // Jester Ears: stepped curves with pink pom-poms on tips
  // Left ear
  cube(body, 2.6, 2.2, 2.6, -3.4, 23.0, 0.2, BLACK);
  cube(body, 2.4, 2.2, 2.4, -4.4, 24.8, 0.1, BLACK);
  cube(body, 2.0, 2.2, 2.0, -5.2, 26.6, 0.0, BLACK);
  cube(body, 1.6, 2.0, 1.6, -5.8, 28.3, 0.0, BLACK);
  cube(body, 2.2, 2.2, 2.2, -6.3, 29.8, 0.0, PINK);
  cube(body, 1.4, 1.4, 1.4, -6.3, 29.8, 0.0, PINK_DARK);
  // Right ear
  cube(body, 2.6, 2.2, 2.6, 3.4, 23.0, 0.2, BLACK);
  cube(body, 2.4, 2.2, 2.4, 4.4, 24.8, 0.1, BLACK);
  cube(body, 2.0, 2.2, 2.0, 5.2, 26.6, 0.0, BLACK);
  cube(body, 1.6, 2.0, 1.6, 5.8, 28.3, 0.0, BLACK);
  cube(body, 2.2, 2.2, 2.2, 6.3, 29.8, 0.0, PINK);
  cube(body, 1.4, 1.4, 1.4, 6.3, 29.8, 0.0, PINK_DARK);

  return { root, body, legL, legR, armL, armR, stars: dizzyStars(root, 31), yaw: 0 };
}

const BUILDERS: Record<CharacterKind, () => CharacterRig> = { hero, penguin, knight, ninja, astronaut, builder, kuromi };

export function buildCharacter(kind: CharacterKind): CharacterRig {
  return (BUILDERS[kind] ?? penguin)();
}
