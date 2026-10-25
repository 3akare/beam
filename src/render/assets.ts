import * as THREE from 'three';

// CC0 assets from Poly Haven and ambientCG (see public/media/LICENSES.md), as 512px WebP.
// Textures load once and are shared by every board; boards clone them to set tiling.
const base = `${import.meta.env.BASE_URL}media/`;
const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

function tex(path: string, srgb = false) {
  let t = cache.get(path);
  if (!t) {
    t = loader.load(base + path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(path, t);
  }
  return t;
}

/** A texture set ready to tile: `repeat(x, y)` returns clones with that tiling. */
function set(maps: Record<string, [string, boolean?]>) {
  return (x = 1, y = 1, rotation = 0) => {
    const out: Record<string, THREE.Texture> = {};
    for (const [key, [path, srgb]] of Object.entries(maps)) {
      const c = tex(path, srgb).clone();
      c.repeat.set(x, y);
      c.rotation = rotation;
      c.center.set(0.5, 0.5);
      c.needsUpdate = true;
      out[key] = c;
    }
    return out;
  };
}

export const brick = set({
  map: ['textures/dark_brick_wall_diff_1k.webp', true],
  normalMap: ['textures/dark_brick_wall_nor_gl_1k.webp'],
  arm: ['textures/dark_brick_wall_arm_1k.webp'],
});

export const concrete = set({
  map: ['textures/painted_concrete_02_diff_1k.webp', true],
  normalMap: ['textures/painted_concrete_02_nor_gl_1k.webp'],
  arm: ['textures/painted_concrete_02_arm_1k.webp'],
});

export const brushedSteel = set({
  roughnessMap: ['textures/Metal009_1K-JPG_Roughness.webp'],
  normalMap: ['textures/Metal009_1K-JPG_NormalGL.webp'],
});

export const silver = set({
  roughnessMap: ['textures/Metal049A_1K-JPG_Roughness.webp'],
  normalMap: ['textures/Metal049A_1K-JPG_NormalGL.webp'],
});

export const fingerprints = set({
  roughnessMap: ['textures/Fingerprints002_1K-JPG_Roughness.webp'],
});

export const HDRI = {
  neon: `${base}hdri/ferndale_studio_12_512.hdr`,
};
