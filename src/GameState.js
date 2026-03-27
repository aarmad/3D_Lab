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
