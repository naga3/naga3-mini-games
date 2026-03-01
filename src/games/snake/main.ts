import { setupCanvas, getCanvasSize } from '../../common/canvas'
import { startLoop } from '../../common/game-loop'
import { setupPointer } from '../../common/input'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = setupCanvas(canvas)

// ---------- 定数 ----------
const SPEED = 200          // px/sec
const TURN_RADIUS = 50     // 旋回半径
const ANGULAR_SPEED = SPEED / TURN_RADIUS // rad/sec
const SEG_R = 7            // セグメント半径
const SEG_SPACING = SEG_R * 2 // セグメント間の距離
const INITIAL_SEGS = 5
const FOOD_R = 7
const WALL = 4             // 壁の太さ
const SELF_SKIP = 12       // 自己衝突チェックで先頭から飛ばすセグメント数

// ---------- 型 ----------
interface Pt { x: number; y: number }

// ---------- 状態 ----------
let headX = 0
let headY = 0
let angle = 0          // 進行方向(rad)
let clockwise = true
let trail: Pt[] = []
let segCount = INITIAL_SEGS
let food: Pt = { x: 0, y: 0 }
let foodPhase = 0       // エサの脈動アニメ用
let score = 0
let hiScore = +(localStorage.getItem('snake-hi') ?? '0')
let gameOver = false
let started = false

// ---------- 初期化 ----------
function init() {
  const { w, h } = getCanvasSize()
  headX = w / 2
  headY = h / 2
  angle = -Math.PI / 2 // 上向き
  clockwise = true
  trail = []
  segCount = INITIAL_SEGS
  score = 0
  gameOver = false

  // 軌跡を真下に事前充填(頭が上向きなので身体は下に伸びる)
  const need = segCount * SEG_SPACING + 60
  for (let i = 0; i <= need; i++) {
    trail.push({ x: headX, y: headY + i })
  }

  spawnFood()
}

function spawnFood() {
  const { w, h } = getCanvasSize()
  const m = WALL + FOOD_R + 10
  const segments = getSegments()

  // 蛇と重ならない位置に置く(最大 50 回試行)
  for (let tries = 0; tries < 50; tries++) {
    const fx = m + Math.random() * (w - m * 2)
    const fy = m + Math.random() * (h - m * 2)
    let onSnake = false
    for (const s of segments) {
      if (dist(fx, fy, s.x, s.y) < SEG_R + FOOD_R + 4) { onSnake = true; break }
    }
    if (!onSnake) {
      food = { x: fx, y: fy }
      return
    }
  }
  // 50 回超えたらそのまま置く
  food = {
    x: m + Math.random() * (w - m * 2),
    y: m + Math.random() * (h - m * 2),
  }
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by
  return Math.sqrt(dx * dx + dy * dy)
}

// ---------- セグメント取得(距離ベース) ----------
function getSegments(): Pt[] {
  const segs: Pt[] = []
  if (trail.length === 0) return segs

  segs.push(trail[0])
  let acc = 0

  for (let i = 1; i < trail.length && segs.length < segCount; i++) {
    acc += dist(trail[i].x, trail[i].y, trail[i - 1].x, trail[i - 1].y)
    if (acc >= SEG_SPACING) {
      segs.push(trail[i])
      acc = 0
    }
  }
  return segs
}

// ---------- 更新 ----------
function update(dt: number) {
  if (gameOver || !started) {
    foodPhase += dt
    return
  }

  foodPhase += dt

  // 角度を更新
  angle += ANGULAR_SPEED * (clockwise ? 1 : -1) * dt

  // 位置を更新
  headX += Math.cos(angle) * SPEED * dt
  headY += Math.sin(angle) * SPEED * dt

  // 軌跡に追加
  trail.unshift({ x: headX, y: headY })

  // 軌跡の上限
  const maxLen = (segCount + 5) * SEG_SPACING * 5
  if (trail.length > maxLen) trail.length = maxLen

  // --- 壁衝突 ---
  const { w, h } = getCanvasSize()
  if (
    headX - SEG_R < WALL || headX + SEG_R > w - WALL ||
    headY - SEG_R < WALL || headY + SEG_R > h - WALL
  ) {
    endGame()
    return
  }

  // --- エサ衝突 ---
  if (dist(headX, headY, food.x, food.y) < SEG_R + FOOD_R) {
    segCount++
    score++
    if (score > hiScore) {
      hiScore = score
      localStorage.setItem('snake-hi', String(hiScore))
    }
    spawnFood()
  }

  // --- 自己衝突 ---
  const segments = getSegments()
  for (let i = SELF_SKIP; i < segments.length; i++) {
    if (dist(headX, headY, segments[i].x, segments[i].y) < SEG_R * 1.8) {
      endGame()
      return
    }
  }
}

function endGame() {
  gameOver = true
}

