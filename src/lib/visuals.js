// src/lib/visuals.js  (REPLACEMENT - debugged & improved)
// IMPORTANT: keep the asset arrays updated with your real asset URLs.
import * as THREE from "three";

/* ---------- CONFIG ---------- */
const CONFIG = {
  initialMode: "peace",
  pressesToShift: 12,
  fogColor: 0x0b0b0f,
  fogNear: 1.5,
  fogFarBase: 14,
  planeBaseSize: 1, // initial plane width
  zStart: -1,    // far plane base
  zStep: 0.15,   // each new plane moves closer (towards camera)
  maxPlanes: 250,
  aspectDefault: 16 / 9,
};

/* ---------- ASSET ARRAYS - edit to match your /public paths ---------- */
const peaceAssets = [
  "/assets/peace/videos/22070-325253460_medium.mp4",
  "/assets/peace/videos/88207-602915574_small.mp4",
  "/assets/peace/videos/185947-876963225_medium.mp4",
  // add more...
];

const warAssets = [
  "/assets/war/videos/375-136120054.mp4",
  "/assets/war/videos/26006-353764184.mp4",
  "/assets/war/videos/138115-768324070_small.mp4",
  // add more...
];

/* ---------- INTERNAL STATE ---------- */
const state = {
  sceneObj: null,
  renderer: null,
  scene: null,
  camera: null,
  clock: null,
  planes: [],
  used: {
    peace: new Set(),
    war: new Set(),
  },
  mode: CONFIG.initialMode,
  presses: 0,
  bias: 0,
  locked: false,
  assetsCache: {}, // url -> { type, texture, videoEl? }
  zIndex: 0,        // increments per spawn; used to bring newer planes forward
};

/* ---------- Scene init / dispose ---------- */
export function initScene(mountEl) {
  // use window sizes to avoid zero size on hidden/mount timing issues
  const width = window.innerWidth;
  const height = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(CONFIG.fogColor); // ensure fog blends with background
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  mountEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.fogColor);
  scene.fog = new THREE.Fog(CONFIG.fogColor, CONFIG.fogNear, CONFIG.fogFarBase);

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  camera.position.set(0, 0, 5.8);

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const d = new THREE.DirectionalLight(0xffffff, 0.35);
  d.position.set(1, 1, 1);
  scene.add(d);

  const clock = new THREE.Clock();

  const sceneObj = { mountEl, renderer, scene, camera, clock, animId: null };
  state.sceneObj = sceneObj;
  state.renderer = renderer;
  state.scene = scene;
  state.camera = camera;
  state.clock = clock;

  // animation loop
  function animate() {
    const t = clock.getElapsedTime();

    // subtle camera drift/float for cinematic feeling
    camera.position.x = Math.sin(t * 0.07) * 0.16;
    camera.position.y = Math.sin(t * 0.04) * 0.12;
    camera.lookAt(0, 0, 0);

    // increase fog range with bias so atmosphere changes as bias grows
    const fogFar = CONFIG.fogFarBase + Math.abs(state.bias) * 0.9;
    if (scene.fog) scene.fog.far = fogFar;

    // ensure video textures update (no-op for images)
    for (let p of state.planes) {
      if (p.userData && p.userData.videoTex) {
        // videoTexture auto-updates; setting needsUpdate is safe
        p.userData.videoTex.needsUpdate = true;
      }
    }

    renderer.render(scene, camera);
    sceneObj.animId = requestAnimationFrame(animate);
  }
  animate();

  // resize handling
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  return sceneObj;
}

export function disposeScene(sceneObj) {
  if (!sceneObj) return;
  cancelAnimationFrame(sceneObj.animId);
  try {
    window.removeEventListener("resize", () => {});
  } catch {}
  // dispose planes
  for (let plane of state.planes) {
    try {
      if (plane.userData?.videoEl) {
        plane.userData.videoEl.pause();
        plane.userData.videoEl.src = "";
      }
      if (plane.material?.map) plane.material.map.dispose();
      if (plane.geometry) plane.geometry.dispose();
      if (plane.material) plane.material.dispose();
      state.scene.remove(plane);
    } catch (e) {}
  }
  state.planes = [];
  try {
    if (sceneObj.renderer) sceneObj.renderer.dispose();
    if (sceneObj.mountEl && sceneObj.mountEl.firstChild)
      sceneObj.mountEl.removeChild(sceneObj.mountEl.firstChild);
  } catch {}
}

/* ---------- Asset preload ---------- */
async function loadAsset(url) {
  if (state.assetsCache[url]) return state.assetsCache[url];
  const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(url);
  if (isVideo) {
    const video = document.createElement("video");
    video.src = url;
    video.crossOrigin = "anonymous";
    video.loop = true;
    video.muted = true;
    video.preload = "auto";
    // Try to load metadata; playing might be blocked until user gesture.
    try {
      await video.play().then(() => video.pause()).catch(() => {});
    } catch {}
    const vtex = new THREE.VideoTexture(video);
    vtex.minFilter = THREE.LinearFilter;
    vtex.magFilter = THREE.LinearFilter;
    vtex.format = THREE.RGBAFormat;
    state.assetsCache[url] = { type: "video", texture: vtex, videoEl: video };
    return state.assetsCache[url];
  } else {
    const loader = new THREE.TextureLoader();
    return new Promise((resolve) => {
      loader.load(
        url,
        (tex) => {
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          state.assetsCache[url] = { type: "image", texture: tex };
          resolve(state.assetsCache[url]);
        },
        undefined,
        () => {
          // on error, still resolve with null so preload continues
          console.warn("Failed to load asset:", url);
          resolve(null);
        }
      );
    });
  }
}

