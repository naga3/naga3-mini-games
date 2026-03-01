import { setupCanvas, getCanvasSize } from '../../common/canvas'
import { setupPointer } from '../../common/input'
import { startLoop } from '../../common/game-loop'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = setupCanvas(canvas)

// --- Constants ---
const GRAVITY = 900
const JUMP_VEL = -430
const MOVE_SPEED = 150
const PLAYER_R = 10
const FLOOR_H = 10
const FLOOR_GAP = 55
const HOLE_W_BASE = 50
const HOLE_W_MAX = 120

// --- Types ---
interface Floor {
  y: number
  holeX: number   // left edge of the hole
  holeW: number   // width of the hole
}

// --- State ---
let px = 0
let py = 0
let vy = 0
let dir = 1           // 1=right, -1=left
let camY = 0          // world-Y of viewport top
let score = 0
let best = 0
let dead = false
let topGenY = 0
let floors: Floor[] = []

/** Holes get wider as you climb */
function holeWidth(): number {
  return Math.min(HOLE_W_MAX, HOLE_W_BASE + score * 0.15)
}

function addFloor(y: number, hw: number) {
  const { w } = getCanvasSize()
  // Hole position: ensure hole fits within screen
  const holeX = Math.random() * (w - hw)
  floors.push({ y, holeX, holeW: hw })
}

function init() {
  const { w, h } = getCanvasSize()
  px = w / 2
  py = h - 80
  vy = JUMP_VEL
  dir = 1
  camY = 0
  score = 0
  dead = false
  floors = []

  // Starting floor: solid (no hole under player)
  floors.push({ y: h - 50, holeX: -100, holeW: 0 })

  // Fill screen with floors
  topGenY = h - 50
  const hw = HOLE_W_BASE
  while (topGenY > -h) {
    topGenY -= FLOOR_GAP
    addFloor(topGenY, hw)
  }
}

/** Check if player is over solid floor (not in the hole) */
function isOnSolid(f: Floor): boolean {
  return px + PLAYER_R <= f.holeX || px - PLAYER_R >= f.holeX + f.holeW
}

init()

setupPointer(canvas, () => {
  if (dead) { init(); return }
  dir *= -1
})

function update(dt: number) {
  if (dead) return
  const { w, h } = getCanvasSize()

  // Horizontal movement + screen wrap
  px += dir * MOVE_SPEED * dt
  if (px < -PLAYER_R) px = w + PLAYER_R
  if (px > w + PLAYER_R) px = -PLAYER_R

  // Gravity
  vy += GRAVITY * dt
  py += vy * dt

  // Floor collision (only while falling)
  if (vy > 0) {
    for (const f of floors) {
      if (
        py + PLAYER_R >= f.y &&
        py + PLAYER_R <= f.y + FLOOR_H + vy * dt &&
        isOnSolid(f)
      ) {
        py = f.y - PLAYER_R
        vy = JUMP_VEL
        break
      }
    }
  }

  // Camera follows player upward (never moves down)
  const target = py - h * 0.35
  if (target < camY) camY = target

  // Score = max height reached
  const s = Math.floor(-camY / 10)
  if (s > score) score = s

  // Generate new floors above
  const hw = holeWidth()
  while (topGenY > camY - FLOOR_GAP) {
    topGenY -= FLOOR_GAP
    addFloor(topGenY, hw)
  }

  // Remove floors far below screen
  floors = floors.filter(f => f.y - camY < h + 100)

  // Death: fell below visible area
  if (py - camY > h + 50) {
    dead = true
    if (score > best) best = score
  }
}

function draw() {
  const { w, h } = getCanvasSize()

  // Background
  ctx.fillStyle = '#0f0a1e'
  ctx.fillRect(0, 0, w, h)

  // Floors (full-width with holes)
  ctx.fillStyle = '#4ecdc4'
  for (const f of floors) {
    const sy = f.y - camY
    // Left segment (before hole)
    if (f.holeX > 0) {
      ctx.fillRect(0, sy, f.holeX, FLOOR_H)
    }
    // Right segment (after hole)
    const rightX = f.holeX + f.holeW
    if (rightX < w) {
      ctx.fillRect(rightX, sy, w - rightX, FLOOR_H)
    }
  }

  // Player
  const playerScreenY = py - camY
  ctx.fillStyle = '#ff6b6b'
  ctx.beginPath()
  ctx.arc(px, playerScreenY, PLAYER_R, 0, Math.PI * 2)
  ctx.fill()

  // Eye (direction indicator)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(px + dir * 4, playerScreenY - 3, 3, 0, Math.PI * 2)
  ctx.fill()

  // Score HUD
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`${score}m`, w - 16, 40)

  if (best > 0 && !dead) {
    ctx.font = '13px sans-serif'
    ctx.fillStyle = '#666'
    ctx.fillText(`Best: ${best}m`, w - 16, 58)
  }

  // Direction arrow hint
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.font = '24px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(dir > 0 ? '→' : '←', w / 2, h - 20)

  // Game over overlay
  if (dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 32px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Game Over', w / 2, h / 2 - 30)

    ctx.font = '20px sans-serif'
    ctx.fillText(`Score: ${score}m`, w / 2, h / 2 + 10)
    ctx.fillText(`Best: ${best}m`, w / 2, h / 2 + 40)

    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#aaa'
    ctx.fillText('Tap to retry', w / 2, h / 2 + 80)
  }
}

startLoop(update, draw)
