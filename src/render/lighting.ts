import * as THREE from 'three';

/**
 * The light buffer: every beam is also drawn, very wide and soft, into a half-resolution
 * HDR target. Floors and walls add it to their shading, and dust motes read it to know
 * whether they're inside a beam. This is what makes the light *illuminate* the stage.
 */
export const beamLight = {
  uLightBuf: { value: null as THREE.Texture | null },
  uLightRes: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
};

interface ReceiveOptions {
  /** How strongly beam light shows on this surface. */
  gain?: number;
  /** Neon bricks: bricks (not mortar) of the colour map glow in the emissive colour. */
  neonBricks?: boolean;
}

/** Patch a standard material so it is lit by the beams (and optionally glows like neon brick). */
export function receiveBeamLight(mat: THREE.MeshStandardMaterial, opts: ReceiveOptions = {}) {
  const gain = opts.gain ?? 1;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLightBuf = beamLight.uLightBuf;
    shader.uniforms.uLightRes = beamLight.uLightRes;
    shader.uniforms.uLightGain = { value: gain };
    shader.fragmentShader = `uniform sampler2D uLightBuf;\nuniform vec2 uLightRes;\nuniform float uLightGain;\n${shader.fragmentShader}`;
    if (opts.neonBricks) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `{
          vec3 brickTex = texture2D( map, vMapUv ).rgb;
          float lum = dot( brickTex, vec3( 0.299, 0.587, 0.114 ) );
          float mortar = smoothstep( 0.2, 0.34, lum );
          totalEmissiveRadiance = emissive * ( 1.0 - mortar ) * ( 0.25 + lum * 4.0 );
        }`,
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
        vec3 beam = texture2D( uLightBuf, gl_FragCoord.xy / uLightRes ).rgb * uLightGain;
        // Diffuse pickup of the beam light, plus a little sheen on smoother spots.
        outgoingLight += diffuseColor.rgb * beam + beam * 0.05 * ( 1.0 - roughnessFactor );
      }
      #include <opaque_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => `beam-light-${opts.neonBricks ? 'brick' : 'plain'}`;
  return mat;
}

/** Floating dust that only shows where a beam passes through it. */
export function dustMotes(width: number, height: number, count = 70) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * width;
    positions[i * 3 + 1] = 0.15 + Math.random() * 0.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * height;
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...beamLight, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: /* glsl */ `
      uniform sampler2D uLightBuf;
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aSeed;
      varying vec3 vLight;
      varying float vTwinkle;
      void main() {
        vec3 p = position;
        float t = uTime * (0.05 + aSeed * 0.08) + aSeed * 40.0;
        p.x += sin(t * 1.3) * 0.35 + sin(t * 0.37 + 2.0) * 0.6;
        p.z += cos(t * 1.1) * 0.35 + sin(t * 0.29) * 0.6;
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
        vLight = texture2D(uLightBuf, uv).rgb;
        vTwinkle = 1.0;
        gl_PointSize = (1.2 + aSeed * 1.2) * uPixelRatio;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vLight;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vLight * a * vTwinkle * 0.6, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}
