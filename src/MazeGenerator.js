export class MazeGenerator {
    constructor(w, h) {
        this.setSize(w, h);
    }

    setSize(w, h) {
        this.width = w % 2 === 0 ? w + 1 : w;
        this.height = h % 2 === 0 ? h + 1 : h;
    }

    generate() {
        const grid = Array.from({ length: this.height }, () =>
            Array(this.width).fill(1)
        );

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

        const loopCount = Math.floor(this.width * this.height * 0.06);
        for (let i = 0; i < loopCount; i++) {
            const row = 1 + 2 * Math.floor(Math.random() * Math.floor((this.height - 1) / 2));
            const col = 2 + 2 * Math.floor(Math.random() * Math.floor((this.width - 2) / 2));
            if (row < this.height - 1 && col < this.width - 1) {
                grid[row][col] = 0;
            }
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
