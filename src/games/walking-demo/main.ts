import { setupCanvas, getCanvasSize } from '../../common/canvas'
import { setupPointer } from '../../common/input'
import { startLoop } from '../../common/game-loop'

// --- 定数 ---
const SPEED = 120 // px/秒
const CHAR_SIZE = 28
const GROUND_HEIGHT = 60

// --- キャラクター状態 ---
interface Character {
  x: number
  y: number
  targetX: number
  targetY: number
  moving: boolean
  direction: 1 | -1 // 1=右向き, -1=左向き
  walkPhase: number // アニメーション用
}

// --- 初期化 ---
const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = setupCanvas(canvas)

const { w, h } = getCanvasSize()
const char: Character = {
  x: w / 2,
  y: h / 2,
  targetX: w / 2,
  targetY: h / 2,
  moving: false,
  direction: 1,
  walkPhase: 0,
}

// タップ/クリックで目標地点を設定
let tapMarker: { x: number; y: number; alpha: number } | null = null

setupPointer(canvas, (e) => {
  char.targetX = e.x
  char.targetY = e.y
  char.moving = true
  if (e.x !== char.x) {
    char.direction = e.x > char.x ? 1 : -1
  }
  tapMarker = { x: e.x, y: e.y, alpha: 1 }
})

// --- 更新 ---
function update(dt: number): void {
  if (!char.moving) return

  const dx = char.targetX - char.x
  const dy = char.targetY - char.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist < 2) {
    char.x = char.targetX
    char.y = char.targetY
    char.moving = false
    char.walkPhase = 0
    return
  }

  const step = SPEED * dt
  if (step >= dist) {
    char.x = char.targetX
    char.y = char.targetY
    char.moving = false
    char.walkPhase = 0
  } else {
    char.x += (dx / dist) * step
    char.y += (dy / dist) * step
    char.walkPhase += dt * 8
  }

  // タップマーカーのフェードアウト
  if (tapMarker) {
    tapMarker.alpha -= dt * 2
    if (tapMarker.alpha <= 0) tapMarker = null
  }
}

// --- 描画 ---
function draw(): void {
  const { w, h } = getCanvasSize()

  // 背景 (空のグラデーション)
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#87CEEB')
  grad.addColorStop(1, '#E0F0FF')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // 地面
  ctx.fillStyle = '#6B8E23'
  ctx.fillRect(0, h - GROUND_HEIGHT, w, GROUND_HEIGHT)
  ctx.fillStyle = '#556B2F'
  ctx.fillRect(0, h - GROUND_HEIGHT, w, 3)

  // タップマーカー
  if (tapMarker) {
    ctx.save()
    ctx.globalAlpha = tapMarker.alpha
    ctx.strokeStyle = '#FFD700'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(tapMarker.x, tapMarker.y, 16, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(tapMarker.x - 8, tapMarker.y)
    ctx.lineTo(tapMarker.x + 8, tapMarker.y)
    ctx.moveTo(tapMarker.x, tapMarker.y - 8)
    ctx.lineTo(tapMarker.x, tapMarker.y + 8)
    ctx.stroke()
    ctx.restore()
  }

  // キャラクター描画
  drawCharacter(char)

  // ヒント
  if (!char.moving && !tapMarker) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('タップ/クリックするとキャラが歩きます', w / 2, 50)
  }
}

function drawCharacter(c: Character): void {
  const s = CHAR_SIZE
  const legSwing = c.moving ? Math.sin(c.walkPhase) * 6 : 0
  const armSwing = c.moving ? Math.sin(c.walkPhase) * 5 : 0
  const bounce = c.moving ? Math.abs(Math.sin(c.walkPhase)) * 3 : 0

  ctx.save()
  ctx.translate(c.x, c.y - bounce)

  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.beginPath()
  ctx.ellipse(0, s * 0.7, s * 0.5, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  const dir = c.direction

  // 足（後ろ）
  ctx.fillStyle = '#4A4A8A'
  ctx.fillRect(-4 * dir, s * 0.2, 6, s * 0.4)
  ctx.save()
  ctx.translate(-1 * dir, s * 0.2)
  ctx.rotate((-legSwing * Math.PI) / 180)
  ctx.fillRect(-3, 0, 6, s * 0.4)
  ctx.restore()

  // 体
  ctx.fillStyle = '#FF6B6B'
  roundRect(ctx, -s * 0.3, -s * 0.35, s * 0.6, s * 0.55, 4)

  // 腕（後ろ）
  ctx.fillStyle = '#FF8888'
  ctx.save()
  ctx.translate(-s * 0.3 * dir, -s * 0.25)
  ctx.rotate((-armSwing * Math.PI) / 180)
  ctx.fillRect(-2, 0, 5, s * 0.35)
  ctx.restore()

  // 腕（前）
  ctx.save()
  ctx.translate(s * 0.3 * dir, -s * 0.25)
  ctx.rotate((armSwing * Math.PI) / 180)
  ctx.fillRect(-2, 0, 5, s * 0.35)
  ctx.restore()

  // 足（前）
  ctx.fillStyle = '#3A3A7A'
  ctx.save()
  ctx.translate(1 * dir, s * 0.2)
  ctx.rotate((legSwing * Math.PI) / 180)
  ctx.fillRect(-3, 0, 6, s * 0.4)
  ctx.restore()

  // 頭
  ctx.fillStyle = '#FFD5AA'
  ctx.beginPath()
  ctx.arc(0, -s * 0.5, s * 0.28, 0, Math.PI * 2)
  ctx.fill()

  // 目
  ctx.fillStyle = '#333'
  ctx.beginPath()
  ctx.arc(5 * dir, -s * 0.54, 2.5, 0, Math.PI * 2)
  ctx.fill()

  // 口
  ctx.beginPath()
  ctx.arc(6 * dir, -s * 0.44, 2, 0, Math.PI)
  ctx.stroke()

  ctx.restore()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

// --- スタート ---
startLoop(update, draw)
