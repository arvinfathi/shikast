'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

// ---------------- CONFIG ----------------
const CONFIG = {
  START_TEXT: 'START',
  END_TEXT: 'FIN.',
  CAMERA_Z: 5,

  TIMER: {
    DURATION: 15000,
    BAR_HEIGHT: 0.05,
    Y_OFFSET: 0.3, // Distance above panels
    COLORS: {
        GREEN: new THREE.Color(0x00ff00),
        YELLOW: new THREE.Color(0xffff00),
        RED: new THREE.Color(0xff0000)
    }
  },

  // Text Animation
  START_TEXT_COLOR: 0xffffff,
  START_TEXT_SIZE: 1.9,
  START_TEXT_FLOAT_SPEED: 1.5,
  START_TEXT_FLOAT_AMPLITUDE: 0.1,

  // Starfield
  STARFIELD_COUNT: 3000,
  STARFIELD_AREA: 50,
  STARFIELD_ROTATE_SPEED: 0.05,
  STARFIELD_PARALLAX_FACTOR: 0.3, // how far starfield moves per panel switch

  // Particle Dissolve
  PARTICLE_SPEED: 0.05,
  PARTICLE_SIZE: 0.02,
  PARTICLE_FADE_SPEED: 0.008,

  // Panels
  PANEL_ASPECT: 16 / 9,
  PANEL_WIDTH: 4.5,
  PANEL_GAP: 0.8,
  PANEL_Y_OFFSET: 0.5,

  // Border effect
  PANEL_BORDER_WIDTH: 0.05,

  // Bloom + Film
  BLOOM_PARAMS: {
    strength: 0.5,
    radius: 0.6,
    threshold: 0.1,
  },
  FILM_PARAMS: {
    noiseIntensity: 0.35,
    scanlineIntensity: 0.5,
  },

  MISSIONS: [
    {
      left: 'https://cdn.pixabay.com/video/2025/05/14/278887_large.mp4',
      right: 'https://cdn.pixabay.com/video/2024/05/29/214409_large.mp4'
    },
    {
      left: 'https://cdn.pixabay.com/video/2021/02/18/65560-515098344_large.mp4',
      right: 'https://cdn.pixabay.com/video/2022/04/17/114174-700585640_large.mp4'
    }
  ]
};

