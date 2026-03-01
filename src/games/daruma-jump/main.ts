import { setupCanvas, getCanvasSize } from '../../common/canvas'
import { startLoop } from '../../common/game-loop'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = setupCanvas(canvas)

// --- Constants ---
const SPEED = 150           // horizontal scroll speed px/s
const GRAVITY = 1200
const MAX_CHARGE = 0.8      // seconds to full power
const JUMP_VEL = -650       // max vertical velocity
const MIN_JUMP = 0.2        // minimum power fraction
const R = 20                // daruma radius
const GROUND_H = 80         // ground area height from bottom

// Difficulty curve
const FIRST_HOLE = 400
const HOLE_W_MIN = 50
const HOLE_W_MAX = 130
const GAP_MAX = 350         // space between holes (easy)
const GAP_MIN = 150         // space between holes (hard)

// --- Types ---
interface Hole { x: number; w: number }

// --- State ---
let wx = 0            // daruma world-X
let dy = 0            // daruma screen-Y
let vy = 0
let rot = 0           // rotation radians
let charging = false
let power = 0
let onFloor = true
let dead = false
let started = false
let score = 0
let best = +(localStorage.getItem('daruma-best') ?? 0)
let holes: Hole[] = []
let nextHole = FIRST_HOLE

// Derived helpers
const floorY = () => getCanvasSize().h - GROUND_H
const screenX = () => Math.min(getCanvasSize().w * 0.28, 120)

// --- Hole logic ---
function calcHoleW() { return Math.min(HOLE_W_MAX, HOLE_W_MIN + score * 0.4) }
function calcGap() { return Math.max(GAP_MIN, GAP_MAX - score * 0.8) }

function genHoles() {
  const limit = wx + getCanvasSize().w * 3
  while (nextHole < limit) {
    const w = calcHoleW()
    holes.push({ x: nextHole, w })
    nextHole += w + calcGap()
  }
}

function overHole(worldX: number): boolean {
  return holes.some(h => worldX > h.x && worldX < h.x + h.w)
}

// --- Init ---
function init() {
  wx = 0
  dy = floorY() - R
  vy = 0
  rot = 0
  charging = false
  power = 0
  onFloor = true
  dead = false
  started = false
  score = 0
  holes = []
  nextHole = FIRST_HOLE
  genHoles()
}
init()

// --- Input (press & hold) ---
function onDown() {
  if (dead) { init(); return }
  if (!started) { started = true; return }
  if (onFloor && !charging) {
    charging = true
    power = 0
  }
}

function onUp() {
  if (!charging) return
  charging = false
  const p = Math.max(MIN_JUMP, power)
  vy = JUMP_VEL * p
  onFloor = false
}

canvas.addEventListener('mousedown', e => { e.preventDefault(); onDown() })
canvas.addEventListener('mouseup', () => onUp())
canvas.addEventListener('mouseleave', () => { if (charging) onUp() })
canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown() }, { passive: false })
canvas.addEventListener('touchend', e => { e.preventDefault(); onUp() }, { passive: false })
canvas.addEventListener('touchcancel', () => { if (charging) onUp() })

// --- Update ---
function update(dt: number) {
  if (dead || !started) return

  if (charging) {
    power = Math.min(1, power + dt / MAX_CHARGE)
    return
  }

  // Horizontal movement
  wx += SPEED * dt
  rot += (SPEED * dt) / R

  if (onFloor) {
    dy = floorY() - R
    if (overHole(wx)) {
      onFloor = false
      vy = 0
    }
  } else {
    // Airborne / falling
    vy += GRAVITY * dt
    dy += vy * dt

    // Landing check
    if (vy > 0 && dy >= floorY() - R) {
      if (overHole(wx)) {
        // keep falling through hole
      } else {
        dy = floorY() - R
        vy = 0
        onFloor = true
      }
    }
  }

  // Death: fell off screen
  if (dy > getCanvasSize().h + R * 3) {
    dead = true
    if (score > best) {
      best = score
      localStorage.setItem('daruma-best', String(best))
    }
  }

  score = Math.floor(wx / 20)
  genHoles()
  holes = holes.filter(h => h.x + h.w > wx - getCanvasSize().w)
}

