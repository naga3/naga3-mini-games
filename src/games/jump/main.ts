import { setupCanvas, getCanvasSize } from '../../common/canvas'
import { setupPointer } from '../../common/input'
import { startLoop } from '../../common/game-loop'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = setupCanvas(canvas)

// --- Constants ---
const GRAVITY = 900
const JUMP_VEL = -430
const MOVE_SPEED = 170
const PLAYER_R = 10
const PLAT_H = 10
const PLAT_GAP = 75
const PLAT_W_BASE = 65
const PLAT_W_MIN = 38

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

interface Platform {
  x: number
  y: number
  w: number
}

let plats: Platform[] = []

/** Platforms get narrower as you climb */
function platWidth(): number {
  return Math.max(PLAT_W_MIN, PLAT_W_BASE - score * 0.03)
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
  plats = []

  const pw = PLAT_W_BASE
  // Starting platform directly under the player
  plats.push({ x: px - pw / 2, y: h - 50, w: pw })

  // Fill screen with platforms
  topGenY = h - 50
  while (topGenY > -h) {
    topGenY -= PLAT_GAP
    plats.push({ x: Math.random() * (w - pw), y: topGenY, w: pw })
  }
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

  // Platform collision (only while falling)
  if (vy > 0) {
    for (const p of plats) {
      if (
        px + PLAYER_R > p.x &&
        px - PLAYER_R < p.x + p.w &&
        py + PLAYER_R >= p.y &&
        py + PLAYER_R <= p.y + PLAT_H + vy * dt
      ) {
        py = p.y - PLAYER_R
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

  // Generate new platforms above
  const pw = platWidth()
  while (topGenY > camY - PLAT_GAP) {
    topGenY -= PLAT_GAP
    plats.push({ x: Math.random() * (w - pw), y: topGenY, w: pw })
  }

  // Remove platforms far below screen
  plats = plats.filter(p => p.y - camY < h + 100)

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

  // Platforms
  ctx.fillStyle = '#4ecdc4'
  for (const p of plats) {
    const sy = p.y - camY
    ctx.beginPath()
    ctx.roundRect(p.x, sy, p.w, PLAT_H, 4)
    ctx.fill()
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
