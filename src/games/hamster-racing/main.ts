import { setupCanvas, getCanvasSize } from '../../common/canvas'
import { startLoop } from '../../common/game-loop'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = setupCanvas(canvas)

// ---------- 定数 ----------
const TURN_RATE = 3.0       // 押下中の旋回速度 (rad/s)
const INITIAL_SPEED = 100   // 初期速度 (px/s)
const SPEED_ACCEL = 6       // 加速度 (px/s²)
const MAX_SPEED = 400       // 最大速度
const HAMSTER_R = 10        // ハムスター半径
const TRACK_STEPS = 120     // トラック描画の分割数

// ---------- トラックパラメータ ----------
let tcx = 0, tcy = 0       // トラック中心
let tR = 0                  // 中心線の半径
let tWBase = 0              // 基本トラック半幅
let tWVar = 0               // 半幅の変動量（左側が狭い）

function calcTrack() {
  const { w, h } = getCanvasSize()
  tcx = w / 2
  tcy = h / 2
  const m = Math.min(w, h)
  tR = m * 0.32
  tWBase = m * 0.14
  tWVar = m * 0.03
}

/** 角度 a でのトラック半幅（右が広く左が狭い） */
function halfW(a: number): number {
  return (tWBase + tWVar * Math.cos(a)) / 2
}

// ---------- 状態 ----------
let hx = 0, hy = 0
let heading = 0
let speed = INITIAL_SPEED
let pressing = false
let gameOver = false
let started = false
let elapsed = 0
let laps = 0
let prevA = 0
let cumA = 0
let bestLaps = +(localStorage.getItem('hamster-best') ?? '0')
let runPhase = 0

// ---------- 初期化 ----------
function init() {
  calcTrack()
  // 右側からスタート（反時計回り、上向き）
  hx = tcx + tR
  hy = tcy
  heading = -Math.PI / 2
  speed = INITIAL_SPEED
  gameOver = false
  elapsed = 0
  laps = 0
  prevA = 0
  cumA = 0
  runPhase = 0
}

// ---------- 更新 ----------
function update(dt: number) {
  if (gameOver || !started) return

  elapsed += dt
  speed = Math.min(INITIAL_SPEED + SPEED_ACCEL * elapsed, MAX_SPEED)
  runPhase += speed * dt * 0.3

  if (pressing) {
    heading -= TURN_RATE * dt
  }

  hx += Math.cos(heading) * speed * dt
  hy += Math.sin(heading) * speed * dt

  // コース外判定
  const a = Math.atan2(hy - tcy, hx - tcx)
  const d = Math.hypot(hx - tcx, hy - tcy)
  const hw = halfW(a)

  if (d < tR - hw + HAMSTER_R * 0.6 || d > tR + hw - HAMSTER_R * 0.6) {
    gameOver = true
    if (laps > bestLaps) {
      bestLaps = laps
      localStorage.setItem('hamster-best', String(bestLaps))
    }
    return
  }

  // 周回カウント（反時計回り = 角度が減少する方向）
  let da = a - prevA
  if (da > Math.PI) da -= 2 * Math.PI
  if (da < -Math.PI) da += 2 * Math.PI
  cumA += da
  prevA = a
  laps = Math.floor(Math.abs(cumA) / (2 * Math.PI))
}

// ---------- 描画 ----------
function draw() {
  const { w, h } = getCanvasSize()

  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, w, h)

  drawTrack()
  drawHamster()
  drawUI(w)

  if (!started) drawStart(w, h)
  if (gameOver) drawGameOverScreen(w, h)
}

