import { setupCanvas, getCanvasSize } from '../../common/canvas'
import { setupPointer } from '../../common/input'
import { startLoop } from '../../common/game-loop'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = setupCanvas(canvas)

// --- Constants ---
const GRAVITY = 900
const JUMP_VEL = -450
const WALL_JUMP_VEL_Y = -480
const MOVE_SPEED = 160
const NINJA_SIZE = 12
const WALL_W = 20
const PLATFORM_H = 8
const SPIKE_H = 10

// --- Types ---
interface Platform {
  x: number
  y: number
  w: number
}

interface Spike {
  x: number
  y: number
  w: number
}

type NinjaState = 'running' | 'airborne' | 'wall' | 'dead'

// --- State ---
let nx = 0
let ny = 0
let vx = 0
let vy = 0
let dir = 1            // 1=right, -1=left
let state: NinjaState = 'airborne'
let camY = 0
let score = 0
let best = 0
let started = false
let topGenY = 0
let platforms: Platform[] = []
let spikes: Spike[] = []

function wallLeft(): number { return WALL_W }
function wallRight(): number { return getCanvasSize().w - WALL_W }

function init() {
  const { w, h } = getCanvasSize()
  const wl = WALL_W
  const wr = w - WALL_W

  nx = (wl + wr) / 2
  ny = h - 60
  vx = MOVE_SPEED
  vy = 0
  dir = 1
  state = 'running'
  camY = 0
  score = 0
  started = false
  platforms = []
  spikes = []

  // Starting platform (wide, safe)
  platforms.push({ x: wl, y: h - 40, w: wr - wl })

  // Generate initial platforms
  topGenY = h - 40
  generateUpTo(-h)
}

function generateUpTo(targetY: number) {
  const { w } = getCanvasSize()
  const wl = WALL_W
  const wr = w - WALL_W
  const corridor = wr - wl

  while (topGenY > targetY) {
    const gap = 70 + Math.random() * 40
    topGenY -= gap

    // Platform width: 40-60% of corridor
    const pw = corridor * (0.35 + Math.random() * 0.25)
    // Alternate sides with some randomness
    const side = Math.random() < 0.5 ? 'left' : 'right'
    const px = side === 'left' ? wl : wr - pw

    platforms.push({ x: px, y: topGenY, w: pw })

    // Add spikes after climbing a bit (score > 3)
    const difficulty = Math.min(score / 50, 0.6)
    if (Math.random() < difficulty && platforms.length > 5) {
      // Spike on the platform surface
      const sw = 20 + Math.random() * 20
      const sx = px + Math.random() * (pw - sw)
      spikes.push({ x: sx, y: topGenY - SPIKE_H, w: sw })
    }

    // Wall spikes (after score > 8)
    if (Math.random() < difficulty * 0.5 && score > 8) {
      const wallSpikeSide = Math.random() < 0.5 ? 'left' : 'right'
      const wsx = wallSpikeSide === 'left' ? wl : wr - 15
      spikes.push({ x: wsx, y: topGenY - 30 - Math.random() * 30, w: 15 })
    }
  }
}

init()

setupPointer(canvas, () => {
  if (state === 'dead') {
    init()
    return
  }

  if (!started) {
    started = true
  }

  if (state === 'running') {
    // Jump from platform
    vy = JUMP_VEL
    state = 'airborne'
  } else if (state === 'wall') {
    // Triangle kick: jump away from wall
    dir *= -1
    vx = dir * MOVE_SPEED
    vy = WALL_JUMP_VEL_Y
    state = 'airborne'
  }
})

