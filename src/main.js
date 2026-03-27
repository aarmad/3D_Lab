import './style.css';
import { GameState } from './GameState.js';
import { MazeGenerator } from './MazeGenerator.js';
import { MazeScene } from './MazeScene.js';
import { formatTime } from './utils.js';

// ============================================================
// GAME INSTANCES
// ============================================================
let soloScene = null;
let splitScene1 = null;
let splitScene2 = null;
let animFrameId = null;
let lastTime = 0;
let timerInterval = null;

const mazeGen = new MazeGenerator(19, 19);

// ============================================================
// TIMER
// ============================================================
function startTimer() {
    GameState.startTime = Date.now();
    GameState.running = true;
    timerInterval = setInterval(updateTimerDisplay, 50);
}

function stopTimer() {
    clearInterval(timerInterval);
    GameState.running = false;
}

function updateTimerDisplay() {
    const duration = GameState.settings.maxTime * 1000;
    const elapsed = Date.now() - GameState.startTime;
    const timeLeft = Math.max(0, duration - elapsed);
    GameState.elapsed = elapsed;
    const mins = Math.floor(timeLeft / 60000);
    const secs = Math.floor((timeLeft % 60000) / 1000);
    const ms = Math.floor((timeLeft % 1000) / 10);
    const el = document.getElementById('timer-display');
    if (el) {
        el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        el.style.color = timeLeft < 10000 ? '#FF2020' : '';
    }
}

// ============================================================
// LEVEL LOGIC
// ============================================================
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

function startSplitGame() {
    GameState.mode = 'split'; showScreen('split-screen');
    const size = GameState.settings.mazeSize; mazeGen.setSize(size, size);
    const c1 = document.getElementById('canvas-p1'), c2 = document.getElementById('canvas-p2');
    c1.width = c2.width = Math.floor(window.innerWidth / 2) - 4;
    c1.height = c2.height = window.innerHeight;
    splitScene1 = new MazeScene(c1, 0, onPlayerReachedExit);
    splitScene2 = new MazeScene(c2, 1, onPlayerReachedExit);
    splitScene1.buildMaze(mazeGen.generate()); splitScene2.buildMaze(mazeGen.generate());
    const splitStart = Date.now(); lastTime = performance.now(); GameState.running = true;
    function loop(now) {
        animFrameId = requestAnimationFrame(loop); if (GameState.mode !== 'split') return;
        const dt = Math.min((now - lastTime) / 1000, 0.05); lastTime = now;
        splitScene1.update(dt); splitScene2.update(dt); splitScene1.render(); splitScene2.render();
        const timeLeft = Math.max(0, GameState.settings.maxTime * 1000 - (Date.now() - splitStart));
        document.getElementById('timer-p1').textContent = document.getElementById('timer-p2').textContent = formatTime(timeLeft);
    }
    cancelAnimationFrame(animFrameId); animFrameId = requestAnimationFrame(loop);
}

// ============================================================
// UI & INFRA
// ============================================================
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

    const sensSlider = document.getElementById('sensitivity-slider');
    sensSlider.oninput = () => { GameState.settings.sensitivity = parseFloat(sensSlider.value); document.getElementById('sensitivity-val').textContent = sensSlider.value; };

    document.getElementById('view-toggle-btn').onclick = () => {
        if (GameState.mode !== 'solo') return;
        GameState.viewMode = GameState.viewMode === 'fps' ? 'topdown' : 'fps';
        document.getElementById('view-label').textContent = GameState.viewMode === 'fps' ? 'FPS' : '3D TOP';
    };

    window.onkeydown = e => { 
        if (e.code === 'Tab') { e.preventDefault(); document.getElementById('view-toggle-btn').click(); }
        if (e.code === 'KeyF') toggleFullscreen();
    };
    window.onresize = () => { if (soloScene && GameState.mode === 'solo') soloScene.resize(window.innerWidth, window.innerHeight); };
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
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

function boot() {
    initUI();
    showScreen('main-menu');
    animateMenuBackground();
}

document.addEventListener('DOMContentLoaded', boot);