function drawTrack() {
  // コース面（外縁→内縁の逆回りで閉じたパス）
  ctx.beginPath()
  for (let i = 0; i <= TRACK_STEPS; i++) {
    const a = (i / TRACK_STEPS) * Math.PI * 2
    const r = tR + halfW(a)
    const x = tcx + Math.cos(a) * r
    const y = tcy + Math.sin(a) * r
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  for (let i = TRACK_STEPS; i >= 0; i--) {
    const a = (i / TRACK_STEPS) * Math.PI * 2
    const r = tR - halfW(a)
    const x = tcx + Math.cos(a) * r
    const y = tcy + Math.sin(a) * r
    ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = '#3d2b1a'
  ctx.fill()

  // 外壁
  drawEdge(1, '#8b6914', 3)
  // 内壁
  drawEdge(-1, '#8b6914', 3)

  // センターライン（破線）
  ctx.setLineDash([8, 8])
  ctx.beginPath()
  for (let i = 0; i <= TRACK_STEPS; i++) {
    const a = (i / TRACK_STEPS) * Math.PI * 2
    const x = tcx + Math.cos(a) * tR
    const y = tcy + Math.sin(a) * tR
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.setLineDash([])

  // スタートライン（右側）
  ctx.beginPath()
  ctx.moveTo(tcx + tR - halfW(0), tcy)
  ctx.lineTo(tcx + tR + halfW(0), tcy)
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawEdge(sign: number, color: string, width: number) {
  ctx.beginPath()
  for (let i = 0; i <= TRACK_STEPS; i++) {
    const a = (i / TRACK_STEPS) * Math.PI * 2
    const r = tR + sign * halfW(a)
    const x = tcx + Math.cos(a) * r
    const y = tcy + Math.sin(a) * r
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

function drawHamster() {
  ctx.save()
  ctx.translate(hx, hy)
  ctx.rotate(heading)

  const legOff = Math.sin(runPhase) * 3

  // 足（4本）
  ctx.fillStyle = '#d2891b'
  for (const fx of [-0.5, 0.5]) {
    for (const fy of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(
        fx * HAMSTER_R * 0.5 + (fy > 0 ? legOff : -legOff),
        fy * HAMSTER_R * 0.65,
        2.5, 0, Math.PI * 2,
      )
      ctx.fill()
    }
  }

  // 胴体
  ctx.beginPath()
  ctx.ellipse(0, 0, HAMSTER_R, HAMSTER_R * 0.75, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#f4a460'
  ctx.fill()
  ctx.strokeStyle = '#d2891b'
  ctx.lineWidth = 0.8
  ctx.stroke()

  // お腹
  ctx.beginPath()
  ctx.ellipse(HAMSTER_R * 0.1, 0, HAMSTER_R * 0.45, HAMSTER_R * 0.35, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#ffe4c4'
  ctx.fill()

  // 耳
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(-HAMSTER_R * 0.5, s * HAMSTER_R * 0.55, HAMSTER_R * 0.28, 0, Math.PI * 2)
    ctx.fillStyle = '#f4a460'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(-HAMSTER_R * 0.5, s * HAMSTER_R * 0.55, HAMSTER_R * 0.16, 0, Math.PI * 2)
    ctx.fillStyle = '#ffb6c1'
    ctx.fill()
  }

  // 目
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(HAMSTER_R * 0.35, s * HAMSTER_R * 0.2, 1.8, 0, Math.PI * 2)
    ctx.fillStyle = '#222'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(HAMSTER_R * 0.42, s * HAMSTER_R * 0.15, 0.7, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
  }

  // 鼻
  ctx.beginPath()
  ctx.arc(HAMSTER_R * 0.7, 0, 1.5, 0, Math.PI * 2)
  ctx.fillStyle = '#ffaaaa'
  ctx.fill()

  // しっぽ
  ctx.beginPath()
  ctx.arc(-HAMSTER_R, 0, 2, 0, Math.PI * 2)
  ctx.fillStyle = '#e8a050'
  ctx.fill()

  ctx.restore()
}

function drawUI(w: number) {
  ctx.fillStyle = '#eee'
  ctx.font = '16px monospace'
  ctx.textAlign = 'right'
  ctx.fillText(`Lap: ${laps}`, w - 12, 24)

  ctx.fillStyle = '#888'
  ctx.font = '12px monospace'
  ctx.fillText(`Best: ${bestLaps}`, w - 12, 42)

  // スピードバー
  if (started && !gameOver) {
    const pct = (speed - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED)
    const bw = 60, bh = 6
    const bx = w - 12 - bw, by = 52
    ctx.fillStyle = '#333'
    ctx.fillRect(bx, by, bw, bh)
    const r = Math.floor(180 + pct * 75)
    const g = Math.floor(180 - pct * 140)
    ctx.fillStyle = `rgb(${r},${g},50)`
    ctx.fillRect(bx, by, bw * pct, bh)
  }
}

function drawOverlay(w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, w, h)
}

function drawStart(w: number, h: number) {
  drawOverlay(w, h)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f4a460'
  ctx.font = 'bold 28px sans-serif'
  ctx.fillText('Hamster Racing', w / 2, h / 2 - 40)
  ctx.fillStyle = '#ccc'
  ctx.font = '16px sans-serif'
  ctx.fillText('コースを走り続けよう！', w / 2, h / 2 - 10)
  ctx.fillText('押している間 ← 左に曲がる', w / 2, h / 2 + 16)
  ctx.fillStyle = '#f4a460'
  ctx.font = '14px sans-serif'
  ctx.fillText('タップでスタート', w / 2, h / 2 + 50)
}

function drawGameOverScreen(w: number, h: number) {
  drawOverlay(w, h)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#e94560'
  ctx.font = 'bold 32px sans-serif'
  ctx.fillText('GAME OVER', w / 2, h / 2 - 24)
  ctx.fillStyle = '#eee'
  ctx.font = '20px sans-serif'
  ctx.fillText(`${laps} Laps`, w / 2, h / 2 + 12)
  if (laps === bestLaps && laps > 0) {
    ctx.fillStyle = '#f0c040'
    ctx.font = '14px sans-serif'
    ctx.fillText('New Record!', w / 2, h / 2 + 36)
  }
  ctx.fillStyle = '#aaa'
  ctx.font = '14px sans-serif'
  ctx.fillText('タップでリトライ', w / 2, h / 2 + 62)
}

// ---------- 入力（押下/解放で操作） ----------
function handleDown() {
  if (gameOver) { init(); started = true; pressing = true; return }
  if (!started) { started = true; pressing = true; return }
  pressing = true
}

canvas.addEventListener('mousedown', (e) => { e.preventDefault(); handleDown() })
canvas.addEventListener('mouseup', () => { pressing = false })
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleDown() }, { passive: false })
canvas.addEventListener('touchend', (e) => { e.preventDefault(); pressing = false }, { passive: false })
canvas.addEventListener('touchcancel', () => { pressing = false })

// ---------- 起動 ----------
init()
startLoop(update, draw)