// ---------- 描画 ----------
function draw() {
  const { w, h } = getCanvasSize()

  // 背景
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, w, h)

  // 壁
  ctx.strokeStyle = '#e94560'
  ctx.lineWidth = WALL
  ctx.strokeRect(WALL / 2, WALL / 2, w - WALL, h - WALL)

  // エサ(脈動)
  const pulse = 1 + 0.15 * Math.sin(foodPhase * 4)
  ctx.beginPath()
  ctx.arc(food.x, food.y, FOOD_R * pulse, 0, Math.PI * 2)
  ctx.fillStyle = '#e94560'
  ctx.fill()
  // エサの光彩
  ctx.beginPath()
  ctx.arc(food.x, food.y, FOOD_R * pulse + 4, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(233,69,96,0.3)'
  ctx.lineWidth = 2
  ctx.stroke()

  // 蛇
  const segments = getSegments()
  for (let i = segments.length - 1; i >= 0; i--) {
    const t = 1 - i / Math.max(segments.length - 1, 1)
    const r = SEG_R * (0.6 + 0.4 * t) // 尻尾ほど小さい

    ctx.beginPath()
    ctx.arc(segments[i].x, segments[i].y, r, 0, Math.PI * 2)

    if (i === 0) {
      ctx.fillStyle = '#4ecca3'
    } else {
      const green = Math.floor(160 + t * 80)
      const blue = Math.floor(80 + t * 60)
      ctx.fillStyle = `rgb(30, ${green}, ${blue})`
    }
    ctx.fill()
  }

  // 目
  if (segments.length > 0) {
    const hd = segments[0]
    const eo = SEG_R * 0.45
    for (const side of [-0.5, 0.5]) {
      ctx.beginPath()
      ctx.arc(
        hd.x + Math.cos(angle + side) * eo,
        hd.y + Math.sin(angle + side) * eo,
        2.5, 0, Math.PI * 2,
      )
      ctx.fillStyle = '#fff'
      ctx.fill()
    }
  }

  // 回転方向インジケーター
  if (started && !gameOver) {
    drawRotationIndicator(w)
  }

  // スコア
  ctx.fillStyle = '#eee'
  ctx.font = '16px monospace'
  ctx.textAlign = 'right'
  ctx.fillText(`Score: ${score}`, w - 12, 24)
  ctx.fillStyle = '#888'
  ctx.font = '12px monospace'
  ctx.fillText(`Hi: ${hiScore}`, w - 12, 42)

  // 開始画面
  if (!started) {
    drawOverlay(w, h)
    ctx.fillStyle = '#eee'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Snake', w / 2, h / 2 - 40)
    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#ccc'
    ctx.fillText('円を描いて進むヘビ', w / 2, h / 2 - 10)
    ctx.fillText('タップで回転方向を切り替え', w / 2, h / 2 + 16)
    ctx.font = '14px sans-serif'
    ctx.fillStyle = '#4ecca3'
    ctx.fillText('タップでスタート', w / 2, h / 2 + 50)
  }

  // ゲームオーバー
  if (gameOver) {
    drawOverlay(w, h)
    ctx.fillStyle = '#e94560'
    ctx.font = 'bold 32px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('GAME OVER', w / 2, h / 2 - 24)
    ctx.fillStyle = '#eee'
    ctx.font = '20px sans-serif'
    ctx.fillText(`Score: ${score}`, w / 2, h / 2 + 12)
    if (score === hiScore && score > 0) {
      ctx.fillStyle = '#f0c040'
      ctx.font = '14px sans-serif'
      ctx.fillText('🏆 New Record!', w / 2, h / 2 + 36)
    }
    ctx.fillStyle = '#aaa'
    ctx.font = '14px sans-serif'
    ctx.fillText('タップでリトライ', w / 2, h / 2 + 62)
  }
}

function drawOverlay(w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, w, h)
}

function drawRotationIndicator(w: number) {
  const ix = w - 32
  const iy = 60
  const ir = 10
  const startA = -Math.PI / 2
  const endA = startA + (clockwise ? 1 : -1) * Math.PI * 1.2

  ctx.beginPath()
  ctx.arc(ix, iy, ir, startA, endA, !clockwise)
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 2
  ctx.stroke()

  // 矢じり
  const ax = ix + Math.cos(endA) * ir
  const ay = iy + Math.sin(endA) * ir
  const arrowAngle = endA + (clockwise ? Math.PI / 2 : -Math.PI / 2)
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(ax + Math.cos(arrowAngle - 0.5) * 5, ay + Math.sin(arrowAngle - 0.5) * 5)
  ctx.lineTo(ax + Math.cos(arrowAngle + 0.5) * 5, ay + Math.sin(arrowAngle + 0.5) * 5)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fill()
}

// ---------- 入力 ----------
setupPointer(canvas, () => {
  if (gameOver) {
    init()
    started = true
    return
  }
  if (!started) {
    started = true
    return
  }
  clockwise = !clockwise
})

// ---------- 起動 ----------
init()
startLoop(update, draw)
