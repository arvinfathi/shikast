'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import * as Tone from 'tone';

// ----------------------------------------
// GAME CONFIGURATION
// ----------------------------------------
const GAME_CONFIG = {
  FONT_URL: 'https://cdn.jsdelivr.net/npm/three@0.164.1/examples/fonts/helvetiker_bold.typeface.json',
  MISSIONS: [
    {
      level: 0,
      left: {
        id: '0xEsRCJKkg4', 
        thumbnail: `https://img.youtube.com/vi/2rCtfrxfsOs/maxresdefault.jpg`,
        endThumbnail: `https://img.youtube.com/vi/7mhL2AKSPYc/maxresdefault.jpg`, // Example end thumb
        title: "Don't take the knife"
      },
      right: {
        id: '0xEsRCJKkg4', 
        thumbnail: `https://img.youtube.com/vi/7mhL2AKSPYc/maxresdefault.jpg`,
        endThumbnail: `https://img.youtube.com/vi/7mhL2AKSPYc/mqdefault.jpg`, // Example end thumb
        title: 'Take the knife'
      },
    },
    {
      level: 1,
      left: {
        id: '0xEsRCJKkg4', 
        thumbnail: `https://img.youtube.com/vi/ya8EgxN3cbE/maxresdefault.jpg`,
        endThumbnail: `https://img.youtube.com/vi/ya8EgxN3cbE/mqdefault.jpg`,
        title: 'Join the fight'
      },
      right: {
        id: '0xEsRCJKkg4', 
        thumbnail: `https://img.youtube.com/vi/pRjhFcUxCR4/maxresdefault.jpg`,
        endThumbnail: `https://img.youtube.com/vi/pRjhFcUxCR4/mqdefault.jpg`,
        title: 'Go to party'
      },
    },
    {
      level: 2,
      left: {
        id: '0xEsRCJKkg4', 
        thumbnail: `https://img.youtube.com/vi/ya8EgxN3cbE/maxresdefault.jpg`,
        endThumbnail: `https://img.youtube.com/vi/ya8EgxN3cbE/mqdefault.jpg`,
        title: 'Join the fight'
      },
      right: {
        id: '0xEsRCJKkg4', 
        thumbnail: `https://img.youtube.com/vi/pRjhFcUxCR4/maxresdefault.jpg`,
        endThumbnail: `https://img.youtube.com/vi/pRjhFcUxCR4/mqdefault.jpg`,
        title: 'Go to party'
      },
    },
  ],
  // Text for the final screen
  END_TEXT: 'FIN.',
};

// ----------------------------------------
// AUDIO MANAGER
// ----------------------------------------
class AudioManager {
  CONFIG = {
    AMBIENT_VOLUME: -30, // in decibels
    DISSOLVE_VOLUME: -10,
    SELECT_VOLUME: -15,
  };

  constructor() {
    this.lastDissolveTime = 0; // For bug fix
    this.ambientSynth = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 5, decay: 0.1, sustain: 1, release: 5 },
      volume: this.CONFIG.AMBIENT_VOLUME,
    }).toDestination();

    this.dissolveSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.1 },
      volume: this.CONFIG.DISSOLVE_VOLUME,
    }).toDestination();

    this.selectSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 },
      volume: this.CONFIG.SELECT_VOLUME,
    }).toDestination();

    this.isStarted = false;
  }

  // Must be called after user interaction
  async start() {
    if (this.isStarted) return;
    await Tone.start();
    this.ambientSynth.triggerAttack();
    this.isStarted = true;
    console.log('Audio Context Started');
  }

  playDissolve() {
    if (!this.isStarted) return;
    
    // *** FIX for Tone.js runtime error ***
    // Prevent re-triggering the sound if it was just played
    const now = Tone.now();
    if (now - this.lastDissolveTime < 0.05) { // 50ms buffer
      return;
    }
    this.lastDissolveTime = now;
    this.dissolveSynth.triggerAttackRelease('0.5', now);
  }

  playSelect() {
    if (!this.isStarted) return;
    this.selectSynth.triggerAttackRelease('C3', '0.1');
  }

  stopAmbient() {
    this.ambientSynth.triggerRelease();
  }

  dispose() {
    this.stopAmbient();
    this.ambientSynth.dispose();
    this.dissolveSynth.dispose();
    this.selectSynth.dispose();
  }
}

// ----------------------------------------
// SCENE MANAGER
// ----------------------------------------
class SceneManager {
  CONFIG = {
    CAMERA_Z: 5,
    BLOOM_PARAMS: { strength: 0.5, radius: 0.6, threshold: 0.1 },
    FILM_PARAMS: { noiseIntensity: 0.35, scanlineIntensity: 0.5 },
    ZOOM_DURATION: 1.5, // seconds
    RESET_DURATION: 1.5, // seconds, increased for smoother travel
  };

  constructor(mountEl) {
    this.mountEl = mountEl;
    this.clock = new THREE.Clock();

    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    this.camera.position.z = this.CONFIG.CAMERA_Z;
    this.originalCameraPos = this.camera.position.clone(); // Store original position

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    mountEl.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      this.CONFIG.BLOOM_PARAMS.strength,
      this.CONFIG.BLOOM_PARAMS.radius,
      this.CONFIG.BLOOM_PARAMS.threshold
    );
    this.filmPass = new FilmPass(
      this.CONFIG.FILM_PARAMS.noiseIntensity,
      this.CONFIG.FILM_PARAMS.scanlineIntensity, 2048, false
    );
    
