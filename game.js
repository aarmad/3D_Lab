/**
 * MAZE RUNNER X — CEL-SHADED CHAOS
 * Three.js Game Engine — v2
 * Fixes: mouse management, no wall-collision bubbles, bigger/harder mazes
 */

import * as THREE from 'three';

// ============================================================
// GAME STATE
// ============================================================
const GameState = {
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
        motionLines: false, // Default off as requested
        mazeSize: 19,
        maxTime: 60,       // Duration in seconds
    },
    players: [
        { finished: false, time: 0 },
        { finished: false, time: 0 },
    ]
};

// ============================================================
// MAZE GENERATOR — Recursive Backtracker + post-process loops
// Produces longer, more complex mazes with dead-ends & shortcuts
// ============================================================
class MazeGenerator {
    constructor(w, h) {
        this.setSize(w, h);
    }

    setSize(w, h) {
        this.width = w % 2 === 0 ? w + 1 : w;
        this.height = h % 2 === 0 ? h + 1 : h;
    }

    generate() {
        // 1. Fill with walls
        const grid = Array.from({ length: this.height }, () =>
            Array(this.width).fill(1)
        );

        // 2. Recursive backtracker from (1,1)
        const stack = [[1, 1]];
        grid[1][1] = 0;
        const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];

        while (stack.length) {
            const [cx, cy] = stack[stack.length - 1];
            const shuffled = this._shuffle([...dirs]);
            let moved = false;
            for (const [dx, dy] of shuffled) {
                const nx = cx + dx, ny = cy + dy;
                if (nx > 0 && nx < this.width - 1 &&
                    ny > 0 && ny < this.height - 1 &&
                    grid[ny][nx] === 1) {
                    grid[cy + dy / 2][cx + dx / 2] = 0;
                    grid[ny][nx] = 0;
                    stack.push([nx, ny]);
                    moved = true;
                    break;
                }
            }
            if (!moved) stack.pop();
        }

        // 3. Add extra loops — punch ~12% of remaining walls to create shortcuts
        const loopCount = Math.floor(this.width * this.height * 0.06);
        for (let i = 0; i < loopCount; i++) {
            const row = 1 + 2 * Math.floor(Math.random() * Math.floor((this.height - 1) / 2));
            const col = 2 + 2 * Math.floor(Math.random() * Math.floor((this.width - 2) / 2));
            if (row < this.height - 1 && col < this.width - 1) {
                grid[row][col] = 0;
            }
        }

        // 4. Entrance & Exit (Place triggers INSIDE the maze to keep boundaries solid)
        // No more grid[1][0] = 0 or grid[h-2][w-1] = 0

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

// ============================================================
// CEL-SHADING MATERIALS
// ============================================================
class CelMaterials {
    static _gradientMap(steps) {
        const data = new Uint8Array(steps);
        for (let i = 0; i < steps; i++) data[i] = Math.floor((i / (steps - 1)) * 255);
        const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
        tex.needsUpdate = true;
        return tex;
    }

    static wallMat() { return new THREE.MeshToonMaterial({ color: 0x8B6914, gradientMap: CelMaterials._gradientMap(4) }); }
    static floorMat() { return new THREE.MeshToonMaterial({ color: 0x1A1A3E, gradientMap: CelMaterials._gradientMap(4) }); }
    static ceilingMat() { return new THREE.MeshToonMaterial({ color: 0x0D0D2B, gradientMap: CelMaterials._gradientMap(3) }); }
    static exitMat() {
        return new THREE.MeshToonMaterial({
            color: 0x00FFAA, emissive: 0x00AA66,
            emissiveIntensity: 0.5,
            gradientMap: CelMaterials._gradientMap(2),
        });
    }
}

// ============================================================
// OUTLINE HELPER
// ============================================================
function addOutline(mesh, parent, thickness = 0.05) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
    const outline = new THREE.Mesh(mesh.geometry.clone(), mat);
    outline.scale.setScalar(1 + thickness);
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    outline.renderOrder = -1;
    parent.add(outline);
}

// ============================================================
// MAZE SCENE — one Three.js renderer per viewport
// ============================================================
class MazeScene {
    constructor(canvas, playerIndex = 0) {
        this.canvas = canvas;
        this.playerIndex = playerIndex;
        this.cellSize = 2;
        this.wallHeight = 3.2;
        this.mazeGrid = null;
        this.mazeW = 0;
        this.mazeH = 0;
        this.exitPos = new THREE.Vector3();
        this.corridorLights = [];
        this.exitLight = null;

        this._initRenderer();
        this._initScene();
        this._initLights();
        this._initPlayer();
        this._initInput();
    }

