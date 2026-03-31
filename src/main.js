// ============================================================
// ENTRY POINT & MODULE IMPORTS
// ============================================================
// Ce fichier orchestre l’ensemble de l’application: menu, démarrage
// de partie, boucle de jeu, pause, split-screen, UI, timer.

import './style.css';
import { GameState } from './GameState.js';
import { MazeGenerator } from './MazeGenerator.js';
import { MazeScene } from './MazeScene.js';
import { formatTime } from './utils.js';

class MazeRunnerGame {
    constructor() {
        this.soloScene = null;
        this.splitScene1 = null;
        this.splitScene2 = null;
        this.animFrameId = null;
        this.lastTime = 0;
        this.timerInterval = null;
        this.splitStart = 0;
        this.splitElapsed = 0;

        this.mazeGen = new MazeGenerator(19, 19);

        this.bindMethods();
    }

    bindMethods() {
        this.startTimer = this.startTimer.bind(this);
        this.stopTimer = this.stopTimer.bind(this);
        this.pauseGame = this.pauseGame.bind(this);
        this.resumeGame = this.resumeGame.bind(this);
        this.updateTimerDisplay = this.updateTimerDisplay.bind(this);
        this.startSoloGame = this.startSoloGame.bind(this);
        this.soloLoop = this.soloLoop.bind(this);
        this.onPlayerReachedExit = this.onPlayerReachedExit.bind(this);
        this.showVictory = this.showVictory.bind(this);
        this.spawnVictoryParticles = this.spawnVictoryParticles.bind(this);
        this.startSplitGame = this.startSplitGame.bind(this);
        this.splitLoop = this.splitLoop.bind(this);
        this.showScreen = this.showScreen.bind(this);
        this.initUI = this.initUI.bind(this);
        this.toggleFullscreen = this.toggleFullscreen.bind(this);
        this.animateMenuBackground = this.animateMenuBackground.bind(this);
        this.boot = this.boot.bind(this);
    }

    startTimer(resume = false) {
        GameState.startTime = resume ? Date.now() - GameState.elapsed : Date.now();
        GameState.running = true;
        this.timerInterval = setInterval(this.updateTimerDisplay, 50);
    }

    stopTimer() {
        clearInterval(this.timerInterval);
        GameState.running = false;
    }

    pauseGame() {
        if (GameState.mode === 'solo') {
            GameState.prevMode = 'solo';
            GameState.mode = 'paused';
            this.stopTimer();
            this.showScreen('pause-menu');
            cancelAnimationFrame(this.animFrameId);
        } else if (GameState.mode === 'split') {
            GameState.prevMode = 'split';
            GameState.mode = 'paused';
            this.splitElapsed = Date.now() - this.splitStart;
            this.showScreen('pause-menu');
            cancelAnimationFrame(this.animFrameId);
        }
    }

    resumeGame() {
        const prevMode = GameState.prevMode || 'solo';
        if (prevMode === 'solo') {
            GameState.mode = 'solo';
            this.startTimer(true);
            this.showScreen('game-screen');
            this.lastTime = performance.now();
            this.animFrameId = requestAnimationFrame(this.soloLoop);
        } else if (prevMode === 'split') {
            GameState.mode = 'split';
            this.splitStart = Date.now() - this.splitElapsed;
            this.showScreen('split-screen');
            this.lastTime = performance.now();
            this.animFrameId = requestAnimationFrame(this.splitLoop);
        }
    }

