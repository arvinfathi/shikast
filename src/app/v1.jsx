'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

// --- Shaders (Inlined to resolve import issues) ---------------------
const ChromaticAberrationShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'amount': { value: 0.005 } // Using the subtle distortion from the HTML file
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
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 offset = amount * vec2(cos(vUv.y * 10.0), sin(vUv.x * 10.0));
      vec4 r = texture2D(tDiffuse, vUv + offset);
      vec4 g = texture2D(tDiffuse, vUv);
      vec4 b = texture2D(tDiffuse, vUv - offset);
      gl_FragColor = vec4(r.r, g.g, b.b, g.a);
    }
  `
};

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


// --- Configuration -----------------------------------------------
const CONFIG = {
    START_TEXT: 'START',
    END_TEXT: 'FIN.',
    TIMER_DURATION: 15000, // in milliseconds
    PARTICLE_SPEED: 0.05,
    CAMERA_Z: 5,
    PANEL_ASPECT: 16 / 9,
    PANEL_WIDTH: 4.5,
    PANEL_GAP: 0.8,
    PANEL_Y_OFFSET: 0.5,
    BLOOM_PARAMS: {
        strength: 0.75, // Matching the bloom strength from the HTML file
        radius: 0.6,
        threshold: 0.1,
    },
    MISSIONS: [
        { 
            left: '/videos/gloomy-forest.mp4',
            right: '/videos/ocean-waves.mp4'
        },
        { 
            left: '/videos/mixkit-fire-breathing-in-the-dark-43384-medium.mp4',
            right: '/videos/mixkit-white-sand-beach-with-people-in-the-water-34629-medium.mp4'
        },
    ]
};

// --- ArtExperience Component ---------------------------
const ArtExperience = () => {
    const mountRef = useRef(null);
    const instructionsRef = useRef(null);
    const threeRef = useRef({}).current;

    useEffect(() => {
        const currentMount = mountRef.current;
        threeRef.scene = new THREE.Scene();
        threeRef.camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        threeRef.camera.position.z = CONFIG.CAMERA_Z;
        threeRef.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        threeRef.renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        threeRef.renderer.setPixelRatio(window.devicePixelRatio);
        currentMount.appendChild(threeRef.renderer.domElement);
        threeRef.clock = new THREE.Clock();
        
        threeRef.state = 'intro';
        threeRef.selectedPanel = 'left';
        threeRef.timer = { startTime: 0, remaining: CONFIG.TIMER_DURATION, active: false };
        threeRef.panels = { left: null, right: null };
        threeRef.particleSystems = [];
        threeRef.currentMission = 0;
        threeRef.mouse = new THREE.Vector2();

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        threeRef.scene.add(ambientLight);
        
        const renderPass = new RenderPass(threeRef.scene, threeRef.camera);
        
        const composer = new EffectComposer(threeRef.renderer);
        composer.addPass(renderPass);
        
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(currentMount.clientWidth, currentMount.clientHeight),
            CONFIG.BLOOM_PARAMS.strength, CONFIG.BLOOM_PARAMS.radius, CONFIG.BLOOM_PARAMS.threshold);
        composer.addPass(bloomPass);
        threeRef.bloomPass = bloomPass;

        const filmPass = new FilmPass(0.35, 0.5, 2048, false);
        composer.addPass(filmPass);
        threeRef.filmPass = filmPass;
        
        const chromaticPass = new ShaderPass(ChromaticAberrationShader);
        composer.addPass(chromaticPass);

        const createStarfield = () => {
            const count = 3000;
            const positions = new Float32Array(count * 3);
            for(let i=0; i< count; i++) {
                positions.set([(Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50], i*3);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const mat = new THREE.PointsMaterial({color: 0xffffff, size: 0.05, transparent: true, opacity: 0.5});
            threeRef.starfield = new THREE.Points(geo, mat);
            threeRef.scene.add(threeRef.starfield);
        };
        createStarfield();

        const fontLoader = new FontLoader();
        const createText = (text, callback) => {
            fontLoader.load('https://cdn.jsdelivr.net/npm/three@0.164.1/examples/fonts/helvetiker_bold.typeface.json', (font) => {
                const geometry = new TextGeometry(text, { font, size: 0.8, height: 0.1, curveSegments: 12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelOffset: 0, bevelSegments: 5 });
                geometry.center();
                const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
                const textMesh = new THREE.Mesh(geometry, material);
                callback(textMesh);
            });
        };

        const onKeyPress = (event) => {
            if (threeRef.state === 'intro') {
                startExperience();
                if(instructionsRef.current) instructionsRef.current.textContent = "Use ← and → to choose. Press Enter to select.";
            }
        };

        createText(CONFIG.START_TEXT, (mesh) => {
            threeRef.startText = mesh;
            threeRef.scene.add(threeRef.startText);
            window.addEventListener('keydown', onKeyPress, { once: true });
        });
        
        const dissolveObject = (objectToDissolve) => {
            if (!objectToDissolve || !objectToDissolve.geometry) return;
            const sampler = new MeshSurfaceSampler(objectToDissolve).build();
            const count = objectToDissolve.geometry.type === 'TextGeometry' ? 5000 : 2000;
            const positions = new Float32Array(count * 3);
            const velocities = new Float32Array(count * 3);
            const _position = new THREE.Vector3();
            for (let i = 0; i < count; i++) {
                sampler.sample(_position);
                positions.set([_position.x, _position.y, _position.z], i * 3);
                const velocity = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5));
                velocity.normalize().multiplyScalar(CONFIG.PARTICLE_SPEED * (Math.random() * 0.5 + 0.5));
                velocities.set([velocity.x, velocity.y, velocity.z], i * 3);
            }
            const particleGeometry = new THREE.BufferGeometry();
            particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            particleGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
            const particleMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.02, transparent: true, opacity: 1.0 });
            const particles = new THREE.Points(particleGeometry, particleMaterial);
            particles.position.copy(objectToDissolve.position);
            threeRef.scene.add(particles);
            threeRef.particleSystems.push(particles);
            threeRef.scene.remove(objectToDissolve);
            objectToDissolve.geometry.dispose();
            if(objectToDissolve.material.dispose) objectToDissolve.material.dispose();
        };
        
        const startExperience = () => {
            if (!threeRef.startText) return;
            dissolveObject(threeRef.startText);
            threeRef.startText = null;
            threeRef.state = 'dissolving';
            setTimeout(() => {
                createPanels(threeRef.currentMission);
                threeRef.state = 'selection';
                threeRef.timer.active = true;
                threeRef.timer.startTime = threeRef.clock.getElapsedTime();
                window.addEventListener('keydown', onSelectionKeyPress);
            }, 2000);
        };

        const createPanels = (missionIndex) => {
            const mission = CONFIG.MISSIONS[missionIndex];
            if (!mission) return;
            document.getElementById('video1').src = mission.left;
            document.getElementById('video2').src = mission.right;
            const videos = [document.getElementById('video1'), document.getElementById('video2')];
            videos.forEach(v => { v.load(); v.play().catch(e => {}); v.pause(); });
            const panelHeight = CONFIG.PANEL_WIDTH / CONFIG.PANEL_ASPECT;
            const geometry = new THREE.PlaneGeometry(CONFIG.PANEL_WIDTH, panelHeight, 32, 32);
            const createPanel = (video, positionX) => {
                const texture = new THREE.VideoTexture(video);
                const material = new THREE.ShaderMaterial({ 
                    uniforms: { time: { value: 0.0 }, tDiffuse: { value: texture }, borderWidth: { value: 0.02 } }, 
                    vertexShader: PanelShader.vertexShader, fragmentShader: PanelShader.fragmentShader
                });
                const panel = new THREE.Mesh(geometry, material);
                panel.position.x = positionX;
                panel.position.y = CONFIG.PANEL_Y_OFFSET;
                threeRef.scene.add(panel);
                return panel;
            };
            const panelX = (CONFIG.PANEL_WIDTH / 2) + CONFIG.PANEL_GAP;
            threeRef.panels.left = createPanel(videos[0], -panelX);
            threeRef.panels.right = createPanel(videos[1], panelX);
            threeRef.panels.left.video = videos[0];
            threeRef.panels.right.video = videos[1];
            createTimerBar();
        };

        const createTimerBar = () => {
            const barWidth = (CONFIG.PANEL_WIDTH + CONFIG.PANEL_GAP) * 2 - (CONFIG.PANEL_GAP);
            const barHeight = 0.05;
            const geometry = new THREE.PlaneGeometry(barWidth, barHeight);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            threeRef.timerBar = new THREE.Mesh(geometry, material);
            const panelHeight = CONFIG.PANEL_WIDTH / CONFIG.PANEL_ASPECT;
            threeRef.timerBar.position.y = CONFIG.PANEL_Y_OFFSET + (panelHeight / 2) + 0.3;
            threeRef.scene.add(threeRef.timerBar);
        };
        
        const onVideoEnd = () => {
            const selectedPanel = threeRef.panels[threeRef.selectedPanel];
            if (selectedPanel) {
                dissolveObject(selectedPanel);
                threeRef.panels[threeRef.selectedPanel] = null;
            }
            threeRef.currentMission++;
            if (threeRef.currentMission < CONFIG.MISSIONS.length) {
                 threeRef.state = 'dissolving';
                 setTimeout(() => {
                    threeRef.state = 'selection';
                    createPanels(threeRef.currentMission);
                    threeRef.timer.active = true;
                    threeRef.timer.startTime = threeRef.clock.getElapsedTime();
                 }, 2000);
            } else {
                threeRef.state = 'finished';
                setTimeout(() => {
                    createText(CONFIG.END_TEXT, (mesh) => {
                        threeRef.endText = mesh;
                        threeRef.scene.add(threeRef.endText);
                    });
                }, 2000);
            }
        };
        
        const playSelectedVideo = () => {
            if (threeRef.state !== 'selection') return;
            threeRef.state = 'playing';
            threeRef.timer.active = false;
            const selected = threeRef.panels[threeRef.selectedPanel];
            const unselected = threeRef.panels[threeRef.selectedPanel === 'left' ? 'right' : 'left'];
            if(unselected) dissolveObject(unselected);
            if(threeRef.timerBar) dissolveObject(threeRef.timerBar);
            threeRef.panels[threeRef.selectedPanel === 'left' ? 'right' : 'left'] = null;
            threeRef.timerBar = null;
            zoomToPanel(selected);
            selected.video.play();
            selected.video.addEventListener('ended', onVideoEnd, { once: true });
            if(instructionsRef.current) instructionsRef.current.style.opacity = '0';
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
            
            const startBorderWidth = panel.material.uniforms.borderWidth.value;

            const startTime = threeRef.clock.getElapsedTime();
            const tween = () => {
                if(threeRef.state !== 'playing') return;
                const progress = Math.min((threeRef.clock.getElapsedTime() - startTime) / duration, 1);
                const easeProgress = 0.5 * (1 - Math.cos(Math.PI * progress));
                cam.position.lerpVectors(startPos, endPos, easeProgress);
                panel.scale.lerpVectors(startScale, endScale, easeProgress);
                panel.material.uniforms.borderWidth.value = THREE.MathUtils.lerp(startBorderWidth, 0.0, easeProgress);

                if (progress < 1) requestAnimationFrame(tween);
            };
            tween();
        };

        const onSelectionKeyPress = (event) => {
             if (threeRef.state !== 'selection') return;
            if (event.key === 'ArrowLeft') threeRef.selectedPanel = 'left';
            else if (event.key === 'ArrowRight') threeRef.selectedPanel = 'right';
            else if (event.key === 'Enter') {
                 window.removeEventListener('keydown', onSelectionKeyPress);
                 playSelectedVideo();
            }
        };
        
        const onWindowResize = () => {
            if(!threeRef.renderer) return;
            threeRef.camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
            threeRef.camera.updateProjectionMatrix();
            threeRef.renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
            composer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        };
        window.addEventListener('resize', onWindowResize);

        const onMouseMove = (event) => {
            if (threeRef.mouse) {
                threeRef.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                threeRef.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            }
        };
        window.addEventListener('mousemove', onMouseMove);


        const animate = () => {
            if (!threeRef.renderer) return;
            const animationId = requestAnimationFrame(animate);
            threeRef.animationId = animationId;
            const delta = threeRef.clock.getDelta();
            const elapsedTime = threeRef.clock.getElapsedTime();

            if(threeRef.starfield) {
                // Parallax effect based on mouse movement
                const targetX = threeRef.mouse.x * 0.1;
                const targetY = threeRef.mouse.y * 0.1;
                threeRef.starfield.rotation.y += 0.05 * (targetX - threeRef.starfield.rotation.y);
                threeRef.starfield.rotation.x += 0.05 * (targetY - threeRef.starfield.rotation.x);
            }

            threeRef.particleSystems.forEach((system, index) => {
                const positions = system.geometry.attributes.position;
                const velocities = system.geometry.attributes.velocity;
                for (let i = 0; i < positions.count; i++) {
                    positions.setXYZ(i, positions.getX(i) + velocities.getX(i), positions.getY(i) + velocities.getY(i), positions.getZ(i) + velocities.getZ(i));
                }
                positions.needsUpdate = true;
                system.material.opacity -= 0.008;
                if (system.material.opacity <= 0) {
                    threeRef.scene.remove(system);
                    system.geometry.dispose();
                    system.material.dispose();
                    threeRef.particleSystems.splice(index, 1);
                }
            });

            if (threeRef.state === 'intro' && threeRef.startText) {
                threeRef.startText.position.y = Math.sin(elapsedTime * 1.5) * 0.1;
                threeRef.filmPass.uniforms['time'].value += delta;
                threeRef.bloomPass.strength = CONFIG.BLOOM_PARAMS.strength + Math.sin(elapsedTime * 5) * 0.1 - 0.2;
            } 
            
            if (threeRef.state === 'selection') {
                const highlightScale = 1.1;
                const baseScale = 1.0;
                Object.entries(threeRef.panels).forEach(([key, panel]) => {
                    if(!panel) return;
                    panel.material.uniforms.time.value = elapsedTime;
                    const targetScale = key === threeRef.selectedPanel ? highlightScale : baseScale;
                    panel.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1);
                    panel.position.y = CONFIG.PANEL_Y_OFFSET + Math.sin(elapsedTime * (key === 'left' ? 1.2 : 1.3)) * 0.1;
                });

                if (threeRef.timer.active && threeRef.timerBar) {
                    const elapsed = (elapsedTime - threeRef.timer.startTime) * 1000;
                    const remaining = Math.max(0, CONFIG.TIMER_DURATION - elapsed);
                    const progress = remaining / CONFIG.TIMER_DURATION;
                    threeRef.timerBar.scale.x = progress;
                    threeRef.timerBar.position.x = - (1 - progress) * (threeRef.timerBar.geometry.parameters.width / 2);
                    if (progress > 0.5) threeRef.timerBar.material.color.set(0x00ff00);
                    else if (progress > 0.2) threeRef.timerBar.material.color.set(0xffa500);
                    else threeRef.timerBar.material.color.set(0xff0000);
                    if (progress <= 0) {
                        window.removeEventListener('keydown', onSelectionKeyPress);
                        playSelectedVideo();
                    }
                }
            }
            if (threeRef.endText) {
                threeRef.endText.position.y = Math.sin(elapsedTime) * 0.05;
            }
            
            composer.render(delta);
        };
        animate();

        return () => {
            cancelAnimationFrame(threeRef.animationId);
            window.removeEventListener('resize', onWindowResize);
            window.removeEventListener('keydown', onKeyPress);
            window.removeEventListener('keydown', onSelectionKeyPress);
            window.removeEventListener('mousemove', onMouseMove);
            if(threeRef.renderer && currentMount.contains(threeRef.renderer.domElement)) {
                currentMount.removeChild(threeRef.renderer.domElement);
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
                fontFamily: 'Inter, sans-serif' }}>
                Press any key to begin
            </div>
            <video id="video1" crossOrigin="anonymous" muted playsInline src="" style={{ display: 'none' }}></video>
            <video id="video2" crossOrigin="anonymous" muted playsInline src="" style={{ display: 'none' }}></video>
            <video preload="auto" src="/videos/mixkit-fire-breathing-in-the-dark-43384-medium.mp4" style={{ display: 'none' }}></video>
            <video preload="auto" src="/videos/mixkit-white-sand-beach-with-people-in-the-water-34629-medium.mp4" style={{ display: 'none' }}></video>
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