    // Fade Pass
    this.fadeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uFade: { value: 0.0 } // 0 = visible, 1 = black
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uFade;
        varying vec2 vUv;
        void main() {
          vec4 texColor = texture2D(tDiffuse, vUv);
          gl_FragColor = texColor * (1.0 - uFade);
        }
      `,
      transparent: true
    });
    this.fadePass = new ShaderPass(this.fadeMaterial);

    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.filmPass);
    this.composer.addPass(this.fadePass);

    this.setPostProcessingEnabled(true);
    window.addEventListener('resize', this.onResize);
  }

  setPostProcessingEnabled = (enabled) => {
    this.bloomPass.enabled = enabled;
    this.filmPass.enabled = enabled;
  };

  // Animate fade (0 to 1)
  fadeTo = (targetFade, duration = 1.0) => {
    return new Promise((resolve) => {
      const startTime = this.clock.getElapsedTime();
      const startFade = this.fadePass.material.uniforms.uFade.value;
      const tick = () => {
        const elapsed = this.clock.getElapsedTime() - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        const easeProgress = 0.5 * (1 - Math.cos(Math.PI * progress));
        this.fadePass.material.uniforms.uFade.value = THREE.MathUtils.lerp(startFade, targetFade, easeProgress);
        
        if (progress < 1.0) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      tick();
    });
  };

  zoomToPanel = (panel) => {
    return new Promise((resolve) => {
      const duration = this.CONFIG.ZOOM_DURATION;
      const cam = this.camera;
      
      // Calculate target scale to fill screen
      // Use panel's Z position for accurate distance
      const distance = cam.position.z - panel.position.z; 
      const vFov = (cam.fov * Math.PI) / 180;
      const height = 2 * Math.tan(vFov / 2) * distance;
      const width = height * cam.aspect;
      
      const startPos = cam.position.clone();
      // Zoom to the panel's X, Y, but maintain camera's Z offset from panel
      const endPos = new THREE.Vector3(panel.position.x, panel.position.y, panel.position.z + this.CONFIG.CAMERA_Z);
      const startScale = panel.scale.clone();
      const endScale = new THREE.Vector3(
        width / ChoicePanel.CONFIG.PANEL_WIDTH, 
        height / (ChoicePanel.CONFIG.PANEL_WIDTH / ChoicePanel.CONFIG.ASPECT), 
        1
      );
      const startBorder = panel.material.uniforms.borderWidth.value;

      const startTime = this.clock.getElapsedTime();
      const tick = () => {
        const elapsed = this.clock.getElapsedTime() - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        const easeProgress = 0.5 * (1 - Math.cos(Math.PI * progress));
        
        cam.position.lerpVectors(startPos, endPos, easeProgress);
        panel.scale.lerpVectors(startScale, endScale, easeProgress);
        panel.material.uniforms.borderWidth.value = THREE.MathUtils.lerp(startBorder, 0.0, easeProgress);

        if (progress < 1.0) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      tick();
    });
  };

  resetCamera = (targetZ) => {
     return new Promise((resolve) => {
      const duration = this.CONFIG.RESET_DURATION;
      const cam = this.camera;
      
      const startPos = cam.position.clone();
      const endPos = this.originalCameraPos.clone();
      endPos.z = targetZ; // Set the new target Z

      const startTime = this.clock.getElapsedTime();
      const tick = () => {
        const elapsed = this.clock.getElapsedTime() - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        // *** This is an ease-in/ease-out curve ***
        const easeProgress = 0.5 * (1 - Math.cos(Math.PI * progress)); 
        
        cam.position.lerpVectors(startPos, endPos, easeProgress);

        if (progress < 1.0) {
          requestAnimationFrame(tick);
        } else {
          resolve(); // Resolve promise on completion
        }
      };
      tick();
    });
  }

  onResize = () => {
    const w = this.mountEl.clientWidth;
    const h = this.mountEl.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  };

  update = () => {
    const delta = this.clock.getDelta();
    this.composer.render(delta);
  };

  dispose = () => {
    window.removeEventListener('resize', this.onResize);
    if (this.mountEl.contains(this.renderer.domElement)) {
      this.mountEl.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  };
}

// ----------------------------------------
// PARTICLE MANAGER
// ----------------------------------------
class ParticleManager {
  CONFIG = {
    PARTICLE_SPEED: 0.05,
    PARTICLE_SIZE: 0.02,
    PARTICLE_FADE_SPEED: 0.008,
    DISSOLVE_DURATION_MS: 1500, // Approx duration of particle fade
  };

  constructor(scene, audioManager) {
    this.scene = scene;
    this.audioManager = audioManager;
    this.particleSystems = [];
  }

  dissolveObject = (object, particleCount = 5000) => {
    if (!object) return;

    this.audioManager.playDissolve();

    try {
      const sampler = new MeshSurfaceSampler(object).build();
      const count = particleCount;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      const p = new THREE.Vector3();

      for (let i = 0; i < count; i++) {
        sampler.sample(p);
        positions.set([p.x, p.y, p.z], i * 3);
        const v = new THREE.Vector3(
          (Math.random() - 0.5),
          (Math.random() - 0.5),
          (Math.random() - 0.5)
        );
        v.normalize().multiplyScalar(this.CONFIG.PARTICLE_SPEED * (Math.random() * 0.5 + 0.5));
        velocities.set([v.x, v.y, v.z], i * 3);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: this.CONFIG.PARTICLE_SIZE,
        transparent: true,
        opacity: 1
      });

      const particles = new THREE.Points(geo, mat);
      particles.position.copy(object.position);
      particles.rotation.copy(object.rotation);
      particles.scale.copy(object.scale);

      this.scene.add(particles);
      this.particleSystems.push(particles);
    } catch (err) {
      console.warn('dissolveObject sampling failed:', err);
    }

    // Remove original object
    this.removeObject(object);
  };

  removeObject = (object) => {
    if (!object) return;
    
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose && m.dispose());
        } else {
          child.material.dispose && child.material.dispose();
        }
      }
    });

    if (object.parent) object.parent.remove(object);
  };

  update = () => {
    for (let idx = this.particleSystems.length - 1; idx >= 0; idx--) {
      const ps = this.particleSystems[idx];
      const pos = ps.geometry.attributes.position;
      const vel = ps.geometry.attributes.velocity;

      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(
          i,
          pos.getX(i) + vel.getX(i),
          pos.getY(i) + vel.getY(i),
          pos.getZ(i) + vel.getZ(i)
        );
      }
      pos.needsUpdate = true;
      ps.material.opacity -= this.CONFIG.PARTICLE_FADE_SPEED;

      if (ps.material.opacity <= 0) {
        this.scene.remove(ps);
        ps.geometry.dispose();
        ps.material.dispose();
        this.particleSystems.splice(idx, 1);
      }
    }
  };

  dispose = () => {
    this.particleSystems.forEach(ps => {
      this.scene.remove(ps);
      ps.geometry.dispose();
      ps.material.dispose();
    });
    this.particleSystems = [];
  };
}

// ----------------------------------------
// STARFIELD
// ----------------------------------------
class Starfield {
  CONFIG = {
    COUNT: 3000,
    AREA: 50,
    ROTATE_SPEED: 0.05,
    PARALLAX_FACTOR: 0.3,
  };

  constructor(scene) {
    this.scene = scene;
    this.targetRotationY = 0;
    
    const starPositions = new Float32Array(this.CONFIG.COUNT * 3);
    for (let i = 0; i < this.CONFIG.COUNT; i++) {
      starPositions.set([
        (Math.random() - 0.5) * this.CONFIG.AREA,
        (Math.random() - 0.5) * this.CONFIG.AREA,
        (Math.random() - 0.5) * this.CONFIG.AREA
      ], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.05,
      transparent: true,
      opacity: 0.5
    });
    
    this.mesh = new THREE.Points(starGeo, starMat);
    this.scene.add(this.mesh);
  }
  
  // Call this on panel selection change
  setParallax = (direction) => { // 'left' or 'right'
    if (direction === 'left') {
      this.targetRotationY -= this.CONFIG.PARALLAX_FACTOR;
    } else {
      this.targetRotationY += this.CONFIG.PARALLAX_FACTOR;
    }
  }

  update = () => {
    // Lerp rotation for a smooth parallax effect
    this.mesh.rotation.y += this.CONFIG.ROTATE_SPEED * (this.targetRotationY - this.mesh.rotation.y);
  };
  
  dispose = () => {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ----------------------------------------
// START TEXT
// ----------------------------------------
class StartText {
  CONFIG = {
    TEXT: 'START',
    COLOR: 0xffffff,
    SIZE: 1.9,
    FLOAT_SPEED: 1.5,
    FLOAT_AMPLITUDE: 0.1,
  };

  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
  }

  createMesh = (font) => {
    const geo = new TextGeometry(this.CONFIG.TEXT, {
      font,
      size: this.CONFIG.SIZE,
      height: 0.1,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelOffset: 0,
      bevelSegments: 5
    });
    geo.center();
    const mat = new THREE.MeshBasicMaterial({ color: this.CONFIG.COLOR });
    this.mesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.mesh);
  };

  update = (elapsedTime) => {
    if (this.mesh) {
      this.mesh.position.y = Math.sin(elapsedTime * this.CONFIG.FLOAT_SPEED) * this.CONFIG.FLOAT_AMPLITUDE;
    }
  };
}

// ----------------------------------------
// END TEXT (MODIFIED)
// ----------------------------------------
class EndText {
  // *** NEW: Configurable properties ***
  static CONFIG = {
    TEXT: GAME_CONFIG.END_TEXT,
    COLOR: 0xffffff,
    SIZE: 1.9,
    FLOAT_SPEED: 1.5,
    FLOAT_AMPLITUDE: 0.1,
    IS_FLOATING: true // Set to false to disable float
  };

  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
  }

  createMesh = (font) => {
    // Style matches StartText
    const geo = new TextGeometry(EndText.CONFIG.TEXT, {
      font,
      size: EndText.CONFIG.SIZE,
      height: 0.1,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelOffset: 0,
      bevelSegments: 5
    });
    geo.center();
    const mat = new THREE.MeshBasicMaterial({ color: EndText.CONFIG.COLOR });
    this.mesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.mesh);
  };
  
  // *** NEW: Update/float function ***
  update = (elapsedTime) => {
    if (this.mesh && EndText.CONFIG.IS_FLOATING) {
      this.mesh.position.y = Math.sin(elapsedTime * EndText.CONFIG.FLOAT_SPEED) * EndText.CONFIG.FLOAT_AMPLITUDE;
    }
  };
}

// ----------------------------------------
// CHOICE PANEL
// ----------------------------------------
class ChoicePanel {
  static CONFIG = {
    ASPECT: 16 / 9,
    PANEL_WIDTH: 4.5,
    PANEL_GAP: 0.8,
    Y_OFFSET: 0.5,
    FLOAT_SPEED_1: 1.2,
    FLOAT_SPEED_2: 1.3,
    FLOAT_AMPLITUDE: 0.1,
    BORDER_WIDTH: 0.05,
    BORDER_COLOR: new THREE.Color(0xff0000), // Red
    SELECTED_SCALE: 1.1,
    DEFAULT_SCALE: 1.0,
    TITLE_TEXT_CONFIG: {
      SIZE: 0.3,
      HEIGHT: 0.05,
      COLOR: 0xffffff,
      Y_OFFSET: -0.4 // Offset *below* the panel's bottom edge
    },
    LEVEL_Z_SPACING: -15, // *** REDUCED DISTANCE ***
  };

  static SHADER = {
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform sampler2D tDiffuse;
      uniform float borderWidth;
      uniform vec3 borderColor; // Use vec3 for color
      varying vec2 vUv;

      void main() {
        vec4 texColor = texture2D(tDiffuse, vUv);
        
        // Border calculation
        float border = smoothstep(0.0, borderWidth, vUv.x) * (1.0 - smoothstep(1.0 - borderWidth, 1.0, vUv.x)) *
                       smoothstep(0.0, borderWidth, vUv.y) * (1.0 - smoothstep(1.0 - borderWidth, 1.0, vUv.y));

        if (border < 0.5 && borderWidth > 0.0) {
          // Pulse logic
          float pulse = 0.6 + 0.4 * sin(time * 8.0);
          // Apply pulse to the configured borderColor
          gl_FragColor = vec4(borderColor * pulse, 1.0);
        } else {
          gl_FragColor = texColor;
        }
      }
    `
  };

  constructor(scene, choiceData, side, font, zPos) { 
    this.scene = scene;
    this.youtubeId = choiceData.id; // Store YouTube ID
    this.thumbnailUrl = choiceData.thumbnail; // Store Thumbnail URL
    this.endThumbnailUrl = choiceData.endThumbnail; // *** NEW ***
    this.textureLoader = new THREE.TextureLoader(); // *** NEW ***
    this.title = choiceData.title; 
    this.font = font; 
    this.side = side;
    this.titleMesh = null;

    const panelHeight = ChoicePanel.CONFIG.PANEL_WIDTH / ChoicePanel.CONFIG.ASPECT;
    const geo = new THREE.PlaneGeometry(ChoicePanel.CONFIG.PANEL_WIDTH, panelHeight);
    
    // Load start thumbnail
    const texture = this.textureLoader.load(this.thumbnailUrl, 
      () => {}, // onSuccess
      undefined, // onProgress
      (err) => { // onError
        console.error('Failed to load thumbnail:', this.thumbnailUrl, err);
        // Fallback placeholder
        const placeholderUrl = `https://placehold.co/640x360/000000/ffffff?text=Video+Not+Found`;
        const fallbackTexture = this.textureLoader.load(placeholderUrl);
        if (this.mesh && this.mesh.material) { // Check if mesh exists
          this.mesh.material.uniforms.tDiffuse.value = fallbackTexture;
          this.mesh.material.needsUpdate = true;
        }
      }
    );
    
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        tDiffuse: { value: texture }, // Use start thumbnail
        borderWidth: { value: ChoicePanel.CONFIG.BORDER_WIDTH },
        borderColor: { value: ChoicePanel.CONFIG.BORDER_COLOR }
      },
      vertexShader: ChoicePanel.SHADER.vertexShader,
      fragmentShader: ChoicePanel.SHADER.fragmentShader
    });

    this.mesh = new THREE.Mesh(geo, mat);
    
    const panelX = (ChoicePanel.CONFIG.PANEL_WIDTH / 2) + ChoicePanel.CONFIG.PANEL_GAP;
    this.mesh.position.set(
      side === 'left' ? -panelX : panelX,
      ChoicePanel.CONFIG.Y_OFFSET,
      zPos 
    );
    
    this.scene.add(this.mesh);
    this.createTitleMesh(); 
  }

  // *** NEW METHOD ***
  swapToEndThumbnail = () => {
    if (!this.endThumbnailUrl || !this.mesh) return;
    try {
      const endTexture = this.textureLoader.load(this.endThumbnailUrl,
        () => {}, // onSuccess
        undefined, // onProgress
        (err) => { // onError
          console.warn('Failed to load end thumbnail:', this.endThumbnailUrl, err);
          // Don't swap if it fails, just keep start thumb
        }
      );
      this.mesh.material.uniforms.tDiffuse.value = endTexture;
      this.mesh.material.needsUpdate = true;
    } catch (e) {
      console.error("Error in swapToEndThumbnail:", e);
    }
  }

  createTitleMesh = () => {
    if (!this.font || !this.title) return;

    const config = ChoicePanel.CONFIG.TITLE_TEXT_CONFIG;
    const panelHeight = ChoicePanel.CONFIG.PANEL_WIDTH / ChoicePanel.CONFIG.ASPECT;

    const geo = new TextGeometry(this.title, {
      font: this.font,
      size: config.SIZE,
      height: config.HEIGHT,
      curveSegments: 4, // Keep it simple
      bevelEnabled: false
    });
    geo.center(); // Center the text geometry itself

    const mat = new THREE.MeshBasicMaterial({ color: config.COLOR });
    this.titleMesh = new THREE.Mesh(geo, mat);

    // Position it relative to the parent panel mesh
    this.titleMesh.position.y = (-panelHeight / 2) + config.Y_OFFSET; 
    
    this.mesh.add(this.titleMesh); // Add as a child to the panel mesh
  }

  update = (elapsedTime, isSelected) => {
    if (!this.mesh) return;
    
    this.mesh.material.uniforms.time.value = elapsedTime;

    // Float animation
    const floatSpeed = this.side === 'left' ? ChoicePanel.CONFIG.FLOAT_SPEED_1 : ChoicePanel.CONFIG.FLOAT_SPEED_2;
    // Use the mesh's original Y offset
    const baseY = ChoicePanel.CONFIG.Y_OFFSET;
    this.mesh.position.y = baseY + Math.sin(elapsedTime * floatSpeed) * ChoicePanel.CONFIG.FLOAT_AMPLITUDE;

    // Scale animation
    const targetScale = isSelected ? ChoicePanel.CONFIG.SELECTED_SCALE : ChoicePanel.CONFIG.DEFAULT_SCALE;
    this.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1);
  };
}

