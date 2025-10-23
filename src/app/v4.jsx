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
        // *** Reverted to YouTube IDs and Thumbnails ***
        id: '2rCtfrxfsOs', 
        thumbnail: `https://img.youtube.com/vi/2rCtfrxfsOs/maxresdefault.jpg`,
        title: "Don't take the knife"
      },
      right: {
        id: '7mhL2AKSPYc', 
        thumbnail: `https://img.youtube.com/vi/7mhL2AKSPYc/maxresdefault.jpg`,
        title: 'Take the knife'
      },
    },
    {
      level: 1,
      left: {
        id: 'ya8EgxN3cbE', 
        thumbnail: `https://img.youtube.com/vi/ya8EgxN3cbE/maxresdefault.jpg`,
        title: 'Join the fight'
      },
      right: {
        id: 'pRjhFcUxCR4', 
        thumbnail: `https://img.youtube.com/vi/pRjhFcUxCR4/maxresdefault.jpg`,
        title: 'Go to party'
      },
    },
    {
      level:2,
      left: {
        id: 'ya8EgxN3cbE', 
        thumbnail: `https://img.youtube.com/vi/ya8EgxN3cbE/maxresdefault.jpg`,
        title: 'Join the fight'
      },
      right: {
        id: 'pRjhFcUxCR4', 
        thumbnail: `https://img.youtube.com/vi/pRjhFcUxCR4/maxresdefault.jpg`,
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
// ... (code unchanged) ...
  CONFIG = {
    AMBIENT_VOLUME: -30, // in decibels
    DISSOLVE_VOLUME: -10,
    SELECT_VOLUME: -15,
  };

  constructor() {
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
    this.dissolveSynth.triggerAttackRelease('0.5');
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
// ... (code unchanged, zoomToPanel and resetCamera are used) ...
  CONFIG = {
    CAMERA_Z: 5,
    BLOOM_PARAMS: { strength: 0.5, radius: 0.6, threshold: 0.1 },
    FILM_PARAMS: { noiseIntensity: 0.35, scanlineIntensity: 0.5 },
    ZOOM_DURATION: 1.5, // seconds
    RESET_DURATION: 1.0, // seconds
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
// ... (renderer setup) ...
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    mountEl.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
// ... (composer setup) ...
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
// ... (bloom pass setup) ...
      this.CONFIG.BLOOM_PARAMS.strength,
      this.CONFIG.BLOOM_PARAMS.radius,
      this.CONFIG.BLOOM_PARAMS.threshold
    );
    this.filmPass = new FilmPass(
// ... (film pass setup) ...
      this.CONFIG.FILM_PARAMS.noiseIntensity,
      this.CONFIG.FILM_PARAMS.scanlineIntensity, 2048, false
    );
    
    // Fade Pass
    this.fadeMaterial = new THREE.ShaderMaterial({
// ... (fade shader) ...
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

  // *** NEW: Zooms camera to the selected panel ***
  zoomToPanel = (panel) => {
    return new Promise((resolve) => {
      const duration = this.CONFIG.ZOOM_DURATION;
      const cam = this.camera;
      
      // Calculate target scale to fill screen
      const distance = cam.position.z - panel.position.z;
      const vFov = (cam.fov * Math.PI) / 180;
      const height = 2 * Math.tan(vFov / 2) * distance;
      const width = height * cam.aspect;
      
      const startPos = cam.position.clone();
      const endPos = new THREE.Vector3(panel.position.x, panel.position.y, cam.position.z);
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

  // *** NEW: Resets camera to original position ***
  resetCamera = () => {
     return new Promise((resolve) => {
      const duration = this.CONFIG.RESET_DURATION;
      const cam = this.camera;
      
      const startPos = cam.position.clone();
      const endPos = this.originalCameraPos;

      const startTime = this.clock.getElapsedTime();
      const tick = () => {
        const elapsed = this.clock.getElapsedTime() - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        const easeProgress = 0.5 * (1 - Math.cos(Math.PI * progress));
        
        cam.position.lerpVectors(startPos, endPos, easeProgress);

        if (progress < 1.0) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      tick();
    });
  }

  onResize = () => {
// ... (resize logic) ...
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
// ... (dispose logic) ...
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
// ... (config and constructor) ...
  CONFIG = {
    PARTICLE_SPEED: 0.05,
    PARTICLE_SIZE: 0.02,
    PARTICLE_FADE_SPEED: 0.008,
  };

  constructor(scene, audioManager) {
    this.scene = scene;
    this.audioManager = audioManager;
    this.particleSystems = [];
  }

  dissolveObject = (object, particleCount = 5000) => {
// ... (dissolve logic) ...
    if (!object) return;

    this.audioManager.playDissolve();

    try {
      const sampler = new MeshSurfaceSampler(object).build();
// ... (particle creation) ...
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
    // *** Reverted: Removed video cleanup logic, as it's not needed ***
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
// ... (particle update logic) ...
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
// ... (dispose logic) ...
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
// ... (code unchanged) ...
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
// ... (code unchanged) ...
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

  // *** Changed from async load() to sync createMesh(font) ***
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
// CHOICE PANEL
// ----------------------------------------
class ChoicePanel {
// ... (static CONFIG and SHADER unchanged) ...
  static CONFIG = {
// ... (config, aspect, width, gap, etc) ...
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
    // *** Config for the new title text ***
    TITLE_TEXT_CONFIG: {
      SIZE: 0.3,
      HEIGHT: 0.05,
      COLOR: 0xffffff,
      Y_OFFSET: -0.4 // Offset *below* the panel's bottom edge
    }
  };

  static SHADER = {
// ... (shader code) ...
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

  // *** Constructor reverted to use Thumbnail images ***
  constructor(scene, choiceData, side, font) { 
    this.scene = scene;
    this.youtubeId = choiceData.id; // Store YouTube ID
    this.thumbnailUrl = choiceData.thumbnail; // Store Thumbnail URL
    this.title = choiceData.title; 
    this.font = font; 
    this.side = side;
    this.titleMesh = null;
    // No more video element

    const panelHeight = ChoicePanel.CONFIG.PANEL_WIDTH / ChoicePanel.CONFIG.ASPECT;
    const geo = new THREE.PlaneGeometry(ChoicePanel.CONFIG.PANEL_WIDTH, panelHeight);
    
    // *** Load thumbnail as a simple texture ***
    const texture = new THREE.TextureLoader().load(this.thumbnailUrl, () => {}, undefined, () => {
      // Error handling: load a fallback placeholder
      const placeholderUrl = `https://placehold.co/640x360/000000/ffffff?text=Video+Not+Found`;
      texture.image.src = placeholderUrl;
      texture.needsUpdate = true;
    });
    
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        tDiffuse: { value: texture }, // Use thumbnail texture
        borderWidth: { value: ChoicePanel.CONFIG.BORDER_WIDTH },
        borderColor: { value: ChoicePanel.CONFIG.BORDER_COLOR }
      },
      vertexShader: ChoicePanel.SHADER.vertexShader,
      fragmentShader: ChoicePanel.SHADER.fragmentShader
    });

    this.mesh = new THREE.Mesh(geo, mat);
    // No video element to attach
    
    const panelX = (ChoicePanel.CONFIG.PANEL_WIDTH / 2) + ChoicePanel.CONFIG.PANEL_GAP;
// ... (positioning) ...
    this.mesh.position.set(
      side === 'left' ? -panelX : panelX,
      ChoicePanel.CONFIG.Y_OFFSET,
      0
    );
    
    this.scene.add(this.mesh);
    this.createTitleMesh(); 
  }
  
  // *** playVideo method removed ***

  // *** createTitleMesh (same as before) ***
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
    // Center of panel is (0, 0, 0) in its local space
    // Bottom of panel is at y = -panelHeight / 2
    this.titleMesh.position.y = (-panelHeight / 2) + config.Y_OFFSET; 
    
    this.mesh.add(this.titleMesh); // *** Add as a child to the panel mesh ***
  }

  update = (elapsedTime, isSelected) => {
// ... (update logic for float and scale) ...
    if (!this.mesh) return;
    
    // This shader time update is now passed to the child title mesh
    this.mesh.material.uniforms.time.value = elapsedTime;

    // Float animation (affects panel and its child text)
    const floatSpeed = this.side === 'left' ? ChoicePanel.CONFIG.FLOAT_SPEED_1 : ChoicePanel.CONFIG.FLOAT_SPEED_2;
    this.mesh.position.y = ChoicePanel.CONFIG.Y_OFFSET + Math.sin(elapsedTime * floatSpeed) * ChoicePanel.CONFIG.FLOAT_AMPLITUDE;

    // Scale animation (affects panel and its child text)
    const targetScale = isSelected ? ChoicePanel.CONFIG.SELECTED_SCALE : ChoicePanel.CONFIG.DEFAULT_SCALE;
    this.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1);
  };
}

// ----------------------------------------
// TIMER BAR
// ----------------------------------------
class TimerBar {
// ... (code unchanged) ...
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

  constructor(scene, particleManager, onTimeout) {
    this.scene = scene;
    this.particleManager = particleManager;
    this.onTimeout = onTimeout; // Callback when timer reaches zero
    this.active = false;
    this.startTime = 0;
    this.mesh = null;
    
    this.createMesh();
  }
  
  createMesh = () => {
    // Calculate total width based on panels
    const panelTotalWidth = (ChoicePanel.CONFIG.PANEL_WIDTH + ChoicePanel.CONFIG.PANEL_GAP) * 2 - ChoicePanel.CONFIG.PANEL_GAP;
    const panelHeight = ChoicePanel.CONFIG.PANEL_WIDTH / ChoicePanel.CONFIG.ASPECT;
    
    const geometry = new THREE.PlaneGeometry(panelTotalWidth, this.CONFIG.BAR_HEIGHT);
    const material = new THREE.MeshBasicMaterial({ color: this.CONFIG.COLORS.GREEN });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = ChoicePanel.CONFIG.Y_OFFSET + (panelHeight / 2) + this.CONFIG.Y_OFFSET;
    
    this.scene.add(this.mesh);
  }

  start = (elapsedTime) => {
    this.startTime = elapsedTime;
    this.active = true;
  };
  
  // Gets remaining progress as 0..1
  getProgress = (elapsedTime) => {
    if (!this.active) return 0;
    const elapsedTimer = (elapsedTime - this.startTime) * 1000;
    const remaining = Math.max(0, this.CONFIG.DURATION - elapsedTimer);
    return remaining / this.CONFIG.DURATION;
  }

  update = (elapsedTime) => {
    if (!this.active || !this.mesh) return;

    const progress = this.getProgress(elapsedTime);
    
    // scale.x is used to represent remaining width
    this.mesh.scale.x = progress;
    
    // reposition the timer so it shrinks from right-to-left
    const originalWidth = this.mesh.geometry.parameters.width;
    this.mesh.position.x = -(1 - progress) * (originalWidth / 2);

    // Update color
    if (progress > 0.5) {
      this.mesh.material.color.lerpColors(this.CONFIG.COLORS.YELLOW, this.CONFIG.COLORS.GREEN, (progress - 0.5) * 2);
    } else {
      this.mesh.material.color.lerpColors(this.CONFIG.COLORS.RED, this.CONFIG.COLORS.YELLOW, progress * 2);
    }

    // Check for timeout
    if (progress <= 0) {
      this.active = false;
      this.onTimeout(); // Notify game engine
    }
  };

  // Called by GameEngine when a choice is made
  onChoiceMade = (isTimeout, remainingProgress) => {
    this.active = false;
    if (isTimeout) {
      // Clean Timeout: just remove it
      this.particleManager.removeObject(this.mesh);
    } else {
      // Proportional Particle Dissolve
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
  // *** Added showYoutubeCallback ***
  constructor(mountEl, showYoutubeCallback, setInstructionsCallback) {
    this.mountEl = mountEl;
    this.showYoutubeCallback = showYoutubeCallback; // Store callback
    this.setInstructionsCallback = setInstructionsCallback;

    this.state = 'loading';
// ... (state setup) ...
    this.selectedPanel = 'left';
    this.currentMissionIndex = 0;
    this.animationId = null;
    this.font = null; 

    // Init Managers
    this.sceneManager = new SceneManager(mountEl);
// ... (managers setup) ...
    this.audioManager = new AudioManager();
    this.particleManager = new ParticleManager(this.sceneManager.scene, this.audioManager);
    
    // Init Game Objects
    this.starfield = new Starfield(this.sceneManager.scene);
// ... (game objects setup) ...
    this.startText = new StartText(this.sceneManager.scene);
    this.timerBar = null;
    this.panels = { left: null, right: null };
  }
  
  // *** loadFont (same as before) ***
  loadFont = () => {
    const fontLoader = new FontLoader();
    return new Promise((resolve, reject) => {
      fontLoader.load(GAME_CONFIG.FONT_URL, resolve, undefined, reject);
    });
  }

  start = async () => {
// ... (start logic) ...
    try {
      // *** Load font first, then create start text ***
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
// ... (onStartKey logic) ...
    if (this.state !== 'intro') return;
    
    this.audioManager.start(); // Start audio on first interaction
    
    this.particleManager.dissolveObject(this.startText.mesh);
    this.startText.mesh = null;
    this.state = 'dissolving';
    
    setTimeout(() => {
      this.showSelection();
    }, 1500); // Wait for dissolve animation
  };

  showSelection = () => {
// ... (mission check) ...
    const mission = GAME_CONFIG.MISSIONS[this.currentMissionIndex];
    if (!mission) {
      console.error('No mission data found for index:', this.currentMissionIndex);
      this.showEndScreen();
      return;
    }
    
    // *** Removed onVideoEnded callback from panels ***
    this.panels.left = new ChoicePanel(this.sceneManager.scene, mission.left, 'left', this.font);
    this.panels.right = new ChoicePanel(this.sceneManager.scene, mission.right, 'right', this.font);

    this.timerBar = new TimerBar(this.sceneManager.scene, this.particleManager, this.onTimerTimeout);
// ... (timer start, state change, event listener) ...
    this.timerBar.start(this.sceneManager.clock.getElapsedTime());
    
    this.state = 'selection';
    this.setInstructionsCallback('Use ← and → to choose. Press Enter to select.');
    window.addEventListener('keydown', this.onSelectionKey);
  };
  
  onSelectionKey = (e) => {
// ... (key handling) ...
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
  
  onTimerTimeout = () => {
// ... (timeout logic) ...
    // Called by TimerBar when progress hits 0
    // Force select the currently highlighted panel
    this.selectChoice(true); // Is a timeout
  };

  // *** UPDATED: selectChoice now zooms, fades, and calls back ***
  selectChoice = async (isTimeout) => {
    if (this.state !== 'selection') return;
    this.state = 'zooming'; // Set state to zooming
    window.removeEventListener('keydown', this.onSelectionKey);
    this.setInstructionsCallback('');
    
    // Keep effects ON for the zoom
    this.sceneManager.setPostProcessingEnabled(true);

    const chosenPanel = this.panels[this.selectedPanel];
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
    this.sceneManager.setPostProcessingEnabled(false); // Turn off effects
    
    // 6. Tell React to show the YouTube video
    this.showYoutubeCallback(chosenPanel.youtubeId);
    // GameEngine now waits for React to call onVideoEnded
  };
  
  // *** This is now called by React when the YT video finishes ***
  onVideoEnded = async () => {
    console.log('Video finished. Moving to next level.');
    this.state = 'dissolving';
    
    // Turn effects back on for transitions
    this.sceneManager.setPostProcessingEnabled(true);
    
    const chosenPanel = this.panels[this.selectedPanel];

    // 1. "dissolve the screen" (the 3D panel, which is hidden)
    if (chosenPanel && chosenPanel.mesh) {
      this.particleManager.dissolveObject(chosenPanel.mesh);
      this.panels[this.selectedPanel] = null;
    }

    // 2. "move the camera forward" (back to origin)
    // Ensure screen is black before resetting camera
    await this.sceneManager.fadeTo(1, 0); 
    await this.sceneManager.resetCamera();
    
    // 3. "to the next level"
    this.currentMissionIndex++;
    if (this.currentMissionIndex >= GAME_CONFIG.MISSIONS.length) {
      console.log('End of missions');
      this.showEndScreen();
    } else {
      // Show new selection (scene is still black)
      this.showSelection(); 
      // Fade back in
      await this.sceneManager.fadeTo(0, 1.0); 
    }
  }
  
  showEndScreen = async () => {
// ... (show end screen logic) ...
    // Logic to show "FIN." text
    await this.sceneManager.fadeTo(1, 1.0); // Fade to black
    // TODO: Create 'FIN.' text geometry
    this.setInstructionsCallback(GAME_CONFIG.END_TEXT);
  }

  animate = () => {
// ... (animate loop) ...
    const elapsedTime = this.sceneManager.clock.getElapsedTime();

    if (this.state === 'intro' && this.startText) {
      this.startText.update(elapsedTime);
    }
    
    if (this.state === 'selection') {
      if (this.panels.left) this.panels.left.update(elapsedTime, this.selectedPanel === 'left');
      if (this.panels.right) this.panels.right.update(elapsedTime, this.selectedPanel === 'right');
      if (this.timerBar) this.timerBar.update(elapsedTime);
    }

    this.starfield.update();
    this.particleManager.update();
    this.sceneManager.update();
    
    this.animationId = requestAnimationFrame(this.animate);
  };

  destroy = () => {
// ... (destroy logic) ...
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('keydown', this.onStartKey);
    window.removeEventListener('keydown', this.onSelectionKey);
    
    this.particleManager.dispose();
    this.starfield.dispose();
    this.timerBar?.dispose();
    this.panels.left?.mesh && this.particleManager.removeObject(this.panels.left.mesh);
    this.panels.right?.mesh && this.particleManager.removeObject(this.panels.right.mesh);
    this.startText.mesh && this.particleManager.removeObject(this.startText.mesh);
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
  const [youtubeId, setYoutubeId] = useState(null); // *** Changed state to hold ID ***
  const playerRef = useRef(null); // For YT Player instance
  const gameEngineRef = useRef(null); // To call engine from callbacks
  const isApiReady = useRef(false); // To track YT API load

  // *** NEW: Callback for when video ends ***
  const handleVideoEnded = useCallback(() => {
    console.log("Video ended, telling game engine.");
    setYoutubeId(null); // Close the player
    if (gameEngineRef.current) {
      gameEngineRef.current.onVideoEnded(); // Tell engine to proceed
    }
  }, []); // Empty deps, it only uses refs and state setters

  // *** NEW: useEffect to load YouTube API ***
  useEffect(() => {
    // Check if API script is already loaded
    if (window.YT && window.YT.Player) {
      isApiReady.current = true;
      return;
    }

    // Check if script is already being loaded
    if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      // Wait for it to be ready
      window.onYouTubeIframeAPIReady = () => {
        console.log("YouTube API Ready");
        isApiReady.current = true;
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

  // *** NEW: useEffect to create/destroy YT Player ***
  useEffect(() => {
    // Function to create the player
    const createPlayer = () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
      
      playerRef.current = new window.YT.Player('youtube-player-mount', {
        height: '100%',
        width: '100%',
        videoId: youtubeId, // Use the ID
        playerVars: {
          'autoplay': 1,
          'controls': 0, // Disable controls
          'rel': 0, // No related videos
          'modestbranding': 1, // Minimal branding
          'iv_load_policy': 3, // Disable annotations
          'disablekb': 1 // Disable keyboard input
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
        // API is ready, create player immediately
        createPlayer();
      } else {
        // API not ready, wait for it
        const checkApiInterval = setInterval(() => {
          if (isApiReady.current) {
            clearInterval(checkApiInterval);
            createPlayer();
          }
        }, 100);
      }
    } else if (!youtubeId && playerRef.current) {
      // URL is null (video ended), destroy the player
      playerRef.current.destroy();
      playerRef.current = null;
    }

    // Cleanup on component unmount
    return () => {
      if (playerRef.current) {
        // Use a try-catch as the player or its methods might be null
        // during fast navigations
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.warn("Error destroying YouTube player:", e);
        }
        playerRef.current = null;
      }
    }
  }, [youtubeId, handleVideoEnded]); // Re-run when ID changes

  // *** Original useEffect to init GameEngine ***
  useEffect(() => {
    if (!mountRef.current) return;

    const gameEngine = new GameEngine(
      mountRef.current,
      setYoutubeId, // *** Pass the callback to set the ID ***
      setInstructions 
    );
    
    gameEngineRef.current = gameEngine; // Store instance
    gameEngine.start();

    return () => {
      if (gameEngineRef.current) {
        gameEngineRef.current.destroy();
      }
      gameEngineRef.current = null;
    };
  }, []); // Empty dependency array, runs once


  return (
    <div style={{
// ... (styles) ...
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: '#000',
      fontFamily: 'Inter, sans-serif',
      color: 'white',
      overflow: 'hidden'
    }}>
      {/* 3D Canvas Mount Point */}
      <div ref={mountRef} style={{ width: '100%', height: '100%', transition: 'opacity 0.5s ease' }} />
      
      {/* Instructions Overlay */}
      <div style={{
// ... (styles) ...
        position: 'absolute',
        bottom: '20px',
        width: '100%',
        textAlign: 'center',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.5)',
        pointerEvents: 'none',
        transition: 'opacity 0.5s ease',
        opacity: instructions ? 1 : 0,
      }}>
        {instructions}
      </div>
      
      {/* *** UPDATED: YouTube Video Overlay *** */}
      {youtubeId && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,1)',
          zIndex: 10
        }}>
          {/* This div is the mount point for the YT Player */}
          <div id="youtube-player-mount"></div>
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

