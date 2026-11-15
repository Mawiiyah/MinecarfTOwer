import * as THREE from "three";

/**
 * Fire-breathing dragon for the DRAGON gift, using the painted animation sheet
 * (public/gifts/dragon_{idle,breath}_{left,right}.png, cut by scripts/cropdragon.py).
 *
 * Two poses per direction: IDLE ("stop", while it flies) and BREATH ("buga", while it
 * burns a column). The rig origin is the spot the fireball lands on (the blocks);
 * both poses are placed so the dragon's mouth stays put when it switches.
 * (A procedural 3D alternative is kept in dragonProcedural.ts.)
 */
export interface DragonRig {
  root: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  jaw: THREE.Group;
  tail: THREE.Group;
  /** Show the right pose: direction of flight and whether it is breathing fire. */
  setPose: (dir: 1 | -1, breathing: boolean) => void;
}

/** Blocks per sprite pixel, and a vertical stretch so the dragon looks chunky. */
const PX = 0.02;
const FAT = 1.3;

interface SpriteDef {
  url: string;
  w: number;
  h: number;
  /** Mouth position inside the image (px, y down). */
  mouth: [number, number];
}

const BREATH_RIGHT: SpriteDef = { url: "/gifts/dragon_breath_right.png", w: 468, h: 242, mouth: [293, 118] };
const BREATH_LEFT: SpriteDef = { url: "/gifts/dragon_breath_left.png", w: 483, h: 214, mouth: [175, 107] };
const IDLE_RIGHT: SpriteDef = { url: "/gifts/dragon_idle_right.png", w: 315, h: 210, mouth: [305, 97] };
const IDLE_LEFT: SpriteDef = { url: "/gifts/dragon_idle_left.png", w: 315, h: 210, mouth: [10, 97] };

/** Where the mouth sits relative to the fireball centre (the rig origin), in px (y down). */
const MOUTH_AT = {
  right: [-(420 - 293), -(200 - 118)] as [number, number],
  left: [175 - 60, -(165 - 107)] as [number, number],
};

export function buildDragon(): DragonRig {
  const root = new THREE.Group();
  const loader = new THREE.TextureLoader();
  const plane = (def: SpriteDef, mouthAt: [number, number]) => {
    const tex = loader.load(def.url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(def.w * PX, def.h * PX * FAT),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false }),
    );
    // Centre of the plane = mouth position + offset from the mouth to the image centre.
    mesh.position.set(
      (mouthAt[0] + (def.w / 2 - def.mouth[0])) * PX,
      -(mouthAt[1] + (def.h / 2 - def.mouth[1])) * PX * FAT,
      0,
    );
    mesh.renderOrder = 10;
    mesh.visible = false;
    root.add(mesh);
    return mesh;
  };
  const breathR = plane(BREATH_RIGHT, MOUTH_AT.right);
  const breathL = plane(BREATH_LEFT, MOUTH_AT.left);
  const idleR = plane(IDLE_RIGHT, MOUTH_AT.right);
  const idleL = plane(IDLE_LEFT, MOUTH_AT.left);
  const setPose = (dir: 1 | -1, breathing: boolean) => {
    breathR.visible = dir > 0 && breathing;
    breathL.visible = dir < 0 && breathing;
    idleR.visible = dir > 0 && !breathing;
    idleL.visible = dir < 0 && !breathing;
  };
  const wingL = new THREE.Group();
  const wingR = new THREE.Group();
  const jaw = new THREE.Group();
  const tail = new THREE.Group();
  root.add(wingL, wingR, jaw, tail);
  return { root, wingL, wingR, jaw, tail, setPose };
}