// ----------------------------------------
// TIMER BAR
// ----------------------------------------
class TimerBar {
  CONFIG = {
    DURATION: 15000, // ms
    BAR_HEIGHT: 0.05,
    Y_OFFSET: 0.3, // Distance above panels
    COLORS: {
      GREEN: new THREE.Color(0x00ff00),
      YELLOW: new THREE.Color(0xffff00),
      RED: new THREE.Color(0xff0000)
    },
    MAX_PARTICLES: 2000 // max particles when dissolving
  };

  constructor(scene, particleManager, onTimeout, zPos) {
    this.scene = scene;
    this.particleManager = particleManager;
    this.onTimeout = onTimeout; // Callback when timer reaches zero
    this.active = false;
    this.startTime = 0;
    this.mesh = null;
    
    this.createMesh(zPos);
  }
  
  createMesh = (zPos) => {
    // Calculate total width based on panels
    const panelTotalWidth = (ChoicePanel.CONFIG.PANEL_WIDTH + ChoicePanel.CONFIG.PANEL_GAP) * 2 - ChoicePanel.CONFIG.PANEL_GAP;
    const panelHeight = ChoicePanel.CONFIG.PANEL_WIDTH / ChoicePanel.CONFIG.ASPECT;
    
    const geometry = new THREE.PlaneGeometry(panelTotalWidth, this.CONFIG.BAR_HEIGHT);
    const material = new THREE.MeshBasicMaterial({ color: this.CONFIG.COLORS.GREEN });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = ChoicePanel.CONFIG.Y_OFFSET + (panelHeight / 2) + this.CONFIG.Y_OFFSET;
    this.mesh.position.z = zPos; // *** Use new zPos ***
    
    this.scene.add(this.mesh);
  }