    // ── Renderer ──────────────────────────────────────────────
    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.setSize(
            this.canvas.clientWidth || window.innerWidth,
            this.canvas.clientHeight || window.innerHeight
        );
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.NoToneMapping;
    }

    // ── Scene & cameras ───────────────────────────────────────
    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);
        this.scene.fog = new THREE.Fog(0x0a0a1a, 10, 38);

        this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 120);
        // Vue du dessus en 3D (Perspective) pour plus de profondeur
        this.topCamera = new THREE.PerspectiveCamera(65, 1, 1, 200);
    }

    // ── Lights ────────────────────────────────────────────────
    _initLights() {
        this.scene.add(new THREE.AmbientLight(0x1a1a3e, 0.4));

        this.mainLight = new THREE.DirectionalLight(0xFF8844, 1.5);
        this.mainLight.position.set(5, 10, 5);
        this.mainLight.castShadow = true;
        this.mainLight.shadow.mapSize.set(1024, 1024);
        this.mainLight.shadow.camera.left = -30;
        this.mainLight.shadow.camera.right = 30;
        this.mainLight.shadow.camera.top = 30;
        this.mainLight.shadow.camera.bottom = -30;
        this.mainLight.shadow.camera.far = 80;
        this.scene.add(this.mainLight);

        const rim = new THREE.DirectionalLight(0x00FFFF, 0.5);
        rim.position.set(-5, 3, -5);
        this.scene.add(rim);
    }

    _initPlayer() {
        this.player = {
            pos: new THREE.Vector3(this.cellSize * 1.5, 1.5, this.cellSize * 1.5),
            yaw: 0,
            pitch: 0,
        };

        // --- AVATAR HUMANOÏDE (Détaillé) ---
        this.playerMarker = new THREE.Group();
        const mat = new THREE.MeshToonMaterial({ color: 0xFF6B00, gradientMap: CelMaterials._gradientMap(4) });
        const blackMat = new THREE.MeshToonMaterial({ color: 0x111111 });

        // Corps (Torse)
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.4), mat);
        torso.position.y = 1.0;
        this.playerMarker.add(torso);
        addOutline(torso, this.playerMarker, 0.05);

        // Tête
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat);
        head.position.y = 1.8;
        this.playerMarker.add(head);
        addOutline(head, this.playerMarker, 0.05);

        // Visière
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x00FFFF }));
        visor.position.set(0, 1.85, -0.23);
        this.playerMarker.add(visor);

        // Bras
        const armGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
        const lArm = new THREE.Mesh(armGeo, mat);
        lArm.position.set(-0.45, 1.1, 0);
        this.playerMarker.add(lArm);
        addOutline(lArm, this.playerMarker, 0.05);

        const rArm = new THREE.Mesh(armGeo, mat);
        rArm.position.set(0.45, 1.1, 0);
        this.playerMarker.add(rArm);
        addOutline(rArm, this.playerMarker, 0.05);

        // Jambes
        const legGeo = new THREE.BoxGeometry(0.25, 0.85, 0.25);
        const lLeg = new THREE.Mesh(legGeo, mat);
        lLeg.position.set(-0.2, 0.4, 0);
        this.playerMarker.add(lLeg);
        addOutline(lLeg, this.playerMarker, 0.05);

        const rLeg = new THREE.Mesh(legGeo, mat);
        rLeg.position.set(0.2, 0.4, 0);
        this.playerMarker.add(rLeg);
        addOutline(rLeg, this.playerMarker, 0.05);

        this.scene.add(this.playerMarker);

        this.cameraRig = new THREE.Object3D();
        this.scene.add(this.cameraRig);
        this.cameraRig.add(this.camera);
        this.camera.position.set(0, 0, 0);

        this._buildWeapon();
    }

    _buildWeapon() {
        this.weaponGroup = new THREE.Group();
        this.camera.add(this.weaponGroup);
        this.weaponGroup.position.set(0, -0.4, -0.6);

        const skinColor = 0xC68642;
        const handMat = new THREE.MeshToonMaterial({ color: skinColor, gradientMap: CelMaterials._gradientMap(3) });

        const createHand = (isLeft) => {
            const hand = new THREE.Group();
            // Paume
            const palm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.1), handMat);
            hand.add(palm);
            addOutline(palm, hand, 0.05);

            // Doigts (simplifiés mais présents)
            for (let i = 0; i < 4; i++) {
                const finger = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.04), handMat);
                finger.position.set(-0.06 + i * 0.04, 0.12, 0);
                hand.add(finger);
            }
            // Pouce
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

    // ── Input — pointer lock géré proprement ──────────────────
    _initInput() {
        this.keys = {};
        this.mouse = { dx: 0, dy: 0, locked: false };

        // Keyboard
        window.addEventListener('keydown', e => { this.keys[e.code] = true; });
        window.addEventListener('keyup', e => { this.keys[e.code] = false; });

        // Pointer lock state
        document.addEventListener('pointerlockchange', () => {
            this.mouse.locked = (document.pointerLockElement === this.canvas);
        });

        // Mouse move — accumulate raw delta
        document.addEventListener('mousemove', e => {
            if (this.mouse.locked) {
                this.mouse.dx += e.movementX;
                this.mouse.dy += e.movementY;
            }
        });

        // Click sur le canvas → lock immédiat (sans overlay)
        this.canvas.addEventListener('click', () => {
            if (!this.mouse.locked && (GameState.mode === 'solo' || GameState.mode === 'split')) {
                this.canvas.requestPointerLock();
            }
        });
    }

    // ── Request pointer lock programmatically ─────────────────
    requestLock() {
        this.canvas.requestPointerLock();
    }

    // ── Build maze geometry ───────────────────────────────────
    buildMaze(grid) {
        this.mazeGrid = grid;
        this.mazeH = grid.length;
        this.mazeW = grid[0].length;

        // Clear previous maze objects
        const toRemove = [];
        this.scene.traverse(o => { if (o.userData.isMaze) toRemove.push(o); });
        toRemove.forEach(o => this.scene.remove(o));
        this.corridorLights.forEach(l => this.scene.remove(l));
        this.corridorLights = [];

        const C = this.cellSize;
        const H = this.wallHeight;

        // Floor
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(this.mazeW * C, this.mazeH * C),
            CelMaterials.floorMat()
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(this.mazeW * C / 2, 0, this.mazeH * C / 2);
        floor.receiveShadow = true;
        floor.userData.isMaze = true;
        this.scene.add(floor);

        // Ceiling
        const ceil = new THREE.Mesh(
            new THREE.PlaneGeometry(this.mazeW * C, this.mazeH * C),
            CelMaterials.ceilingMat()
        );
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(this.mazeW * C / 2, H, this.mazeH * C / 2);
        ceil.userData.isMaze = true;
        this.scene.add(ceil);

        // Walls — InstancedMesh
        const wallPositions = [];
        const wallGeo = new THREE.BoxGeometry(C, H, C);

        for (let row = 0; row < this.mazeH; row++) {
            for (let col = 0; col < this.mazeW; col++) {
                if (grid[row][col] === 1) {
                    wallPositions.push({
                        x: col * C + C / 2,
                        y: H / 2,
                        z: row * C + C / 2,
                    });
                }
            }
        }

        const wallMesh = new THREE.InstancedMesh(wallGeo, CelMaterials.wallMat(), wallPositions.length);
        wallMesh.castShadow = wallMesh.receiveShadow = true;
        wallMesh.userData.isMaze = true;

        const dummy = new THREE.Object3D();
        wallPositions.forEach((p, i) => {
            dummy.position.set(p.x, p.y, p.z);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            wallMesh.setMatrixAt(i, dummy.matrix);
        });
        wallMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(wallMesh);

        // Outline walls
        const outlineMesh = new THREE.InstancedMesh(
            wallGeo,
            new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }),
            wallPositions.length
        );
        outlineMesh.userData.isMaze = true;
        outlineMesh.renderOrder = -1;
        wallPositions.forEach((p, i) => {
            dummy.position.set(p.x, p.y, p.z);
            dummy.scale.setScalar(1.06);
            dummy.updateMatrix();
            outlineMesh.setMatrixAt(i, dummy.matrix);
        });
        outlineMesh.instanceMatrix.needsUpdate = true;
        this.scene.add(outlineMesh);

        // Exit marker
        const exitRow = this.mazeH - 2;
        const exitCol = this.mazeW - 2;
        this.exitPos.set(exitCol * C + C / 2, 0.1, exitRow * C + C / 2);

        const exitMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 10), CelMaterials.exitMat());
        exitMesh.position.copy(this.exitPos);
        exitMesh.userData.isMaze = true;
        this.scene.add(exitMesh);

        // Exit vertical beam
        const beamGeo = new THREE.CylinderGeometry(0.08, 0.08, H, 6);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x00FFAA, transparent: true, opacity: 0.35 });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(this.exitPos.x, H / 2, this.exitPos.z);
        beam.userData.isMaze = true;
        this.scene.add(beam);

        // Exit light
        this.exitLight = new THREE.PointLight(0x00FFAA, 2.5, 7);
        this.exitLight.position.set(this.exitPos.x, 1.8, this.exitPos.z);
        this.exitLight.userData.isMaze = true;
        this.scene.add(this.exitLight);

        // Corridor lights
        this._addCorridorLights(grid, C, H);

        // Graffiti
        this._addGraffiti(grid, C, H);

        // Player start
        this.player.pos.set(C * 1.5, 1.5, C * 1.5);
        this.player.yaw = 0;
        this.player.pitch = 0;

        // Top camera
        // Top camera (Perspective Update)
        const maxDim = Math.max(this.mazeW, this.mazeH) * C;
        const height = maxDim * 0.95;

        this.topCamera.position.set(this.mazeW * C / 2, height, this.mazeH * C / 2 + 0.1);
        this.topCamera.lookAt(this.mazeW * C / 2, 0, this.mazeH * C / 2);
        this.topCamera.updateProjectionMatrix();

        // Collision map
        this._buildCollisionMap(grid, C);
    }

    _addCorridorLights(grid, C, H) {
        const colors = [0xFF6B00, 0x00FFFF, 0xFF00AA, 0xFFD700];
        let n = 0;
        // Space lights every 5 cells to avoid too many on big mazes
        const step = Math.max(4, Math.floor(this.mazeW / 5));
        for (let row = 1; row < grid.length - 1; row += step) {
            for (let col = 1; col < grid[0].length - 1; col += step) {
                if (grid[row][col] === 0) {
                    const light = new THREE.PointLight(colors[n % colors.length], 1.3, 10);
                    light.position.set(col * C + C / 2, H - 0.4, row * C + C / 2);
                    light.userData.isMaze = true;
                    this.scene.add(light);
                    this.corridorLights.push(light);
                    n++;
                }
            }
        }
    }

    _addGraffiti(grid, C, H) {
        const colors = [0xFF6B00, 0x00FFFF, 0xFF00AA, 0xFFD700, 0x39FF14];
        let count = 0;
        const maxGraffiti = Math.floor(this.mazeW * this.mazeH * 0.01); // scale with size
        for (let row = 1; row < grid.length - 1 && count < maxGraffiti; row++) {
            for (let col = 1; col < grid[0].length - 1 && count < maxGraffiti; col++) {
                if (grid[row][col] === 1 && Math.random() < 0.12) {
                    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                        const nr = row + dr, nc = col + dc;
                        if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length && grid[nr][nc] === 0) {
                            const geo = new THREE.PlaneGeometry(0.9, 0.65);
                            const mat = new THREE.MeshBasicMaterial({
                                color: colors[count % colors.length],
                                transparent: true, opacity: 0.65, depthWrite: false,
                            });
                            const plane = new THREE.Mesh(geo, mat);
                            plane.position.set(
                                col * C + C / 2 + dc * (C / 2 + 0.01),
                                H * 0.45,
                                row * C + C / 2 + dr * (C / 2 + 0.01)
                            );
                            if (dr !== 0) plane.rotation.y = Math.PI / 2;
                            plane.userData.isMaze = true;
                            this.scene.add(plane);
                            count++;
                            break;
                        }
                    }
                }
            }
        }
    }

    _buildCollisionMap(grid, C) {
        this.wallBoxes = [];
        for (let row = 0; row < grid.length; row++) {
            for (let col = 0; col < grid[0].length; col++) {
                if (grid[row][col] === 1) {
                    this.wallBoxes.push({
                        minX: col * C, maxX: col * C + C,
                        minZ: row * C, maxZ: row * C + C,
                    });
                }
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

    // ── Update ────────────────────────────────────────────────
    update(dt) {
        if (!GameState.running) return;

        const S = GameState.settings;
        const sens = S.sensitivity * 0.0018;

        // ---- Mouse look (FPS only) ----
        if (this.mouse.locked && GameState.viewMode === 'fps') {
            this.player.yaw -= this.mouse.dx * sens;
            this.player.pitch -= this.mouse.dy * sens;
            this.player.pitch = Math.max(-Math.PI / 2.8, Math.min(Math.PI / 2.8, this.player.pitch));
        }
        this.mouse.dx = 0;
        this.mouse.dy = 0;

        // ---- Movement ----
        const sin = Math.sin(this.player.yaw);
        const cos = Math.cos(this.player.yaw);
        const forward = new THREE.Vector3(-sin, 0, -cos);
        const right = new THREE.Vector3(cos, 0, -sin);

        const moveDir = new THREE.Vector3();
        let moved = false;

        if (this.playerIndex === 0) {
            // Player 1 controls
            if (this.keys['KeyW']) { moveDir.addScaledVector(forward, 1); moved = true; }
            if (this.keys['KeyS']) { moveDir.addScaledVector(forward, -1); moved = true; }
            if (this.keys['KeyA']) { moveDir.addScaledVector(right, -1); moved = true; }
            if (this.keys['KeyD']) { moveDir.addScaledVector(right, 1); moved = true; }
        } else {
            // Player 2 controls
            if (this.keys['KeyI'] || this.keys['ArrowUp']) { moveDir.addScaledVector(forward, 1); moved = true; }
            if (this.keys['KeyK'] || this.keys['ArrowDown']) { moveDir.addScaledVector(forward, -1); moved = true; }
            if (this.keys['KeyJ']) { moveDir.addScaledVector(right, -1); moved = true; }
            if (this.keys['KeyL']) { moveDir.addScaledVector(right, 1); moved = true; }

            // Rotation for P2 (Arrows)
            if (this.keys['ArrowLeft']) this.player.yaw += 0.05;
            if (this.keys['ArrowRight']) this.player.yaw -= 0.05;
        }

        if (moveDir.lengthSq() > 0) moveDir.normalize();

        const speed = S.speed * dt;
        const nx = this.player.pos.x + moveDir.x * speed;
        const nz = this.player.pos.z + moveDir.z * speed;

        // Slide along walls — try each axis independently
        if (!this._checkCollision(nx, this.player.pos.z)) this.player.pos.x = nx;
        if (!this._checkCollision(this.player.pos.x, nz)) this.player.pos.z = nz;

        // ---- Motion lines Removed ----
        // No effects when running as requested

        // ---- Weapon bob ----
        if (moved) {
            this.weaponGroup.userData.bobTime += dt * 9;
            const t = this.weaponGroup.userData.bobTime;
            this.weaponGroup.position.y = this.weaponGroup.userData.basePos.y + Math.sin(t) * 0.016;
            this.weaponGroup.position.x = this.weaponGroup.userData.basePos.x + Math.cos(t * 0.5) * 0.009;
        } else {
            this.weaponGroup.position.lerp(this.weaponGroup.userData.basePos, 0.12);
        }

        // ---- Camera rig ----
        this.cameraRig.position.copy(this.player.pos);
        this.cameraRig.rotation.y = this.player.yaw;
        this.camera.rotation.x = this.player.pitch;

        // ---- Player Marker Update ----
        if (this.playerMarker) {
            this.playerMarker.position.copy(this.player.pos);
            // Sync rotation with yaw
            this.playerMarker.rotation.y = this.player.yaw;
            this.playerMarker.visible = (GameState.viewMode !== 'fps');
        }

        // ---- Animate lights ----
        const t = Date.now();
        if (this.exitLight) this.exitLight.intensity = 2.0 + Math.sin(t * 0.003) * 0.6;
        this.corridorLights.forEach((l, i) => {
            l.intensity = 1.1 + Math.sin(t * 0.0018 + i * 1.7) * 0.35;
        });

        // ---- Exit check ----
        if (this.player.pos.distanceTo(this.exitPos) < 1.6) {
            onPlayerReachedExit(this.playerIndex);
        }
    }

    resize(w, h) {
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    render() {
        const cam = GameState.viewMode === 'fps' ? this.camera : this.topCamera;
        this.renderer.render(this.scene, cam);
    }

    // ── Minimap ───────────────────────────────────────────────
    drawMinimap(ctx, canvas) {
        if (!this.mazeGrid) return;
        const cw = canvas.width, ch = canvas.height;
        const cW = cw / this.mazeW, cH = ch / this.mazeH;

        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = '#080818';
        ctx.fillRect(0, 0, cw, ch);

        for (let r = 0; r < this.mazeH; r++) {
            for (let c = 0; c < this.mazeW; c++) {
                if (this.mazeGrid[r][c] === 1) {
                    ctx.fillStyle = '#7A5A10';
                    ctx.fillRect(c * cW, r * cH, cW, cH);
                }
            }
        }

        // Exit
        ctx.fillStyle = '#00FFAA';
        ctx.fillRect((this.mazeW - 1) * cW, (this.mazeH - 2) * cH, cW, cH);

        // Player
        const C = this.cellSize;
        const px = (this.player.pos.x / C) * cW;
        const pz = (this.player.pos.z / C) * cH;
        const r = Math.max(cW, cH) * 0.9;

        ctx.fillStyle = '#FF6B00';
        ctx.beginPath();
        ctx.arc(px, pz, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Direction arrow
        const al = r * 2.2;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, pz);
        ctx.lineTo(px - Math.sin(this.player.yaw) * al, pz - Math.cos(this.player.yaw) * al);
        ctx.stroke();
    }
}

// ============================================================
// FX — Motion lines only (no wall-collision bubbles)
// ============================================================
function spawnMotionLine() {
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
    `;
    overlay.appendChild(line);
    setTimeout(() => line.remove(), 320);
}

// Victory particles (kept for win screen)
function spawnVictoryParticles() {
    const container = document.getElementById('victory-particles');
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#FFD700', '#FF6B00', '#00FFFF', '#FF00AA', '#39FF14'];
    for (let i = 0; i < 45; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const tx = (Math.random() - 0.5) * window.innerWidth;
        const ty = -(Math.random() * window.innerHeight);
        const dur = 1 + Math.random() * 2;
        p.style.cssText = `
            left: 50%; top: 50%;
            background: ${colors[i % colors.length]};
            --tx: ${tx}px; --ty: ${ty}px;
            animation-duration: ${dur}s;
            animation-delay: ${Math.random() * 0.5}s;
            width: ${8 + Math.random() * 14}px;
            height: ${8 + Math.random() * 14}px;
            transform: rotate(${Math.random() * 360}deg);
        `;
        container.appendChild(p);
    }
}

// ============================================================
// TIMER
// ============================================================
let timerInterval = null;

function startTimer() {
    GameState.startTime = Date.now();
    GameState.running = true;
    timerInterval = setInterval(updateTimerDisplay, 50);
}

function stopTimer() {
    clearInterval(timerInterval);
    GameState.running = false;
}

function resetTimer() {
    stopTimer();
    GameState.elapsed = 0;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const duration = GameState.settings.maxTime * 1000;
    const elapsed = Date.now() - GameState.startTime;
    const timeLeft = Math.max(0, duration - elapsed);

    GameState.elapsed = elapsed; // used for stats

    const mins = Math.floor(timeLeft / 60000);
    const secs = Math.floor((timeLeft % 60000) / 1000);
    const ms = Math.floor((timeLeft % 1000) / 10);

    const el = document.getElementById('timer-display');
    const me = document.getElementById('timer-ms');
    if (el) {
        el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        if (timeLeft < 10000) el.style.color = '#FF2020'; // Alarm red
        else el.style.color = '';
    }
    if (me) me.textContent = String(ms).padStart(2, '0');

    if (timeLeft <= 0 && GameState.running) {
        // Time out logic could go here, or just let them finish with 00:00
    }
}

function formatTime(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ============================================================
// VICTORY
// ============================================================
function showVictory() {
    stopTimer();
    document.exitPointerLock();
    GameState.mode = 'victory';

    const elapsed = GameState.elapsed;
    const score = Math.max(0, 200000 - Math.floor(elapsed / 80));
    GameState.score = score;

    document.getElementById('final-time').textContent = formatTime(elapsed);
    document.getElementById('final-score').textContent = score.toLocaleString();

    let rank = 'D';
    if (elapsed < 30000) rank = 'S';
    else if (elapsed < 75000) rank = 'A';
    else if (elapsed < 150000) rank = 'B';
    else if (elapsed < 240000) rank = 'C';
    document.getElementById('final-rank').textContent = rank;

    showScreen('victory-screen');
    spawnVictoryParticles();
}

// ============================================================
// SCREEN MANAGER
// ============================================================
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = '';
    });
    const target = document.getElementById(id);
    if (!target) return;
    target.classList.add('active');
    target.style.display = (id === 'game-screen') ? 'block' : 'flex';
}

// ============================================================
// GAME INSTANCES
// ============================================================
let soloScene = null;
let splitScene1 = null;
let splitScene2 = null;
let animFrameId = null;
let lastTime = 0;

const mazeGen = new MazeGenerator(19, 19);

// ── Level size scaling ────────────────────────────────────────
function mazeSizeForLevel(level) {
    // Level 1 → 19, level 2 → 23, level 3 → 27 … capped at 41
    const base = GameState.settings.mazeSize;
    const extra = (level - 1) * 4;
    const size = base + extra;
    return Math.min(size % 2 === 0 ? size + 1 : size, 41);
}

// ── Solo ─────────────────────────────────────────────────────
function startSoloGame(level = 1) {
    GameState.mode = 'solo';
    GameState.level = level;
    GameState.score = 0;
    GameState.players[0].finished = false;

    const size = mazeSizeForLevel(level);
    mazeGen.setSize(size, size);
    const grid = mazeGen.generate();

    showScreen('game-screen');

    const canvas = document.getElementById('game-canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    if (!soloScene) {
        soloScene = new MazeScene(canvas, 0);
    } else {
        // Re-use renderer on same canvas
        soloScene.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    soloScene.buildMaze(grid);
    soloScene.resize(window.innerWidth, window.innerHeight);

    document.getElementById('level-num').textContent = level;
    document.getElementById('score-display').textContent = '0';

    const mazeNames = ['ZONE ALPHA', 'SECTOR BETA', 'NEXUS GAMMA', 'VOID DELTA', 'CHAOS OMEGA', 'ABYSS ZETA', 'INFERNO ETA'];
    document.getElementById('maze-name').textContent = mazeNames[(level - 1) % mazeNames.length];

    // ── Pointer lock immédiat — pas d'overlay ──
    // On tente le lock; si le navigateur le refuse (pas de geste utilisateur),
    // on affiche juste un message discret dans le HUD.
    soloScene.requestLock();
    // Fallback : si pas encore locké après 300ms, afficher hint
    setTimeout(() => {
        if (!soloScene.mouse.locked) {
            showClickHint(true);
        }
    }, 300);

    resetTimer();
    startTimer();

    cancelAnimationFrame(animFrameId);
    lastTime = performance.now();
    animFrameId = requestAnimationFrame(soloLoop);
}

function soloLoop(now) {
    animFrameId = requestAnimationFrame(soloLoop);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (GameState.mode !== 'solo') return;

    soloScene.update(dt);
    soloScene.render();

    // Hide click hint once locked
    if (soloScene.mouse.locked) showClickHint(false);

    // Minimap
    const mm = document.getElementById('minimap');
    const ctx = mm.getContext('2d');
    soloScene.drawMinimap(ctx, mm);

    // Score
    const score = Math.max(0, 200000 - Math.floor(GameState.elapsed / 80));
    document.getElementById('score-display').textContent = score.toLocaleString();
}

function onPlayerReachedExit(playerIndex) {
    if (GameState.mode === 'solo' && !GameState.players[0].finished) {
        GameState.players[0].finished = true;
        showVictory();
    }
    if (GameState.mode === 'split' && !GameState.players[playerIndex].finished) {
        GameState.players[playerIndex].finished = true;
        // First to finish wins
        if (!GameState.players[0].finished || !GameState.players[1].finished) {
            const winner = playerIndex + 1;
            document.getElementById('split-winner').textContent = `JOUEUR ${winner} GAGNE !`;
            document.getElementById('split-winner').style.display = 'block';
        }
    }
}

// ── Click hint (discret, pas d'overlay plein écran) ──────────
function showClickHint(show) {
    let hint = document.getElementById('click-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'click-hint';
        hint.textContent = '🖱 CLIQUEZ POUR JOUER';
        hint.style.cssText = `
            position: fixed; bottom: 1.5rem; left: 50%;
            transform: translateX(-50%);
            font-family: 'Bangers', cursive;
            font-size: 1.2rem; letter-spacing: 3px;
            color: #FFD700; background: rgba(0,0,0,0.75);
            border: 2px solid #FFD700; padding: 0.4rem 1.2rem;
            z-index: 200; pointer-events: none;
            animation: lockBounce 1s ease-in-out infinite alternate;
        `;
        document.body.appendChild(hint);
    }
    hint.style.display = show ? 'block' : 'none';
}

// ── Split screen ─────────────────────────────────────────────
function startSplitGame() {
    GameState.mode = 'split';
    GameState.players[0].finished = false;
    GameState.players[1].finished = false;
    showScreen('split-screen');

    const size = GameState.settings.mazeSize;
    mazeGen.setSize(size, size);
    const grid1 = mazeGen.generate();
    const grid2 = mazeGen.generate();

    const c1 = document.getElementById('canvas-p1');
    const c2 = document.getElementById('canvas-p2');
    c1.width = Math.floor(window.innerWidth / 2) - 4;
    c1.height = window.innerHeight;
    c2.width = Math.floor(window.innerWidth / 2) - 4;
    c2.height = window.innerHeight;

    splitScene1 = new MazeScene(c1, 0);
    splitScene2 = new MazeScene(c2, 1);
    splitScene1.buildMaze(grid1);
    splitScene2.buildMaze(grid2);
    splitScene1.resize(c1.width, c1.height);
    splitScene2.resize(c2.width, c2.height);

    // P1 & P2 now use their own logic inside update()

    // Reset hint animation
    const hint = document.getElementById('split-controls-hint');
    if (hint) {
        hint.style.animation = 'none';
        hint.offsetHeight; /* trigger reflow */
        hint.style.animation = '';
    }

    // P1 lock on click
    c1.addEventListener('click', () => { if (!splitScene1.mouse.locked) c1.requestPointerLock(); });
    c2.addEventListener('click', () => { if (!splitScene2.mouse.locked) c2.requestPointerLock(); });

    document.addEventListener('pointerlockchange', () => {
        splitScene1.mouse.locked = (document.pointerLockElement === c1);
        splitScene2.mouse.locked = (document.pointerLockElement === c2);
    });

    const splitStart = Date.now();
    cancelAnimationFrame(animFrameId);
    lastTime = performance.now();
    GameState.running = true;

    function splitLoop(now) {
        animFrameId = requestAnimationFrame(splitLoop);
        if (GameState.mode !== 'split') return;
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        splitScene1.update(dt);
        splitScene2.update(dt);
        splitScene1.render();
        splitScene2.render();

        const duration = GameState.settings.maxTime * 1000;
        const elapsed = Date.now() - splitStart;
        const timeLeft = Math.max(0, duration - elapsed);
        const timeStr = formatTime(timeLeft);

        document.getElementById('timer-p1').textContent = timeStr;
        document.getElementById('timer-p2').textContent = timeStr;
    }
    animFrameId = requestAnimationFrame(splitLoop);
}

// Redundant _initInputP2 removed

// ============================================================
// UI
// ============================================================
function initUI() {
    // Menu
    document.getElementById('btn-solo').addEventListener('click', () => startSoloGame(1));
    document.getElementById('btn-multi').addEventListener('click', () => startSplitGame());
    document.getElementById('btn-settings').addEventListener('click', () => showScreen('settings-screen'));

    // Pause
    document.getElementById('pause-btn').addEventListener('click', togglePause);
    document.getElementById('btn-resume').addEventListener('click', togglePause);
    document.getElementById('btn-restart').addEventListener('click', () => startSoloGame(GameState.level));
    document.getElementById('btn-menu-pause').addEventListener('click', () => {
        stopTimer();
        document.exitPointerLock();
        GameState.mode = 'menu';
        showScreen('main-menu');
    });

    // Victory
    document.getElementById('btn-next-level').addEventListener('click', () => startSoloGame(GameState.level + 1));
    document.getElementById('btn-retry').addEventListener('click', () => startSoloGame(GameState.level));
    document.getElementById('btn-menu-victory').addEventListener('click', () => {
        GameState.mode = 'menu';
        showScreen('main-menu');
    });

    // Settings
    document.getElementById('btn-settings-back').addEventListener('click', () => showScreen('main-menu'));

    const sensSlider = document.getElementById('sensitivity-slider');
    sensSlider.addEventListener('input', () => {
        GameState.settings.sensitivity = parseFloat(sensSlider.value);
        document.getElementById('sensitivity-val').textContent = parseFloat(sensSlider.value).toFixed(1);
    });

    const speedSlider = document.getElementById('speed-slider');
    speedSlider.addEventListener('input', () => {
        GameState.settings.speed = parseFloat(speedSlider.value);
        document.getElementById('speed-val').textContent = parseFloat(speedSlider.value).toFixed(1);
    });

    const motionToggle = document.getElementById('toggle-motion');
    motionToggle.addEventListener('click', () => {
        GameState.settings.motionLines = !GameState.settings.motionLines;
        motionToggle.textContent = GameState.settings.motionLines ? 'ON' : 'OFF';
        motionToggle.classList.toggle('off', !GameState.settings.motionLines);
    });

    const mazeSizeSelect = document.getElementById('maze-size-select');
    mazeSizeSelect.addEventListener('change', () => {
        GameState.settings.mazeSize = parseInt(mazeSizeSelect.value);
    });

    // View toggle
    document.getElementById('view-toggle-btn').addEventListener('click', toggleView);

    // Split back
    document.getElementById('split-back-btn').addEventListener('click', () => {
        GameState.mode = 'menu';
        GameState.running = false;
        document.exitPointerLock();
        showScreen('main-menu');
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', e => {
        if (e.code === 'Escape') {
            if (GameState.mode === 'solo') togglePause();
            else if (GameState.mode === 'paused') togglePause();
        }
        if (e.code === 'Tab') { e.preventDefault(); toggleView(); }
        if (e.code === 'KeyF') toggleFullscreen();
    });

    // Resize
    window.addEventListener('resize', () => {
        if (soloScene && GameState.mode === 'solo') {
            soloScene.resize(window.innerWidth, window.innerHeight);
        }
    });
}

function togglePause() {
    if (GameState.mode === 'solo') {
        GameState.mode = 'paused';
        stopTimer();
        document.exitPointerLock();
        showScreen('pause-menu');
    } else if (GameState.mode === 'paused') {
        GameState.mode = 'solo';
        startTimer();
        showScreen('game-screen');
        // Re-lock mouse
        setTimeout(() => soloScene?.requestLock(), 100);
    }
}

function toggleView() {
    if (GameState.mode !== 'solo' && GameState.mode !== 'paused') return;
    GameState.viewMode = GameState.viewMode === 'fps' ? 'topdown' : 'fps';
    const icon = document.getElementById('view-icon');
    const label = document.getElementById('view-label');
    const isFPS = GameState.viewMode === 'fps';
    icon.textContent = isFPS ? '👁' : '🗺';
    label.textContent = isFPS ? 'FPS' : '3D TOP';
    document.getElementById('crosshair').style.display = isFPS ? '' : 'none';
    document.getElementById('minimap-container').style.display = isFPS ? '' : 'none';
    // Release/re-acquire lock depending on view
    if (!isFPS) document.exitPointerLock();
    else soloScene?.requestLock();
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}

// ============================================================
// BOOT
// ============================================================
function boot() {
    showScreen('main-menu');
    initUI();
    animateMenuBackground();
}

function animateMenuBackground() {
    const bg = document.querySelector('.menu-bg-anim');
    if (!bg) return;
    const words = ['CHAOS', 'MAZE', 'RUN', 'ESCAPE', 'BOOM!', 'POW!', 'ZAP!', 'LOST?', 'FIND IT!'];
    words.forEach(word => {
        const el = document.createElement('div');
        el.textContent = word;
        el.style.cssText = `
            position: absolute;
            font-family: 'Bangers', cursive;
            font-size: ${1 + Math.random() * 2.2}rem;
            color: rgba(255,${Math.floor(Math.random() * 180)},0,0.13);
            left: ${Math.random() * 90}%;
            top:  ${Math.random() * 90}%;
            transform: rotate(${Math.random() * 40 - 20}deg);
            pointer-events: none;
            letter-spacing: 3px;
            -webkit-text-stroke: 1px rgba(0,0,0,0.25);
            animation: tagWobble ${2 + Math.random() * 3}s ease-in-out infinite alternate;
            animation-delay: ${Math.random() * 2}s;
        `;
        bg.appendChild(el);
    });
}

document.addEventListener('DOMContentLoaded', boot);
