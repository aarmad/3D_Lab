# MAZE RUNNER X — Documentation Technique

## Vue d'ensemble du projet

**Maze Runner X** est un jeu de labyrinthe 3D immersif développé avec Three.js, offrant une expérience de jeu en cel-shading (style cartoon) avec des mécaniques de jeu variées : mode solo avec niveaux progressifs, mode duel split-screen, et diverses options de personnalisation.

Le projet est structuré autour d'une architecture orientée objet modulaire, utilisant ES6 modules et Vite comme outil de build. Le jeu combine rendu 3D temps réel, génération procédurale de labyrinthes, et une interface utilisateur réactive.

## Architecture générale

Le code est organisé en plusieurs modules interconnectés :

- **`index.html`** : Structure HTML principale avec menus, écrans de jeu et canvas 3D
- **`style.css`** : Styles CSS pour l'interface comic book avec animations
- **`src/main.js`** : Classe `MazeRunnerGame` orchestrant l'ensemble de l'application
- **`src/MazeScene.js`** : Classe `MazeScene` gérant le rendu 3D et la logique joueur
- **`src/MazeGenerator.js`** : Classe `MazeGenerator` pour la génération procédurale
- **`src/GameState.js`** : Objet `GameState` centralisant l'état global
- **`src/utils.js`** : Utilitaires et matériaux cel-shading
- **`package.json`** & **`vite.config.js`** : Configuration build et dépendances

## Interactions entre les composants

### Flux de données principal
```
index.html (UI) ↔ MazeRunnerGame (orchestration)
    ↓
GameState (état global) ↔ MazeScene (rendu 3D)
    ↓
MazeGenerator (génération) → utils.js (matériaux)
```

### Responsabilités clés
- **MazeRunnerGame** : Point d'entrée, gestion des modes de jeu, timers, événements UI
- **MazeScene** : Instance par joueur (solo/split), gère caméra, contrôles, collision
- **MazeGenerator** : Crée des grilles de labyrinthe via backtracking récursif
- **GameState** : Stockage partagé des paramètres et état de jeu
- **CelMaterials** : Définit les matériaux toon avec gradients personnalisés

---

# Division du travail pour présentation (3 développeurs)

## Partie 1 : Interface Utilisateur et Gestion du Jeu
**Développeur 1** - Responsable de l'expérience utilisateur et de l'orchestration globale

### Fichiers principaux
- `index.html` : Structure complète des écrans (menu, jeu, victoire, paramètres)
- `style.css` : Styles CSS avec thème comic book, animations, responsive design
- `src/main.js` (Classe `MazeRunnerGame`) : Gestion des modes de jeu, timers, événements

### Fonctionnalités implémentées
- **Navigation entre écrans** : Menu principal → Jeu solo → Victoire → Paramètres
- **Gestion des timers** : Chronomètre avec alerte visuelle, calcul du score
- **Contrôles UI** : Boutons pause/résume, fullscreen, changement de vue
- **Mode split-screen** : Gestion des deux joueurs avec timers séparés
- **Animations et effets** : Particules de victoire, arrière-plan animé du menu

### Code clé (MazeRunnerGame)
```javascript
class MazeRunnerGame {
    constructor() { /* Initialisation scènes, générateur */ }
    startSoloGame(level) { /* Démarrage partie solo */ }
    startSplitGame() { /* Démarrage duel split-screen */ }
    soloLoop() { /* Boucle de rendu solo */ }
    pauseGame() / resumeGame() { /* Gestion pause */ }
    showVictory() { /* Écran de fin avec statistiques */ }
}
```

### Défis techniques
- Synchronisation des timers entre modes solo/split
- Gestion des événements clavier/souris pour contrôles multiples
- Animation fluide des transitions d'écran
- Intégration des particules CSS pour effets visuels

---

## Partie 2 : Génération et État du Labyrinthe
**Développeur 2** - Spécialiste en algorithmes et gestion d'état

### Fichiers principaux
- `src/MazeGenerator.js` : Algorithme de génération procédurale
- `src/GameState.js` : État global et configuration

