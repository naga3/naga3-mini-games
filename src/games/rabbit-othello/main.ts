const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const BOARD_SIZE = 8;
const PLAYER = 1;   // black rabbit (player)
const CPU = 2;       // white rabbit (cpu)

let board: number[][] = [];
let cellSize = 0;
let boardOffsetX = 0;
let boardOffsetY = 0;
let gameOver = false;
let playerCanPlace = true;

// CPU timing - starts slow, gets faster
let cpuInterval = 3000;    // ms between CPU moves
const CPU_MIN_INTERVAL = 400;
const CPU_SPEED_DECAY = 0.92;
let lastCpuMove = 0;

// Score
let playerScore = 2;
let cpuScore = 2;

// Message display
let message = 'タップしてコマを置こう！';
let messageTimer = 0;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const maxBoard = Math.min(canvas.width - 20, canvas.height - 120);
  cellSize = Math.floor(maxBoard / BOARD_SIZE);
  boardOffsetX = Math.floor((canvas.width - cellSize * BOARD_SIZE) / 2);
  boardOffsetY = Math.floor((canvas.height - cellSize * BOARD_SIZE) / 2) + 20;
}

function initBoard() {
  board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  const mid = BOARD_SIZE / 2;
  board[mid - 1][mid - 1] = CPU;
  board[mid][mid] = CPU;
  board[mid - 1][mid] = PLAYER;
  board[mid][mid - 1] = PLAYER;
  gameOver = false;
  playerCanPlace = true;
  cpuInterval = 3000;
  lastCpuMove = performance.now();
  playerScore = 2;
  cpuScore = 2;
  message = 'タップしてコマを置こう！';
}

// Directions for checking flips
const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

function getFlips(row: number, col: number, color: number): [number, number][] {
  if (board[row][col] !== 0) return [];
  const opponent = color === PLAYER ? CPU : PLAYER;
  const allFlips: [number, number][] = [];

  for (const [dr, dc] of DIRS) {
    const flips: [number, number][] = [];
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === opponent) {
      flips.push([r, c]);
      r += dr;
      c += dc;
    }
    if (flips.length > 0 && r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === color) {
      allFlips.push(...flips);
    }
  }
  return allFlips;
}

function getValidMoves(color: number): [number, number][] {
  const moves: [number, number][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (getFlips(r, c, color).length > 0) {
        moves.push([r, c]);
      }
    }
  }
  return moves;
}

function placeStone(row: number, col: number, color: number): boolean {
  const flips = getFlips(row, col, color);
  if (flips.length === 0) return false;
  board[row][col] = color;
  for (const [r, c] of flips) {
    board[r][c] = color;
  }
  updateScore();
  return true;
}

function updateScore() {
  playerScore = 0;
  cpuScore = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === PLAYER) playerScore++;
      else if (board[r][c] === CPU) cpuScore++;
    }
  }
}

function checkGameOver() {
  const playerMoves = getValidMoves(PLAYER);
  const cpuMoves = getValidMoves(CPU);
  playerCanPlace = playerMoves.length > 0;

  if (playerMoves.length === 0 && cpuMoves.length === 0) {
    gameOver = true;
    if (playerScore > cpuScore) {
      message = `勝ち！ 🐰 ${playerScore} - ${cpuScore}`;
    } else if (cpuScore > playerScore) {
      message = `負け… 🐰 ${playerScore} - ${cpuScore}`;
    } else {
      message = `引き分け！ ${playerScore} - ${cpuScore}`;
    }
  }

  // Also check if board is full
  let empty = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 0) empty++;
    }
  }
  if (empty === 0) {
    gameOver = true;
    if (playerScore > cpuScore) {
      message = `勝ち！ 🐰 ${playerScore} - ${cpuScore}`;
    } else if (cpuScore > playerScore) {
      message = `負け… 🐰 ${playerScore} - ${cpuScore}`;
    } else {
      message = `引き分け！ ${playerScore} - ${cpuScore}`;
    }
  }
}

