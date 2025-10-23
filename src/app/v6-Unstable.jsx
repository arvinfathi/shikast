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
  END_FRAME_STAY_DURATION_MS: 500, // How long to show end thumbnail before dissolve
  MISSIONS: [
    {
      level: 0,
      narrationUrl: 'https://invalid-url-that-will-cause-403.mp3', // Intentionally invalid URL for testing
      // narrationUrl: 'https://cdn.pixabay.com/download/audio/2022/03/14/audio_522b656909.mp3', // Valid URL
      description: "You are in a dark room. A choice appears.",
      descriptionStayDurationMs: 3000,
      left: {
        id: '2rCtfrxfsOs',
        thumbnail: `https://img.youtube.com/vi/2rCtfrxfsOs/maxresdefault.jpg`,
        endThumbnail: `https://img.youtube.com/vi/2rCtfrxfsOs/mqdefault.jpg`,
        title: "Don't take the knife"
      },
      right: {
        id: '7mhL2AKSPYc',
        thumbnail: `https://img.youtube.com/vi/7mhL2AKSPYc/maxresdefault.jpg`,
        endThumbnail: `https://img.youtube.com/vi/7mhL2AKSPYc/mqdefault.jpg`,
        title: 'Take the knife'
      },
    },
    {
      level: 1,
      narrationUrl: null,
      description: "The consequences of your choice are clear.",
      descriptionStayDurationMs: 4000,
      left: {
        id: 'ya8EgxN3cbE',
        thumbnail: `https://img.youtube.com/vi/ya8EgxN3cbE/maxresdefault.jpg`,
        endThumbnail: `https://img.youtube.com/vi/ya8EgxN3cbE/mqdefault.jpg`,
        title: 'Join the fight'
      },
      right: {
        id: 'pRjhFcUxCR4',
        thumbnail: `https://img.youtube.com/vi/pRjhFcUxCR4/maxresdefault.jpg`,
        endThumbnail: `https://img.youtube.com/vi/pRjhFcUxCR4/mqdefault.jpg`,
        title: 'Go to party'
      },
    },
  ],
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
    NARRATION_VOLUME: -5,
  };

  constructor() {
    this.lastDissolveTime = 0;
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

    this.narrationPlayer = null;
    this.isStarted = false;
    this.narrationManuallyStopped = false;
    this.narrationEndedCallback = null; // Store the callback
  }

  async start() {
    if (this.isStarted) return;
    await Tone.start();
    this.ambientSynth.triggerAttack();
    this.isStarted = true;
    console.log('Audio Context Started');
  }

  playDissolve() {
    if (!this.isStarted) return;
    const now = Tone.now();
    if (now - this.lastDissolveTime < 0.05) {
      return;
    }
    this.lastDissolveTime = now;
    this.dissolveSynth.triggerAttackRelease('0.5', now);
  }

  playSelect() {
    if (!this.isStarted) return;
    this.selectSynth.triggerAttackRelease('C3', '0.1');
  }

  /**
   * Plays narration. Calls onEnded *once* when finished naturally, stopped, or if an error occurs.
   */
  playNarration(url, onEnded) {
    // Store the callback, ensure it's called only once
    let endedCalled = false;
    this.narrationEndedCallback = () => {
        if (!endedCalled) {
            endedCalled = true;
            this.narrationEndedCallback = null; // Clear callback
            requestAnimationFrame(onEnded);
        }
    };

    if (!url || !this.isStarted) {
      if (!url) console.log("No narration URL, skipping.");
      else console.warn("Audio context not started. Skipping narration.");
      this.narrationEndedCallback(); // Call immediately if skipping
      return;
    }

    this.stopNarration(); // Clean up previous player

    try {
      this.narrationManuallyStopped = false;
      this.narrationPlayer = new Tone.Player({
        url: url,
        autostart: false, // Don't autostart
        volume: this.CONFIG.NARRATION_VOLUME,
        onload: () => {
           console.log("Narration loaded:", url);
           // Start playback after a short delay to potentially avoid timing issues
           setTimeout(() => {
                if (this.narrationPlayer && this.narrationPlayer.loaded && !this.narrationManuallyStopped) {
                    try {
                        console.log("Starting narration playback.");
                        this.narrationPlayer.start();
                    } catch (e) {
                         // *** Catch start error ***
                         console.error("Error starting Tone.Player:", e);
                         if(e.message.includes("Start time must be strictly greater")) {
                             console.warn("Attempted to start player too soon. Retrying...");
                             // Retry after a slightly longer delay
                             setTimeout(() => {
                                 if (this.narrationPlayer && this.narrationPlayer.loaded && !this.narrationManuallyStopped) {
                                     try { this.narrationPlayer.start(); } catch (e2) { console.error("Retry start failed:", e2); this.narrationEndedCallback(); this.stopNarration();}
                                 } else if (!this.narrationManuallyStopped) { this.narrationEndedCallback();}
                             }, 100);
                         } else {
                            this.narrationEndedCallback(); // Call callback on other start errors
                            this.stopNarration();
                         }
                    }
                } else if (!this.narrationManuallyStopped) {
                     console.log("Narration player not ready or stopped before starting.");
                     this.narrationEndedCallback(); // Ensure callback if player disposed before start
                }
           }, 50);
        },
        onstop: () => {
          // Check if stopped naturally (not manually and player exists)
          if (this.narrationPlayer && !this.narrationManuallyStopped) {
            console.log("Narration finished naturally via onstop.");
            this.narrationEndedCallback(); // Call stored callback
          } else {
             console.log("Narration stopped manually or disposed, onstop ignored for callback.");
          }
          // Always dispose when stopped
          if (this.narrationPlayer) {
             this.narrationPlayer.dispose();
             this.narrationPlayer = null;
          }
        }
      }).toDestination();

      this.narrationPlayer.onerror = (error) => {
        console.error("Error with Tone.Player:", url, error);
        this.narrationEndedCallback(); // Call callback on error
        this.stopNarration(); // Clean up
      };

      // Load the audio buffer
      this.narrationPlayer.load(url).catch(error => {
          console.error("Tone.Player failed to load buffer:", url, error);
          this.narrationEndedCallback(); // Call callback on load error
          this.stopNarration(); // Clean up
      });

    } catch (e) {
      console.error("Failed to create Tone.Player:", e);
      this.narrationEndedCallback(); // Call callback if creation fails
    }
  }


  stopAmbient() {
    this.ambientSynth.triggerRelease();
  }

  stopNarration() {
    if (this.narrationPlayer) {
      console.log("Stopping narration manually.");
      this.narrationManuallyStopped = true;
      try {
        // Stop playback - this triggers the onstop callback
        this.narrationPlayer.stop();
      } catch(e) {
        console.warn("Error stopping narration player:", e);
        // Ensure disposal even if stop fails
        if (this.narrationPlayer) {
           this.narrationPlayer.dispose();
           this.narrationPlayer = null;
        }
      }
      // Disposal is handled in onstop
    }
     // Call the ended callback if it hasn't been called yet and stop was invoked
     // This ensures the game flow continues if narration is cut short by user action
     if(this.narrationEndedCallback) {
         console.log("Calling narrationEndedCallback due to manual stop.");
         this.narrationEndedCallback();
     }
  }

  dispose() {
    this.stopAmbient();
    this.stopNarration();
    this.ambientSynth.dispose();
    this.dissolveSynth.dispose();
    this.selectSynth.dispose();
  }
}

