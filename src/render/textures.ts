import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

/**
 * Running-bond bricks. Returns a colour map (dark fired brick) and an emissive
 * map (bricks bright, mortar black) so the walls glow from the bricks outward.
 */
export function brickTextures() {
  const W = 256;
  const H = 128;
  const rows = 4;
  const cols = 4;
  const bh = H / rows;
  const bw = W / cols;
  const [cc, color] = canvas(W, H);
  const [ec, glow] = canvas(W, H);
  color.fillStyle = '#120809';
  color.fillRect(0, 0, W, H);
  glow.fillStyle = '#000';
  glow.fillRect(0, 0, W, H);
  let seed = 3;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let r = 0; r < rows; r++) {
    const shift = r % 2 ? bw / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + shift + 3;
      const y = r * bh + 3;
      const w = bw - 6;
      const h = bh - 6;
      const v = 0.55 + rnd() * 0.45;
      color.fillStyle = `rgb(${60 + 40 * v}, ${18 + 8 * v}, ${16 + 6 * v})`;
      color.fillRect(x, y, w, h);
      const g = glow.createLinearGradient(x, y, x, y + h);
      const l = Math.round(150 * v + 60);
      g.addColorStop(0, `rgb(${l},${l},${l})`);
      g.addColorStop(1, `rgb(${l * 0.6},${l * 0.6},${l * 0.6})`);
      glow.fillStyle = g;
      glow.fillRect(x, y, w, h);
    }
  }
  const make = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: make(cc, true), emissiveMap: make(ec, true) };
}

/** Cross-section of a soft beam: bright centre fading to clear edges (along v). */
export function beamTexture() {
  const [c, ctx] = canvas(4, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.25)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

/** Radial falloff for halos under lit targets and the emitter lens. */
export function glowTexture() {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Night background: a faint lift in the middle, dark at the corners. */
export function backgroundTexture(tint: THREE.Color) {
  const [c, ctx] = canvas(512, 512);
  const g = ctx.createRadialGradient(256, 230, 30, 256, 256, 380);
  const mid = new THREE.Color(0x10121b).lerp(tint, 0.06);
  g.addColorStop(0, `#${mid.getHexString()}`);
  g.addColorStop(1, '#040407');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Faint floor grid so free placement still has spatial reference. */
export function floorTexture() {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#0c0d13';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