  start = (elapsedTime) => {
    this.startTime = elapsedTime;
    this.active = true;
  };
  
  getProgress = (elapsedTime) => {
    if (!this.active) return 0;
    const elapsedTimer = (elapsedTime - this.startTime) * 1000;
    const remaining = Math.max(0, this.CONFIG.DURATION - elapsedTimer);
    return remaining / this.CONFIG.DURATION;
  }

  update = (elapsedTime) => {
    if (!this.active || !this.mesh) return;

    const progress = this.getProgress(elapsedTime);
    
    this.mesh.scale.x = progress;
    
    const originalWidth = this.mesh.geometry.parameters.width;
    this.mesh.position.x = -(1 - progress) * (originalWidth / 2);

    // Update color
    if (progress > 0.5) {
      this.mesh.material.color.lerpColors(this.CONFIG.COLORS.YELLOW, this.CONFIG.COLORS.GREEN, (progress - 0.5) * 2);
    } else {
      this.mesh.material.color.lerpColors(this.CONFIG.COLORS.RED, this.CONFIG.COLORS.YELLOW, progress * 2);
    }

    if (progress <= 0) {
      this.active = false;
      this.onTimeout(); // Notify game engine
    }
  };

  onChoiceMade = (isTimeout, remainingProgress) => {
    this.active = false;
    if (isTimeout) {
      this.particleManager.removeObject(this.mesh);
    } else {
      const particleCount = Math.max(10, Math.floor(this.CONFIG.MAX_PARTICLES * remainingProgress));
      this.particleManager.dissolveObject(this.mesh, particleCount);
    }
    this.mesh = null;
  }
  
