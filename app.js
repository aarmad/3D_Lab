import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js';

// GLOBAL GAME STATE
export const GameState = {
    mode: 'menu',      // menu | solo | split | paused | victory
    level: 1,
    score: 0,
    startTime: 0,
    elapsed: 0,
    running: false,
    viewMode: 'fps',   // fps | topdown
    settings: {
        sensitivity: 2.0,
        speed: 5.5,
        motionLines: false,
        mazeSize: 19,
        maxTime: 60,
    },
    players: [
        { finished: false, time: 0 },
        { finished: false, time: 0 },
    ]
};

// CEL SHADING MATERIAL HELPERS
export class CelMaterials {
    static _gradientMap(steps) {
        const data = new Uint8Array(steps);
        for (let i = 0; i < steps; i++) data[i] = Math.floor((i / (steps - 1)) * 255);
        const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
        tex.needsUpdate = true;
        return tex;
    }

    static wallMat() { return new THREE.MeshToonMaterial({ color: 0x8B6914, gradientMap: CelMaterials._gradientMap(5), flatShading: true, emissive: 0x442800, emissiveIntensity: 0.25, metalness: 0.1, roughness: 0.8 }); }
    static floorMat() { return new THREE.MeshToonMaterial({ color: 0x1A1A3E, gradientMap: CelMaterials._gradientMap(4), flatShading: true }); }
    static ceilingMat() { return new THREE.MeshToonMaterial({ color: 0x0D0D2B, gradientMap: CelMaterials._gradientMap(3), flatShading: true }); }
    static exitMat() {
        return new THREE.MeshToonMaterial({
            color: 0x00FFAA, emissive: 0x00AA66,
            emissiveIntensity: 0.5,
            gradientMap: CelMaterials._gradientMap(2),
        });
    }
}

export function addOutline(mesh, parent, thickness = 0.05) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
    const outline = new THREE.Mesh(mesh.geometry.clone(), mat);
    outline.scale.setScalar(1 + thickness);
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    outline.renderOrder = -1;
    parent.add(outline);
}

export function formatTime(ms) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function spawnMotionLine() {
    const overlay = document.getElementById('ink-overlay');
    if (!overlay) return;
    const line = document.createElement('div');
    line.className = 'motion-line';
    const w = 90 + Math.random() * 130;
    line.style.cssText = `
        width: ${w}px;
        left: ${Math.random() * 100}%;
        top:  ${Math.random() * 100}%;
        transform: rotate(${Math.random() * 30 - 15}deg);
        background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.6), transparent);
        position: absolute;
        height: 2px;
        animation: motionFade 0.3s ease-out forwards;
        pointer-events: none;
    `;
    overlay.appendChild(line);
    setTimeout(() => line.remove(), 400);
}

// PROCÉDURE DE GÉNÉRATION DE LABYRINTHE
export class MazeGenerator {
    constructor(w, h) { this.setSize(w, h); }
    setSize(w, h) { this.width = w % 2 === 0 ? w + 1 : w; this.height = h % 2 === 0 ? h + 1 : h; }
    generate() {
        const grid = Array.from({ length: this.height }, () => Array(this.width).fill(1));
        const stack = [[1, 1]];
        grid[1][1] = 0;
        const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];

        while (stack.length) {
            const [cx, cy] = stack[stack.length - 1];
            const shuffled = this._shuffle([...dirs]);
            let moved = false;
            for (const [dx, dy] of shuffled) {
                const nx = cx + dx, ny = cy + dy;
                if (nx > 0 && nx < this.width - 1 && ny > 0 && ny < this.height - 1 && grid[ny][nx] === 1) {
                    grid[cy + dy / 2][cx + dx / 2] = 0;
                    grid[ny][nx] = 0;
                    stack.push([nx, ny]);
                    moved = true;
                    break;
                }
            }
            if (!moved) stack.pop();
        }

        const loopCount = Math.floor(this.width * this.height * 0.06);
        for (let i = 0; i < loopCount; i++) {
            const row = 1 + 2 * Math.floor(Math.random() * Math.floor((this.height - 1) / 2));
            const col = 2 + 2 * Math.floor(Math.random() * Math.floor((this.width - 2) / 2));
            if (row < this.height - 1 && col < this.width - 1) grid[row][col] = 0;
        }

        return grid;
    }

    _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