// ----------------------------------------
// SCENE MANAGER
// ----------------------------------------
class SceneManager {
  static CONFIG = {
    CAMERA_Z: 5,
    BLOOM_PARAMS: { strength: 0.5, radius: 0.6, threshold: 0.1 },
    FILM_PARAMS: { noiseIntensity: 0.35, scanlineIntensity: 0.5 },
    ZOOM_DURATION: 1.5, // seconds
    RESET_DURATION: 1.5, // seconds
    END_FRAME_FADE_IN_DURATION: 1.0,
  };

  constructor(mountEl) {
    this.mountEl = mountEl;
    this.clock = new THREE.Clock();

    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    this.camera.position.z = SceneManager.CONFIG.CAMERA_Z;
    this.originalCameraPos = this.camera.position.clone();

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
      SceneManager.CONFIG.BLOOM_PARAMS.strength || 0,
      SceneManager.CONFIG.BLOOM_PARAMS.radius || 0,
      SceneManager.CONFIG.BLOOM_PARAMS.threshold || 0
    );
    this.bloomPass.enabled = !!(SceneManager.CONFIG.BLOOM_PARAMS.strength && SceneManager.CONFIG.BLOOM_PARAMS.strength > 0);

    this.filmPass = new FilmPass(
      SceneManager.CONFIG.FILM_PARAMS.noiseIntensity || 0,
      SceneManager.CONFIG.FILM_PARAMS.scanlineIntensity || 0,
      2048,
      false
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
    this.bloomPass.enabled = enabled && !!(SceneManager.CONFIG.BLOOM_PARAMS.strength && SceneManager.CONFIG.BLOOM_PARAMS.strength > 0);
    this.filmPass.enabled = enabled;
  };

