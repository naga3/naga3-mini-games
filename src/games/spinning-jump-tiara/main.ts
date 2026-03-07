import { setupCanvas, getCanvasSize } from '../../common/canvas'
import { startLoop } from '../../common/game-loop'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = setupCanvas(canvas)

// --- Constants ---
const SPEED_BASE = 150
const SPEED_MAX = 320
const GRAVITY = 1200
const MAX_CHARGE = 0.8
const JUMP_VEL = -960
const MIN_JUMP = 0.2
const R = 18                // ballerina radius
const GROUND_H = 80

// Goal & tiara placement
const GOAL_DIST = 6000      // distance to goal in world px
const TIARA_SPACING_MIN = 120
const TIARA_SPACING_MAX = 280
const TIARA_SIZE = 14
const TIARA_FLOAT_H_MIN = 0   // min height above ground (0 = on ground)
const TIARA_FLOAT_H_MAX = 160 // max height above ground

// --- Types ---
interface Tiara { x: number; y: number; collected: boolean }

// --- State ---
let wx = 0
let dy = 0
let vy = 0
let rot = 0
let spinSpeed = 0           // spinning speed during jump
let charging = false
let power = 0
let onFloor = true
let dead = false
let started = false
let cleared = false          // reached goal
let score = 0
let tiaraCount = 0
let best = +(localStorage.getItem('tiara-best') ?? 0)
let tiaras: Tiara[] = []
let nextTiaraX = 200

// Derived helpers
const floorY = () => getCanvasSize().h - GROUND_H
const screenX = () => Math.min(getCanvasSize().w * 0.28, 120)

// --- Difficulty ---
function curSpeed() { return Math.min(SPEED_MAX, SPEED_BASE + score * 0.3) }

// --- Tiara generation ---
function genTiaras() {
  const limit = wx + getCanvasSize().w * 3
  while (nextTiaraX < GOAL_DIST && nextTiaraX < limit) {
    const floatH = TIARA_FLOAT_H_MIN + Math.random() * (TIARA_FLOAT_H_MAX - TIARA_FLOAT_H_MIN)
    tiaras.push({
      x: nextTiaraX,
      y: floorY() - R * 2 - floatH,
      collected: false,
    })
    nextTiaraX += TIARA_SPACING_MIN + Math.random() * (TIARA_SPACING_MAX - TIARA_SPACING_MIN)
  }
}

// --- Init ---
function init() {
  wx = 0
  dy = floorY() - R
  vy = 0
  rot = 0
  spinSpeed = 0
  charging = false
  power = 0
  onFloor = true
  dead = false
  cleared = false
  started = false
  score = 0
  tiaraCount = 0
  tiaras = []
  nextTiaraX = 200
  genTiaras()
}
init()

// --- Input ---
function onDown() {
  if (dead || cleared) { init(); return }
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
  spinSpeed = 8 + p * 12  // spinning speed based on jump power
}

canvas.addEventListener('mousedown', e => { e.preventDefault(); onDown() })
canvas.addEventListener('mouseup', () => onUp())
canvas.addEventListener('mouseleave', () => { if (charging) onUp() })
canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown() }, { passive: false })
canvas.addEventListener('touchend', e => { e.preventDefault(); onUp() }, { passive: false })
canvas.addEventListener('touchcancel', () => { if (charging) onUp() })

// --- Update ---
function update(dt: number) {
  if (dead || !started || cleared) return

  if (charging) {
    power = Math.min(1, power + dt / MAX_CHARGE)
    return
  }

  const spd = curSpeed()
  wx += spd * dt

  // Rotation: spin fast while airborne, slow roll on ground
  if (!onFloor) {
    rot += spinSpeed * dt
  } else {
    rot += (spd * dt) / R
    spinSpeed = 0
  }

  if (onFloor) {
    dy = floorY() - R
  } else {
    vy += GRAVITY * dt
    dy += vy * dt

    if (vy > 0 && dy >= floorY() - R) {
      dy = floorY() - R
      vy = 0
      onFloor = true
    }
  }

  // Collect tiaras
  const collectR = R + TIARA_SIZE
  for (const t of tiaras) {
    if (t.collected) continue
    const tdx = wx - t.x
    const tdy = dy - t.y
    if (tdx * tdx + tdy * tdy < collectR * collectR) {
      t.collected = true
      tiaraCount++
    }
  }

  // Check goal
  if (wx >= GOAL_DIST) {
    cleared = true
    if (tiaraCount > best) {
      best = tiaraCount
      localStorage.setItem('tiara-best', String(best))
    }
  }

  score = Math.floor(wx / 20)
  genTiaras()
  tiaras = tiaras.filter(t => t.x > wx - getCanvasSize().w || !t.collected)
}