// CLASSE DE SCÈNE MAZE (affichage + contrôles joueur + collision)
export class MazeScene {
    constructor(canvas, playerIndex = 0, onExit = null) {
        this.canvas = canvas;
        this.playerIndex = playerIndex;
        this.onExit = onExit;
        this.cellSize = 2;
        this.wallHeight = 4.5;
        this.mazeGrid = null;
        this.mazeW = 0;
        this.mazeH = 0;
        this.exitPos = new THREE.Vector3();
        this.corridorLights = [];
        this.exitLight = null;
        this.viewMode = GameState.viewMode;

        this._initRenderer();
        this._initScene();
        this._initLights();
        this._initPlayer();
        this._initInput();
    }

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.setSize(this.canvas.clientWidth || window.innerWidth, this.canvas.clientHeight || window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);
        this.scene.fog = new THREE.Fog(0x0a0a1a, 10, 38);
        this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 120);
        this.topCamera = new THREE.PerspectiveCamera(65, 1, 1, 200);
    }

    _initLights() {
        this.scene.add(new THREE.AmbientLight(0x1a1a3e, 0.4));
        const mainLight = new THREE.DirectionalLight(0xFF8844, 1.5);
        mainLight.position.set(5, 10, 5);
        mainLight.castShadow = true;
        this.scene.add(mainLight);
        const rim = new THREE.DirectionalLight(0x00FFFF, 0.5);
        rim.position.set(-5, 3, -5);
        this.scene.add(rim);
    }

    _initPlayer() {
        this.player = { pos: new THREE.Vector3(this.cellSize * 1.5, 1.5, this.cellSize * 1.5), yaw: 0, pitch: 0, velY: 0, isGrounded: true, walkTime: 0 };
        this.playerMarker = new THREE.Group();
        const mat = new THREE.MeshToonMaterial({ color: 0x00FFFF, gradientMap: CelMaterials._gradientMap(4) });
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.4), mat); torso.position.y = 1.0; this.playerMarker.add(torso); addOutline(torso, this.playerMarker, 0.05);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat); head.position.y = 1.8; this.playerMarker.add(head); addOutline(head, this.playerMarker, 0.05);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xFF00FF })); visor.position.set(0, 1.85, -0.23); this.playerMarker.add(visor);

        const armGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
        this.lArm = new THREE.Mesh(armGeo, mat); this.lArm.position.set(-0.45, 1.1, 0); this.playerMarker.add(this.lArm); addOutline(this.lArm, this.playerMarker, 0.05);
        this.rArm = new THREE.Mesh(armGeo, mat); this.rArm.position.set(0.45, 1.1, 0); this.playerMarker.add(this.rArm); addOutline(this.rArm, this.playerMarker, 0.05);
        const legGeo = new THREE.BoxGeometry(0.25, 0.85, 0.25);
        this.lLeg = new THREE.Mesh(legGeo, mat); this.lLeg.position.set(-0.2, 0.4, 0); this.playerMarker.add(this.lLeg); addOutline(this.lLeg, this.playerMarker, 0.05);
        this.rLeg = new THREE.Mesh(legGeo, mat); this.rLeg.position.set(0.2, 0.4, 0); this.playerMarker.add(this.rLeg); addOutline(this.rLeg, this.playerMarker, 0.05);

        this.scene.add(this.playerMarker);
        this.cameraRig = new THREE.Object3D(); this.scene.add(this.cameraRig); this.cameraRig.add(this.camera);
        this._buildWeapon();
    }

    _buildWeapon() {
        this.weaponGroup = new THREE.Group();
        this.camera.add(this.weaponGroup);
        this.weaponGroup.position.set(0, -0.4, -0.6);
        const handMat = new THREE.MeshToonMaterial({ color: 0xC68642, gradientMap: CelMaterials._gradientMap(3) });

        const createHand = (isLeft) => {
            const hand = new THREE.Group();
            const palm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.1), handMat);
            hand.add(palm);
            addOutline(palm, hand, 0.05);
            for (let i = 0; i < 4; i++) {
                const finger = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.04), handMat);
                finger.position.set(-0.06 + i * 0.04, 0.12, 0);
                hand.add(finger);
            }
            const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.04), handMat);
            thumb.position.set(isLeft ? 0.1 : -0.1, 0.04, 0);
            hand.add(thumb);
            return hand;
        };

        this.leftHand = createHand(true);
        this.leftHand.position.set(-0.35, -0.1, 0.1);
        this.leftHand.rotation.set(0.4, 0.2, 0.1);
        this.weaponGroup.add(this.leftHand);

        this.rightHand = createHand(false);
        this.rightHand.position.set(0.35, -0.1, 0.1);
        this.rightHand.rotation.set(0.4, -0.2, -0.1);
        this.weaponGroup.add(this.rightHand);

        this.weaponGroup.userData.basePos = this.weaponGroup.position.clone();
        this.weaponGroup.userData.bobTime = 0;
    }

    _initInput() {
        this.keys = {};
        this.mouse = { dx: 0, dy: 0, locked: false };
        window.addEventListener('keydown', e => { this.keys[e.code] = true; if (e.key) this.keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', e => { this.keys[e.code] = false; if (e.key) this.keys[e.key.toLowerCase()] = false; });
        document.addEventListener('pointerlockchange', () => { this.mouse.locked = (document.pointerLockElement === this.canvas); });
        document.addEventListener('mousemove', e => { if (this.mouse.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } });
        this.canvas.addEventListener('click', () => { if (!this.mouse.locked && (GameState.mode === 'solo' || GameState.mode === 'split')) { this.canvas.requestPointerLock(); } });
    }

    resize(width, height) {
        if (!this.renderer || width <= 0 || height <= 0) return;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.topCamera.aspect = width / height;
        this.topCamera.updateProjectionMatrix();
    }

    requestLock() { this.canvas.requestPointerLock(); }

    buildMaze(grid) {
        this.mazeGrid = grid;
        this.mazeH = grid.length;
        this.mazeW = grid[0].length;

        if (this.wallGroup) { this.scene.remove(this.wallGroup); this.wallGroup = null; }
        const toRemove = [];
        this.scene.traverse(o => { if (o.userData.isMaze) toRemove.push(o); });
        toRemove.forEach(o => this.scene.remove(o));
        this.corridorLights.forEach(l => this.scene.remove(l));
        this.corridorLights = [];

        const C = this.cellSize, H = this.wallHeight;
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.mazeW * C, this.mazeH * C), CelMaterials.floorMat());
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(this.mazeW * C / 2, 0, this.mazeH * C / 2);
        floor.receiveShadow = true;
        floor.userData.isMaze = true;
        this.scene.add(floor);

        const ceil = new THREE.Mesh(new THREE.PlaneGeometry(this.mazeW * C, this.mazeH * C), CelMaterials.ceilingMat());
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(this.mazeW * C / 2, H, this.mazeH * C / 2);
        ceil.userData.isMaze = true;
        this.scene.add(ceil);

        const wallPositions = [];
        for (let r = 0; r < this.mazeH; r++) {
            for (let c = 0; c < this.mazeW; c++) {
                if (grid[r][c] === 1) wallPositions.push({ x: c * C + C / 2, y: H / 2, z: r * C + C / 2 });
            }
        }

        const wallGeo = new THREE.BoxGeometry(C, H, C);
        this.wallGroup = new THREE.Group();
        this.wallGroup.userData.isMaze = true;

        wallPositions.forEach(p => {
            const wall = new THREE.Mesh(wallGeo, CelMaterials.wallMat());
            wall.position.set(p.x, p.y, p.z);
            wall.castShadow = true;
            wall.receiveShadow = true;
            wall.userData.isMaze = true;
            this.wallGroup.add(wall);
            const edge = new THREE.LineSegments(new THREE.EdgesGeometry(wallGeo), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85 }));
            edge.position.copy(wall.position);
            edge.userData.isMaze = true;
            this.wallGroup.add(edge);
        });

        this.scene.add(this.wallGroup);

        const exitRow = this.mazeH - 2, exitCol = this.mazeW - 2;
        this.exitPos.set(exitCol * C + C / 2, 0.1, exitRow * C + C / 2);
        const exitMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 10), CelMaterials.exitMat());
        exitMesh.position.copy(this.exitPos); exitMesh.userData.isMaze = true; this.scene.add(exitMesh);

        this.exitLight = new THREE.PointLight(0x00FFAA, 2.5, 7);
        this.exitLight.position.set(this.exitPos.x, 1.8, this.exitPos.z); this.exitLight.userData.isMaze = true; this.scene.add(this.exitLight);

        this.player.pos.set(C * 1.5, 1.5, C * 1.5);
        const maxDim = Math.max(this.mazeW, this.mazeH) * C;
        this.topCamera.position.set(this.mazeW * C / 2, maxDim * 0.95, this.mazeH * C / 2 + 0.1);
        this.topCamera.lookAt(this.mazeW * C / 2, 0, this.mazeH * C / 2);

        this._buildCollisionMap(grid, C);
    }

    _buildCollisionMap(grid, C) {
        this.wallBoxes = [];
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[0].length; c++) {
                if (grid[r][c] === 1) this.wallBoxes.push({ minX: c * C, maxX: c * C + C, minZ: r * C, maxZ: r * C + C });
            }
        }
    }

    _checkCollision(x, z, radius = 0.42) {
        for (const b of this.wallBoxes) {
            const nx = Math.max(b.minX, Math.min(x, b.maxX));
            const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
            if ((x - nx) ** 2 + (z - nz) ** 2 < radius * radius) return true;
        }
        return false;
    }

    update(dt) {
        if (!GameState.running) return;
        const S = GameState.settings, sens = S.sensitivity * 0.0018;
        let jumping = this.playerIndex === 0 ? this.keys['Space'] : (this.keys['KeyM'] || this.keys['Semicolon'] || this.keys['m']);
        if (jumping && this.player.isGrounded) { this.player.velY = 7.5; this.player.isGrounded = false; }
        this.player.velY -= 20 * dt; this.player.pos.y += this.player.velY * dt;
        if (this.player.pos.y <= 1.5) { this.player.pos.y = 1.5; this.player.velY = 0; this.player.isGrounded = true; }

        const mode = this.viewMode || GameState.viewMode;
        if (this.mouse.locked && mode === 'fps' && this.playerIndex === 0) {
            this.player.yaw -= this.mouse.dx * sens; this.player.pitch -= this.mouse.dy * sens;
            this.player.pitch = Math.max(-Math.PI / 2.8, Math.min(Math.PI / 2.8, this.player.pitch));
        }

        if (this.playerIndex === 1 && mode === 'fps') {
            if (this.keys['ArrowLeft']) this.player.yaw += 2.5 * dt;
            if (this.keys['ArrowRight']) this.player.yaw -= 2.5 * dt;
            if (this.keys['ArrowUp']) this.player.pitch += 1.8 * dt;
            if (this.keys['ArrowDown']) this.player.pitch -= 1.8 * dt;
            this.player.pitch = Math.max(-Math.PI / 2.8, Math.min(Math.PI / 2.8, this.player.pitch));
        }
        this.mouse.dx = 0; this.mouse.dy = 0;

        const isTop = (mode === 'topdown');
        let fwdVec = isTop ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
        let rightVec = isTop ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
        const moveDir = new THREE.Vector3(); let moved = false;

        if (this.playerIndex === 0) {
            if (this.keys['KeyW']) { moveDir.addScaledVector(fwdVec, 1); moved = true; }
            if (this.keys['KeyS']) { moveDir.addScaledVector(fwdVec, -1); moved = true; }
            if (this.keys['KeyA']) { moveDir.addScaledVector(rightVec, -1); moved = true; }
            if (this.keys['KeyD']) { moveDir.addScaledVector(rightVec, 1); moved = true; }
        } else {
            if (this.keys['KeyI']) { moveDir.addScaledVector(fwdVec, 1); moved = true; }
            if (this.keys['KeyK']) { moveDir.addScaledVector(fwdVec, -1); moved = true; }
            if (this.keys['KeyJ'] || (isTop && this.keys['ArrowLeft'])) { moveDir.addScaledVector(rightVec, -1); moved = true; }
            if (this.keys['KeyL'] || (isTop && this.keys['ArrowRight'])) { moveDir.addScaledVector(rightVec, 1); moved = true; }
        }

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize();
            if (isTop) this.player.yaw = Math.atan2(-moveDir.x, -moveDir.z);
            const speed = S.speed * dt;
            const nx = this.player.pos.x + moveDir.x * speed, nz = this.player.pos.z + moveDir.z * speed;
            if (!this._checkCollision(nx, this.player.pos.z)) this.player.pos.x = nx;
            if (!this._checkCollision(this.player.pos.x, nz)) this.player.pos.z = nz;
        }

        if (moved && S.motionLines && Math.random() < 0.08) spawnMotionLine();

        this.cameraRig.position.copy(this.player.pos); this.cameraRig.rotation.y = this.player.yaw;
        this.camera.rotation.x = this.player.pitch;

        if (this.playerMarker) {
            this.playerMarker.position.copy(this.player.pos); this.playerMarker.rotation.y = this.player.yaw;
            this.playerMarker.visible = !isTop ? false : true;
            if (moved) {
                this.player.walkTime += dt * 10; const t = this.player.walkTime;
                this.lArm.rotation.x = Math.sin(t) * 0.8; this.rArm.rotation.x = -Math.sin(t) * 0.8;
                this.lLeg.rotation.x = -Math.sin(t) * 0.6; this.rLeg.rotation.x = Math.sin(t) * 0.6;
                this.playerMarker.position.y = this.player.pos.y + Math.abs(Math.sin(t * 0.5)) * 0.05;
            }
        }

        if (this.player.pos.distanceTo(this.exitPos) < 1.6 && this.onExit) this.onExit(this.playerIndex);
    }

    render() {
        const isTop = (this.viewMode || GameState.viewMode) !== 'fps';
        if (this.scene.fog) { this.scene.fog.near = isTop ? 50 : 10; this.scene.fog.far = isTop ? 250 : 38; }
        this.renderer.render(this.scene, isTop ? this.topCamera : this.camera);
    }

    drawMinimap(ctx, canvas) {
        if (!this.mazeGrid) return;
        const cw = canvas.width, ch = canvas.height;
        const cW = cw / this.mazeW, cH = ch / this.mazeH;
        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = '#080818'; ctx.fillRect(0, 0, cw, ch);
        for (let r = 0; r < this.mazeH; r++) {
            for (let c = 0; c < this.mazeW; c++) {
                if (this.mazeGrid[r][c] === 1) { ctx.fillStyle = '#7A5A10'; ctx.fillRect(c * cW, r * cH, cW, cH); }
            }
        }
        ctx.fillStyle = '#FF6B00';
        ctx.beginPath();
        ctx.arc((this.player.pos.x / this.cellSize) * cW, (this.player.pos.z / this.cellSize) * cH, Math.max(cW, cH) * 0.9, 0, Math.PI * 2);
        ctx.fill();
    }
}

