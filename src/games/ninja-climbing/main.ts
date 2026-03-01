import { setupCanvas, getCanvasSize } from '../../common/canvas'
import { setupPointer } from '../../common/input'
import { startLoop } from '../../common/game-loop'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = setupCanvas(canvas)

// --- Constants ---
const GRAVITY = 800
const JUMP_VY = -420
const MOVE_SPEED = 160
const WALL_JUMP_VX = 220
const WALL_JUMP_VY = -400
const NINJA_W = 16
const NINJA_H = 20
const WALL_THICKNESS = 30
const FLOOR_THICKNESS = 10
const SPIKE_SIZE = 12
const CHANNEL_MIN_W = 140
const CHANNEL_MAX_W = 260
const SECTION_H = 120

// --- Types ---
interface Wall { x: number; y: number; w: number; h: number }
interface Spike { x: number; y: number; onWall: boolean; facingRight: boolean }
interface Section { y: number; walls: Wall[]; floors: Wall[]; spikes: Spike[] }

type NinjaState = 'running' | 'jumping' | 'wall_left' | 'wall_right'

// --- State ---
let nx = 0
let ny = 0
let vx = 0
let vy = 0
let state: NinjaState = 'running'
let camY = 0
let score = 0
let best = +(localStorage.getItem('ninja-best') || 0)
let dead = false
let started = false
let sections: Section[] = []
let topGenY = 0
let channelLeft = 0
let channelRight = 0

function init() {
  const { w, h } = getCanvasSize()
  const cw = 200
  channelLeft = (w - cw) / 2
  channelRight = channelLeft + cw

  // Ninja starts on a floor near the bottom
  nx = channelLeft + cw / 2
  ny = h - 60 - NINJA_H
  vx = MOVE_SPEED
  vy = 0
  state = 'running'
  camY = 0
  score = 0
  dead = false
  started = false
  sections = []

  // Generate initial sections filling the screen
  topGenY = h - 60
  // Starting floor
  sections.push({
    y: h - 60,
    walls: [
      { x: channelLeft - WALL_THICKNESS, y: h - 300, w: WALL_THICKNESS, h: 300 },
      { x: channelRight, y: h - 300, w: WALL_THICKNESS, h: 300 },
    ],
    floors: [{ x: channelLeft, y: h - 60, w: channelRight - channelLeft, h: FLOOR_THICKNESS }],
    spikes: [],
  })

  // Fill screen with sections
  while (topGenY > -h) {
    generateSection()
  }
}

function generateSection() {
  const { w } = getCanvasSize()
  topGenY -= SECTION_H

  // Slowly widen or shift the channel
  const drift = (Math.random() - 0.5) * 40
  const widthChange = (Math.random() - 0.5) * 20
  channelLeft = Math.max(WALL_THICKNESS, Math.min(w - CHANNEL_MIN_W - WALL_THICKNESS, channelLeft + drift))
  const cw = Math.max(CHANNEL_MIN_W, Math.min(CHANNEL_MAX_W, channelRight - channelLeft + widthChange))
  channelRight = channelLeft + cw

  const walls: Wall[] = [
    { x: channelLeft - WALL_THICKNESS, y: topGenY, w: WALL_THICKNESS, h: SECTION_H },
    { x: channelRight, y: topGenY, w: WALL_THICKNESS, h: SECTION_H },
  ]

  // Sometimes add a floor ledge from one wall
  const floors: Wall[] = []
  if (Math.random() < 0.35) {
    const fromLeft = Math.random() < 0.5
    const ledgeW = 30 + Math.random() * 40
    const ledgeY = topGenY + 20 + Math.random() * (SECTION_H - 40)
    if (fromLeft) {
      floors.push({ x: channelLeft, y: ledgeY, w: ledgeW, h: FLOOR_THICKNESS })
    } else {
      floors.push({ x: channelRight - ledgeW, y: ledgeY, w: ledgeW, h: FLOOR_THICKNESS })
    }
  }

  // Spikes
  const spikes: Spike[] = []
  const difficulty = Math.max(0, Math.min(1, score / 80))

  // Wall spikes
  if (Math.random() < 0.3 + difficulty * 0.3) {
    const onLeft = Math.random() < 0.5
    const sy = topGenY + 20 + Math.random() * (SECTION_H - 40)
    spikes.push({
      x: onLeft ? channelLeft : channelRight - SPIKE_SIZE,
      y: sy,
      onWall: true,
      facingRight: onLeft,
    })
  }

  // Additional wall spike at higher difficulty
  if (difficulty > 0.5 && Math.random() < difficulty * 0.4) {
    const onLeft = Math.random() < 0.5
    const sy = topGenY + 20 + Math.random() * (SECTION_H - 40)
    spikes.push({
      x: onLeft ? channelLeft : channelRight - SPIKE_SIZE,
      y: sy,
      onWall: true,
      facingRight: onLeft,
    })
  }

  sections.push({ y: topGenY, walls, floors, spikes })
}

function rectOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

init()

setupPointer(canvas, () => {
  if (dead) { init(); return }
  if (!started) { started = true }

  if (state === 'running') {
    // Jump
    vy = JUMP_VY
    state = 'jumping'
  } else if (state === 'wall_left') {
    // Wall jump off left wall → go right
    vx = WALL_JUMP_VX
    vy = WALL_JUMP_VY
    state = 'jumping'
  } else if (state === 'wall_right') {
    // Wall jump off right wall → go left
    vx = -WALL_JUMP_VX
    vy = WALL_JUMP_VY
    state = 'jumping'
  }
})

function update(dt: number) {
  if (dead || !started) return
  const { h } = getCanvasSize()

  // Apply gravity
  vy += GRAVITY * dt

  // Move ninja
  nx += vx * dt
  ny += vy * dt

  const ninjaL = nx - NINJA_W / 2
  const ninjaR = nx + NINJA_W / 2
  const ninjaT = ny
  const ninjaB = ny + NINJA_H

  // Collision with walls and floors from sections
  let onFloor = false
  let hitWallLeft = false
  let hitWallRight = false

  for (const sec of sections) {
    // Wall collisions
    for (const wall of sec.walls) {
      if (!rectOverlap(ninjaL, ninjaT, NINJA_W, NINJA_H, wall.x, wall.y, wall.w, wall.h)) continue

      // Determine which side
      const wallCenter = wall.x + wall.w / 2
      if (wallCenter < nx) {
        // Wall is to the left
        nx = wall.x + wall.w + NINJA_W / 2
        if (vx < 0) vx = 0
        hitWallLeft = true
      } else {
        // Wall is to the right
        nx = wall.x - NINJA_W / 2
        if (vx > 0) vx = 0
        hitWallRight = true
      }
    }

    // Floor collisions (only when falling)
    if (vy >= 0) {
      for (const floor of sec.floors) {
        if (
          ninjaR > floor.x && ninjaL < floor.x + floor.w &&
          ninjaB >= floor.y && ninjaB <= floor.y + floor.h + vy * dt + 2
        ) {
          ny = floor.y - NINJA_H
          vy = 0
          onFloor = true
          if (vx === 0) vx = MOVE_SPEED
        }
      }
    }

    // Spike collisions
    for (const spike of sec.spikes) {
      const margin = 4
      if (rectOverlap(
        ninjaL + margin, ninjaT + margin, NINJA_W - margin * 2, NINJA_H - margin * 2,
        spike.x, spike.y, SPIKE_SIZE, SPIKE_SIZE,
      )) {
        dead = true
        if (score > best) {
          best = score
          localStorage.setItem('ninja-best', String(best))
        }
        return
      }
    }
  }

  // State transitions
  if (hitWallLeft && !onFloor && vy >= 0) {
    state = 'wall_left'
    vy = 20 // Slow slide
    vx = 0
  } else if (hitWallRight && !onFloor && vy >= 0) {
    state = 'wall_right'
    vy = 20 // Slow slide
    vx = 0
  } else if (onFloor) {
    state = 'running'
    if (vx === 0) vx = MOVE_SPEED
  } else if (state === 'wall_left' && !hitWallLeft) {
    state = 'jumping'
  } else if (state === 'wall_right' && !hitWallRight) {
    state = 'jumping'
  }

  // Camera follows ninja upward
  const target = ny - h * 0.4
  if (target < camY) camY += (target - camY) * 0.1

  // Score
  const s = Math.floor(-camY / 15)
  if (s > score) score = s

  // Generate new sections above
  while (topGenY > camY - SECTION_H) {
    generateSection()
  }

  // Remove old sections below screen
  sections = sections.filter(sec => sec.y - camY < h + 200)

  // Death: fell below screen
  if (ny - camY > h + 100) {
    dead = true
    if (score > best) {
      best = score
      localStorage.setItem('ninja-best', String(best))
    }
  }
}

