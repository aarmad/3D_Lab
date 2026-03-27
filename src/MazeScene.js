import * as THREE from 'three';
import { GameState } from './GameState.js';
import { CelMaterials, addOutline, spawnMotionLine } from './utils.js';

export class MazeScene {
    constructor(canvas, playerIndex = 0, onExit = null) {
        this.canvas = canvas;
        this.playerIndex = playerIndex;
        this.onExit = onExit;
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

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.setSize(
            this.canvas.clientWidth || window.innerWidth,
            this.canvas.clientHeight || window.innerHeight
        );
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
        this.player = {
            pos: new THREE.Vector3(this.cellSize * 1.5, 1.5, this.cellSize * 1.5),
            yaw: 0, pitch: 0, velY: 0, isGrounded: true, walkTime: 0
        };

        this.playerMarker = new THREE.Group();
        const mat = new THREE.MeshToonMaterial({ color: 0x00FFFF, gradientMap: CelMaterials._gradientMap(4) });
        
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.4), mat);
        torso.position.y = 1.0;
        this.playerMarker.add(torso);
        addOutline(torso, this.playerMarker, 0.05);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat);
        head.position.y = 1.8;
        this.playerMarker.add(head);
        addOutline(head, this.playerMarker, 0.05);

        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xFF00FF }));
        visor.position.set(0, 1.85, -0.23);
        this.playerMarker.add(visor);

        const armGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
        this.lArm = new THREE.Mesh(armGeo, mat);
        this.lArm.position.set(-0.45, 1.1, 0);
        this.playerMarker.add(this.lArm);
        addOutline(this.lArm, this.playerMarker, 0.05);

        this.rArm = new THREE.Mesh(armGeo, mat);
        this.rArm.position.set(0.45, 1.1, 0);
        this.playerMarker.add(this.rArm);
        addOutline(this.rArm, this.playerMarker, 0.05);

        const legGeo = new THREE.BoxGeometry(0.25, 0.85, 0.25);
        this.lLeg = new THREE.Mesh(legGeo, mat);
        this.lLeg.position.set(-0.2, 0.4, 0);
        this.playerMarker.add(this.lLeg);
        addOutline(this.lLeg, this.playerMarker, 0.05);

        this.rLeg = new THREE.Mesh(legGeo, mat);
        this.rLeg.position.set(0.2, 0.4, 0);
        this.playerMarker.add(this.rLeg);
        addOutline(this.rLeg, this.playerMarker, 0.05);

        this.scene.add(this.playerMarker);

        this.cameraRig = new THREE.Object3D();
        this.scene.add(this.cameraRig);
        this.cameraRig.add(this.camera);
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
        window.addEventListener('keydown', e => { 
            this.keys[e.code] = true; 
            if (e.key) this.keys[e.key.toLowerCase()] = true;
        });
        window.addEventListener('keyup', e => { 
            this.keys[e.code] = false; 
            if (e.key) this.keys[e.key.toLowerCase()] = false;
        });
        document.addEventListener('pointerlockchange', () => {
            this.mouse.locked = (document.pointerLockElement === this.canvas);
        });
        document.addEventListener('mousemove', e => {
            if (this.mouse.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
        });
        this.canvas.addEventListener('click', () => {
            if (!this.mouse.locked && (GameState.mode === 'solo' || GameState.mode === 'split')) {
                this.canvas.requestPointerLock();
            }
        });
    }

    requestLock() { this.canvas.requestPointerLock(); }

    buildMaze(grid) {
        this.mazeGrid = grid;
        this.mazeH = grid.length;
        this.mazeW = grid[0].length;
        
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
        const wallMesh = new THREE.InstancedMesh(wallGeo, CelMaterials.wallMat(), wallPositions.length);
        wallMesh.castShadow = true; wallMesh.receiveShadow = true;
        wallMesh.userData.isMaze = true;
        const dummy = new THREE.Object3D();
        wallPositions.forEach((p, i) => {
            dummy.position.set(p.x, p.y, p.z); dummy.updateMatrix();
            wallMesh.setMatrixAt(i, dummy.matrix);
        });
        this.scene.add(wallMesh);

        const exitRow = this.mazeH - 2, exitCol = this.mazeW - 2;
        this.exitPos.set(exitCol * C + C / 2, 0.1, exitRow * C + C / 2);
        const exitMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 10), CelMaterials.exitMat());
        exitMesh.position.copy(this.exitPos); exitMesh.userData.isMaze = true;
        this.scene.add(exitMesh);

        this.exitLight = new THREE.PointLight(0x00FFAA, 2.5, 7);
        this.exitLight.position.set(this.exitPos.x, 1.8, this.exitPos.z);
        this.exitLight.userData.isMaze = true;
        this.scene.add(this.exitLight);

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

        if (this.mouse.locked && GameState.viewMode === 'fps' && this.playerIndex === 0) {
            this.player.yaw -= this.mouse.dx * sens; this.player.pitch -= this.mouse.dy * sens;
            this.player.pitch = Math.max(-Math.PI / 2.8, Math.min(Math.PI / 2.8, this.player.pitch));
        }

        if (this.playerIndex === 1 && GameState.viewMode === 'fps') {
            if (this.keys['ArrowLeft']) this.player.yaw += 2.5 * dt;
            if (this.keys['ArrowRight']) this.player.yaw -= 2.5 * dt;
            if (this.keys['ArrowUp']) this.player.pitch += 1.8 * dt;
            if (this.keys['ArrowDown']) this.player.pitch -= 1.8 * dt;
            this.player.pitch = Math.max(-Math.PI / 2.8, Math.min(Math.PI / 2.8, this.player.pitch));
        }
        this.mouse.dx = 0; this.mouse.dy = 0;

        const isTop = (GameState.viewMode === 'topdown');
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
        const isTop = (GameState.viewMode !== 'fps');
        if (this.scene.fog) { this.scene.fog.near = isTop ? 50 : 10; this.scene.fog.far = isTop ? 250 : 38; }
        this.renderer.render(this.scene, isTop ? this.topCamera : this.camera);
    }

    drawMinimap(ctx, canvas) {
        if (!this.mazeGrid) return;
        const cw = canvas.width, ch = canvas.height;
        const cW = cw / this.mazeW, cH = ch / this.mazeH;
        ctx.clearRect(0, 0, cw, ch); ctx.fillStyle = '#080818'; ctx.fillRect(0, 0, cw, ch);
        for (let r = 0; r < this.mazeH; r++) {
            for (let c = 0; c < this.mazeW; c++) {
                if (this.mazeGrid[r][c] === 1) { ctx.fillStyle = '#7A5A10'; ctx.fillRect(c * cW, r * cH, cW, cH); }
            }
        }
        ctx.fillStyle = '#FF6B00'; ctx.beginPath(); ctx.arc((this.player.pos.x / this.cellSize) * cW, (this.player.pos.z / this.cellSize) * cH, Math.max(cW, cH) * 0.9, 0, Math.PI * 2); ctx.fill();
    }
}