    updateTimerDisplay() {
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

    mazeSizeForLevel(level) {
        const base = GameState.settings.mazeSize;
        const size = base + (level - 1) * 4;
        return Math.min(size % 2 === 0 ? size + 1 : size, 41);
    }

    startSoloGame(level = 1) {
        GameState.mode = 'solo';
        GameState.level = level;
        const size = this.mazeSizeForLevel(level);
        this.mazeGen.setSize(size, size);
        const grid = this.mazeGen.generate();
        this.showScreen('game-screen');
        const canvas = document.getElementById('game-canvas');
        if (!this.soloScene) this.soloScene = new MazeScene(canvas, 0, this.onPlayerReachedExit);
        this.soloScene.viewMode = GameState.viewMode;
        this.soloScene.buildMaze(grid);
        this.soloScene.resize(window.innerWidth, window.innerHeight);
        document.getElementById('level-num').textContent = level;
        document.getElementById('maze-name').textContent = `SECTOR ${level}`;
        this.soloScene.requestLock();
        this.startTimer();
        this.lastTime = performance.now();
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = requestAnimationFrame(this.soloLoop);
    }

    soloLoop(now) {
        this.animFrameId = requestAnimationFrame(this.soloLoop);
        if (GameState.mode !== 'solo') return;
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;
        this.soloScene.update(dt);
        this.soloScene.render();
        const mm = document.getElementById('minimap');
        this.soloScene.drawMinimap(mm.getContext('2d'), mm);
        const score = Math.max(0, 200000 - Math.floor(GameState.elapsed / 80));
        document.getElementById('score-display').textContent = score.toLocaleString();
    }

    onPlayerReachedExit(playerIndex) {
        if (GameState.mode === 'solo') this.showVictory();
        if (GameState.mode === 'split') {
            GameState.players[playerIndex].finished = true;
            document.getElementById('split-winner').textContent = `JOUEUR ${playerIndex+1} GAGNE !`;
            document.getElementById('split-winner').style.display = 'block';
        }
    }

    showVictory() {
        this.stopTimer();
        document.exitPointerLock();
        GameState.mode = 'victory';
        document.getElementById('final-time').textContent = formatTime(GameState.elapsed);
        this.showScreen('victory-screen');
        this.spawnVictoryParticles();
    }

    spawnVictoryParticles() {
        const container = document.getElementById('victory-particles');
        if (!container) return;
        container.innerHTML = '';
        const colors = ['#FFD700', '#FF6B00', '#00FFFF', '#FF00AA', '#39FF14'];
        for (let i = 0; i < 45; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const tx = (Math.random() - 0.5) * window.innerWidth;
            const ty = -(Math.random() * window.innerHeight);
            p.style.cssText = `left: 50%; top: 50%; background: ${colors[i % colors.length]}; --tx: ${tx}px; --ty: ${ty}px; animation-duration: ${1 + Math.random() * 2}s; width: ${8 + Math.random() * 14}px; height: ${8 + Math.random() * 14}px;`;
            container.appendChild(p);
        }
    }

    startSplitGame() {
        GameState.mode = 'split';
        this.showScreen('split-screen');
        const size = GameState.settings.mazeSize;
        this.mazeGen.setSize(size, size);
        const c1 = document.getElementById('canvas-p1');
        const c2 = document.getElementById('canvas-p2');
        c1.width = c2.width = Math.floor(window.innerWidth / 2) - 4;
        c1.height = c2.height = window.innerHeight;
        this.splitScene1 = new MazeScene(c1, 0, this.onPlayerReachedExit);
        this.splitScene2 = new MazeScene(c2, 1, this.onPlayerReachedExit);
        this.splitScene1.viewMode = 'fps';
        this.splitScene2.viewMode = 'fps';
        const sharedGrid = this.mazeGen.generate();
        this.splitScene1.buildMaze(sharedGrid);
        this.splitScene2.buildMaze(sharedGrid);
        this.splitStart = Date.now() - this.splitElapsed;
        this.lastTime = performance.now();
        GameState.running = true;
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = requestAnimationFrame(this.splitLoop);
    }

    splitLoop(now) {
        this.animFrameId = requestAnimationFrame(this.splitLoop);
        if (GameState.mode !== 'split') return;
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;
        this.splitScene1.update(dt);
        this.splitScene2.update(dt);
        this.splitScene1.render();
        this.splitScene2.render();
        const timeLeft = Math.max(0, GameState.settings.maxTime * 1000 - (Date.now() - this.splitStart));
        document.getElementById('timer-p1').textContent = document.getElementById('timer-p2').textContent = formatTime(timeLeft);
        if (timeLeft <= 0) {
            GameState.mode = 'victory';
            this.showScreen('victory-screen');
            document.getElementById('final-time').textContent = formatTime(GameState.settings.maxTime * 1000);
            document.getElementById('final-score').textContent = '0';
            document.getElementById('final-rank').textContent = '-';
        }
    }

    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
        const t = document.getElementById(id);
        if (t) { t.classList.add('active'); t.style.display = id === 'game-screen' ? 'block' : 'flex'; }
    }