// --- Draw daruma ---
function drawDaruma(x: number, y: number, angle: number, sx = 1, sy = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(sx, sy)
  ctx.rotate(angle)

  // Body
  ctx.fillStyle = '#d32f2f'
  ctx.beginPath()
  ctx.arc(0, 0, R, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#b71c1c'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Face oval
  ctx.fillStyle = '#fff8e1'
  ctx.beginPath()
  ctx.ellipse(0, -R * 0.1, R * 0.55, R * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()

  // Eyes
  ctx.fillStyle = '#212121'
  ctx.beginPath()
  ctx.arc(-R * 0.22, -R * 0.18, R * 0.1, 0, Math.PI * 2)
  ctx.arc(R * 0.22, -R * 0.18, R * 0.1, 0, Math.PI * 2)
  ctx.fill()

  // Eyebrows (八の字)
  ctx.strokeStyle = '#212121'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-R * 0.05, -R * 0.32)
  ctx.quadraticCurveTo(-R * 0.22, -R * 0.55, -R * 0.42, -R * 0.32)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(R * 0.05, -R * 0.32)
  ctx.quadraticCurveTo(R * 0.22, -R * 0.55, R * 0.42, -R * 0.32)
  ctx.stroke()

  // Mouth
  ctx.strokeStyle = '#5d4037'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(0, R * 0.12, R * 0.18, 0.3, Math.PI - 0.3)
  ctx.stroke()

  // Gold band
  ctx.strokeStyle = '#ffc107'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.arc(0, 0, R - 2, Math.PI * 0.15, Math.PI * 0.85)
  ctx.stroke()

  ctx.restore()
}

// --- Draw ---
function draw() {
  const { w, h } = getCanvasSize()
  const gy = floorY()
  const cam = wx - screenX()
  const dsx = screenX()

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#1a0a2e')
  bg.addColorStop(0.7, '#2d1541')
  bg.addColorStop(1, '#3e1f56')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Background hills (parallax)
  ctx.fillStyle = '#241335'
  const hillOff = cam * 0.08
  for (let hx = -(hillOff % 220) - 220; hx < w + 220; hx += 220) {
    const hh = 50 + Math.abs(Math.sin((hx + hillOff) * 0.005)) * 40
    ctx.beginPath()
    ctx.moveTo(hx, gy)
    ctx.quadraticCurveTo(hx + 110, gy - hh, hx + 220, gy)
    ctx.fill()
  }

  // Ground
  ctx.fillStyle = '#5d4037'
  ctx.fillRect(0, gy, w, GROUND_H)
  ctx.fillStyle = '#6d4c41'
  ctx.fillRect(0, gy, w, 3)

  // Holes
  for (const hole of holes) {
    const hsx = hole.x - cam
    if (hsx > w + 10 || hsx + hole.w < -10) continue
    // Dark void
    ctx.fillStyle = '#0a0515'
    ctx.fillRect(hsx, gy, hole.w, GROUND_H)
    // Edges
    ctx.fillStyle = '#3e2723'
    ctx.fillRect(hsx, gy, 2, GROUND_H)
    ctx.fillRect(hsx + hole.w - 2, gy, 2, GROUND_H)
  }

  // Shadow under daruma (only when airborne over solid ground)
  if (!onFloor && dy < gy - R && !overHole(wx)) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(dsx, gy - 1, R * 0.7, 3, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Daruma
  if (dy < h + R) {
    if (charging) {
      const sqY = 1 - power * 0.2
      const sqX = 1 + power * 0.2
      const adjustedY = gy - R * sqY
      drawDaruma(dsx, adjustedY, rot, sqX, sqY)
    } else {
      drawDaruma(dsx, dy, rot)
    }
  }

  // Power bar
  if (charging) {
    const barW = 8
    const barH = 50
    const bx = dsx - barW / 2
    const by = dy - R - 20 - barH

    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2)

    const fill = barH * power
    const hue = 120 * (1 - power) // green → red
    ctx.fillStyle = `hsl(${hue}, 85%, 50%)`
    ctx.fillRect(bx, by + barH - fill, barW, fill)

    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1
    ctx.strokeRect(bx, by, barW, barH)
  }

  // HUD
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`${score}m`, w - 16, 40)
  if (best > 0) {
    ctx.font = '13px sans-serif'
    ctx.fillStyle = '#888'
    ctx.fillText(`Best: ${best}m`, w - 16, 58)
  }

  // Start screen
  if (!started && !dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(0, 0, w, h)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 24px sans-serif'
    ctx.fillText('だるまジャンプ', w / 2, h / 2 - 40)

    ctx.font = '16px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText('長押しでパワーを溜めてジャンプ！', w / 2, h / 2)

    ctx.font = '14px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText('穴に落ちないように進もう', w / 2, h / 2 + 28)
    ctx.fillText('タップでスタート', w / 2, h / 2 + 65)
  }

  // Game over
  if (dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, w, h)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 32px sans-serif'
    ctx.fillText('Game Over', w / 2, h / 2 - 30)

    ctx.font = '20px sans-serif'
    ctx.fillText(`Score: ${score}m`, w / 2, h / 2 + 10)
    ctx.fillText(`Best: ${best}m`, w / 2, h / 2 + 40)

    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#aaa'
    ctx.fillText('タップでリトライ', w / 2, h / 2 + 80)
  }
}

startLoop(update, draw)
