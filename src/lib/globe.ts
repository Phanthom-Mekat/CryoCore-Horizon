import * as THREE from "three";

/*
 * "Ride with NISAR": the camera flies beside the spacecraft at its real altitude.
 * - Earth is drawn at true scale (1 unit = Earth radius) with NASA Blue Marble / VIIRS Black Marble,
 *   plus a sharper regional texture over Greenland and Baffin Bay.
 * - The Sun is placed for the simulated UTC time; NISAR flies a dawn-dusk sun-synchronous orbit
 *   (747 km, 98.4°), so the spacecraft stays sunlit while the ground below can be in polar night.
 * - The radar looks to one side, imaging a ~240 km swath at ~29–41° look angle.
 * - The pass is simulated from the orbit geometry and chosen so the swath crosses Jakobshavn.
 *   It is not NISAR's real schedule.
 * - The spacecraft is drawn in metres in its own render pass (true scale, no float jitter).
 */

export const SIM_SPEED = 15; // simulated seconds per real second
const EARTH_R_M = 6_371_000;
const ALT_KM = 747;
const R = 1 + (ALT_KM * 1000) / EARTH_R_M;
const INC = THREE.MathUtils.degToRad(98.4);
const PERIOD_S = 99.5 * 60;
const SWATH_NEAR = 0.066; // radians of ground arc off the track (~420 km)
const SWATH_FAR = 0.104; // (~660 km), so ~240 km wide
const D2R = Math.PI / 180;
const JAK = { lat: 69.17, lon: -49.9 };
const REGION = new THREE.Vector4(50, 85, -95, 5); // lat min/max, lon min/max of the regional texture

/** Earth-fixed unit vector. Matches three.js SphereGeometry UVs on an equirectangular map. */
export function fromLatLon(lat: number, lon: number, out = new THREE.Vector3()) {
  const a = lat * D2R;
  const o = lon * D2R;
  return out.set(Math.cos(a) * Math.cos(o), Math.sin(a), -Math.cos(a) * Math.sin(o));
}

/** Subsolar latitude/longitude in degrees for a UTC date (low-precision almanac, ~0.1°). */
export function subsolar(date: Date) {
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * D2R;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  const e = (23.439 - 0.00000036 * d) * D2R;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / D2R;
  const decl = Math.asin(Math.sin(e) * Math.sin(L)) / D2R;
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const lon = ((((ra - gmst * 15 + 180) % 360) + 360) % 360) - 180;
  return { lat: decl, lon };
}

/** Sun elevation in degrees at a place and time (geometric, no refraction). */
export function sunElevation(lat: number, lon: number, date: Date) {
  const s = subsolar(date);
  return 90 - Math.acos(THREE.MathUtils.clamp(fromLatLon(lat, lon).dot(fromLatLon(s.lat, s.lon)), -1, 1)) / D2R;
}

/** Orbit plane of a dawn-dusk sun-synchronous orbit at a given time, in Earth-fixed axes. */
function orbitAt(ms: number) {
  const s = subsolar(new Date(ms));
  const sun = fromLatLon(s.lat, s.lon);
  const node = fromLatLon(0, s.lon + 90); // ascending node at 18:00 local solar time
  const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(node, INC);
  const b = new THREE.Vector3().crossVectors(n, node);
  return { sun, node, n, b };
}

/** Next time (from `from`) when Jakobshavn sits mid-swath, scanning a day in 20 s steps. */
export function nextJakobshavnPass(from: number) {
  const jak = fromLatLon(JAK.lat, JAK.lon);
  const mid = Math.sin((SWATH_NEAR + SWATH_FAR) / 2);
  let prev = jak.dot(orbitAt(from).n) - mid;
  for (let t = from + 20000; t < from + 86400000; t += 20000) {
    const f = jak.dot(orbitAt(t).n) - mid;
    if (Math.sign(f) !== Math.sign(prev)) return t;
    prev = f;
  }
  return from;
}

const earthVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vObj, vView;
  void main() {
    vUv = uv;
    vObj = normalize(position);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const swathGlsl = /* glsl */ `
  uniform vec3 uOrbitN, uSatDir, uVelDir;
  uniform vec2 uSwath;
  float swathAt(vec3 p, float soft) {
    float side = dot(p, uOrbitN);
    float band = smoothstep(uSwath.x - soft, uSwath.x + soft, side) * (1.0 - smoothstep(uSwath.y - soft, uSwath.y + soft, side));
    vec3 q = normalize(p - uOrbitN * side);
    float along = atan(dot(q, uVelDir), dot(q, uSatDir)); // > 0 ahead of the spacecraft
    return along < 0.0 ? band * exp(along * 3.0) : band * (1.0 - smoothstep(0.0, 0.004, along));
  }`;

const earthFrag = /* glsl */ `
  uniform sampler2D uDay, uNight, uWater, uRegionDay, uRegionNight;
  uniform vec4 uRegion;
  uniform vec3 uSun;
  varying vec2 vUv;
  varying vec3 vObj, vView;
  ${swathGlsl}
  void main() {
    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb;
    // sharper NASA imagery over Greenland and Baffin Bay, feathered into the global map
    float lat = degrees(asin(clamp(vObj.y, -1.0, 1.0)));
    float lon = degrees(atan(-vObj.z, vObj.x));
    vec2 ruv = vec2((lon - uRegion.z) / (uRegion.w - uRegion.z), (lat - uRegion.x) / (uRegion.y - uRegion.x));
    float inR = smoothstep(0.0, 0.03, ruv.x) * smoothstep(1.0, 0.97, ruv.x) * smoothstep(0.0, 0.05, ruv.y) * smoothstep(1.0, 0.95, ruv.y);
    if (inR > 0.0) {
      day = mix(day, texture2D(uRegionDay, ruv).rgb, inR);
      night = mix(night, texture2D(uRegionNight, ruv).rgb, inR);
    }
    float water = texture2D(uWater, vUv).r;

    float sunDot = dot(vObj, uSun);
    float light = smoothstep(-0.1, 0.1, sunDot);
    vec3 lit = day * (0.16 + 1.05 * max(sunDot, 0.0));
    vec3 dark = night * vec3(1.0, 0.8, 0.55) * 1.2 + day * vec3(0.05, 0.065, 0.09); // city lights + faint earthshine
    vec3 col = mix(dark, lit, light);
    col += vec3(1.0, 0.42, 0.18) * 0.1 * max(0.0, 1.0 - abs(sunDot) * 9.0) * (1.0 - water * 0.4); // twilight band

    vec3 h = normalize(uSun + vView);
    col += water * light * pow(max(dot(vObj, h), 0.0), 80.0) * vec3(1.0, 0.92, 0.75) * 0.5;

    // radar returns: grey backscatter, independent of sunlight
    float s = swathAt(vObj, 0.0015);
    float lum = dot(day, vec3(0.3, 0.55, 0.15));
    vec3 radar = mix(vec3(0.03, 0.07, 0.1), vec3(0.66, 0.82, 0.88), clamp(lum * 1.2, 0.0, 1.0) * (1.0 - water * 0.85));
    col = mix(col, radar, s * 0.85);
    col += vec3(0.42, 1.0, 0.72) * s * 0.05;

    float rim = pow(1.0 - max(dot(vObj, vView), 0.0), 4.0);
    col += vec3(0.3, 0.55, 1.0) * rim * (0.05 + 0.5 * light);
    gl_FragColor = vec4(col, 1.0);
  }`;

const cloudFrag = /* glsl */ `
  uniform sampler2D uClouds;
  uniform vec3 uSun;
  varying vec2 vUv;
  varying vec3 vObj, vView;
  ${swathGlsl}
  void main() {
    float c = min(texture2D(uClouds, vUv).r * 1.4, 1.0);
    float light = smoothstep(-0.12, 0.2, dot(vObj, uSun));
    float a = c * (0.06 + 0.6 * light) * (1.0 - swathAt(vObj, 0.003)); // radar sees through cloud
    gl_FragColor = vec4(vec3(0.94, 0.96, 1.0) * (0.2 + 0.8 * light), a);
  }`;

const atmoFrag = /* glsl */ `
  uniform vec3 uSun;
  varying vec3 vN, vW;
  void main() {
    vec3 v = normalize(cameraPosition - vW);
    float i = pow(max(0.0, 0.5 + dot(vN, v)), 5.0) * 2.0;
    float day = smoothstep(-0.3, 0.35, dot(normalize(vW), uSun));
    float a = clamp(i * (0.12 + 0.88 * day), 0.0, 1.0);
    gl_FragColor = vec4(vec3(0.35, 0.65, 1.0) * a, a);
  }`;

/** NISAR to its published layout, in metres. +z = direction of flight, +y = away from Earth, +x = radar side. */
function buildNisar() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: "#d4a23a", metalness: 0.9, roughness: 0.32 });
  const foil = new THREE.MeshStandardMaterial({ color: "#d6a443", metalness: 0.75, roughness: 0.45, emissive: "#2a1a05" });
  const white = new THREE.MeshStandardMaterial({ color: "#e4e7ea", metalness: 0.1, roughness: 0.55 });
  const cell = new THREE.MeshStandardMaterial({ color: "#1c3368", metalness: 0.6, roughness: 0.25, emissive: "#03060f" });
  const frame = new THREE.MeshStandardMaterial({ color: "#b9c0c8", metalness: 0.7, roughness: 0.35 });
  const mesh = new THREE.MeshStandardMaterial({ color: "#e8bd55", metalness: 0.95, roughness: 0.25, side: THREE.DoubleSide, transparent: true, opacity: 0.42 });

  g.add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.2, 1.8), foil)); // ISRO I-3K bus in gold blanket
  const instr = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.7, 8), white); // NASA octagonal radar instrument structure
  instr.position.y = -1.95;
  g.add(instr);
  for (let i = 0; i < 4; i++) {
    const feed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.9), frame); // L- and S-band feed apertures
    feed.position.set(0.9, -2.8, -0.75 + i * 0.5);
    g.add(feed);
  }
  const edgeMat = new THREE.LineBasicMaterial({ color: "#8fa4c0", transparent: true, opacity: 0.5 });
  for (const s of [-1, 1]) {
    // two solar wings of three panels on opposite sides of the bus
    const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), frame);
    yoke.rotation.x = Math.PI / 2;
    yoke.position.z = s * 1.55;
    g.add(yoke);
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 2.0), cell);
      p.position.set(-0.2, 0.2, s * (3.2 + i * 2.1));
      p.rotation.z = 0.35; // tilted toward the Sun
      g.add(p);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(p.geometry), edgeMat);
      edge.position.copy(p.position);
      edge.rotation.copy(p.rotation);
      g.add(edge);
    }
  }
  // 9 m boom out to the reflector on the radar side, below the bus
  const from = new THREE.Vector3(0.9, -2.7, 0);
  const to = new THREE.Vector3(7.4, -7.0, 0);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, from.distanceTo(to), 8), frame);
  boom.position.copy(from).lerp(to, 0.5);
  boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  g.add(boom);
  // 12 m reflector: gold wire mesh on a ring of composite struts
  const prof = Array.from({ length: 14 }, (_, i) => new THREE.Vector2((i / 13) * 6, (((i / 13) * 6) ** 2) / 26));
  const reflector = new THREE.Group();
  reflector.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 64), mesh));
  reflector.add(
    new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.LatheGeometry([prof[0], prof[6], prof[13]], 30)),
      new THREE.LineBasicMaterial({ color: "#f6d98a", transparent: true, opacity: 0.5 }),
    ),
  );
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6, 0.13, 6, 96), gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = prof[13].y;
  reflector.add(rim);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 4), frame);
    strut.position.set(Math.cos(a) * 6, prof[13].y - 0.7, Math.sin(a) * 6);
    reflector.add(strut);
  }
  reflector.position.copy(to);
  // dish axis aims back at the feeds, so the reflected beam goes down-range to the swath
  reflector.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.75, 0.55, 0).normalize());
  g.add(reflector);
  return { group: g, dishCenter: to };
}