export async function preloadAssets() {
  const all = [...peaceAssets, ...warAssets];
  const concurrency = 3;
  let index = 0;
  const workers = new Array(concurrency).fill(0).map(async () => {
    while (index < all.length) {
      const url = all[index++];
      try {
        await loadAsset(url);
      } catch (e) {
        console.warn("preload failed", url, e);
      }
    }
  });
  await Promise.all(workers);
  return true;
}

/* ---------- No-duplicate asset picker ---------- */
function pickUnusedAssetUrl(poolName) {
  const pool = poolName === "peace" ? peaceAssets : warAssets;
  const usedSet = state.used[poolName];
  // available
  const available = pool.filter((p) => !usedSet.has(p));
  if (available.length === 0) {
    usedSet.clear(); // recycle
    available.push(...pool);
  }
  const idx = Math.floor(Math.random() * available.length);
  const chosen = available[idx];
  usedSet.add(chosen);
  return chosen;
}

/* ---------- Spawn logic exposed ---------- */
export function spawnAssetFromPool(sceneObj) {
  state.presses += 1;

  // simple bias accumulation -> war preference
  if (!state.locked) {
    if (state.presses >= CONFIG.pressesToShift) state.bias += 1.0;
    else state.bias *= 0.985;
    if (state.bias >= 8) {
      state.locked = true;
      state.mode = "war";
    }
  }

  // choose pool (peaceChance decreases as bias grows)
  let chooseWar;
  if (state.locked) chooseWar = true;
  else {
    const basePeace = 0.78;
    const peaceChance = Math.max(0.05, basePeace - state.bias * 0.075);
    chooseWar = Math.random() >= peaceChance;
  }
  state.mode = chooseWar ? "war" : "peace";

  const poolName = state.mode;
  const assetUrl = pickUnusedAssetUrl(poolName);
  spawnPersistentPlane(sceneObj, assetUrl);
  return { pool: poolName, url: assetUrl, presses: state.presses, bias: state.bias };
}

/* ---------- Create persistent plane; newest plane should draw on top ---------- */
function spawnPersistentPlane(sceneObj, url) {
  const { scene } = sceneObj;
  if (!scene) return;

  // enforce max planes
  if (state.planes.length >= CONFIG.maxPlanes) {
    const oldest = state.planes.shift();
    try {
      if (oldest.userData?.videoEl) {
        oldest.userData.videoEl.pause();
        oldest.userData.videoEl.src = "";
      }
      if (oldest.material?.map) oldest.material.map.dispose();
      if (oldest.geometry) oldest.geometry.dispose();
      if (oldest.material) oldest.material.dispose();
      scene.remove(oldest);
    } catch (e) {}
  }

  const cached = state.assetsCache[url];
  if (!cached) return;

  // ----- plane size grows slightly per spawn -----
  const base = CONFIG.planeBaseSize;
  const growth = 0.08 * state.planes.length; // each one ~8% bigger
  const width = base;
  const aspect =
    cached.type === "image" && cached.texture.image
      ? cached.texture.image.width / (cached.texture.image.height || 1)
      : CONFIG.aspectDefault;
  const height = width / aspect;

  const geom = new THREE.PlaneGeometry(width, height);

  // ----- video / image texture -----
  let tex, videoClone = null;
  if (cached.type === "video") {
    // clone the <video> element to get independent playback time
    videoClone = cached.videoEl.cloneNode(true);
    videoClone.currentTime = Math.random() * 3; // desync start position
    videoClone.playbackRate = 0.9 + Math.random() * 0.2; // subtle tempo variance
    videoClone.muted = true;
    videoClone.loop = true;
    // slight async start to avoid all playing same frame
    setTimeout(() => videoClone.play().catch(() => {}), Math.random() * 800);

    tex = new THREE.VideoTexture(videoClone);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.format = THREE.RGBAFormat;
  } else {
    tex = cached.texture.clone ? cached.texture.clone() : cached.texture;
  }

  // ----- material -----
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
  });

  const mesh = new THREE.Mesh(geom, mat);

  // ----- positioning -----
  const x = (Math.random() - 0.5) * 7;
  const y = (Math.random() - 0.5) * 4.2;
  state.zIndex += 1;
  const z = CONFIG.zStart + state.zIndex * CONFIG.zStep; // closer each time
  mesh.position.set(x, y, z);
  mesh.rotation.z = (Math.random() - 0.5) * 0.38;
  mesh.renderOrder = state.zIndex + 1000;

  mesh.userData.videoEl = videoClone;
  mesh.userData.videoTex = tex;

  scene.add(mesh);
  state.planes.push(mesh);

  // ----- fade-in + slight scale animation -----
  const fadeInMs = 600 + Math.random() * 700;
  const start = performance.now();
  const fromScale = 0.9;
  const toScale = 1.05;
  mesh.scale.set(fromScale, fromScale, fromScale);

  (function fadeAnim(now) {
    const t = Math.min(1, (now - start) / fadeInMs);
    mesh.material.opacity = t;
    const s = fromScale + (toScale - fromScale) * easeOutBack(t);
    mesh.scale.setScalar(s);
    if (t < 1) requestAnimationFrame(fadeAnim);
  })(start);
}


/* ---------- small helpers ---------- */
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function getControlState() {
  return {
    presses: state.presses,
    bias: state.bias,
    mode: state.mode,
    locked: state.locked,
  };
}