// --- Draw ballerina ---
function drawBallerina(x: number, y: number, angle: number, sx = 1, sy = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(sx, sy)
  ctx.rotate(angle)

  // Tutu (skirt) - triangle shape
  ctx.fillStyle = '#f48fb1'
  ctx.beginPath()
  ctx.moveTo(-R * 1.1, R * 0.3)
  ctx.lineTo(R * 1.1, R * 0.3)
  ctx.lineTo(0, -R * 0.1)
  ctx.closePath()
  ctx.fill()
  // Tutu ruffles
  ctx.strokeStyle = '#f06292'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-R * 1.1, R * 0.3)
  ctx.quadraticCurveTo(-R * 0.55, R * 0.5, 0, R * 0.3)
  ctx.quadraticCurveTo(R * 0.55, R * 0.5, R * 1.1, R * 0.3)
  ctx.stroke()

  // Body
  ctx.fillStyle = '#ffe0b2'
  ctx.beginPath()
  ctx.ellipse(0, -R * 0.1, R * 0.35, R * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ffcc80'
  ctx.lineWidth = 1
  ctx.stroke()

  // Head
  ctx.fillStyle = '#ffe0b2'
  ctx.beginPath()
  ctx.arc(0, -R * 0.7, R * 0.38, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ffcc80'
  ctx.lineWidth = 1
  ctx.stroke()

  // Hair bun
  ctx.fillStyle = '#5d4037'
  ctx.beginPath()
  ctx.arc(0, -R * 1.05, R * 0.22, 0, Math.PI * 2)
  ctx.fill()
  // Hair on head
  ctx.beginPath()
  ctx.ellipse(0, -R * 0.85, R * 0.38, R * 0.18, 0, Math.PI, Math.PI * 2)
  ctx.fill()

  // Eyes
  ctx.fillStyle = '#212121'
  ctx.beginPath()
  ctx.arc(-R * 0.15, -R * 0.72, R * 0.06, 0, Math.PI * 2)
  ctx.arc(R * 0.15, -R * 0.72, R * 0.06, 0, Math.PI * 2)
  ctx.fill()

  // Smile
  ctx.strokeStyle = '#e91e63'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(0, -R * 0.6, R * 0.12, 0.2, Math.PI - 0.2)
  ctx.stroke()

  // Arms (extended like ballet pose)
  ctx.strokeStyle = '#ffe0b2'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  // Left arm up
  ctx.beginPath()
  ctx.moveTo(-R * 0.3, -R * 0.2)
  ctx.quadraticCurveTo(-R * 0.9, -R * 0.7, -R * 0.7, -R * 1.0)
  ctx.stroke()
  // Right arm out
  ctx.beginPath()
  ctx.moveTo(R * 0.3, -R * 0.2)
  ctx.quadraticCurveTo(R * 0.9, -R * 0.4, R * 1.0, -R * 0.6)
  ctx.stroke()

  // Legs
  ctx.strokeStyle = '#ffe0b2'
  ctx.lineWidth = 3
  // Left leg
  ctx.beginPath()
  ctx.moveTo(-R * 0.15, R * 0.3)
  ctx.lineTo(-R * 0.25, R * 0.9)
  ctx.stroke()
  // Right leg (pointed toe)
  ctx.beginPath()
  ctx.moveTo(R * 0.15, R * 0.3)
  ctx.lineTo(R * 0.3, R * 0.85)
  ctx.lineTo(R * 0.4, R * 0.95)
  ctx.stroke()

  ctx.restore()
}

// --- Draw tiara ---
function drawTiara(x: number, y: number, glow: boolean) {
  ctx.save()
  ctx.translate(x, y)

  if (glow) {
    ctx.shadowColor = '#ffd700'
    ctx.shadowBlur = 12
  }

  const s = TIARA_SIZE

  // Base band
  ctx.strokeStyle = '#ffd700'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, s * 0.15, s * 0.5, 0, Math.PI)
  ctx.stroke()

  // Crown points
  ctx.fillStyle = '#ffd700'
  ctx.beginPath()
  ctx.moveTo(-s * 0.5, s * 0.15)
  ctx.lineTo(-s * 0.35, -s * 0.25)
  ctx.lineTo(-s * 0.18, s * 0.05)
  ctx.lineTo(0, -s * 0.45)
  ctx.lineTo(s * 0.18, s * 0.05)
  ctx.lineTo(s * 0.35, -s * 0.25)
  ctx.lineTo(s * 0.5, s * 0.15)
  ctx.closePath()
  ctx.fill()

  // Gems
  ctx.fillStyle = '#e91e63'
  ctx.beginPath()
  ctx.arc(0, -s * 0.2, s * 0.08, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2196f3'
  ctx.beginPath()
  ctx.arc(-s * 0.28, -s * 0.05, s * 0.06, 0, Math.PI * 2)
  ctx.arc(s * 0.28, -s * 0.05, s * 0.06, 0, Math.PI * 2)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.restore()
}

// --- Draw goal flag ---
function drawGoal(sx: number) {
  const gy = floorY()
  // Pole
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(sx, gy)
  ctx.lineTo(sx, gy - 120)
  ctx.stroke()

  // Flag
  ctx.fillStyle = '#e91e63'
  ctx.beginPath()
  ctx.moveTo(sx, gy - 120)
  ctx.lineTo(sx + 40, gy - 105)
  ctx.lineTo(sx, gy - 90)
  ctx.closePath()
  ctx.fill()

  // "GOAL" text
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('GOAL', sx, gy - 130)
}

// --- Draw ---
function draw() {
  const { w, h } = getCanvasSize()
  const gy = floorY()
  const cam = wx - screenX()
  const dsx = screenX()

  // Background gradient (pink/purple ballet theme)
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#1a0a2e')
  bg.addColorStop(0.5, '#2d1541')
  bg.addColorStop(1, '#3e1f56')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  for (let i = 0; i < 40; i++) {
    const sx2 = ((i * 173 + 29) % w + w) % w
    const sy = ((i * 97 + 53) % (gy * 0.7))
    const sr = 0.5 + (i % 3) * 0.5
    ctx.beginPath()
    ctx.arc(sx2, sy, sr, 0, Math.PI * 2)
    ctx.fill()
  }

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

  // Ground (stage floor)
  ctx.fillStyle = '#5d4037'
  ctx.fillRect(0, gy, w, GROUND_H)
  ctx.fillStyle = '#8d6e63'
  ctx.fillRect(0, gy, w, 3)

  // Stage floor pattern (wooden planks)
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 1
  const plankOff = cam % 60
  for (let px = -plankOff; px < w; px += 60) {
    ctx.beginPath()
    ctx.moveTo(px, gy)
    ctx.lineTo(px, gy + GROUND_H)
    ctx.stroke()
  }

  // Goal flag
  const goalSx = GOAL_DIST - cam
  if (goalSx > -50 && goalSx < w + 50) {
    drawGoal(goalSx)
  }

  // Tiaras
  for (const t of tiaras) {
    if (t.collected) continue
    const tsx = t.x - cam
    if (tsx > w + 20 || tsx < -20) continue
    // Floating animation
    const floatOff = Math.sin(t.x * 0.02 + Date.now() * 0.003) * 4
    drawTiara(tsx, t.y + floatOff, true)
  }

  // Shadow under ballerina
  if (!onFloor && dy < gy - R) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.beginPath()
    ctx.ellipse(dsx, gy - 1, R * 0.7, 3, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Ballerina
  if (dy < h + R) {
    if (charging) {
      const sqY = 1 - power * 0.2
      const sqX = 1 + power * 0.2
      const adjustedY = gy - R * sqY
      drawBallerina(dsx, adjustedY, rot, sqX, sqY)
    } else {
      drawBallerina(dsx, dy, rot)
    }
  }

  // Collect sparkle particles (simple)
  // Power bar
  if (charging) {
    const barW = 8
    const barH = 50
    const bx = dsx - barW / 2
    const by = dy - R - 20 - barH

    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2)

    const fill = barH * power
    const hue = 120 * (1 - power)
    ctx.fillStyle = `hsl(${hue}, 85%, 50%)`
    ctx.fillRect(bx, by + barH - fill, barW, fill)

    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1
    ctx.strokeRect(bx, by, barW, barH)
  }

  // HUD
  ctx.textAlign = 'right'
  // Tiara count
  ctx.fillStyle = '#ffd700'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText(`👑 ${tiaraCount}`, w - 16, 40)
  // Progress
  ctx.fillStyle = '#fff'
  ctx.font = '14px sans-serif'
  const progress = Math.min(100, Math.floor((wx / GOAL_DIST) * 100))
  ctx.fillText(`${progress}%`, w - 16, 60)

  // Progress bar
  const pbW = 100
  const pbH = 6
  const pbX = w - 16 - pbW
  const pbY = 68
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.fillRect(pbX, pbY, pbW, pbH)
  ctx.fillStyle = '#e91e63'
  ctx.fillRect(pbX, pbY, pbW * Math.min(1, wx / GOAL_DIST), pbH)

  if (best > 0) {
    ctx.font = '13px sans-serif'
    ctx.fillStyle = '#888'
    ctx.textAlign = 'right'
    ctx.fillText(`Best: 👑${best}`, w - 16, 90)
  }

  // Start screen
  if (!started && !dead && !cleared) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(0, 0, w, h)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 24px sans-serif'
    ctx.fillText('バレリーナジャンプ', w / 2, h / 2 - 50)

    ctx.font = '16px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText('長押しでパワーを溜めてジャンプ！', w / 2, h / 2 - 10)

    ctx.fillStyle = '#ffd700'
    ctx.fillText('くるくる回ってティアラを集めよう', w / 2, h / 2 + 18)

    ctx.font = '14px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText('ゴールまでにたくさん集めよう！', w / 2, h / 2 + 48)
    ctx.fillText('タップでスタート', w / 2, h / 2 + 75)
  }

  // Clear screen
  if (cleared) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, w, h)

    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffd700'
    ctx.font = 'bold 32px sans-serif'
    ctx.fillText('CLEAR!', w / 2, h / 2 - 40)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 24px sans-serif'
    ctx.fillText(`👑 ${tiaraCount}個 ゲット！`, w / 2, h / 2 + 5)

    ctx.font = '18px sans-serif'
    ctx.fillText(`Best: ${best}個`, w / 2, h / 2 + 35)

    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#aaa'
    ctx.fillText('タップでリトライ', w / 2, h / 2 + 75)
  }
}

startLoop(update, draw)