// MAIN SCRIPT (game flow)
let soloScene = null;
let splitScene1 = null;
let splitScene2 = null;
let animFrameId = null;
let lastTime = 0;
let timerInterval = null;
let splitStart = 0;
let splitElapsed = 0;
const mazeGen = new MazeGenerator(19, 19);

function startTimer(resume = false) {
    GameState.startTime = resume ? Date.now() - GameState.elapsed : Date.now();
    GameState.running = true;
    timerInterval = setInterval(updateTimerDisplay, 50);
}

function stopTimer() {
    clearInterval(timerInterval);
    GameState.running = false;
}

function pauseGame() {
    if (GameState.mode === 'solo') {
        GameState.prevMode = 'solo';
        GameState.mode = 'paused';
        stopTimer();
        showScreen('pause-menu');
        cancelAnimationFrame(animFrameId);
    } else if (GameState.mode === 'split') {
        GameState.prevMode = 'split';
        GameState.mode = 'paused';
        splitElapsed = Date.now() - splitStart;
        showScreen('pause-menu');
        cancelAnimationFrame(animFrameId);
    }
}

function resumeGame() {
    const prevMode = GameState.prevMode || 'solo';
    if (prevMode === 'solo') {
        GameState.mode = 'solo';
        startTimer(true);
        showScreen('game-screen');
        lastTime = performance.now();
        animFrameId = requestAnimationFrame(soloLoop);
    } else if (prevMode === 'split') {
        GameState.mode = 'split';
        splitStart = Date.now() - splitElapsed;
        showScreen('split-screen');
        lastTime = performance.now();
        animFrameId = requestAnimationFrame(splitLoop);
    }
}