### Fonctionnalités implémentées
- **Génération de labyrinthe** : Algorithme recursive backtracking avec boucles optionnelles
- **Gestion des niveaux** : Taille progressive des labyrinthes (11×11 → 41×41)
- **État partagé** : Mode de jeu, paramètres, scores, progression
- **Configuration** : Sensibilité souris, vitesse joueur, taille labyrinthe

### Algorithme de génération (MazeGenerator)
```javascript
class MazeGenerator {
    generate() {
        // 1. Grille pleine de murs
        // 2. Backtracking récursif depuis (1,1)
        // 3. Ajout de boucles pour variété
        // 4. Retour grille 2D (0=couloir, 1=mur)
    }
}
```

### État global (GameState)
```javascript
export const GameState = {
    mode: 'menu', // menu | solo | split | paused | victory
    settings: {
        sensitivity: 2.0,
        speed: 5.5,
        mazeSize: 19,
        maxTime: 60
    },
    players: [{finished: false}, {finished: false}]
};
```

### Défis techniques
- Optimisation de l'algorithme pour grandes tailles (35×35+)
- Génération déterministe pour mode split-screen partagé
- Balance difficulté/temps de génération
- Persistance des paramètres utilisateur

---

## Partie 3 : Rendu 3D et Scène
**Développeur 3** - Expert Three.js et rendu temps réel

### Fichiers principaux
- `src/MazeScene.js` : Gestion complète de la scène 3D
- `src/utils.js` : Matériaux cel-shading et utilitaires

### Fonctionnalités implémentées
- **Rendu Three.js** : Scène, caméras, éclairage, ombres
- **Contrôles joueur** : FPS/top-down, collision, saut, animation
- **Matériaux toon** : Cel-shading avec gradients personnalisés
- **Minimap 2D** : Représentation top-down du labyrinthe
- **Effets visuels** : Lignes de mouvement, outlines, brouillard

### Architecture 3D (MazeScene)
```javascript
class MazeScene {
    constructor(canvas, playerIndex) {
        this._initRenderer(); // WebGL + Three.js
        this._initScene();    // Géométries, matériaux
        this._initLights();   // Éclairage directionnel + ambiante
        this._initPlayer();   // Modèle joueur animé
        this._initInput();    // Gestion clavier/souris
    }
    
    update(dt) { /* Physique, contrôles, collision */ }
    render() { /* Rendu final */ }
    buildMaze(grid) { /* Construction géométrique */ }
}
```

### Matériaux cel-shading (utils.js)
```javascript
class CelMaterials {
    static wallMat() {
        return new THREE.MeshToonMaterial({
            color: 0x8B6914,
            gradientMap: CelMaterials._gradientMap(5),
            flatShading: true,
            emissive: 0x442800
        });
    }
}
```

### Défis techniques
- Optimisation des performances (ombres, géométrie instanciée)
- Gestion des contrôles multi-joueurs (P1: WASD, P2: IJKL)
- Collision précise avec boîtes englobantes
- Cel-shading uniforme sur tous les matériaux
- Synchronisation rendu entre vues solo/split

---

## Technologies utilisées

- **Three.js** : Moteur 3D WebGL pour rendu temps réel
- **Vite** : Outil de build rapide avec HMR
- **ES6 Modules** : Architecture modulaire moderne
- **HTML5 Canvas** : Contextes de rendu 3D
- **CSS3** : Animations, gradients, responsive design
- **Web APIs** : Pointer Lock, Fullscreen, Gamepad (futur)

## Structure de build

```
npm run dev     # Serveur développement (port 3000)
npm run build   # Build production vers /dist
npm run preview # Prévisualisation build
```

## Points d'extension

- **Multiplayer réseau** : Extension WebSocket pour jeu en ligne
- **Niveaux personnalisés** : Éditeur de labyrinthe intégré
- **Physique avancée** : Moteur physique pour interactions
- **Audio** : Effets sonores et musique adaptative
- **Mobile** : Support tactile et contrôles gyroscopiques

---

*Documentation créée pour présentation du projet Maze Runner X - Développement collaboratif en 3 parties égales*</content>
<parameter name="filePath">c:\Users\madjr\Desktop\Skool\3D_Lab\README.md