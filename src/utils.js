import * as THREE from 'three';

export class CelMaterials {
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