function update(dt: number) {
  if (state === 'dead' || !started) return
  const { h } = getCanvasSize()
  const wl = wallLeft()
  const wr = wallRight()

  if (state === 'wall') {
    // Stuck on wall, gravity still applies slightly (slide down slowly)
    vy += GRAVITY * 0.1 * dt
    ny += vy * dt

    // Check if slid onto a platform below
    for (const p of platforms) {
      if (
        ny + NINJA_SIZE >= p.y &&
        ny + NINJA_SIZE <= p.y + PLATFORM_H + 20 &&
        nx + NINJA_SIZE > p.x &&
        nx - NINJA_SIZE < p.x + p.w &&
        vy > 0
      ) {
        ny = p.y - NINJA_SIZE
        vy = 0
        state = 'running'
        vx = dir * MOVE_SPEED
        break
      }
    }

    // Fall below camera = death
    if (ny - camY > h + 50) {
      state = 'dead'
      if (score > best) best = score
    }
    return
  }

  // Horizontal movement
  nx += vx * dt

  // Wall collision
  if (nx - NINJA_SIZE <= wl) {
    nx = wl + NINJA_SIZE
    if (state === 'airborne') {
      // Stick to left wall
      state = 'wall'
      dir = 1
      vx = 0
      vy = 0
    } else {
      // Running: bounce direction
      dir = 1
      vx = MOVE_SPEED
    }
  }
  if (nx + NINJA_SIZE >= wr) {
    nx = wr - NINJA_SIZE
    if (state === 'airborne') {
      // Stick to right wall
      state = 'wall'
      dir = -1
      vx = 0
      vy = 0
    } else {
      dir = -1
      vx = -MOVE_SPEED
    }
  }

  // Gravity
  vy += GRAVITY * dt
  ny += vy * dt

  // Platform collision (only while falling)
  if (vy > 0 && state !== 'wall') {
    for (const p of platforms) {
      if (
        ny + NINJA_SIZE >= p.y &&
        ny + NINJA_SIZE <= p.y + PLATFORM_H + vy * dt &&
        nx + NINJA_SIZE > p.x &&
        nx - NINJA_SIZE < p.x + p.w
      ) {
        ny = p.y - NINJA_SIZE
        vy = 0
        state = 'running'
        break
      }
    }
  }

  // Fall off platform edge → become airborne
  if (state === 'running') {
    let onPlatform = false
    for (const p of platforms) {
      if (
        Math.abs((ny + NINJA_SIZE) - p.y) < 2 &&
        nx + NINJA_SIZE > p.x &&
        nx - NINJA_SIZE < p.x + p.w
      ) {
        onPlatform = true
        break
      }
    }
    if (!onPlatform) {
      state = 'airborne'
    }
  }

  // Spike collision
  for (const s of spikes) {
    const spikeTop = s.y
    const spikeBottom = s.y + SPIKE_H
    const spikeLeft = s.x
    const spikeRight = s.x + s.w

    if (
      nx + NINJA_SIZE * 0.7 > spikeLeft &&
      nx - NINJA_SIZE * 0.7 < spikeRight &&
      ny + NINJA_SIZE * 0.7 > spikeTop &&
      ny - NINJA_SIZE * 0.7 < spikeBottom
    ) {
      state = 'dead'
      if (score > best) best = score
      return
    }
  }

  // Camera follows player upward
  const target = ny - h * 0.35
  if (target < camY) camY = target

  // Score = max height
  const s = Math.floor(-camY / 15)
  if (s > score) score = s

  // Generate new platforms above
  generateUpTo(camY - 100)

  // Cleanup below screen
  platforms = platforms.filter(p => p.y - camY < h + 100)
  spikes = spikes.filter(s => s.y - camY < h + 100)

  // Death: fell below screen
  if (ny - camY > h + 50) {
    state = 'dead'
    if (score > best) best = score
  }
}