function updateTimerDisplay() {
    const duration = GameState.settings.maxTime * 1000;
    const elapsed = Date.now() - GameState.startTime;
    const timeLeft = Math.max(0, duration - elapsed);
    GameState.elapsed = elapsed;
    const mins = Math.floor(timeLeft / 60000);
    const secs = Math.floor((timeLeft % 60000) / 1000);
    const el = document.getElementById('timer-display');
    if (el) {
        el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        el.style.color = timeLeft < 10000 ? '#FF2020' : '';
    }
}

function mazeSizeForLevel(level) {
    const base = GameState.settings.mazeSize;
    const size = base + (level - 1) * 4;
    return Math.min(size % 2 === 0 ? size + 1 : size, 41);
}

function startSoloGame(level = 1) {
    GameState.mode = 'solo';
    GameState.level = level;
    const size = mazeSizeForLevel(level);
    mazeGen.setSize(size, size);
    const grid = mazeGen.generate();
    showScreen('game-screen');
    const canvas = document.getElementById('game-canvas');
    if (!soloScene) soloScene = new MazeScene(canvas, 0, onPlayerReachedExit);
    soloScene.viewMode = GameState.viewMode;
    soloScene.buildMaze(grid);
    soloScene.resize(window.innerWidth, window.innerHeight);
    document.getElementById('level-num').textContent = level;
    document.getElementById('maze-name').textContent = `SECTOR ${level}`;
    soloScene.requestLock();
    startTimer();
    lastTime = performance.now();
    cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(soloLoop);
}

