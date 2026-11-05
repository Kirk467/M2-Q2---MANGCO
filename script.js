
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const scene = new THREE.Scene();
const textureLoader = new THREE.TextureLoader();

// Space background
const backgroundTexture = textureLoader.load(
    'assets/felix-mittermeier-milky-way-2695569.jpg'
);
backgroundTexture.colorSpace = THREE.SRGBColorSpace;
backgroundTexture.center.set(0.5, 0.5);
backgroundTexture.rotation = Math.PI;

const backgroundSphere = new THREE.Mesh(
    new THREE.SphereGeometry(500, 64, 64),
    new THREE.MeshBasicMaterial({
        map: backgroundTexture,
        side: THREE.BackSide,
        depthWrite: false
    })
);

scene.add(backgroundSphere);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
document.body.appendChild(renderer.domElement);

// Camera
const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

const cameraTarget = new THREE.Vector3(0, 0, 0);
camera.position.set(0, 5, 60);

const viewDirection = camera.position.clone()
    .sub(cameraTarget)
    .normalize();

camera.up.set(0, 1, 0);
camera.up.applyAxisAngle(viewDirection, THREE.MathUtils.degToRad(55));
camera.lookAt(cameraTarget);

// Camera controls
const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.copy(cameraTarget);

controls.minDistance = 5;
controls.maxDistance = 200;
controls.rotateSpeed = 0.7;
controls.panSpeed = 0.7;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI / 2;

controls.update();

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(8, 12, 8);
directionalLight.castShadow = true;
scene.add(directionalLight);

const redLight = new THREE.PointLight(0xff1010, 20, 30);
redLight.position.set(0, 4, 0);
scene.add(redLight);

// Glass material
const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,

    metalness: 0.0,
    roughness: 0.05,

    transmission: 1.0,
    thickness: 0.05,
    ior: 1.5,

    attenuationColor: 0xffffff,
    attenuationDistance: 100,

    transparent: true,
    opacity: 0.1,

    envMapIntensity: 2.0,

    side: THREE.DoubleSide
});

// Post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Neon bloom
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.5,
    0.5,
    0.1
);

composer.addPass(bloomPass);

// Screen vignette
const vignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        darkness: { value: 1 },
        offset: { value: 0.8 }
    },

    vertexShader: `
        varying vec2 vUv;

        void main() {
            vUv = uv;
            gl_Position = projectionMatrix *
                          modelViewMatrix *
                          vec4(position, 1.0);
        }
    `,

    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float darkness;
        uniform float offset;

        varying vec2 vUv;

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);

            vec2 center = vUv - vec2(0.5);
            float distanceFromCenter = length(center);

            float vignette = smoothstep(
                offset * 0.35,
                offset,
                distanceFromCenter
            );

            color.rgb *= 1.0 - vignette * darkness;
            gl_FragColor = color;
        }
    `
};

composer.addPass(new ShaderPass(vignetteShader));

// Create the grid lines
function createBoxGrid({
    name = 'Grid',
    width = 14,
    depth = 12,
    spacing = 1,
    density = 1,
    thickness = 0.06,
    lineHeight = 0.15,
    x = 0,
    y = 0,
    z = 0,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    scaleX = 1,
    scaleY = 1,
    scaleZ = 1,
    color = 0xff1010,
    emissiveIntensity = 0.5,
    metalness = 0.5,
    roughness = 0.3,
    fadeNear = 5,
    fadeFar = 30,
    fadeStrength = 0.2
} = {}) {
    const grid = new THREE.Group();
    grid.name = name;

    const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity,
        metalness,
        roughness
    });

    // Fade grid lines based on camera distance
    material.onBeforeCompile = (shader) => {
        shader.uniforms.fadeNear = { value: fadeNear };
        shader.uniforms.fadeFar = { value: fadeFar };
        shader.uniforms.fadeStrength = { value: fadeStrength };

        shader.vertexShader = `
            varying float vViewDepth;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `
            #include <project_vertex>
            vViewDepth = -mvPosition.z;
            `
        );

        shader.fragmentShader = `
            varying float vViewDepth;
            uniform float fadeNear;
            uniform float fadeFar;
            uniform float fadeStrength;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>

            float fade = 1.0 - smoothstep(
                fadeNear,
                fadeFar,
                vViewDepth
            );

            diffuseColor.rgb = mix(
                diffuseColor.rgb,
                vec3(1.0),
                fade * fadeStrength
            );
            `
        );
    };

    const actualSpacing = spacing / Math.max(0.01, density);

    // Grid geometry
    const horizontalGeometry = new THREE.BoxGeometry(
        width,
        lineHeight,
        thickness
    );

    const verticalGeometry = new THREE.BoxGeometry(
        thickness,
        lineHeight,
        depth
    );

    let index = 0;

    for (
        let lineZ = -depth / 2;
        lineZ <= depth / 2 + 0.0001;
        lineZ += actualSpacing
    ) {
        const line = new THREE.Mesh(horizontalGeometry, material);

        line.name = `${name}_Horizontal_${index++}`;
        line.position.set(0, 0, lineZ);
        line.castShadow = true;
        line.receiveShadow = true;

        grid.add(line);
    }

    index = 0;

    for (
        let lineX = -width / 2;
        lineX <= width / 2 + 0.0001;
        lineX += actualSpacing
    ) {
        const line = new THREE.Mesh(verticalGeometry, material);

        line.name = `${name}_Vertical_${index++}`;
        line.position.set(lineX, 0, 0);
        line.castShadow = true;
        line.receiveShadow = true;

        grid.add(line);
    }

    grid.position.set(x, y, z);

    grid.rotation.set(
        THREE.MathUtils.degToRad(rotationX),
        THREE.MathUtils.degToRad(rotationY),
        THREE.MathUtils.degToRad(rotationZ)
    );

    grid.scale.set(scaleX, scaleY, scaleZ);

    return grid;
}