    initUI() {
        document.getElementById('btn-solo').onclick = () => this.startSoloGame(1);
        document.getElementById('btn-multi').onclick = () => this.startSplitGame();
        document.getElementById('btn-settings').onclick = () => this.showScreen('settings-screen');
        document.getElementById('btn-settings-back').onclick = () => this.showScreen('main-menu');
        document.getElementById('btn-menu-victory').onclick = () => { GameState.mode = 'menu'; this.showScreen('main-menu'); };
        document.getElementById('btn-next-level').onclick = () => this.startSoloGame(GameState.level + 1);
        document.getElementById('btn-retry').onclick = () => this.startSoloGame(GameState.level);

        document.getElementById('pause-btn').onclick = this.pauseGame;
        document.getElementById('btn-resume').onclick = this.resumeGame;
        document.getElementById('btn-restart').onclick = () => this.startSoloGame(GameState.level);
        document.getElementById('btn-menu-pause').onclick = () => { GameState.mode = 'menu'; this.showScreen('main-menu'); };
        document.getElementById('split-back-btn').onclick = () => { GameState.mode = 'menu'; this.showScreen('main-menu'); };

        const sensSlider = document.getElementById('sensitivity-slider');
        sensSlider.oninput = () => {
            GameState.settings.sensitivity = parseFloat(sensSlider.value);
            document.getElementById('sensitivity-val').textContent = sensSlider.value;
        };

        document.getElementById('view-toggle-btn').onclick = () => {
            if (GameState.mode === 'solo' && this.soloScene) {
                GameState.viewMode = GameState.viewMode === 'fps' ? 'topdown' : 'fps';
                this.soloScene.viewMode = GameState.viewMode;
                document.getElementById('view-label').textContent = GameState.viewMode === 'fps' ? 'FPS' : '3D TOP';
            }
        };

        document.getElementById('fullscreen-btn').onclick = this.toggleFullscreen;

        window.onkeydown = e => {
            if (e.code === 'Tab') {
                e.preventDefault();
                document.getElementById('view-toggle-btn').click();
            }
            if (e.code === 'KeyF') this.toggleFullscreen();

            if (GameState.mode === 'split') {
                if (e.code === 'KeyU' && this.splitScene1) {
                    this.splitScene1.viewMode = this.splitScene1.viewMode === 'fps' ? 'topdown' : 'fps';
                }
                if (e.code === 'KeyO' && this.splitScene2) {
                    this.splitScene2.viewMode = this.splitScene2.viewMode === 'fps' ? 'topdown' : 'fps';
                }
            }
        };

        window.onresize = () => {
            if (this.soloScene && GameState.mode === 'solo') this.soloScene.resize(window.innerWidth, window.innerHeight);
            if (GameState.mode === 'split' && this.splitScene1 && this.splitScene2) {
                const w = Math.floor(window.innerWidth / 2) - 4;
                const h = window.innerHeight;
                this.splitScene1.canvas.width = w;
                this.splitScene1.canvas.height = h;
                this.splitScene1.resize(w, h);
                this.splitScene2.canvas.width = w;
                this.splitScene2.canvas.height = h;
                this.splitScene2.resize(w, h);
            }
        };
    }

    toggleFullscreen() {
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

    animateMenuBackground() {
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

    boot() {
        this.initUI();
        this.showScreen('main-menu');
        this.animateMenuBackground();
    }
}

const GAME = new MazeRunnerGame();
document.addEventListener('DOMContentLoaded', () => GAME.boot());

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
            if (e.code === 'KeyU' && splitScene1) {
                splitScene1.viewMode = splitScene1.viewMode === 'fps' ? 'topdown' : 'fps';
            }
            if (e.code === 'KeyO' && splitScene2) {
                splitScene2.viewMode = splitScene2.viewMode === 'fps' ? 'topdown' : 'fps';
            }
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