export type Globe = { dispose: () => void; setPaused: (paused: boolean) => void };
export type Telemetry = { simTime: Date; satLat: number; satLon: number; toJakKm: number; inSwath: boolean };

export function mountGlobe(
  canvas: HTMLCanvasElement,
  opts: {
    reduced: boolean;
    paused?: boolean;
    onReady?: () => void;
    onReadyChange?: (ready: boolean) => void;
    onTick?: (t: Telemetry) => void;
    marker?: HTMLElement | null;
    craftLabel?: HTMLElement | null;
  },
): Globe {
  const mq = matchMedia("(max-width: 768px)");
  let small = mq.matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;

  // ---- Earth pass (1 unit = Earth radius) ----
  const earthScene = new THREE.Scene();
  const earthCam = new THREE.PerspectiveCamera(48, 1, 0.002, 8);

  const loader = new THREE.TextureLoader();
  const pending: Promise<unknown>[] = [];
  const tex = (name: string, color = true) => {
    let t!: THREE.Texture;
    pending.push(new Promise((res, rej) => (t = loader.load(`/earth/${name}.webp`, res, undefined, rej))));
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const textures = {
    day: tex("day"),
    night: tex("night"),
    water: tex("water", false),
    clouds: tex("clouds", false),
    regionDay: tex("region-day"),
    regionNight: tex("region-night"),
  };

  const shared = {
    uSun: { value: new THREE.Vector3() },
    uOrbitN: { value: new THREE.Vector3() },
    uSatDir: { value: new THREE.Vector3() },
    uVelDir: { value: new THREE.Vector3() },
    uSwath: { value: new THREE.Vector2(SWATH_NEAR, SWATH_FAR) },
  };
  earthScene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1, small ? 256 : 384, small ? 128 : 192),
      new THREE.ShaderMaterial({
        uniforms: {
          ...shared,
          uDay: { value: textures.day },
          uNight: { value: textures.night },
          uWater: { value: textures.water },
          uRegionDay: { value: textures.regionDay },
          uRegionNight: { value: textures.regionNight },
          uRegion: { value: REGION },
        },
        vertexShader: earthVert,
        fragmentShader: earthFrag,
      }),
    ),
  );
  earthScene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1.0016, 192, 96), // ~10 km cloud deck
      new THREE.ShaderMaterial({ uniforms: { ...shared, uClouds: { value: textures.clouds } }, vertexShader: earthVert, fragmentShader: cloudFrag, transparent: true, depthWrite: false }),
    ),
  );
  earthScene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1.025, 128, 64),
      new THREE.ShaderMaterial({
        uniforms: { uSun: shared.uSun },
        vertexShader: `varying vec3 vN, vW; void main(){ vN = normalize(normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: atmoFrag,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    ),
  );
  // faint stars on a shell that travels with the camera
  const starPos = new Float32Array(1800 * 3);
  const sv = new THREE.Vector3();
  for (let i = 0; i < 1800; i++) sv.randomDirection().multiplyScalar(6).toArray(starPos, i * 3);
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: "#cfe2ff", size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  stars.renderOrder = -1;
  earthScene.add(stars);

  // ---- Spacecraft pass (metres, spacecraft at the origin in its own flight frame) ----
  const craftScene = new THREE.Scene();
  const craftCam = new THREE.PerspectiveCamera(48, 1, 0.5, 2000);
  const { group: nisar, dishCenter } = buildNisar();
  craftScene.add(nisar);
  const sunLight = new THREE.DirectionalLight("#fff4e0", 3.4);
  craftScene.add(sunLight, new THREE.HemisphereLight("#b4cbe6", "#1a2638", 1.1));
  // radar beam: a fading wedge from the reflector toward the swath edges
  const look = (a: number) => new THREE.Vector3(Math.sin(a), Math.cos(a) - R, 0).normalize();
  const beamGeo = new THREE.BufferGeometry();
  {
    const L = 900;
    const c = dishCenter;
    const edge = (a: number, z: number) => look(a).multiplyScalar(L).add(c).setZ(z);
    const w = 18;
    const v = [c, edge(SWATH_NEAR, -w), edge(SWATH_FAR, -w), c, edge(SWATH_FAR, w), edge(SWATH_NEAR, w), c, edge(SWATH_NEAR, -w), edge(SWATH_NEAR, w), c, edge(SWATH_FAR, w), edge(SWATH_FAR, -w)];
    beamGeo.setFromPoints(v);
    beamGeo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(v.length).map((_, i) => (i % 3 === 0 ? 0.3 : 0)), 1));
  }
  craftScene.add(
    new THREE.Mesh(
      beamGeo,
      new THREE.ShaderMaterial({
        vertexShader: `attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(0.56, 0.89, 1.0) * vA, vA); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    ),
  );

  // camera in the flight frame: ahead of the spacecraft, looking back along the track toward the radar
  // side, so the freshly imaged strip recedes toward the horizon behind it
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const camLocalPos = new THREE.Vector3();
  const camLocalQuat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tmpM = new THREE.Matrix4();
  const tmpV = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  function placeCameras() {
    const yaw = (small ? 155 : 160) * D2R + pointer.sx * 0.08;
    const pitch = (small ? -36 : -37) * D2R - pointer.sy * 0.04;
    const dist = small ? 58 : 42;
    dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    right.crossVectors(dir, up).normalize();
    // desktop keeps NISAR right of the headline; mobile centres the reflector in the upper 39svh stage
    camLocalPos
      .copy(dir)
      .multiplyScalar(-dist)
      .addScaledVector(right, small ? 0 : -17)
      .add(tmpV.set(small ? 3.5 : 3, small ? -2.5 : -3, small ? 0 : 2));
    tmpM.lookAt(camLocalPos, tmpV.copy(camLocalPos).add(dir), up);
    camLocalQuat.setFromRotationMatrix(tmpM);
    craftCam.position.copy(camLocalPos);
    craftCam.quaternion.copy(camLocalQuat);
  }

  // ---- simulation: start shortly before a pass whose swath crosses Jakobshavn ----
  const passTime = nextJakobshavnPass(Date.now());
  const LEAD = 0.13; // radians of orbit before closest approach (~830 km)
  let simMs = passTime - (LEAD / (Math.PI * 2)) * PERIOD_S * 1000;
  const orbit0 = orbitAt(passTime);
  const jak = fromLatLon(JAK.lat, JAK.lon);
  let argLat = Math.atan2(jak.dot(orbit0.b), jak.dot(orbit0.node)) - LEAD;
  if (opts.reduced) {
    simMs = passTime; // one still frame with the swath right over the glacier
    argLat += LEAD;
  }

  const satE = new THREE.Vector3();
  const velE = new THREE.Vector3();
  const sideE = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const basisQ = new THREE.Quaternion();
  const invQ = new THREE.Quaternion();
  let lastTick = -Infinity;

  const smoothstep = (e0: number, e1: number, x: number) => {
    const k = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return k * k * (3 - 2 * k);
  };
  const swathAt = (p: THREE.Vector3, soft: number) => {
    const n = shared.uOrbitN.value;
    const side = p.dot(n);
    const band = smoothstep(SWATH_NEAR - soft, SWATH_NEAR + soft, side) * (1 - smoothstep(SWATH_FAR - soft, SWATH_FAR + soft, side));
    const q = tmpV.copy(p).addScaledVector(n, -side).normalize();
    const along = Math.atan2(q.dot(velE), q.dot(satE));
    return along < 0 ? band * Math.exp(along * 3) : band * (1 - smoothstep(0, 0.004, along));
  };
  const jakFacing = () => jak.dot(tmpV.copy(earthCam.position).sub(jak).normalize());

  function syncCameras() {
    placeCameras();
    // flight frame -> Earth frame
    basis.makeBasis(sideE, satE, velE);
    basisQ.setFromRotationMatrix(basis);
    earthCam.position.copy(satE).multiplyScalar(R).add(tmpV.copy(camLocalPos).applyQuaternion(basisQ).divideScalar(EARTH_R_M));
    earthCam.quaternion.copy(basisQ).multiply(camLocalQuat);
    earthCam.updateMatrixWorld();
    stars.position.copy(earthCam.position);

    invQ.copy(basisQ).invert();
    sunLight.position.copy(shared.uSun.value).applyQuaternion(invQ).multiplyScalar(100);
  }

  function update(dtReal: number, now: number) {
    const dt = dtReal * SIM_SPEED;
    simMs += dt * 1000;
    argLat += (dt / PERIOD_S) * Math.PI * 2;
    const o = orbitAt(simMs);
    satE.copy(o.node).multiplyScalar(Math.cos(argLat)).addScaledVector(o.b, Math.sin(argLat));
    velE.copy(o.node).multiplyScalar(-Math.sin(argLat)).addScaledVector(o.b, Math.cos(argLat));
    sideE.crossVectors(satE, velE); // the orbit normal: the radar side
    shared.uSun.value.copy(o.sun);
    shared.uOrbitN.value.copy(o.n);
    shared.uSatDir.value.copy(satE);
    shared.uVelDir.value.copy(velE);

    const k = Math.min(1, dtReal * 2.5);
    pointer.sx += (pointer.x - pointer.sx) * k;
    pointer.sy += (pointer.y - pointer.sy) * k;
    syncCameras();

    placeLabels();
    if (opts.onTick && now - lastTick > 250) {
      lastTick = now;
      const slantKm = (tmpV.copy(satE).multiplyScalar(R).sub(jak).length() * EARTH_R_M) / 1000;
      opts.onTick({
        simTime: new Date(simMs),
        satLat: Math.asin(THREE.MathUtils.clamp(satE.y, -1, 1)) / D2R,
        satLon: Math.atan2(-satE.z, satE.x) / D2R,
        toJakKm: slantKm,
        inSwath: swathAt(jak, 0.0015) > 0.15 && jakFacing() > 0,
      });
    }
  }

  const pv = new THREE.Vector3();
  function project(el: HTMLElement | null | undefined, v: THREE.Vector3, cam: THREE.Camera, visible: number) {
    if (!el) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) {
      el.style.opacity = "0";
      return;
    }
    v.project(cam);
    const onScreen = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
    if (!onScreen) {
      el.style.opacity = "0";
      return;
    }
    const x = ((v.x + 1) / 2) * w;
    const y = ((1 - v.y) / 2) * h;
    const hudReserve = small ? 68 : 112;
    const sideMargin = 16;
    const topMargin = 16;
    const edgeFade = 24;
    const bottomFade = small ? 24 : 36;
    const guard =
      smoothstep(sideMargin, sideMargin + edgeFade, x) *
      smoothstep(w - sideMargin, w - sideMargin - edgeFade, x) *
      smoothstep(topMargin, topMargin + edgeFade, y) *
      smoothstep(h - hudReserve, h - hudReserve - bottomFade, y);
    const alpha = Math.max(0, Math.min(1, visible * guard));
    el.dataset.edge = x > w - 180 ? "right" : "left";
    if (alpha > 0) {
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
    el.style.opacity = alpha.toFixed(3);
  }
  function placeLabels() {
    craftCam.updateMatrixWorld();
    project(opts.marker, pv.copy(jak), earthCam, Math.max(0, Math.min(1, jakFacing() * 8)));
    project(opts.craftLabel, pv.copy(dishCenter).add(tmpV.set(0, 7, 0)), craftCam, 1);
  }

  const onPointer = (e: PointerEvent) => {
    pointer.x = (e.clientX / innerWidth - 0.5) * 2;
    pointer.y = (e.clientY / innerHeight - 0.5) * 2;
  };

  let disposed = false;
  let paused = Boolean(opts.paused);
  let texturesReady = false;
  let contextLost = renderer.getContext()?.isContextLost?.() ?? false;
  let visible = true;
  let raf = 0;
  let last = 0;

  const setReady = (ready: boolean) => {
    opts.onReadyChange?.(ready);
    if (ready) opts.onReady?.();
  };
  const hideCallouts = () => {
    if (opts.marker) opts.marker.style.opacity = "0";
    if (opts.craftLabel) opts.craftLabel.style.opacity = "0";
  };

  const render = () => {
    if (disposed || contextLost) return;
    renderer.clear();
    renderer.render(earthScene, earthCam);
    renderer.clearDepth();
    renderer.render(craftScene, craftCam);
  };
  const resize = () => {
    if (disposed || contextLost) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const nextSmall = mq.matches;
    if (nextSmall !== small) {
      small = nextSmall;
      syncCameras();
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
    renderer.setSize(w, h, false);
    for (const c of [earthCam, craftCam]) {
      c.aspect = w / h;
      c.fov = w / h < 1 ? 64 : 48;
      c.updateProjectionMatrix();
    }
    placeLabels();
    render();
  };
  const ro = new ResizeObserver(resize);

  const tick = (now: number) => {
    raf = 0;
    if (disposed || paused || contextLost || !visible || document.hidden) return;
    update(Math.min((now - last) / 1000, 0.05), now);
    last = now;
    render();
    raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (opts.reduced || paused || raf || disposed || contextLost || !texturesReady || !visible || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const setPaused = (next: boolean) => {
    if (disposed) return;
    paused = next;
    if (paused) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      kick();
    }
  };
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    kick();
  });

  const onContextLost = (e: Event) => {
    e.preventDefault();
    contextLost = true;
    cancelAnimationFrame(raf);
    raf = 0;
    hideCallouts();
    setReady(false);
  };
  const onContextRestored = () => {
    if (disposed) return;
    if (renderer.getContext()?.isContextLost?.()) {
      contextLost = true;
      hideCallouts();
      setReady(false);
      return;
    }
    contextLost = false;
    if (!texturesReady) return;
    try {
      update(0, performance.now());
      resize();
      if (renderer.getContext()?.isContextLost?.()) {
        contextLost = true;
        hideCallouts();
        setReady(false);
        return;
      }
      setReady(true);
      kick();
    } catch {
      contextLost = true;
      hideCallouts();
      setReady(false);
    }
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    raf = 0;
    io.disconnect();
    ro.disconnect();
    removeEventListener("pointermove", onPointer);
    document.removeEventListener("visibilitychange", kick);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    hideCallouts();
    for (const s of [earthScene, craftScene])
      s.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
    Object.values(textures).forEach((t) => t.dispose());
    renderer.dispose();
  };

  Promise.all(pending).then(
    () => {
      if (disposed) return;
      texturesReady = true;
      ro.observe(canvas);
      io.observe(canvas);
      document.addEventListener("visibilitychange", kick);
      if (!opts.reduced) addEventListener("pointermove", onPointer, { passive: true });
      if (contextLost || renderer.getContext()?.isContextLost?.()) {
        contextLost = true;
        hideCallouts();
        setReady(false);
        return;
      }
      update(0, performance.now());
      resize();
      setReady(true);
      kick();
    },
    () => {
      if (disposed) return;
      setReady(false);
      dispose();
    }, // a failed texture cleans up GPU/DOM resources and leaves the CSS poster in place
  );

  return { dispose, setPaused };
}