function soloLoop(now) {
    animFrameId = requestAnimationFrame(soloLoop);
    if (GameState.mode !== 'solo') return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    soloScene.update(dt); soloScene.render();
    const mm = document.getElementById('minimap');
    soloScene.drawMinimap(mm.getContext('2d'), mm);
    const score = Math.max(0, 200000 - Math.floor(GameState.elapsed / 80));
    document.getElementById('score-display').textContent = score.toLocaleString();
}

function onPlayerReachedExit(playerIndex) {
    if (GameState.mode === 'solo') showVictory();
    if (GameState.mode === 'split') {
        GameState.players[playerIndex].finished = true;
        document.getElementById('split-winner').textContent = `JOUEUR ${playerIndex+1} GAGNE !`;
        document.getElementById('split-winner').style.display = 'block';
    }
}

function showVictory() {
    stopTimer(); document.exitPointerLock(); GameState.mode = 'victory';
    document.getElementById('final-time').textContent = formatTime(GameState.elapsed);
    showScreen('victory-screen');
    spawnVictoryParticles();
}

function animateMenuBackground() {
    const bg = document.querySelector('.menu-bg-anim');
    if (!bg) return;
    const words = ['CHAOS', 'MAZE', 'RUN', 'ESCAPE', 'BOOM!', 'POW!', 'ZAP!', 'LOST?', 'FIND IT!'];
    words.forEach(word => {
        const el = document.createElement('div');
        el.textContent = word;
        el.style.cssText = `position: absolute; font-family: 'Bangers', cursive; font-size: ${1 + Math.random() * 2}rem; color: rgba(255,100,0,0.1); left: ${Math.random() * 90}%; top: ${Math.random() * 90}%; transform: rotate(${Math.random() * 40 - 20}deg); animation: tagWobble ${2 + Math.random() * 3}s ease-in-out infinite alternate;`;
        bg.appendChild(el);
    });
}