  dispose = () => {
    this.particleManager.removeObject(this.mesh);
  }
}

// ----------------------------------------
// GAME ENGINE
// ----------------------------------------
class GameEngine {
  constructor(mountEl, showYoutubeCallback, setInstructionsCallback) {
    this.mountEl = mountEl;
    this.showYoutubeCallback = showYoutubeCallback; // Store callback
    this.setInstructionsCallback = setInstructionsCallback;

    this.state = 'loading';
    this.selectedPanel = 'left';
    this.currentMissionIndex = 0;
    this.animationId = null;
    this.font = null; 

    // Init Managers
    this.sceneManager = new SceneManager(mountEl);
    this.audioManager = new AudioManager();
    this.particleManager = new ParticleManager(this.sceneManager.scene, this.audioManager);
    
    // Init Game Objects
    this.starfield = new Starfield(this.sceneManager.scene);
    this.startText = new StartText(this.sceneManager.scene);
    this.endText = null; 
    this.timerBar = null;
    this.panels = { left: null, right: null };

    // *** NEW: Refactor level creation ***
    this.currentLevel = { panels: { left: null, right: null }, timer: null };
  }
  
  loadFont = () => {
    const fontLoader = new FontLoader();
    return new Promise((resolve, reject) => {
      fontLoader.load(GAME_CONFIG.FONT_URL, resolve, undefined, reject);
    });
  }

