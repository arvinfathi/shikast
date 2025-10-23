// lib/shaders.js

export const ChromaticAberrationShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'amount': { value: 0.015 } // Increased amount for more noticeable prism effect
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
      vec2 offset = amount * vec2(cos(vUv.y * 20.0), sin(vUv.x * 20.0));
      vec4 r = texture2D(tDiffuse, vUv + offset);
      vec4 g = texture2D(tDiffuse, vUv);
      vec4 b = texture2D(tDiffuse, vUv - offset);
      gl_FragColor = vec4(r.r, g.g, b.b, g.a);
    }
  `
};

export const PanelShader = {
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

        // Function to convert HSV to RGB
        vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        void main() {
            vec4 texColor = texture2D(tDiffuse, vUv);
            
            // Calculate a soft border mask
            float border = smoothstep(0.0, borderWidth, vUv.x) * (1.0 - smoothstep(1.0 - borderWidth, 1.0, vUv.x)) *
                           smoothstep(0.0, borderWidth, vUv.y) * (1.0 - smoothstep(1.0 - borderWidth, 1.0, vUv.y));

            // Animate hue for the gradient border
            float speed = 2.0;
            float hue = mod(time * speed + vUv.x + vUv.y, 1.0);
            vec3 gradientColor = hsv2rgb(vec3(hue, 1.0, 1.0));

            // If inside the border area, show the gradient; otherwise, show the video texture
            if (border < 0.5) {
                gl_FragColor = vec4(gradientColor, 1.0);
            } else {
                gl_FragColor = texColor;
            }
        }
    `
};