// Settings for all grids
const gridSettings = {
    width: 100,
    depth: 200,
    spacing: 1,
    density: 0.5,
    thickness: 0.2,
    lineHeight: 0.05,
    fadeNear: 5,
    fadeFar: 30,
    fadeStrength: 0.2
};

// Create the red and blue grids
const grids = [
    {
        name: 'RedGrid',
        x: 0,
        y: 0,
        z: 0,
        color: 0xff1010,
        emissiveIntensity: 0.5
    },
    {
        name: 'BlueGrid',
        x: 1,
        y: -1,
        z: 0,
        color: 0x0a0495,
        emissiveIntensity: 2
    },
    {
        name: 'RedGrid2',
        x: 0,
        y: 20,
        z: 0,
        color: 0xff1010,
        emissiveIntensity: 0.5
    },
    {
        name: 'BlueGrid2',
        x: 1,
        y: 21,
        z: 0,
        color: 0x0a0495,
        emissiveIntensity: 2
    }
];

grids.forEach((settings) => {
    const grid = createBoxGrid({
        ...gridSettings,
        ...settings
    });

    scene.add(grid);
});

// Glass walls
const wallGeometry = new THREE.BoxGeometry(0.1, 20, 200);

const leftGlassWall = new THREE.Mesh(wallGeometry, glassMaterial);
leftGlassWall.position.set(-50, 10, 0);
scene.add(leftGlassWall);

const rightGlassWall = new THREE.Mesh(wallGeometry, glassMaterial);
rightGlassWall.position.set(50, 10, 0);
scene.add(rightGlassWall);

// Glass floor and ceiling
const horizontalGlassGeometry = new THREE.BoxGeometry(100, 0.1, 200);

const glassFloor = new THREE.Mesh(
    horizontalGlassGeometry,
    glassMaterial
);
glassFloor.position.set(0, -2, 0);
scene.add(glassFloor);

const glassCeiling = new THREE.Mesh(
    horizontalGlassGeometry,
    glassMaterial
);
glassCeiling.position.set(0, 22, 0);
scene.add(glassCeiling);

// Moon
const moonGeometry = new THREE.SphereGeometry(7, 32, 32);

const moonTexture = textureLoader.load('assets/moon.jpg');
moonTexture.colorSpace = THREE.SRGBColorSpace;
moonTexture.wrapS = THREE.RepeatWrapping;
moonTexture.wrapT = THREE.ClampToEdgeWrapping;
moonTexture.offset.x = 0.25;

const moonMaterial = new THREE.MeshPhysicalMaterial({
    map: moonTexture,
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    emissive: 0x8daaff,
    emissiveMap: moonTexture,
    emissiveIntensity: 1.5,
    clearcoat: 0,
    transmission: 0,
    ior: 1.5
});

const moon = new THREE.Mesh(moonGeometry, moonMaterial);
moon.position.set(0, 10, -100);
moon.castShadow = true;
moon.receiveShadow = true;
scene.add(moon);

const moonLight = new THREE.PointLight(0x8daaff, 8, 60);
moonLight.position.set(
    moon.position.x,
    moon.position.y + 5,
    moon.position.z + 5
);
scene.add(moonLight);

// Moon particles
const particleCount = 1000;
const particlePositions = [];
const moonPosition = new THREE.Vector3(0, 10, -110);

for (let i = 0; i < particleCount; i++) {
    const radius = 12 + Math.random() * 7;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    const x = radius * Math.sin(phi) * Math.cos(theta) * 3;
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);

    particlePositions.push(
        moonPosition.x + x,
        moonPosition.y + y,
        moonPosition.z + z
    );
}

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(particlePositions, 3)
);

const starTexture = textureLoader.load('assets/star.png');
starTexture.colorSpace = THREE.SRGBColorSpace;

const particleMaterial = new THREE.PointsMaterial({
    map: starTexture,
    color: 0x6688ff,
    size: 1.5,
    transparent: true,
    opacity: 0.85,
    alphaTest: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const moonParticles = new THREE.Points(
    particleGeometry,
    particleMaterial
);

scene.add(moonParticles);

// Earth
const earthGeometry = new THREE.SphereGeometry(10, 40, 40);

const earthTexture = textureLoader.load('assets/earth.jpg');
earthTexture.colorSpace = THREE.SRGBColorSpace;
earthTexture.offset.x = 0.1;

const earthMaterial = new THREE.MeshPhysicalMaterial({
    map: earthTexture,
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0,
    emissive: 0x8e8aff,
    emissiveMap: earthTexture,
    emissiveIntensity: 2,
    clearcoat: 0,
    transmission: 0,
    ior: 1.5
});

const earth = new THREE.Mesh(earthGeometry, earthMaterial);
earth.position.set(0, 10, 100);
scene.add(earth);

const earthLight = new THREE.PointLight(0xffffff, 150, 100);
earthLight.position.set(0, 16, 85);
scene.add(earthLight);

// Earth blue glow
const atmosphereGeometry = new THREE.SphereGeometry(10.8, 40, 40);

const atmosphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x6688ff,
    transparent: true,
    opacity: 0.25,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const earthAtmosphere = new THREE.Mesh(
    atmosphereGeometry,
    atmosphereMaterial
);

earth.add(earthAtmosphere);

// Animation
function animate() {
    requestAnimationFrame(animate);

    controls.update();
    composer.render();
}

animate();

// Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