// Draw rabbit face
function drawRabbit(cx: number, cy: number, radius: number, isBlack: boolean) {
  const r = radius * 0.85;

  // Ears
  const earW = r * 0.22;
  const earH = r * 0.55;
  const earSpread = r * 0.3;

  ctx.save();

  // Left ear
  ctx.beginPath();
  ctx.ellipse(cx - earSpread, cy - r * 0.7, earW, earH, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = isBlack ? '#333' : '#fff';
  ctx.fill();
  ctx.strokeStyle = isBlack ? '#111' : '#ccc';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Left ear inner
  ctx.beginPath();
  ctx.ellipse(cx - earSpread, cy - r * 0.65, earW * 0.55, earH * 0.65, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = isBlack ? '#555' : '#ffcccc';
  ctx.fill();

  // Right ear
  ctx.beginPath();
  ctx.ellipse(cx + earSpread, cy - r * 0.7, earW, earH, 0.15, 0, Math.PI * 2);
  ctx.fillStyle = isBlack ? '#333' : '#fff';
  ctx.fill();
  ctx.strokeStyle = isBlack ? '#111' : '#ccc';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Right ear inner
  ctx.beginPath();
  ctx.ellipse(cx + earSpread, cy - r * 0.65, earW * 0.55, earH * 0.65, 0.15, 0, Math.PI * 2);
  ctx.fillStyle = isBlack ? '#555' : '#ffcccc';
  ctx.fill();

  // Head (circle)
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = isBlack ? '#333' : '#fff';
  ctx.fill();
  ctx.strokeStyle = isBlack ? '#111' : '#ccc';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Eyes
  const eyeY = cy - r * 0.08;
  const eyeSpread = r * 0.18;
  const eyeR = r * 0.07;
  ctx.beginPath();
  ctx.arc(cx - eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fillStyle = isBlack ? '#fff' : '#333';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fillStyle = isBlack ? '#fff' : '#333';
  ctx.fill();

  // Nose
  ctx.beginPath();
  const noseY = cy + r * 0.08;
  ctx.arc(cx, noseY, r * 0.04, 0, Math.PI * 2);
  ctx.fillStyle = isBlack ? '#ff9999' : '#ff6666';
  ctx.fill();

  // Mouth
  ctx.beginPath();
  ctx.moveTo(cx, noseY + r * 0.04);
  ctx.lineTo(cx - r * 0.08, noseY + r * 0.14);
  ctx.moveTo(cx, noseY + r * 0.04);
  ctx.lineTo(cx + r * 0.08, noseY + r * 0.14);
  ctx.strokeStyle = isBlack ? '#aaa' : '#999';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function draw(_now: number) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Title & score
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Rabbit Othello', canvas.width / 2, boardOffsetY - 40);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#aaa';

  // Player score (left)
  ctx.textAlign = 'right';
  ctx.fillText(`🐰⬛ あなた: ${playerScore}`, canvas.width / 2 - 10, boardOffsetY - 12);

  // CPU score (right)
  ctx.textAlign = 'left';
  ctx.fillText(`🐰⬜ COM: ${cpuScore}`, canvas.width / 2 + 10, boardOffsetY - 12);

  // Board background
  ctx.fillStyle = '#0a6e32';
  ctx.fillRect(boardOffsetX, boardOffsetY, cellSize * BOARD_SIZE, cellSize * BOARD_SIZE);

  // Grid lines
  ctx.strokeStyle = '#085a28';
  ctx.lineWidth = 1;
  for (let i = 0; i <= BOARD_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(boardOffsetX + i * cellSize, boardOffsetY);
    ctx.lineTo(boardOffsetX + i * cellSize, boardOffsetY + BOARD_SIZE * cellSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(boardOffsetX, boardOffsetY + i * cellSize);
    ctx.lineTo(boardOffsetX + BOARD_SIZE * cellSize, boardOffsetY + i * cellSize);
    ctx.stroke();
  }

  // Valid move highlights for player
  if (!gameOver && playerCanPlace) {
    const validMoves = getValidMoves(PLAYER);
    for (const [r, c] of validMoves) {
      ctx.fillStyle = 'rgba(255, 255, 100, 0.2)';
      ctx.fillRect(
        boardOffsetX + c * cellSize + 1,
        boardOffsetY + r * cellSize + 1,
        cellSize - 2,
        cellSize - 2,
      );
    }
  }

  // Pieces
  const pieceRadius = cellSize * 0.45;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== 0) {
        const cx = boardOffsetX + c * cellSize + cellSize / 2;
        const cy = boardOffsetY + r * cellSize + cellSize / 2;
        drawRabbit(cx, cy, pieceRadius, board[r][c] === PLAYER);
      }
    }
  }

  // CPU speed indicator
  if (!gameOver) {
    const barY = boardOffsetY + BOARD_SIZE * cellSize + 16;
    const barW = cellSize * BOARD_SIZE;
    const speed = 1 - (cpuInterval - CPU_MIN_INTERVAL) / (3000 - CPU_MIN_INTERVAL);
    ctx.fillStyle = '#333';
    ctx.fillRect(boardOffsetX, barY, barW, 8);
    ctx.fillStyle = `hsl(${(1 - speed) * 120}, 80%, 50%)`;
    ctx.fillRect(boardOffsetX, barY, barW * speed, 8);
    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('COM スピード', canvas.width / 2, barY + 22);
  }

  // Message
  if (message) {
    const msgY = boardOffsetY + BOARD_SIZE * cellSize + 50;
    ctx.fillStyle = '#fff';
    ctx.font = gameOver ? 'bold 20px sans-serif' : '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, msgY);

    if (gameOver) {
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#aaa';
      ctx.fillText('タップしてリスタート', canvas.width / 2, msgY + 28);
    }
  }
}

function cpuMove(now: number) {
  if (gameOver) return;
  if (now - lastCpuMove < cpuInterval) return;

  const moves = getValidMoves(CPU);
  if (moves.length === 0) {
    lastCpuMove = now;
    return;
  }

  // Random move
  const [r, c] = moves[Math.floor(Math.random() * moves.length)];
  placeStone(r, c, CPU);
  lastCpuMove = now;

  // Speed up
  cpuInterval = Math.max(CPU_MIN_INTERVAL, cpuInterval * CPU_SPEED_DECAY);

  checkGameOver();
}

function gameLoop(now: number) {
  cpuMove(now);
  draw(now);
  requestAnimationFrame(gameLoop);
}

function handleClick(x: number, y: number) {
  if (gameOver) {
    initBoard();
    return;
  }

  if (!playerCanPlace) return;

  const col = Math.floor((x - boardOffsetX) / cellSize);
  const row = Math.floor((y - boardOffsetY) / cellSize);

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;

  if (placeStone(row, col, PLAYER)) {
    checkGameOver();
  }
}

canvas.addEventListener('click', (e) => {
  handleClick(e.clientX, e.clientY);
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  handleClick(touch.clientX, touch.clientY);
}, { passive: false });

window.addEventListener('resize', resize);

resize();
initBoard();
requestAnimationFrame(gameLoop);