function drawNinja(sx: number, sy: number) {
  const s = NINJA_SIZE

  // Body (dark outfit)
  ctx.fillStyle = '#2a2a3a'
  ctx.fillRect(sx - s * 0.7, sy - s * 0.5, s * 1.4, s * 1.5)

  // Head
  ctx.fillStyle = '#2a2a3a'
  ctx.beginPath()
  ctx.arc(sx, sy - s * 0.7, s * 0.7, 0, Math.PI * 2)
  ctx.fill()

  // Headband
  ctx.fillStyle = '#e63946'
  ctx.fillRect(sx - s * 0.8, sy - s * 0.9, s * 1.6, s * 0.3)

  // Headband tail
  ctx.beginPath()
  ctx.moveTo(sx + dir * -s * 0.8, sy - s * 0.9)
  ctx.lineTo(sx + dir * -s * 1.5, sy - s * 1.3)
  ctx.lineTo(sx + dir * -s * 0.8, sy - s * 0.6)
  ctx.fillStyle = '#e63946'
  ctx.fill()

  // Eyes
  ctx.fillStyle = '#fff'
  ctx.fillRect(sx - s * 0.4, sy - s * 0.85, s * 0.25, s * 0.2)
  ctx.fillRect(sx + s * 0.15, sy - s * 0.85, s * 0.25, s * 0.2)

  // Legs
  if (state === 'running') {
    const legPhase = (Date.now() % 300) / 300
    const legOffset = Math.sin(legPhase * Math.PI * 2) * s * 0.3
    ctx.fillStyle = '#2a2a3a'
    ctx.fillRect(sx - s * 0.4, sy + s, s * 0.3, s * 0.5 + legOffset)
    ctx.fillRect(sx + s * 0.1, sy + s, s * 0.3, s * 0.5 - legOffset)
  } else if (state === 'wall') {
    // Crouching on wall pose
    ctx.fillStyle = '#2a2a3a'
    ctx.fillRect(sx - s * 0.5, sy + s * 0.5, s * 1.0, s * 0.4)
  } else {
    // Airborne: legs together
    ctx.fillStyle = '#2a2a3a'
    ctx.fillRect(sx - s * 0.3, sy + s, s * 0.6, s * 0.4)
  }
}

function drawSpike(sx: number, sy: number, sw: number) {
  ctx.fillStyle = '#ff4757'
  const numTriangles = Math.floor(sw / 10)
  const tw = sw / numTriangles

  for (let i = 0; i < numTriangles; i++) {
    ctx.beginPath()
    ctx.moveTo(sx + i * tw, sy + SPIKE_H)
    ctx.lineTo(sx + i * tw + tw / 2, sy)
    ctx.lineTo(sx + (i + 1) * tw, sy + SPIKE_H)
    ctx.closePath()
    ctx.fill()
  }
}

function draw() {
  const { w, h } = getCanvasSize()

  // Background
  ctx.fillStyle = '#0a0a1a'
  ctx.fillRect(0, 0, w, h)

  // Walls
  ctx.fillStyle = '#1a1a3a'
  ctx.fillRect(0, 0, WALL_W, h)
  ctx.fillRect(w - WALL_W, 0, WALL_W, h)

  // Wall texture (subtle bricks)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let by = -((camY % 20) + 20); by < h; by += 20) {
    ctx.beginPath()
    ctx.moveTo(0, by)
    ctx.lineTo(WALL_W, by)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(w - WALL_W, by)
    ctx.lineTo(w, by)
    ctx.stroke()
  }

  // Platforms
  ctx.fillStyle = '#4a6741'
  for (const p of platforms) {
    const sy = p.y - camY
    ctx.fillRect(p.x, sy, p.w, PLATFORM_H)
    // Platform top highlight
    ctx.fillStyle = '#5a8a50'
    ctx.fillRect(p.x, sy, p.w, 2)
    ctx.fillStyle = '#4a6741'
  }

  // Spikes
  for (const s of spikes) {
    drawSpike(s.x, s.y - camY, s.w)
  }

  // Ninja
  if (state !== 'dead') {
    drawNinja(nx, ny - camY)
  }

  // Score HUD
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`${score}m`, w - 16, 40)

  if (best > 0 && state !== 'dead') {
    ctx.font = '13px sans-serif'
    ctx.fillStyle = '#666'
    ctx.fillText(`Best: ${best}m`, w - 16, 58)
  }

  // Start screen
  if (!started && state !== 'dead') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Ninja Climbing', w / 2, h / 2 - 60)

    ctx.font = '15px sans-serif'
    ctx.fillStyle = '#ccc'
    ctx.fillText('タップでジャンプ', w / 2, h / 2 - 20)
    ctx.fillText('壁に張り付いたら三角蹴り！', w / 2, h / 2 + 10)
    ctx.fillText('トゲに当たるとゲームオーバー', w / 2, h / 2 + 40)

    ctx.font = '14px sans-serif'
    ctx.fillStyle = '#888'
    ctx.fillText('Tap to Start', w / 2, h / 2 + 80)
  }

  // Game over overlay
  if (state === 'dead') {
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