  start = async () => {
    try {
      this.font = await this.loadFont();
      this.startText.createMesh(this.font);
      
      this.state = 'intro';
      this.setInstructionsCallback('Press any key to begin');
      window.addEventListener('keydown', this.onStartKey, { once: true });
      this.animate();
    } catch (err) {
      console.error('Failed to load font:', err);
      this.setInstructionsCallback('Error: Failed to load resources.');
    }
  };

  onStartKey = () => {
    if (this.state !== 'intro') return;
    
    this.audioManager.start(); 
    
    this.particleManager.dissolveObject(this.startText.mesh);
    this.startText.mesh = null;
    this.state = 'dissolving';
    
    setTimeout(() => {
      this.activateLevel(0);
    }, 1500); // Wait for dissolve animation
  };
  
  // *** NEW: Creates a level but does not activate it ***
  createLevel = (index) => {
    const mission = GAME_CONFIG.MISSIONS[index];
    if (!mission) return null;
    
    const levelZ = index * ChoicePanel.CONFIG.LEVEL_Z_SPACING;
    
    const newPanels = {
      left: new ChoicePanel(this.sceneManager.scene, mission.left, 'left', this.font, levelZ),
      right: new ChoicePanel(this.sceneManager.scene, mission.right, 'right', this.font, levelZ)
    };
    const newTimer = new TimerBar(this.sceneManager.scene, this.particleManager, this.onTimerTimeout, levelZ);
    
    return { panels: newPanels, timer: newTimer };
  }

  // *** NEW: Activates a pre-created level ***
  activateLevel = (index) => {
    // Clean up any *previous* level objects
    if (this.currentLevel.panels.left) this.particleManager.removeObject(this.currentLevel.panels.left.mesh);
    if (this.currentLevel.panels.right) this.particleManager.removeObject(this.currentLevel.panels.right.mesh);
    if (this.currentLevel.timer) this.particleManager.removeObject(this.currentLevel.timer.mesh);
    
    const newLevel = this.createLevel(index);
    
    if (!newLevel) {
       console.error('No mission data found for index:', index);
       this.showEndScreen(); // Should be handled by onVideoEnded
       return;
    }

    this.currentLevel = newLevel;
    this.panels = newLevel.panels; // Keep this for selection logic
    this.timerBar = newLevel.timer;
    
    this.timerBar.start(this.sceneManager.clock.getElapsedTime());
    this.state = 'selection';
    this.setInstructionsCallback('Use ← and → to choose. Press Enter to select.');
    window.addEventListener('keydown', this.onSelectionKey);
  };
  
  onSelectionKey = (e) => {
    if (this.state !== 'selection') return;

    if (e.key === 'ArrowLeft') {
      this.selectedPanel = 'left';
      this.starfield.setParallax('left');
      this.audioManager.playSelect();
    } else if (e.key === 'ArrowRight') {
      this.selectedPanel = 'right';
      this.starfield.setParallax('right');
      this.audioManager.playSelect();
    } else if (e.key === 'Enter') {
      this.selectChoice(false); // User selected, not a timeout
    }
  };
  
  // *** NEW: End screen key listener ***
  onEndKey = (e) => {
    if (this.state !== 'end') return;

    if (e.key === 'ArrowLeft') {
      this.starfield.setParallax('left');
    } else if (e.key === 'ArrowRight') {
      this.starfield.setParallax('right');
    }
  }
  
  onTimerTimeout = () => {
    this.selectChoice(true); // Is a timeout
  };

  selectChoice = async (isTimeout) => {
    if (this.state !== 'selection') return;
    
    // *** BUG FIX: Check if chosenPanel is valid before proceeding ***
    const chosenPanel = this.panels[this.selectedPanel];
    if (!chosenPanel) {
      console.error('selectChoice called but chosenPanel is null. State:', this.state, 'Selected:', this.selectedPanel);
      return; // Prevent crash
    }
    
    this.state = 'zooming'; 
    window.removeEventListener('keydown', this.onSelectionKey);
    this.setInstructionsCallback('');
    
    this.sceneManager.setPostProcessingEnabled(true);

    const unchosenPanel = this.panels[this.selectedPanel === 'left' ? 'right' : 'left'];

    // 1. Handle Timer Dissolve
    const remainingProgress = this.timerBar.getProgress(this.sceneManager.clock.getElapsedTime());
    this.timerBar.onChoiceMade(isTimeout, remainingProgress);
    this.timerBar = null;

    // 2. Dissolve unchosen panel
    if (unchosenPanel && unchosenPanel.mesh) {
      this.particleManager.dissolveObject(unchosenPanel.mesh);
      this.panels[this.selectedPanel === 'left' ? 'right' : 'left'] = null;
    }
    
    // 3. Remove the title from the *chosen* panel
    if (chosenPanel && chosenPanel.titleMesh) {
       this.particleManager.removeObject(chosenPanel.titleMesh);
       chosenPanel.titleMesh = null;
    }
    
    // 4. Zoom into the chosen panel
    if (chosenPanel && chosenPanel.mesh) {
      await this.sceneManager.zoomToPanel(chosenPanel.mesh);
    }
    
    // 5. Fade out 3D scene to black
    await this.sceneManager.fadeTo(1, 0.5); // Fade to black
    this.sceneManager.setPostProcessingEnabled(false); 
    
    // 6. Tell React to show the YouTube video
    this.showYoutubeCallback(chosenPanel.youtubeId);
  };
  