// ---------------- Panel Shader ----------------
const PanelShader = {
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
    varying vec2 vUv;
    void main() {
      vec4 texColor = texture2D(tDiffuse, vUv);
      float border = smoothstep(0.0, borderWidth, vUv.x) * (1.0 - smoothstep(1.0 - borderWidth, 1.0, vUv.x)) *
                     smoothstep(0.0, borderWidth, vUv.y) * (1.0 - smoothstep(1.0 - borderWidth, 1.0, vUv.y));
      if (border < 0.5 && borderWidth > 0.0) {
        float pulse = 0.6 + 0.4 * sin(time * 8.0);
        gl_FragColor = vec4(pulse, 0.0, 0.0, 1.0);
      } else {
        gl_FragColor = texColor;
      }
    }
  `
};

const ArtExperience = () => {
  const mountRef = useRef(null);
  const instructionsRef = useRef(null);
  const threeRef = useRef({}).current;

  useEffect(() => {
    const mount = mountRef.current;

    // --- Basic setup
    threeRef.scene = new THREE.Scene();
    threeRef.camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    threeRef.camera.position.z = CONFIG.CAMERA_Z;
    threeRef.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    threeRef.renderer.setSize(mount.clientWidth, mount.clientHeight);
    threeRef.renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(threeRef.renderer.domElement);

    threeRef.clock = new THREE.Clock();
    threeRef.state = 'intro';
    threeRef.selectedPanel = 'left';
    threeRef.panels = {};
    threeRef.particleSystems = [];
    threeRef.currentMission = 0;
    threeRef.starfieldOffset = 0; // for parallax effect
    threeRef.timer = { startTime: 0, active: false };


    // --- Lighting
    threeRef.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // --- Postprocessing
    const composer = new EffectComposer(threeRef.renderer);
    composer.addPass(new RenderPass(threeRef.scene, threeRef.camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(mount.clientWidth, mount.clientHeight),
      CONFIG.BLOOM_PARAMS.strength,
      CONFIG.BLOOM_PARAMS.radius,
      CONFIG.BLOOM_PARAMS.threshold
    );
    composer.addPass(bloomPass);
    const filmPass = new FilmPass(CONFIG.FILM_PARAMS.noiseIntensity, CONFIG.FILM_PARAMS.scanlineIntensity, 2048, false);
    composer.addPass(filmPass);
    threeRef.composer = composer;

    // --- Starfield
    const starPositions = new Float32Array(CONFIG.STARFIELD_COUNT * 3);
    for (let i = 0; i < CONFIG.STARFIELD_COUNT; i++) {
      starPositions.set([
        (Math.random() - 0.5) * CONFIG.STARFIELD_AREA,
        (Math.random() - 0.5) * CONFIG.STARFIELD_AREA,
        (Math.random() - 0.5) * CONFIG.STARFIELD_AREA
      ], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.5 });
    threeRef.starfield = new THREE.Points(starGeo, starMat);
    threeRef.scene.add(threeRef.starfield);

    // --- Start Text
    const fontLoader = new FontLoader();
    fontLoader.load('https://cdn.jsdelivr.net/npm/three@0.164.1/examples/fonts/helvetiker_bold.typeface.json', (font) => {
      const geo = new TextGeometry(CONFIG.START_TEXT, {
        font,
        size: CONFIG.START_TEXT_SIZE,
        height: 0.1,
        curveSegments: 12,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.02,
        bevelOffset: 0,
        bevelSegments: 5
      });
      geo.center();
      const mat = new THREE.MeshBasicMaterial({ color: CONFIG.START_TEXT_COLOR });
      threeRef.startText = new THREE.Mesh(geo, mat);
      threeRef.scene.add(threeRef.startText);
      window.addEventListener('keydown', handleStartKey, { once: true });
    });

    // --- Events
    const handleStartKey = () => {
      if (threeRef.state === 'intro') {
        dissolveObject(threeRef.startText);
        threeRef.state = 'dissolving';
        setTimeout(() => {
          createPanels(threeRef.currentMission);
          threeRef.state = 'selection';
          threeRef.timer.active = true;
          threeRef.timer.startTime = threeRef.clock.getElapsedTime();
          if (instructionsRef.current) {
            instructionsRef.current.textContent = "Use ← and → to choose. Press Enter to select.";
          }
          window.addEventListener('keydown', onSelectionKeyPress);
        }, 1500);
      }
    };

    const onSelectionKeyPress = (e) => {
      if (threeRef.state !== 'selection') return;
      if (e.key === 'ArrowLeft') {
        threeRef.selectedPanel = 'left';
        threeRef.starfieldOffset -= CONFIG.STARFIELD_PARALLAX_FACTOR;
      } else if (e.key === 'ArrowRight') {
        threeRef.selectedPanel = 'right';
        threeRef.starfieldOffset += CONFIG.STARFIELD_PARALLAX_FACTOR;
      } else if (e.key === 'Enter') {
        window.removeEventListener('keydown', onSelectionKeyPress);
        playSelectedVideo();
      }
    };

    const dissolveObject = (object) => {
      if (!object) return;
      const sampler = new MeshSurfaceSampler(object).build();
      const count = 5000;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      const p = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        sampler.sample(p);
        positions.set([p.x, p.y, p.z], i * 3);
        const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5));
        v.normalize().multiplyScalar(CONFIG.PARTICLE_SPEED * (Math.random() * 0.5 + 0.5));
        velocities.set([v.x, v.y, v.z], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
      const mat = new THREE.PointsMaterial({ color: 0xffffff, size: CONFIG.PARTICLE_SIZE, transparent: true, opacity: 1 });
      const particles = new THREE.Points(geo, mat);
      
      // FIX: Copy the dissolving object's world position to the particles
      particles.position.copy(object.position);

      threeRef.scene.add(particles);
      threeRef.particleSystems.push(particles);
      threeRef.scene.remove(object);
      object.geometry.dispose();
      object.material.dispose();
    };

    const createPanels = (missionIndex) => {
      const mission = CONFIG.MISSIONS[missionIndex];
      if (!mission) return;
      const panelHeight = CONFIG.PANEL_WIDTH / CONFIG.PANEL_ASPECT;
      const geo = new THREE.PlaneGeometry(CONFIG.PANEL_WIDTH, panelHeight);
      const panelX = (CONFIG.PANEL_WIDTH / 2) + CONFIG.PANEL_GAP;

      const createPanel = (src, x) => {
        const video = document.createElement('video');
        video.src = src;
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.loop = false;
        video.playsInline = true;
        video.preload = 'auto';
        const texture = new THREE.VideoTexture(video);
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0.0 },
            tDiffuse: { value: texture },
            borderWidth: { value: CONFIG.PANEL_BORDER_WIDTH }
          },
          vertexShader: PanelShader.vertexShader,
          fragmentShader: PanelShader.fragmentShader
        });
        const panel = new THREE.Mesh(geo, mat);
        panel.position.set(x, CONFIG.PANEL_Y_OFFSET, 0);
        panel.video = video;
        threeRef.scene.add(panel);
        return panel;
      };

      threeRef.panels.left = createPanel(mission.left, -panelX);
      threeRef.panels.right = createPanel(mission.right, panelX);
      createTimerBar();
    };

    const createTimerBar = () => {
        const barWidth = (CONFIG.PANEL_WIDTH + CONFIG.PANEL_GAP) * 2 - CONFIG.PANEL_GAP;
        const geometry = new THREE.PlaneGeometry(barWidth, CONFIG.TIMER.BAR_HEIGHT);
        const material = new THREE.MeshBasicMaterial({ color: CONFIG.TIMER.COLORS.GREEN });
        threeRef.timerBar = new THREE.Mesh(geometry, material);
        const panelHeight = CONFIG.PANEL_WIDTH / CONFIG.PANEL_ASPECT;
        threeRef.timerBar.position.y = CONFIG.PANEL_Y_OFFSET + (panelHeight / 2) + CONFIG.TIMER.Y_OFFSET;
        threeRef.scene.add(threeRef.timerBar);
    };

    const playSelectedVideo = () => {
      if (threeRef.state !== 'selection') return;
      threeRef.state = 'playing';
      threeRef.timer.active = false;
      const selected = threeRef.panels[threeRef.selectedPanel];
      const unselected = threeRef.panels[threeRef.selectedPanel === 'left' ? 'right' : 'left'];
      if (unselected) dissolveObject(unselected);
      if (threeRef.timerBar) dissolveObject(threeRef.timerBar);

      selected.video.play();
      zoomToPanel(selected);
      if (instructionsRef.current) instructionsRef.current.style.opacity = '0';
    };

    const zoomToPanel = (panel) => {
      const duration = 1.5;
      const cam = threeRef.camera;
      const distance = cam.position.z - panel.position.z;
      const vFov = (cam.fov * Math.PI) / 180;
      const height = 2 * Math.tan(vFov / 2) * distance;
      const width = height * cam.aspect;
      const startPos = cam.position.clone();
      const endPos = new THREE.Vector3(panel.position.x, panel.position.y, cam.position.z);
      const startScale = panel.scale.clone();
      const endScale = new THREE.Vector3(width / CONFIG.PANEL_WIDTH, height / (CONFIG.PANEL_WIDTH / CONFIG.PANEL_ASPECT), 1);

      const startTime = threeRef.clock.getElapsedTime();
      const tween = () => {
        if(threeRef.state !== 'playing') return;
        const progress = Math.min((threeRef.clock.getElapsedTime() - startTime) / duration, 1);
        const easeProgress = 0.5 * (1 - Math.cos(Math.PI * progress));
        cam.position.lerpVectors(startPos, endPos, easeProgress);
        panel.scale.lerpVectors(startScale, endScale, easeProgress);
        panel.material.uniforms.borderWidth.value = THREE.MathUtils.lerp(CONFIG.PANEL_BORDER_WIDTH, 0.0, easeProgress);

        if (progress < 1) requestAnimationFrame(tween);
      };
      tween();
    };

    // --- Resize
    const onResize = () => {
      threeRef.camera.aspect = mount.clientWidth / mount.clientHeight;
      threeRef.camera.updateProjectionMatrix();
      threeRef.renderer.setSize(mount.clientWidth, mount.clientHeight);
      threeRef.composer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // --- Animation Loop
    const animate = () => {
      const delta = threeRef.clock.getDelta();
      const elapsed = threeRef.clock.getElapsedTime();

      // Float Start Text
      if (threeRef.state === 'intro' && threeRef.startText) {
        threeRef.startText.position.y = Math.sin(elapsed * CONFIG.START_TEXT_FLOAT_SPEED) * CONFIG.START_TEXT_FLOAT_AMPLITUDE;
      }

      // Starfield movement reacts to panel switch (parallax)
      threeRef.starfield.rotation.y += CONFIG.STARFIELD_ROTATE_SPEED * (threeRef.starfieldOffset - threeRef.starfield.rotation.y);

      // Particle Dissolve animation
      threeRef.particleSystems.forEach((ps, idx) => {
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
        ps.material.opacity -= CONFIG.PARTICLE_FADE_SPEED;
        if (ps.material.opacity <= 0) {
          threeRef.scene.remove(ps);
          ps.geometry.dispose();
          ps.material.dispose();
          threeRef.particleSystems.splice(idx, 1);
        }
      });

      // Panels idle bounce & Timer Logic
      if (threeRef.state === 'selection') {
        Object.entries(threeRef.panels).forEach(([key, panel]) => {
          if (!panel) return;
          panel.material.uniforms.time.value = elapsed;
          const targetScale = key === threeRef.selectedPanel ? 1.1 : 1.0;
          panel.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1);
          panel.position.y = CONFIG.PANEL_Y_OFFSET + Math.sin(elapsed * (key === 'left' ? 1.2 : 1.3)) * 0.1;
        });

        if (threeRef.timer.active && threeRef.timerBar) {
            const elapsedTimer = (elapsed - threeRef.timer.startTime) * 1000;
            const remaining = Math.max(0, CONFIG.TIMER.DURATION - elapsedTimer);
            const progress = remaining / CONFIG.TIMER.DURATION;
            
            threeRef.timerBar.scale.x = progress;
            threeRef.timerBar.position.x = -(1 - progress) * (threeRef.timerBar.geometry.parameters.width / 2);

            if (progress > 0.5) {
                threeRef.timerBar.material.color.lerpColors(CONFIG.TIMER.COLORS.YELLOW, CONFIG.TIMER.COLORS.GREEN, (progress - 0.5) * 2);
            } else {
                threeRef.timerBar.material.color.lerpColors(CONFIG.TIMER.COLORS.RED, CONFIG.TIMER.COLORS.YELLOW, progress * 2);
            }

            if (progress <= 0) {
                window.removeEventListener('keydown', onSelectionKeyPress);
                playSelectedVideo();
            }
        }
      }

      threeRef.composer.render(delta);
      threeRef.animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(threeRef.animationId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', handleStartKey);
      window.removeEventListener('keydown', onSelectionKeyPress);
      if(threeRef.renderer && mount.contains(threeRef.renderer.domElement)) {
        mount.removeChild(threeRef.renderer.domElement);
      }
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div ref={instructionsRef} style={{
        position: 'absolute',
        bottom: '20px',
        width: '100%',
        textAlign: 'center',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.5)',
        pointerEvents: 'none',
        transition: 'opacity 0.5s ease-in-out',
        fontFamily: 'Inter, sans-serif'
      }}>
        Press any key to begin
      </div>
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