  fadeTo = (targetFade, duration = 1.0) => {
    if (duration <= 0) {
      this.fadePass.material.uniforms.uFade.value = targetFade;
      return Promise.resolve();
    }

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
      const duration = SceneManager.CONFIG.ZOOM_DURATION;
      const cam = this.camera;

      const distance = cam.position.z - panel.position.z;
      const vFov = (cam.fov * Math.PI) / 180;
      const height = 2 * Math.tan(vFov / 2) * distance;
      const width = height * cam.aspect;

      const startPos = cam.position.clone();
      const endPos = new THREE.Vector3(panel.position.x, panel.position.y, panel.position.z + SceneManager.CONFIG.CAMERA_Z);
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
      const duration = SceneManager.CONFIG.RESET_DURATION;
      const cam = this.camera;

      const startPos = cam.position.clone();
      const endPos = this.originalCameraPos.clone();
      endPos.z = targetZ;

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
     // Return a promise that resolves when particles are mostly faded
     return new Promise((resolve) => {
        if (!object) {
            resolve();
            return;
        }

        this.audioManager.playDissolve();
        let samplingSucceeded = false; // Flag to track success

        try {
          // Use computeBoundingBox if available, otherwise just use object properties if they exist
          if (object.geometry?.computeBoundingBox) {
            object.geometry.computeBoundingBox();
          } else if (object.geometry?.boundingBox) {
            // Already computed or doesn't need recomputing
          } else {
            console.warn("Cannot compute bounding box for dissolve, object might not sample correctly.");
          }

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
          samplingSucceeded = true; // Mark as successful

          // Resolve the promise after the dissolve duration
          setTimeout(resolve, this.CONFIG.DISSOLVE_DURATION_MS);

        } catch (err) { // <<< The error object 'err' is defined *here*
          console.warn('dissolveObject sampling failed:', object, err);
          // Fallback: Remove object immediately and resolve
          this.removeObject(object);
          resolve();
        }

        // *** FIX: Remove original object immediately *only* if sampling succeeded ***
        if (samplingSucceeded) {
           this.removeObject(object);
        }
        // *** REMOVED: if (! (err instanceof Error)) { ... } *** <<< This caused the ReferenceError

     }); // End of promise
  };