  onVideoEnded = async () => {
    console.log('Video finished. Fading in for dissolve.');
    this.state = 'travelling'; // Set new state
    
    this.sceneManager.setPostProcessingEnabled(true);
    
    // Get panel from *current* level
    const chosenPanel = this.currentLevel.panels[this.selectedPanel];

    // 1. *** NEW: Swap to end thumbnail *before* fade-in ***
    if (chosenPanel) {
      chosenPanel.swapToEndThumbnail();
    }
    
    // 2. Fade back IN to the zoomed-in panel
    await this.sceneManager.fadeTo(0, 1.0);
    
    // 3. Wait a moment to see the end thumbnail
    await new Promise(r => setTimeout(r, 500)); // 500ms delay

    // 4. Pre-load next level panels
    const nextMissionIndex = this.currentMissionIndex + 1;
    let nextLevel = null;
    if (nextMissionIndex < GAME_CONFIG.MISSIONS.length) {
      // Create panels for next level, but don't activate
      nextLevel = this.createLevel(nextMissionIndex); 
    }

    // 5. Start camera move *concurrently*
    let cameraMovePromise;
    this.currentMissionIndex++; // Increment level *now*
    
    if (this.currentMissionIndex >= GAME_CONFIG.MISSIONS.length) {
      console.log('End of missions');
      // Fade to black for the *final* end screen
      cameraMovePromise = this.sceneManager.fadeTo(1, 1.0); 
    } else {
      // Move camera to new Z position
      const nextLevelZ = this.currentMissionIndex * ChoicePanel.CONFIG.LEVEL_Z_SPACING;
      const newCameraZ = nextLevelZ + this.sceneManager.CONFIG.CAMERA_Z;
      cameraMovePromise = this.sceneManager.resetCamera(newCameraZ);
    }
    
    // 6. Dissolve panel *concurrently*
    if (chosenPanel && chosenPanel.mesh) {
      this.particleManager.dissolveObject(chosenPanel.mesh);
      this.currentLevel.panels[this.selectedPanel] = null; // Clear from old level
    }

    // 7. Wait for camera/fade to finish
    await cameraMovePromise;

    // 8. Activate next level *after* camera arrives
    if (this.currentMissionIndex >= GAME_CONFIG.MISSIONS.length) {
      await this.showEndScreen(); // Await the async end screen
    } else {
      // Activate the pre-created level
      this.currentLevel = nextLevel;
      this.panels = nextLevel.panels; // Update panel refs for selection
      this.timerBar = nextLevel.timer;
      
      this.timerBar.start(this.sceneManager.clock.getElapsedTime());
      this.state = 'selection';
      this.setInstructionsCallback('Use ← and → to choose. Press Enter to select.');
      window.addEventListener('keydown', this.onSelectionKey);
    }
  }
  
  showEndScreen = async () => {
    this.setInstructionsCallback(''); // Clear old instructions
              
    // Position text in front of the camera
    const camPos = this.sceneManager.camera.position;
    const textPos = new THREE.Vector3(camPos.x, camPos.y, camPos.z - this.sceneManager.CONFIG.CAMERA_Z);
    
    this.endText = new EndText(this.sceneManager.scene);
    this.endText.createMesh(this.font);
    this.endText.mesh.position.copy(textPos);
    
    // *** NEW: Add end key listener and set state ***
    this.state = 'end';
    window.addEventListener('keydown', this.onEndKey);
    
    // Fade in to see the final text
    await this.sceneManager.fadeTo(0, 1.5);
  }

  animate = () => {
    const elapsedTime = this.sceneManager.clock.getElapsedTime();

    if (this.state === 'intro' && this.startText) {
      this.startText.update(elapsedTime);
    }
    
    if (this.state === 'selection') {
      // *** BUG FIX: Use currentLevel for animation updates ***
      if (this.currentLevel.panels.left) this.currentLevel.panels.left.update(elapsedTime, this.selectedPanel === 'left');
      if (this.currentLevel.panels.right) this.currentLevel.panels.right.update(elapsedTime, this.selectedPanel === 'right');
      if (this.currentLevel.timer) this.currentLevel.timer.update(elapsedTime);
    }
    
    // *** NEW: Animate end text ***
    if (this.state === 'end' && this.endText) {
      this.endText.update(elapsedTime);
    }

    this.starfield.update();
    this.particleManager.update();
    this.sceneManager.update();
    
    this.animationId = requestAnimationFrame(this.animate);
  };

  destroy = () => {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('keydown', this.onStartKey);
    window.removeEventListener('keydown', this.onSelectionKey);
    window.removeEventListener('keydown', this.onEndKey); // *** NEW: Remove end key listener ***
    
    this.particleManager.dispose();
    this.starfield.dispose();
    
    // Dispose current level objects
    this.currentLevel.timer?.dispose();
    this.currentLevel.panels.left?.mesh && this.particleManager.removeObject(this.currentLevel.panels.left.mesh);
    this.currentLevel.panels.right?.mesh && this.particleManager.removeObject(this.currentLevel.panels.right.mesh);

    this.startText.mesh && this.particleManager.removeObject(this.startText.mesh);
    this.endText?.mesh && this.particleManager.removeObject(this.endText.mesh); 
    this.audioManager.dispose();
    this.sceneManager.dispose();
  };
}