function startSplitGame() {
    GameState.mode = 'split'; showScreen('split-screen');
    const size = GameState.settings.mazeSize; mazeGen.setSize(size, size);
    const c1 = document.getElementById('canvas-p1'), c2 = document.getElementById('canvas-p2');
    c1.width = c2.width = Math.floor(window.innerWidth / 2) - 4;
    c1.height = c2.height = window.innerHeight;
    splitScene1 = new MazeScene(c1, 0, onPlayerReachedExit);
    splitScene2 = new MazeScene(c2, 1, onPlayerReachedExit);
    splitScene1.viewMode = 'fps';
    splitScene2.viewMode = 'fps';
    const sharedGrid = mazeGen.generate();
    splitScene1.buildMaze(sharedGrid); splitScene2.buildMaze(sharedGrid);
    splitStart = Date.now() - splitElapsed;
    lastTime = performance.now();
    GameState.running = true;
    cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(splitLoop);
}

function splitLoop(now) {
    animFrameId = requestAnimationFrame(splitLoop);
    if (GameState.mode !== 'split') return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    splitScene1.update(dt); splitScene2.update(dt);
    splitScene1.render(); splitScene2.render();
    const timeLeft = Math.max(0, GameState.settings.maxTime * 1000 - (Date.now() - splitStart));
    document.getElementById('timer-p1').textContent = document.getElementById('timer-p2').textContent = formatTime(timeLeft);
    if (timeLeft <= 0) {
        GameState.mode = 'victory';
        showScreen('victory-screen');
        document.getElementById('final-time').textContent = formatTime(GameState.settings.maxTime * 1000);
        document.getElementById('final-score').textContent = '0';
        document.getElementById('final-rank').textContent = '-';
    }
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
    const t = document.getElementById(id); if (t) { t.classList.add('active'); t.style.display = id === 'game-screen' ? 'block' : 'flex'; }
}