  removeObject = (object) => {
    if (!object) return;

    // Dispose of materials and geometries
    object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
                child.material.forEach(material => material.dispose());
            } else if (child.material) {
                child.material.dispose();
            }
        }
    });


    if (object.parent) {
      object.parent.remove(object);
    } else {
      // If object wasn't added to scene (possible race condition)
      console.warn("Attempted to remove object not in scene:", object);
    }
  };


  update = () => {
    for (let idx = this.particleSystems.length - 1; idx >= 0; idx--) {
      const ps = this.particleSystems[idx];
      // Check if geometry exists before accessing attributes
      if (!ps.geometry) continue;

      const pos = ps.geometry.attributes.position;
      const vel = ps.geometry.attributes.velocity;

      // Check if attributes exist
      if (!pos || !vel) continue;


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
      ps.geometry?.dispose(); // Safe disposal
      ps.material?.dispose(); // Safe disposal
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
  static CONFIG = {
    TEXT: GAME_CONFIG.END_TEXT,
    COLOR: 0xffffff,
    SIZE: 1.9,
    FLOAT_SPEED: 1.5,
    FLOAT_AMPLITUDE: 0.1,
    IS_FLOATING: true,
    IS_INTERACTIVE: true,
  };

  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
  }

  createMesh = (font) => {
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

  update = (elapsedTime) => {
    if (this.mesh && EndText.CONFIG.IS_FLOATING) {
      this.mesh.position.y = Math.sin(elapsedTime * EndText.CONFIG.FLOAT_SPEED) * EndText.CONFIG.FLOAT_AMPLITUDE;
    }
  };
}

// ----------------------------------------
// DESCRIPTION TEXT (MODIFIED FOR DISSOLVE)
// ----------------------------------------
class DescriptionText {
  static CONFIG = {
    COLOR: 0xaaaaaa,
    SIZE: 0.4,
    HEIGHT: 0.01,
    FADE_DURATION_MS: 1000,
    DISSOLVE_PARTICLE_COUNT: 1000,
  };

  constructor(scene, text, font, camera) {
    this.scene = scene;
    this.camera = camera;
    this.mesh = null;
    this.createMesh(text, font);
  }

  createMesh = (text, font) => {
    const geo = new TextGeometry(text, {
      font,
      size: DescriptionText.CONFIG.SIZE,
      height: DescriptionText.CONFIG.HEIGHT,
      curveSegments: 4,
      bevelEnabled: false
    });
    geo.center();

    const mat = new THREE.MeshBasicMaterial({
      color: DescriptionText.CONFIG.COLOR,
      transparent: true,
      opacity: 0
    });

    this.mesh = new THREE.Mesh(geo, mat);
    const currentCamZ = this.camera.position.z;
    this.mesh.position.set(0, 0, currentCamZ - SceneManager.CONFIG.CAMERA_Z * 0.8);
    this.scene.add(this.mesh);
  }

  fadeTo = (targetOpacity, duration) => {
    return new Promise((resolve) => {
      if (!this.mesh || !this.mesh.material) return resolve(); // Added material check
      const startOpacity = this.mesh.material.opacity;
      const startTime = performance.now();

      const tick = (now) => {
         if (!this.mesh || !this.mesh.material) return; // Check again in tick

        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        this.mesh.material.opacity = THREE.MathUtils.lerp(startOpacity, targetOpacity, progress);

        if (progress < 1.0) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      tick(performance.now());
    });
  }

  fadeIn = () => {
    return this.fadeTo(1.0, DescriptionText.CONFIG.FADE_DURATION_MS);
  }
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
      Y_OFFSET: -0.4
    },
    LEVEL_Z_SPACING: -15,
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
      uniform vec3 borderColor;
      varying vec2 vUv;

      void main() {
        vec4 texColor = texture2D(tDiffuse, vUv);

        float border = smoothstep(0.0, borderWidth, vUv.x) * (1.0 - smoothstep(1.0 - borderWidth, 1.0, vUv.x)) *
                       smoothstep(0.0, borderWidth, vUv.y) * (1.0 - smoothstep(1.0 - borderWidth, 1.0, vUv.y));

        if (border < 0.5 && borderWidth > 0.0) {
          float pulse = 0.6 + 0.4 * sin(time * 8.0);
          gl_FragColor = vec4(borderColor * pulse, 1.0);
        } else {
          gl_FragColor = texColor;
        }
      }
    `
  };

  constructor(scene, choiceData, side, font, zPos) {
    this.scene = scene;
    this.youtubeId = choiceData.id;
    this.thumbnailUrl = choiceData.thumbnail;
    this.endThumbnailUrl = choiceData.endThumbnail;
    this.textureLoader = new THREE.TextureLoader();
    this.title = choiceData.title;
    this.font = font;
    this.side = side;
    this.titleMesh = null;
    this.startTexture = null;
    this.endTexture = null;
    this.isVisible = false;
    this.mesh = null; // Initialize mesh as null


    const panelHeight = ChoicePanel.CONFIG.PANEL_WIDTH / ChoicePanel.CONFIG.ASPECT;
    const geo = new THREE.PlaneGeometry(ChoicePanel.CONFIG.PANEL_WIDTH, panelHeight);

    this.startTexture = this.textureLoader.load(this.thumbnailUrl,
      () => {}, // onSuccess
      undefined, // onProgress
      (err) => {
        console.error('Failed to load thumbnail:', this.thumbnailUrl, err);
        const placeholderUrl = `https://placehold.co/640x360/000000/ffffff?text=Video+Not+Found`;
        this.startTexture = this.textureLoader.load(placeholderUrl);
        if (this.mesh && this.mesh.material) {
          this.mesh.material.uniforms.tDiffuse.value = this.startTexture;
          this.mesh.material.needsUpdate = true;
        }
      }
    );

    if (this.endThumbnailUrl) {
      this.endTexture = this.textureLoader.load(this.endThumbnailUrl,
        () => console.log('End thumb loaded for', this.title),
        undefined,
        (err) => console.warn('Failed to load end thumbnail:', this.endThumbnailUrl, err)
      );
    }

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        tDiffuse: { value: this.startTexture },
        borderWidth: { value: ChoicePanel.CONFIG.BORDER_WIDTH },
        borderColor: { value: ChoicePanel.CONFIG.BORDER_COLOR }
      },
      vertexShader: ChoicePanel.SHADER.vertexShader,
      fragmentShader: ChoicePanel.SHADER.fragmentShader,
      transparent: true,
      opacity: 0, // Start invisible
    });


    this.mesh = new THREE.Mesh(geo, mat);

    const panelX = (ChoicePanel.CONFIG.PANEL_WIDTH / 2) + ChoicePanel.CONFIG.PANEL_GAP;
    this.mesh.position.set(
      side === 'left' ? -panelX : panelX,
      ChoicePanel.CONFIG.Y_OFFSET,
      zPos
    );

    // Don't add to scene immediately
    // this.scene.add(this.mesh);
    this.createTitleMesh();
  }

  // *** NEW: Method to add mesh to scene ***
  addToScene = () => {
      if (this.mesh && !this.mesh.parent) {
          this.scene.add(this.mesh);
      }
  }


  fadeIn = (duration = 500) => {
    return new Promise((resolve) => {
      if (!this.mesh) return resolve(); // Safety check
      this.isVisible = true;
      const startOpacity = this.mesh.material.opacity;
      const startTime = performance.now();

      const tick = (now) => {
         if (!this.mesh || !this.mesh.material) return; // Safety check in tick

        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        this.mesh.material.opacity = THREE.MathUtils.lerp(startOpacity, 1.0, progress);
        if (this.titleMesh && this.titleMesh.material) this.titleMesh.material.opacity = this.mesh.material.opacity;


        if (progress < 1.0) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      tick(performance.now());
    });
  }


  swapToEndThumbnail = () => {
    if (!this.endTexture || !this.mesh || !this.mesh.material) { // Added material check
        console.log("No end texture or mesh/material found, not swapping.");
        return;
    }
    try {
      this.mesh.material.uniforms.tDiffuse.value = this.endTexture;
      this.mesh.material.needsUpdate = true;
    } catch (e) {
      console.error("Error in swapToEndThumbnail:", e);
    }
  }

  createTitleMesh = () => {
    if (!this.font || !this.title || !this.mesh) return; // Added mesh check


    const config = ChoicePanel.CONFIG.TITLE_TEXT_CONFIG;
    const panelHeight = ChoicePanel.CONFIG.PANEL_WIDTH / ChoicePanel.CONFIG.ASPECT;

    const geo = new TextGeometry(this.title, {
      font: this.font,
      size: config.SIZE,
      height: config.HEIGHT,
      curveSegments: 4,
      bevelEnabled: false
    });
    geo.center();

    const mat = new THREE.MeshBasicMaterial({
        color: config.COLOR,
        transparent: true,
        opacity: 0, // Start invisible
    });
    this.titleMesh = new THREE.Mesh(geo, mat);

    this.titleMesh.position.y = (-panelHeight / 2) + config.Y_OFFSET;

    this.mesh.add(this.titleMesh); // Add title as child
  }

  update = (elapsedTime, isSelected) => {
    if (!this.mesh || !this.isVisible) return;


    this.mesh.material.uniforms.time.value = elapsedTime;

    const floatSpeed = this.side === 'left' ? ChoicePanel.CONFIG.FLOAT_SPEED_1 : ChoicePanel.CONFIG.FLOAT_SPEED_2;
    const baseY = ChoicePanel.CONFIG.Y_OFFSET;
    this.mesh.position.y = baseY + Math.sin(elapsedTime * floatSpeed) * ChoicePanel.CONFIG.FLOAT_AMPLITUDE;

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
    this.onTimeout = onTimeout;
    this.active = false;
    this.startTime = 0;
    this.mesh = null;
    this.isVisible = false;

    this.createMesh(zPos);
  }

  createMesh = (zPos) => {
    const panelTotalWidth = (ChoicePanel.CONFIG.PANEL_WIDTH + ChoicePanel.CONFIG.PANEL_GAP) * 2 - ChoicePanel.CONFIG.PANEL_GAP;
    const panelHeight = ChoicePanel.CONFIG.PANEL_WIDTH / ChoicePanel.CONFIG.ASPECT;

    const geometry = new THREE.PlaneGeometry(panelTotalWidth, this.CONFIG.BAR_HEIGHT);
    const material = new THREE.MeshBasicMaterial({
        color: this.CONFIG.COLORS.GREEN,
        transparent: true,
        opacity: 0, // Start invisible
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = ChoicePanel.CONFIG.Y_OFFSET + (panelHeight / 2) + this.CONFIG.Y_OFFSET;
    this.mesh.position.z = zPos;

    // Don't add to scene immediately
    // this.scene.add(this.mesh);
  }

  // *** NEW: Method to add mesh to scene ***
  addToScene = () => {
      if (this.mesh && !this.mesh.parent) {
          this.scene.add(this.mesh);
      }
  }


  fadeIn = (duration = 500) => {
    return new Promise((resolve) => {
      if (!this.mesh) return resolve(); // Safety check
      this.isVisible = true;
      const startOpacity = this.mesh.material.opacity;
      const startTime = performance.now();

      const tick = (now) => {
         if (!this.mesh || !this.mesh.material) return; // Safety check in tick

        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1.0);
        this.mesh.material.opacity = THREE.MathUtils.lerp(startOpacity, 1.0, progress);

        if (progress < 1.0) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      tick(performance.now());
    });
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
    if (!this.active || !this.mesh || !this.isVisible) return;


    const progress = this.getProgress(elapsedTime);

    this.mesh.scale.x = progress;

    const originalWidth = this.mesh.geometry.parameters.width;
    this.mesh.position.x = -(1 - progress) * (originalWidth / 2);

    if (progress > 0.5) {
      this.mesh.material.color.lerpColors(this.CONFIG.COLORS.YELLOW, this.CONFIG.COLORS.GREEN, (progress - 0.5) * 2);
    } else {
      this.mesh.material.color.lerpColors(this.CONFIG.COLORS.RED, this.CONFIG.COLORS.YELLOW, progress * 2);
    }

    if (progress <= 0) {
      this.active = false;
      this.onTimeout();
    }
  };

  onChoiceMade = (isTimeout, remainingProgress) => {
    this.active = false;
    let promise = Promise.resolve(); // Default to resolved promise
    if (isTimeout) {
      this.particleManager.removeObject(this.mesh);
    } else {
      const particleCount = Math.max(10, Math.floor(this.CONFIG.MAX_PARTICLES * remainingProgress));
      promise = this.particleManager.dissolveObject(this.mesh, particleCount); // Store the dissolve promise
    }
    this.mesh = null;
    return promise; // Return the promise
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
    this.showYoutubeCallback = showYoutubeCallback;
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
    this.descriptionTextInstance = null;

    this.levels = new Map();
    this.currentLevel = null;
    // Keep direct refs for easy access during selection state
    this.panels = { left: null, right: null };
    this.timerBar = null;
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

    this.particleManager.dissolveObject(this.startText.mesh).then(() => {
        this.startText.mesh = null;
        this.loadLevel(0); // Start level flow after dissolve
    });
    this.state = 'dissolving';

  };

  // Creates level objects but doesn't make them visible or active
  createLevel = (index) => {
    const mission = GAME_CONFIG.MISSIONS[index];
    if (!mission) return null;

    const levelZ = index * ChoicePanel.CONFIG.LEVEL_Z_SPACING;

    // Clean up just in case (safer than relying only on dissolve)
    const oldLevel = this.levels.get(index);
    if (oldLevel) {
        console.log(`Disposing old level ${index} elements.`);
        oldLevel.timer?.dispose();
        oldLevel.panels.left?.mesh && this.particleManager.removeObject(oldLevel.panels.left.mesh);
        oldLevel.panels.right?.mesh && this.particleManager.removeObject(oldLevel.panels.right.mesh);
        this.levels.delete(index); // Remove old data
    }

    console.log(`Creating level ${index} elements.`);
    const newPanels = {
      left: new ChoicePanel(this.sceneManager.scene, mission.left, 'left', this.font, levelZ),
      right: new ChoicePanel(this.sceneManager.scene, mission.right, 'right', this.font, levelZ)
    };
    const newTimer = new TimerBar(this.sceneManager.scene, this.particleManager, this.onTimerTimeout, levelZ);

    const levelData = { panels: newPanels, timer: newTimer, index: index };
    this.levels.set(index, levelData);
    return levelData;
  }

  // Starts the process: Description -> Narration -> Panels/Activate
  loadLevel = (index) => {
    this.currentMissionIndex = index;
    const mission = GAME_CONFIG.MISSIONS[index];

    if (!mission) {
      console.error("Mission index out of bounds, showing end screen.");
      this.sceneManager.fadeTo(1, 1.0).then(this.showEndScreen);
      return;
    }

    this.state = 'loading_level';
    this.setInstructionsCallback('');

    // Pre-create level elements (invisible)
    this.currentLevel = this.levels.get(index) || this.createLevel(index);
     if (!this.currentLevel) {
       console.error("Failed to get or create level in loadLevel", index);
       this.sceneManager.fadeTo(1, 1.0).then(this.showEndScreen);
       return;
     }
     // Update refs immediately, although they are invisible
     this.panels = this.currentLevel.panels;
     this.timerBar = this.currentLevel.timer;

    // Start Description/Narration sequence according to new flow
    this.handleLevelIntroSequence(mission);
  }

  // *** MODIFIED Flow: Description -> Narration & Panel Fade In -> Activate ***
  handleLevelIntroSequence = async (mission) => {
    let narrationEndPromise = Promise.resolve();
    let descriptionDissolvePromise = Promise.resolve();

    // 1. Show Description (if exists) & Wait
    if (mission.description) {
      this.state = 'describing';
      this.descriptionTextInstance = new DescriptionText(
         this.sceneManager.scene,
         mission.description,
         this.font,
         this.sceneManager.camera
      );
      await this.descriptionTextInstance.fadeIn();
      await new Promise(r => setTimeout(r, mission.descriptionStayDurationMs || 3000));
       // Start dissolving description *now*
      descriptionDissolvePromise = this.particleManager.dissolveObject(
          this.descriptionTextInstance.mesh,
          DescriptionText.CONFIG.DISSOLVE_PARTICLE_COUNT
       );
    } else {
        // If no description, ensure state moves on
        this.state = 'loading_level'; // Or 'narrating' if narration starts next
    }

    // 2. Start Narration (if exists) - concurrent with description dissolve
    if (mission.narrationUrl) {
        if (this.state !== 'describing') this.state = 'narrating';
        this.setInstructionsCallback('...'); // Indicate narration
        narrationEndPromise = new Promise((resolve) => {
            this.audioManager.playNarration(mission.narrationUrl, resolve);
        });
    }

    // 3. Wait for description to FINISH dissolving before adding/fading panels
    await descriptionDissolvePromise;
    if(this.descriptionTextInstance) this.descriptionTextInstance = null; // Clear ref after await

    // *** NEW: Add panels/timer to scene AFTER description dissolve ***
    this.currentLevel.panels.left?.addToScene();
    this.currentLevel.panels.right?.addToScene();
    this.currentLevel.timer?.addToScene();


    // 4. Fade in Panels and Timer (concurrent with potential narration)
    await this.fadeInPanelsAndTimer(); // Await fade in

    // 5. Activate the level - allows user input
    this.activateCurrentLevel();

    // Narration continues until it finishes or is stopped by user choice
  }


  // Fades in the current level's panels and timer
  fadeInPanelsAndTimer = async () => {
      if (!this.currentLevel) {
          console.error("Cannot fade in panels/timer: currentLevel is null.");
          return;
      }
      console.log("Fading in panels and timer for level:", this.currentLevel.index);
      // Make sure elements exist before trying to fade them in
      const fadePromises = [];
      if (this.currentLevel.panels?.left) fadePromises.push(this.currentLevel.panels.left.fadeIn());
      if (this.currentLevel.panels?.right) fadePromises.push(this.currentLevel.panels.right.fadeIn());
      if (this.currentLevel.timer) fadePromises.push(this.currentLevel.timer.fadeIn());

      // Ensure panels/timer are fully visible before proceeding
      if (fadePromises.length > 0) {
        await Promise.all(fadePromises);
      }
      console.log("Finished fading in panels and timer for level:", this.currentLevel.index);
  }


  // Activates the currently loaded level
  activateCurrentLevel = () => {
    // Check if panels/timer are ready and visible
    if (!this.currentLevel ||
        !this.currentLevel.panels.left?.isVisible ||
        !this.currentLevel.panels.right?.isVisible ||
        !this.currentLevel.timer?.isVisible) {
        console.error("Cannot activate level: Elements missing or not visible.", this.currentLevel);
        return;
    }
    // Only activate if we are coming from a state where activation makes sense
    // Adjusted states: after dissolving description or straight from loading/narrating if no desc
    if (!['loading_level', 'narrating', 'describing'].includes(this.state)) {
        console.warn("Attempted to activate level in invalid state:", this.state);
        return;
    }


    this.timerBar = this.currentLevel.timer; // Ensure ref is current
    this.timerBar.start(this.sceneManager.clock.getElapsedTime());
    this.state = 'selection';
    this.setInstructionsCallback('Use ← and → to choose. Press Enter to select.');
    window.removeEventListener('keydown', this.onSelectionKey); // Prevent duplicates
    window.addEventListener('keydown', this.onSelectionKey);
    console.log("Level activated:", this.currentLevel.index);
  }


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

  onEndKey = (e) => {
    if (this.state !== 'end') return;

    if (e.key === 'ArrowLeft') {
      this.starfield.setParallax('left');
    } else if (e.key === 'ArrowRight') {
      this.starfield.setParallax('right');
    }
  }

  onTimerTimeout = () => {
    if (this.state === 'selection') {
       console.log("Timer timed out.");
       this.selectChoice(true);
    } else {
        console.warn("Timer timeout ignored, not in selection state:", this.state);
    }
  };


  selectChoice = async (isTimeout) => {
    if (this.state !== 'selection') return;

    // Stop narration immediately on choice
    this.audioManager.stopNarration();


    const chosenPanel = this.currentLevel.panels[this.selectedPanel];
    if (!chosenPanel) {
      console.error('selectChoice called but chosenPanel is null. State:', this.state, 'Selected:', this.selectedPanel);
      return;
    }

    this.state = 'zooming';
    window.removeEventListener('keydown', this.onSelectionKey);
    this.setInstructionsCallback('');

    this.sceneManager.setPostProcessingEnabled(true);

    const unchosenPanel = this.currentLevel.panels[this.selectedPanel === 'left' ? 'right' : 'left'];

    // --- Dissolve timer and unchosen panel concurrently ---
    let dissolvePromises = [];
    if (this.timerBar) {
        const remainingProgress = this.timerBar.getProgress(this.sceneManager.clock.getElapsedTime());
        dissolvePromises.push(this.timerBar.onChoiceMade(isTimeout, remainingProgress));
        this.timerBar = null;
    }
    if (unchosenPanel && unchosenPanel.mesh) {
      dissolvePromises.push(this.particleManager.dissolveObject(unchosenPanel.mesh));
      this.currentLevel.panels[this.selectedPanel === 'left' ? 'right' : 'left'] = null;
    }
    // --- End concurrent dissolves ---

    // Remove the title from the *chosen* panel (instantly)
    if (chosenPanel && chosenPanel.titleMesh) {
       this.particleManager.removeObject(chosenPanel.titleMesh);
       chosenPanel.titleMesh = null;
    }

    // Zoom into the chosen panel (wait for it)
    if (chosenPanel && chosenPanel.mesh) {
      await this.sceneManager.zoomToPanel(chosenPanel.mesh);
    }

    // Fade out 3D scene to black (wait for it)
    await this.sceneManager.fadeTo(1, 0.5);
    this.sceneManager.setPostProcessingEnabled(false);

    // Tell React to show the YouTube video
    this.showYoutubeCallback(chosenPanel.youtubeId);
  };


  onVideoEnded = async () => {
    console.log('Video finished. Processing end frame.');
    this.state = 'travelling';

    this.sceneManager.setPostProcessingEnabled(true);

    // Get the panel that was chosen in the *previous* level
    const chosenPanel = this.levels.get(this.currentMissionIndex)?.panels[this.selectedPanel];


    // 1. Swap to end thumbnail *before* making scene visible
    if (chosenPanel) {
      chosenPanel.swapToEndThumbnail();
    } else {
       console.warn("Could not find chosen panel to swap thumbnail for level:", this.currentMissionIndex);
    }


    // 2. *** Make scene instantly visible showing end frame ***
    this.sceneManager.fadePass.material.uniforms.uFade.value = 0.0;


    // 3. Wait a moment to see the end thumbnail
    await new Promise(r => setTimeout(r, GAME_CONFIG.END_FRAME_STAY_DURATION_MS));

    // --- Transition Starts ---
    const nextMissionIndex = this.currentMissionIndex + 1;

    // 4. Pre-create next level's objects (invisible) if it exists
    if (nextMissionIndex < GAME_CONFIG.MISSIONS.length) {
       this.createLevel(nextMissionIndex);
    }

    // 5. Start camera move *concurrently*
    let cameraMovePromise;
    if (nextMissionIndex >= GAME_CONFIG.MISSIONS.length) {
      console.log('End of missions');
      // Fade to black for the *final* end screen
      cameraMovePromise = this.sceneManager.fadeTo(1, 1.0);
    } else {
      // Move camera to new Z position
      const nextLevelZ = nextMissionIndex * ChoicePanel.CONFIG.LEVEL_Z_SPACING;
      const newCameraZ = nextLevelZ + SceneManager.CONFIG.CAMERA_Z;
      cameraMovePromise = this.sceneManager.resetCamera(newCameraZ);
    }

    // 6. Dissolve old panel *concurrently*
    let dissolvePromise = Promise.resolve();
    if (chosenPanel && chosenPanel.mesh) {
      dissolvePromise = this.particleManager.dissolveObject(chosenPanel.mesh);
      // Clean up ref from the stored level data
      const oldLevelData = this.levels.get(this.currentMissionIndex);
      if (oldLevelData) {
         oldLevelData.panels[this.selectedPanel] = null;
      }
    }

    // 7. Wait for camera move AND dissolve to finish
    await Promise.all([cameraMovePromise, dissolvePromise]);

    // --- Transition Ends ---

    // 8. Load or end game
    if (nextMissionIndex >= GAME_CONFIG.MISSIONS.length) {
      await this.showEndScreen();
    } else {
      // Load the next level (starts Description -> Narration -> Panels Fade In -> Activate)
      this.loadLevel(nextMissionIndex);
    }
  }


  showEndScreen = async () => {
    this.setInstructionsCallback('');

    // Position text in front of the camera
    const camPos = this.sceneManager.camera.position;
    const textPos = new THREE.Vector3(camPos.x, camPos.y, camPos.z - SceneManager.CONFIG.CAMERA_Z);


    this.endText = new EndText(this.sceneManager.scene);
    this.endText.createMesh(this.font);
    this.endText.mesh.position.copy(textPos);

    this.state = 'end';
    if (EndText.CONFIG.IS_INTERACTIVE) {
      this.setInstructionsCallback('Use ← and → to look around.');
      window.addEventListener('keydown', this.onEndKey);
    }

    // Fade in to see the final text
    await this.sceneManager.fadeTo(0, 1.5);
  }

  animate = () => {
    const elapsedTime = this.sceneManager.clock.getElapsedTime();

    if (this.state === 'intro' && this.startText) {
      this.startText.update(elapsedTime);
    }

    // Only update active level's panels/timer if in selection state
    if (this.state === 'selection' && this.currentLevel) {
      if (this.currentLevel.panels?.left) this.currentLevel.panels.left.update(elapsedTime, this.selectedPanel === 'left');
      if (this.currentLevel.panels?.right) this.currentLevel.panels.right.update(elapsedTime, this.selectedPanel === 'right');
      if (this.currentLevel.timer) this.currentLevel.timer.update(elapsedTime);
    }


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
    if (EndText.CONFIG.IS_INTERACTIVE) {
      window.removeEventListener('keydown', this.onEndKey);
    }

    this.particleManager.dispose();
    this.starfield.dispose();

    // Dispose all created levels
    this.levels.forEach(level => {
      level.timer?.dispose();
      level.panels.left?.mesh && this.particleManager.removeObject(level.panels.left.mesh);
      level.panels.right?.mesh && this.particleManager.removeObject(level.panels.right.mesh);
    });

    this.startText.mesh && this.particleManager.removeObject(this.startText.mesh);
    this.endText?.mesh && this.particleManager.removeObject(this.endText.mesh);
    this.descriptionTextInstance?.mesh && this.particleManager.removeObject(this.descriptionTextInstance.mesh);
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

  const [isPlayerDestroyed, setIsPlayerDestroyed] = useState(true);

  const handleVideoEnded = useCallback(() => {
    console.log("Video ended, telling game engine.");
    setYoutubeId(null);
  }, []);

  useEffect(() => {
    if (window.YT && window.YT.Player) {
      isApiReady.current = true;
      return;
    }

    if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
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

  useEffect(() => {
    const createPlayer = () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch(e) {
          console.warn("Old player failed", e);
        }
      }
      setIsPlayerDestroyed(false);
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
      try {
        playerRef.current.destroy();
      } catch (e) {
        console.warn("Error destroying YouTube player:", e);
      }
      playerRef.current = null;
      setIsPlayerDestroyed(true);
    } else {
      setIsPlayerDestroyed(true);
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

  useEffect(() => {
    if (isPlayerDestroyed && gameEngineRef.current) {
      // Ensure the state allows proceeding (e.g., after zooming)
      if (gameEngineRef.current.state === 'zooming') {
        console.log("Player is destroyed, telling engine to proceed.");
        gameEngineRef.current.onVideoEnded();
      }
    }
  }, [isPlayerDestroyed]);


  useEffect(() => {
    const handleContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const gameEngine = new GameEngine(
      mountRef.current,
      (id) => {
        setIsPlayerDestroyed(false);
        setYoutubeId(id);
      },
      setInstructions
    );

    gameEngineRef.current = gameEngine;
    gameEngine.start();

    return () => {
      if (gameEngineRef.current) {
        gameEngineRef.current.destroy();
      }
      gameEngineRef.current = null;
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
      pointerEvents: 'none',
      cursor: 'none'
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
        pointerEvents: 'none'
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
          pointerEvents: 'auto'
        }}>
          {/* This div is the mount point for the YT Player */}
          <div id="youtube-player-mount" style={{ width: '100%', height: '100%' }}></div>

          {/* Click/Hover Shield */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 11,
            background: 'transparent',
            cursor: 'none'
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