function drawNinja(screenX: number, screenY: number) {
  // Body
  ctx.fillStyle = '#2a2a2a'
  ctx.fillRect(screenX - NINJA_W / 2, screenY, NINJA_W, NINJA_H)

  // Head band (red)
  ctx.fillStyle = '#e74c3c'
  ctx.fillRect(screenX - NINJA_W / 2 - 2, screenY + 2, NINJA_W + 4, 4)

  // Eyes
  ctx.fillStyle = '#fff'
  const eyeDir = vx >= 0 ? 1 : -1
  ctx.fillRect(screenX + eyeDir * 3 - 2, screenY + 5, 4, 3)

  // Headband tail
  if (state === 'wall_left' || state === 'wall_right') {
    ctx.strokeStyle = '#e74c3c'
    ctx.lineWidth = 2
    ctx.beginPath()
    const tailDir = state === 'wall_left' ? 1 : -1
    ctx.moveTo(screenX + tailDir * NINJA_W / 2, screenY + 4)
    ctx.lineTo(screenX + tailDir * (NINJA_W / 2 + 8), screenY + 2)
    ctx.lineTo(screenX + tailDir * (NINJA_W / 2 + 14), screenY + 6)
    ctx.stroke()
  }
}

function drawSpike(spike: Spike, offy: number) {
  ctx.fillStyle = '#e74c3c'
  const sx = spike.x
  const sy = spike.y - offy

  ctx.beginPath()
  if (spike.facingRight) {
    // Points right (on left wall)
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + SPIKE_SIZE, sy + SPIKE_SIZE / 2)
    ctx.lineTo(sx, sy + SPIKE_SIZE)
  } else {
    // Points left (on right wall)
    ctx.moveTo(sx + SPIKE_SIZE, sy)
    ctx.lineTo(sx, sy + SPIKE_SIZE / 2)
    ctx.lineTo(sx + SPIKE_SIZE, sy + SPIKE_SIZE)
  }
  ctx.closePath()
  ctx.fill()
}

function draw() {
  const { w, h } = getCanvasSize()

  // Background
  ctx.fillStyle = '#0a0a1a'
  ctx.fillRect(0, 0, w, h)

  // Draw sections
  for (const sec of sections) {
    // Walls
    ctx.fillStyle = '#2c3e50'
    for (const wall of sec.walls) {
      ctx.fillRect(wall.x, wall.y - camY, wall.w, wall.h)
    }

    // Floors
    ctx.fillStyle = '#34495e'
    for (const floor of sec.floors) {
      ctx.fillRect(floor.x, floor.y - camY, floor.w, floor.h)
    }

    // Spikes
    for (const spike of sec.spikes) {
      drawSpike(spike, camY)
    }
  }

  // Ninja
  drawNinja(nx, ny - camY)

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

  // State indicator
  if (state === 'wall_left' || state === 'wall_right') {
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Tap to wall jump!', w / 2, h - 20)
  }

  // Start screen
  if (!started && !dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Ninja Climbing', w / 2, h / 2 - 40)

    ctx.font = '15px sans-serif'
    ctx.fillStyle = '#aaa'
    ctx.fillText('タップでジャンプ', w / 2, h / 2)
    ctx.fillText('壁に張り付いてタップで三角蹴り', w / 2, h / 2 + 25)
    ctx.fillText('トゲに当たるとゲームオーバー', w / 2, h / 2 + 50)

    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#e74c3c'
    ctx.fillText('Tap to Start', w / 2, h / 2 + 90)
  }

  // Game over
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