// ----------------------------------------
// REACT COMPONENT
// ----------------------------------------
const ArtExperience = () => {
  const mountRef = useRef(null);
  const [instructions, setInstructions] = useState('Loading...');
  const [youtubeId, setYoutubeId] = useState(null); 
  const playerRef = useRef(null); 
  const gameEngineRef = useRef(null); 
  const isApiReady = useRef(false); 
  
  // State to control player destruction
  const [isPlayerDestroyed, setIsPlayerDestroyed] = useState(true);

  // Callback for when video ends
  const handleVideoEnded = useCallback(() => {
    console.log("Video ended, telling game engine.");
    setYoutubeId(null); // Trigger player destruction
  }, []); 

  // useEffect to load YouTube API
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      isApiReady.current = true;
      return;
    }

    if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      // If script is already present, just wait for the API ready
      const interval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          console.log("YouTube API Ready (already loaded)");
          isApiReady.current = true;
          clearInterval(interval);
        }
      }, 100);

      window.onYouTubeIframeAPIReady = () => {
        console.log("YouTube API Ready");
        isApiReady.current = true;
        clearInterval(interval);
      };
      return;
    }
    
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    } else {
        document.head.appendChild(tag);
    }

    window.onYouTubeIframeAPIReady = () => {
      console.log("YouTube API Ready");
      isApiReady.current = true;
    };
  }, []);

  // useEffect to create/destroy YT Player
  useEffect(() => {
    const createPlayer = () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch(e) {
          console.warn("Old player failed", e);
        }
      }
      setIsPlayerDestroyed(false); // Player is about to be created
      playerRef.current = new window.YT.Player('youtube-player-mount', {
        height: '100%',
        width: '100%',
        videoId: youtubeId, 
        playerVars: {
          'autoplay': 1,
          'controls': 0, 
          'rel': 0, 
          'modestbranding': 1, 
          'iv_load_policy': 3, 
          'disablekb': 1 
        },
        events: {
          'onReady': (event) => event.target.playVideo(),
          'onStateChange': (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              handleVideoEnded();
            }
          }
        }
      });
    };
    
    if (youtubeId) {
      if (isApiReady.current) {
        createPlayer();
      } else {
        const checkApiInterval = setInterval(() => {
          if (isApiReady.current) {
            clearInterval(checkApiInterval);
            createPlayer();
          }
        }, 100);
      }
    } else if (!youtubeId && playerRef.current) {
      // URL is null (video ended), destroy the player
      try {
        playerRef.current.destroy();
      } catch (e) {
        console.warn("Error destroying YouTube player:", e);
      }
      playerRef.current = null;
      setIsPlayerDestroyed(true); // Mark player as destroyed
    } else {
      setIsPlayerDestroyed(true); // Ensure it's true initially
    }

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.warn("Error destroying YouTube player on unmount:", e);
        }
        playerRef.current = null;
      }
    }
  }, [youtubeId, handleVideoEnded]); 

  // useEffect to trigger next level
  // This effect runs *after* the player is destroyed
  useEffect(() => {
    if (isPlayerDestroyed && gameEngineRef.current) {
      // Check if the state is 'zooming' or 'travelling'
      // 'zooming' is set right before video plays
      // 'travelling' will be set *after* video ends
      if (gameEngineRef.current.state === 'zooming') {
        console.log("Player is destroyed, telling engine to proceed.");
        gameEngineRef.current.onVideoEnded(); // Tell engine to proceed
      }
    }
  }, [isPlayerDestroyed]);

  // *** NEW: useEffect to disable right-click ***
  useEffect(() => {
    // Disable right-click context menu
    const handleContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);
  
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []); // Empty dependency array, runs once on mount

  // Original useEffect to init GameEngine
  useEffect(() => {
    if (!mountRef.current) return;

    const gameEngine = new GameEngine(
      mountRef.current,
      (id) => {
        setIsPlayerDestroyed(false); // Reset destroy flag
        setYoutubeId(id); // Show player
      },
      setInstructions 
    );
    
    gameEngineRef.current = gameEngine; // Store instance
    gameEngine.start();

    return () => {
      if (gameEngineRef.current) {
        gameEngineRef.current.destroy();
      }
      gameEngineRef.current = null;
      // Clean up YouTube API callback to prevent memory leaks
      window.onYouTubeIframeAPIReady = null;
    };
  }, []); 


  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: '#000',
      fontFamily: 'Inter, sans-serif',
      color: 'white',
      overflow: 'hidden',
      pointerEvents: 'none', // Disable mouse events on main window
      cursor: 'none' // *** ADDED: Hide cursor ***
    }}>
      {/* 3D Canvas Mount Point */}
      <div ref={mountRef} style={{ width: '100%', height: '100%', transition: 'opacity 0.5s ease' }} />
      
      {/* Instructions Overlay */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        width: '100%',
        textAlign: 'center',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.5)',
        transition: 'opacity 0.5s ease',
        opacity: instructions ? 1 : 0,
        pointerEvents: 'none' // Disable mouse events on instructions
      }}>
        {instructions}
      </div>
      
      {/* YouTube Video Overlay */}
      {youtubeId && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,1)',
          zIndex: 10,
          pointerEvents: 'auto' // Re-enable pointer events for this overlay
        }}>
          {/* This div is the mount point for the YT Player */}
          <div id="youtube-player-mount" style={{ width: '100%', height: '100%' }}></div>
          
          {/* Click/Hover Shield */}
          {/* This transparent div sits on top of the iframe to block all mouse interactions */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 11, // Higher zIndex than the player
            background: 'transparent',
            cursor: 'none' // *** ADDED: Hide cursor on shield ***
          }}></div>
        </div>
      )}
      
    </div>
  );
};

export default function Home() {
  return (
    <main>
      <ArtExperience />
    </main>
  );
}