function initUI() {
    document.getElementById('btn-solo').onclick = () => startSoloGame(1);
    document.getElementById('btn-multi').onclick = startSplitGame;
    document.getElementById('btn-settings').onclick = () => showScreen('settings-screen');
    document.getElementById('btn-settings-back').onclick = () => showScreen('main-menu');
    document.getElementById('btn-menu-victory').onclick = () => { GameState.mode = 'menu'; showScreen('main-menu'); };
    document.getElementById('btn-next-level').onclick = () => startSoloGame(GameState.level + 1);
    document.getElementById('btn-retry').onclick = () => startSoloGame(GameState.level);

    document.getElementById('pause-btn').onclick = pauseGame;
    document.getElementById('btn-resume').onclick = resumeGame;
    document.getElementById('btn-restart').onclick = () => startSoloGame(GameState.level);
    document.getElementById('btn-menu-pause').onclick = () => { GameState.mode = 'menu'; showScreen('main-menu'); };
    document.getElementById('split-back-btn').onclick = () => { GameState.mode = 'menu'; showScreen('main-menu'); };

    const sensSlider = document.getElementById('sensitivity-slider');
    sensSlider.oninput = () => { GameState.settings.sensitivity = parseFloat(sensSlider.value); document.getElementById('sensitivity-val').textContent = sensSlider.value; };

    document.getElementById('view-toggle-btn').onclick = () => {
        if (GameState.mode === 'solo' && soloScene) {
            GameState.viewMode = GameState.viewMode === 'fps' ? 'topdown' : 'fps';
            soloScene.viewMode = GameState.viewMode;
            document.getElementById('view-label').textContent = GameState.viewMode === 'fps' ? 'FPS' : '3D TOP';
        }
    };

    document.getElementById('fullscreen-btn').onclick = toggleFullscreen;

    window.onkeydown = e => {
        if (e.code === 'Tab') { e.preventDefault(); document.getElementById('view-toggle-btn').click(); }
        if (e.code === 'KeyF') toggleFullscreen();

        if (GameState.mode === 'split') {
            if (e.code === 'KeyU' && splitScene1) { splitScene1.viewMode = splitScene1.viewMode === 'fps' ? 'topdown' : 'fps'; }
            if (e.code === 'KeyO' && splitScene2) { splitScene2.viewMode = splitScene2.viewMode === 'fps' ? 'topdown' : 'fps'; }
        }
    };
    window.onresize = () => {
        if (soloScene && GameState.mode === 'solo') soloScene.resize(window.innerWidth, window.innerHeight);
        if (GameState.mode === 'split' && splitScene1 && splitScene2) {
            const w = Math.floor(window.innerWidth / 2) - 4;
            const h = window.innerHeight;
            splitScene1.canvas.width = w;
            splitScene1.canvas.height = h;
            splitScene1.resize(w, h);
            splitScene2.canvas.width = w;
            splitScene2.canvas.height = h;
            splitScene2.resize(w, h);
        }
    };
}

function toggleFullscreen() {
    const doc = document;
    const elem = document.documentElement;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
        if (elem.requestFullscreen) elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
    } else {
        if (doc.exitFullscreen) doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        else if (doc.msExitFullscreen) doc.msExitFullscreen();
    }
}

function spawnVictoryParticles() {
    const container = document.getElementById('victory-particles');
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#FFD700', '#FF6B00', '#00FFFF', '#FF00AA', '#39FF14'];
    for (let i = 0; i < 45; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const tx = (Math.random() - 0.5) * window.innerWidth, ty = -(Math.random() * window.innerHeight);
        p.style.cssText = `left: 50%; top: 50%; background: ${colors[i % colors.length]}; --tx: ${tx}px; --ty: ${ty}px; animation-duration: ${1 + Math.random() * 2}s; width: ${8 + Math.random() * 14}px; height: ${8 + Math.random() * 14}px;`;
        container.appendChild(p);
    }
}

function boot() {
    initUI();
    showScreen('main-menu');
    animateMenuBackground();
}

document.addEventListener('DOMContentLoaded', boot);
