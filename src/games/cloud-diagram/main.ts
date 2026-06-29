// Re:Wire — AWS 構成図 Netwalk
// タイルをタップで回転させ、全 AWS サービスを 1 本のネットワークに繋げると
// 「構成図」が完成する。アイコンは常に正立、回転するのは接続パイプだけ。
import {
  generatePuzzle,
  buildStage,
  isSolved,
  computeLit,
  computeDepth,
  countOnline,
  rotateCell,
  popcount,
  SERVICES,
  LAYERS,
  LEVELS,
  type Puzzle,
  type Category,
} from './logic'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

const RANDOM_N = 8

// ===== カテゴリ色 / ラベル =====
const CAT_COLOR: Record<Category, string> = {
  network: '#8C4FFF',
  compute: '#ED7100',
  integration: '#E7157B',
  database: '#4D9FFF',
  storage: '#3FB950',
}
const CAT_LABEL: Record<Category, string> = {
  network: 'Network',
  compute: 'Compute',
  integration: 'Messaging',
  database: 'Database',
  storage: 'Storage',
}

// ===== 状態 =====
let W = 0
let H = 0
let dpr = 1
let cellSize = 0
let boardX = 0
let boardY = 0
let boardW = 0
let boardH = 0

type Mode = 'stage' | 'random'
let mode: Mode = 'stage'
let stageIndex = 0

let puzzle: Puzzle
let dispTurns: number[] = [] // 表示用の回転（rot へ滑らかに追従）
let lit: boolean[] = []
let litPrev: boolean[] = [] // 起動演出のための前フレーム点灯状態
let pulse: number[] = [] // 各タイルの起動パルス（1 → 0）
let depth: number[] = []
let maxDepth = 0

let online = 0
let total = 0
let moves = 0
let startTime = 0 // 最初の操作時刻（0 = まだ未操作）
let elapsedMs = 0
let solved = false
let solveAnimT = 0

const FLOW_SPEED = 7 // クリア演出で光が広がる速さ（深さ/秒）
const PULSE_DUR = 0.45 // 起動パルスの長さ（秒）

// ボタンの当たり判定
interface Btn {
  x: number
  y: number
  w: number
  h: number
  kind: 'stage' | 'random'
  index: number
}
let buttons: Btn[] = []

// ===== サウンド（WebAudio・アセット不要） =====
let actx: AudioContext | null = null
function audio(): AudioContext | null {
  try {
    if (!actx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      actx = new AC()
    }
    if (actx.state === 'suspended') actx.resume()
    return actx
  } catch {
    return null
  }
}
function blip(freq: number, dur: number, type: OscillatorType, gain: number) {
  const a = audio()
  if (!a) return
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.value = freq
  o.connect(g)
  g.connect(a.destination)
  const t = a.currentTime
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.start(t)
  o.stop(t + dur)
}
function playPop(k: number) {
  blip(520 + Math.min(k - 1, 6) * 55, 0.12, 'triangle', 0.05)
}
function playClear() {
  const notes = [523, 659, 784, 1047]
  notes.forEach((f, i) => setTimeout(() => blip(f, 0.2, 'sine', 0.06), i * 95))
}

// ===== ベストスコア =====
function ctxKey(): string {
  return mode === 'stage' ? `rewire-stage-${stageIndex}` : `rewire-rand-${RANDOM_N}`
}
function loadBest(): number {
  const v = localStorage.getItem(ctxKey())
  return v == null ? 0 : Number(v)
}
function saveBestIfBetter(m: number) {
  const b = loadBest()
  if (b === 0 || m < b) localStorage.setItem(ctxKey(), String(m))
}

// ===== 初期化 =====
function startStage(i: number) {
  mode = 'stage'
  stageIndex = i
  puzzle = buildStage(LEVELS[i])
  initFromPuzzle()
}
function startRandom() {
  mode = 'random'
  puzzle = generatePuzzle(RANDOM_N, RANDOM_N)
  initFromPuzzle()
}
function initFromPuzzle() {
  dispTurns = puzzle.rot.slice() // 出題状態から開始（最初の回転で動かない）
  pulse = new Array(puzzle.rows * puzzle.cols).fill(0)
  moves = 0
  startTime = 0
  elapsedMs = 0
  solved = false
  solveAnimT = 0
  lit = computeLit(puzzle)
  litPrev = lit.slice()
  const cc = countOnline(puzzle, lit)
  online = cc.online
  total = cc.total
  layout()
}

function advanceAfterClear() {
  if (mode === 'stage' && stageIndex + 1 < LEVELS.length) startStage(stageIndex + 1)
  else startRandom()
}

// タップ後：点灯を再計算し、新たに繋がったタイルを起動演出する
function afterRotate() {
  const newLit = computeLit(puzzle)
  let connected = 0
  for (let i = 0; i < newLit.length; i++) {
    if (newLit[i] && !litPrev[i] && puzzle.present[i]) {
      pulse[i] = 1
      connected++
    }
  }
  litPrev = newLit
  lit = newLit
  const cc = countOnline(puzzle, lit)
  online = cc.online
  total = cc.total
  if (connected > 0) playPop(connected)
}

// ===== レイアウト =====
function resize() {
  dpr = window.devicePixelRatio || 1
  W = window.innerWidth
  H = window.innerHeight
  canvas.width = Math.floor(W * dpr)
  canvas.height = Math.floor(H * dpr)
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  layout()
}

function layout() {
  if (!puzzle) return
  const { rows, cols } = puzzle
  const marginX = 10
  const leftGutter = Math.round(Math.min(84, Math.max(48, W * 0.13)))
  const topHeader = 92
  const bottomBar = 80
  const availW = W - marginX * 2 - leftGutter
  const availH = H - topHeader - bottomBar
  cellSize = Math.floor(Math.min(availW / cols, availH / rows, 120))
  boardW = cellSize * cols
  boardH = cellSize * rows
  boardX = Math.floor(leftGutter + marginX + (availW - boardW) / 2)
  // 縦は中央やや上寄せ（小さいステージが画面中央でぽつんと浮かないように）
  boardY = Math.floor(topHeader + (availH - boardH) * 0.38)
}

// ===== 入力 =====
function handleTap(px: number, py: number) {
  for (const b of buttons) {
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
      if (b.kind === 'stage') startStage(b.index)
      else startRandom()
      return
    }
  }
  if (solved) {
    advanceAfterClear()
    return
  }
  const c = Math.floor((px - boardX) / cellSize)
  const r = Math.floor((py - boardY) / cellSize)
  if (r < 0 || r >= puzzle.rows || c < 0 || c >= puzzle.cols) return
  const i = r * puzzle.cols + c
  if (!puzzle.present[i] || popcount(puzzle.base[i]) === 0) return
  rotateCell(puzzle, i)
  moves++
  if (startTime === 0) startTime = performance.now()
  afterRotate()
  if (isSolved(puzzle)) {
    solved = true
    solveAnimT = 0
    depth = computeDepth(puzzle)
    maxDepth = depth.reduce((a, b) => Math.max(a, b), 0)
    saveBestIfBetter(moves)
    playClear()
  }
}

canvas.addEventListener('click', (e) => handleTap(e.clientX, e.clientY))
canvas.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault()
    const t = e.touches[0]
    handleTap(t.clientX, t.clientY)
  },
  { passive: false },
)

// ===== 更新 =====
function update(dt: number) {
  const k = 1 - Math.exp(-dt * 16)
  for (let i = 0; i < dispTurns.length; i++) {
    dispTurns[i] += (puzzle.rot[i] - dispTurns[i]) * k
    if (pulse[i] > 0) pulse[i] = Math.max(0, pulse[i] - dt / PULSE_DUR)
  }
  if (solved) {
    solveAnimT += dt
  } else if (startTime !== 0) {
    elapsedMs = performance.now() - startTime
  }
}

// ===== 描画 =====
function roundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fitFont(text: string, maxW: number, startPx: number, weight = '600'): number {
  let px = startPx
  ctx.font = `${weight} ${px}px sans-serif`
  while (ctx.measureText(text).width > maxW && px > 7) {
    px--
    ctx.font = `${weight} ${px}px sans-serif`
  }
  return px
}

function drawGlyph(cat: Category, key: string, x: number, y: number, s: number, col: string) {
  ctx.save()
  ctx.strokeStyle = col
  ctx.fillStyle = col
  ctx.lineWidth = Math.max(1.2, s * 0.07)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const u = s * 0.5 // 半径目安
  if (key === 'lambda') {
    ctx.font = `700 ${s * 0.9}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('λ', x, y + s * 0.04)
  } else if (cat === 'network') {
    // 地球儀
    ctx.beginPath()
    ctx.arc(x, y, u * 0.78, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(x, y, u * 0.32, u * 0.78, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - u * 0.78, y)
    ctx.lineTo(x + u * 0.78, y)
    ctx.stroke()
  } else if (cat === 'compute') {
    // チップ
    roundRect(x - u * 0.5, y - u * 0.5, u, u, u * 0.12)
    ctx.stroke()
    for (let i = -1; i <= 1; i++) {
      const o = i * u * 0.3
      ctx.beginPath(); ctx.moveTo(x + o, y - u * 0.5); ctx.lineTo(x + o, y - u * 0.72); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x + o, y + u * 0.5); ctx.lineTo(x + o, y + u * 0.72); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x - u * 0.5, y + o); ctx.lineTo(x - u * 0.72, y + o); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x + u * 0.5, y + o); ctx.lineTo(x + u * 0.72, y + o); ctx.stroke()
    }
  } else if (cat === 'integration') {
    // 封筒（メッセージング）
    const w = u * 1.0
    const h = u * 0.72
    roundRect(x - w / 2, y - h / 2, w, h, u * 0.1)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - w / 2, y - h / 2)
    ctx.lineTo(x, y + h * 0.12)
    ctx.lineTo(x + w / 2, y - h / 2)
    ctx.stroke()
  } else if (cat === 'database') {
    // 円柱
    const w = u * 0.8
    const h = u * 1.0
    ctx.beginPath(); ctx.ellipse(x, y - h / 2, w / 2, w * 0.22, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - w / 2, y - h / 2)
    ctx.lineTo(x - w / 2, y + h / 2)
    ctx.moveTo(x + w / 2, y - h / 2)
    ctx.lineTo(x + w / 2, y + h / 2)
    ctx.stroke()
    ctx.beginPath(); ctx.ellipse(x, y + h / 2, w / 2, w * 0.22, 0, 0, Math.PI); ctx.stroke()
  } else if (key === 'backup') {
    // 盾
    ctx.beginPath()
    ctx.moveTo(x, y - u * 0.7)
    ctx.lineTo(x + u * 0.55, y - u * 0.4)
    ctx.lineTo(x + u * 0.55, y + u * 0.2)
    ctx.quadraticCurveTo(x + u * 0.55, y + u * 0.7, x, y + u * 0.78)
    ctx.quadraticCurveTo(x - u * 0.55, y + u * 0.7, x - u * 0.55, y + u * 0.2)
    ctx.lineTo(x - u * 0.55, y - u * 0.4)
    ctx.closePath()
    ctx.stroke()
  } else {
    // バケツ（ストレージ）
    const top = u * 0.7
    const bot = u * 0.48
    ctx.beginPath()
    ctx.moveTo(x - top, y - u * 0.55)
    ctx.lineTo(x + top, y - u * 0.55)
    ctx.lineTo(x + bot, y + u * 0.62)
    ctx.lineTo(x - bot, y + u * 0.62)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath(); ctx.ellipse(x, y - u * 0.55, top, top * 0.28, 0, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.restore()
}

function tileGlow(i: number): number {
  if (!solved) return 0
  const front = solveAnimT * FLOW_SPEED
  const d = depth[i] >= 0 ? depth[i] : 0
  return Math.exp(-((front - d) * (front - d)) / 1.4)
}

// パイプは盤内にクリップして描くので、開放端が HUD にはみ出さない
function drawPipes(i: number, r: number, c: number) {
  if (!puzzle.present[i]) return
  const cx = boardX + c * cellSize + cellSize / 2
  const cy = boardY + r * cellSize + cellSize / 2
  const half = cellSize / 2
  const on = solved || lit[i]
  const glow = tileGlow(i)

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(dispTurns[i] * (Math.PI / 2))
  const pipeW = Math.max(2, cellSize * 0.12)
  ctx.lineWidth = pipeW
  ctx.lineCap = 'round'
  let pipeColor = on ? '#cfe3ff' : '#39465f'
  if (solved) pipeColor = '#ffd76a'
  ctx.strokeStyle = pipeColor
  const ends: [number, number][] = [
    [0, -half],
    [half, 0],
    [0, half],
    [-half, 0],
  ]
  for (let d = 0; d < 4; d++) {
    if (!(puzzle.base[i] & (1 << d))) continue
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(ends[d][0], ends[d][1])
    ctx.stroke()
  }
  if (solved && glow > 0.02) {
    ctx.strokeStyle = `rgba(255,255,255,${0.85 * glow})`
    ctx.lineWidth = pipeW * (0.6 + glow * 0.6)
    for (let d = 0; d < 4; d++) {
      if (!(puzzle.base[i] & (1 << d))) continue
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ends[d][0], ends[d][1]); ctx.stroke()
    }
  }
  ctx.restore()
}

// ノード（正立。回転しない）。パイプの上に重ねて描く
function drawNode(i: number, r: number, c: number) {
  if (!puzzle.present[i]) return
  const cx = boardX + c * cellSize + cellSize / 2
  const cy = boardY + r * cellSize + cellSize / 2
  const svc = SERVICES[puzzle.service[i]]
  const color = CAT_COLOR[svc.category]
  const on = solved || lit[i]
  const glow = tileGlow(i)
  const pls = pulse[i]

  // 起動パルス：外に広がるリング
  if (pls > 0) {
    const rr = cellSize * (0.34 + (1 - pls) * 0.34)
    ctx.strokeStyle = `rgba(255,255,255,${pls * 0.6})`
    ctx.lineWidth = 2 + pls * 2
    ctx.beginPath()
    ctx.arc(cx, cy, rr, 0, Math.PI * 2)
    ctx.stroke()
  }

  const ns = cellSize * (cellSize < 36 ? 0.5 : 0.46) * (1 + pls * 0.14)
  const nx = cx - ns / 2
  const ny = cy - ns / 2
  if (on) {
    const sh = Math.max(16 * glow, pls * 14)
    if (sh > 0.5) {
      ctx.shadowColor = '#ffffff'
      ctx.shadowBlur = sh
    }
    ctx.fillStyle = color
    roundRect(nx, ny, ns, ns, ns * 0.22)
    ctx.fill()
    ctx.shadowBlur = 0
  } else {
    ctx.fillStyle = '#202a3d'
    roundRect(nx, ny, ns, ns, ns * 0.22)
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.6
    roundRect(nx, ny, ns, ns, ns * 0.22)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // グリフ
  const glyphCol = on ? '#ffffff' : '#6b7c99'
  drawGlyph(svc.category, svc.key, cx, cy - (cellSize >= 40 ? ns * 0.02 : 0), ns * 0.62, glyphCol)

  // source（Internet 入口）リング
  if (i === puzzle.source) {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    roundRect(nx - 3, ny - 3, ns + 6, ns + 6, ns * 0.28)
    ctx.stroke()
  }

  // サービス名（小さく下に）
  if (cellSize >= 40) {
    const label = svc.label
    const px = fitFont(label, cellSize * 0.86, Math.max(8, cellSize * 0.17))
    ctx.font = `600 ${px}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(10,14,28,0.9)'
    ctx.strokeText(label, cx, cy + ns / 2 + 2)
    ctx.fillStyle = on ? '#e8eefc' : '#7889a6'
    ctx.fillText(label, cx, cy + ns / 2 + 2)
  }
}

function drawBoard() {
  const { rows, cols } = puzzle
  // レイヤーの帯（present タイルのカテゴリで色分け）＋ ラベル
  let prevLabel = ''
  for (let r = 0; r < rows; r++) {
    let rep: Category | null = null
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (puzzle.present[i]) {
        rep = SERVICES[puzzle.service[i]].category
        break
      }
    }
    if (!rep) continue
    ctx.fillStyle = CAT_COLOR[rep]
    ctx.globalAlpha = 0.06
    ctx.fillRect(boardX, boardY + r * cellSize, boardW, cellSize)
    ctx.globalAlpha = 1
    const labelText = mode === 'random' ? LAYERS[puzzle.layer[r * cols]].name : CAT_LABEL[rep]
    if (labelText !== prevLabel) {
      ctx.fillStyle = '#6b7c99'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      const px = fitFont(labelText, boardX - 8, Math.min(12, cellSize * 0.3))
      ctx.font = `600 ${px}px sans-serif`
      ctx.fillText(labelText, boardX - 6, boardY + r * cellSize + cellSize / 2)
      prevLabel = labelText
    }
  }
  // パイプ（盤内にクリップ）→ ノードの順で 2 パス描画
  ctx.save()
  ctx.beginPath()
  ctx.rect(boardX, boardY, boardW, boardH)
  ctx.clip()
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) drawPipes(r * cols + c, r, c)
  ctx.restore()
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) drawNode(r * cols + c, r, c)
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function drawHud() {
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  // タイトル
  ctx.fillStyle = '#fff'
  ctx.font = '700 23px sans-serif'
  ctx.fillText('Re:Wire', W / 2, 28)

  // サブタイトル（ステージ名 / ランダム）
  const sub =
    mode === 'stage'
      ? `Stage ${stageIndex + 1}　${LEVELS[stageIndex].name}`
      : `ランダム ${RANDOM_N}×${RANDOM_N}`
  ctx.fillStyle = '#aab3d6'
  ctx.font = '600 14px sans-serif'
  ctx.fillText(sub, W / 2, 49)

  // 稼働カウンタ（進捗）＋ 手数・時間
  const allOn = online >= total
  ctx.font = '600 13px sans-serif'
  const statusGreen = `稼働 ${online} / ${total}`
  const statusRest = `　⏱ ${fmtTime(elapsedMs)}　手数 ${moves}`
  const wG = ctx.measureText(statusGreen).width
  const wR = ctx.measureText(statusRest).width
  const startX = W / 2 - (wG + wR) / 2
  ctx.textAlign = 'left'
  ctx.fillStyle = allOn ? '#ffd76a' : '#3FB950'
  ctx.fillText(statusGreen, startX, 69)
  ctx.fillStyle = '#7d88a8'
  ctx.fillText(statusRest, startX + wG, 69)
}

function drawBottomBar() {
  buttons = []
  const barY = H - 66
  const pillH = 36
  const gap = 6
  const labels = ['1', '2', '3', '4', '5', 'RND']
  const totalW = Math.min(W - 20, 430)
  const pillW = (totalW - gap * (labels.length - 1)) / labels.length
  let x = (W - totalW) / 2
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (let i = 0; i < labels.length; i++) {
    const isRandom = i === labels.length - 1
    const active = isRandom ? mode === 'random' : mode === 'stage' && stageIndex === i
    ctx.fillStyle = active ? '#2b5bd7' : '#1b2440'
    roundRect(x, barY, pillW, pillH, 8)
    ctx.fill()
    if (active) {
      ctx.strokeStyle = '#5b8bff'
      ctx.lineWidth = 1.5
      roundRect(x, barY, pillW, pillH, 8)
      ctx.stroke()
    }
    ctx.fillStyle = active ? '#fff' : '#9fb0d0'
    ctx.font = `600 14px sans-serif`
    ctx.fillText(labels[i], x + pillW / 2, barY + pillH / 2 + 1)
    buttons.push({ x, y: barY, w: pillW, h: pillH, kind: isRandom ? 'random' : 'stage', index: i })
    x += pillW + gap
  }
  // 注記
  ctx.fillStyle = '#3c465e'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Unofficial — AWS service names are trademarks of Amazon.com, Inc.', W / 2, H - 12)
}

function drawClearOverlay() {
  if (!solved) return
  const front = solveAnimT * FLOW_SPEED
  if (front < maxDepth + 0.6) return // 光が末端まで届いてから出す
  const a = Math.min(1, (front - maxDepth - 0.6) * 1.5)
  ctx.fillStyle = `rgba(8,12,24,${0.74 * a})`
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = a
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffd76a'
  ctx.font = '700 30px sans-serif'
  ctx.fillText('✨ 構成完成！ ✨', W / 2, H / 2 - 56)

  if (mode === 'stage') {
    ctx.fillStyle = '#fff'
    ctx.font = '700 19px sans-serif'
    ctx.fillText(`Stage ${stageIndex + 1}　${LEVELS[stageIndex].name}`, W / 2, H / 2 - 22)
    ctx.fillStyle = '#aab3d6'
    ctx.font = '13px sans-serif'
    ctx.fillText(LEVELS[stageIndex].subtitle, W / 2, H / 2 + 2)
  }
  ctx.fillStyle = '#fff'
  ctx.font = '600 16px sans-serif'
  ctx.fillText(`${moves} 手 / ${fmtTime(elapsedMs)}`, W / 2, H / 2 + 30)
  const best = loadBest()
  if (best > 0) {
    ctx.fillStyle = '#9fb0d0'
    ctx.font = '13px sans-serif'
    ctx.fillText(`Best ${best} 手`, W / 2, H / 2 + 52)
  }
  const next =
    mode === 'stage'
      ? stageIndex + 1 < LEVELS.length
        ? 'タップで次のステージへ →'
        : 'タップでランダムへ →'
      : 'タップで次の構成へ →'
  ctx.fillStyle = '#cfe3ff'
  ctx.font = '15px sans-serif'
  ctx.fillText(next, W / 2, H / 2 + 84)
  ctx.globalAlpha = 1
}

function draw() {
  ctx.fillStyle = '#0b1020'
  ctx.fillRect(0, 0, W, H)
  drawBoard()
  drawHud()
  drawBottomBar()
  drawClearOverlay()
}

// ===== ループ =====
let prev = performance.now()
function frame(now: number) {
  const dt = Math.min((now - prev) / 1000, 0.05)
  prev = now
  update(dt)
  draw()
  requestAnimationFrame(frame)
}

window.addEventListener('resize', resize)
startStage(0)
resize()
requestAnimationFrame(frame)

// テスト用フック（URL に ?test を付けた時のみ。通常プレイには影響しない）
if (location.search.includes('test')) {
  ;(window as unknown as { __rewire: unknown }).__rewire = {
    solve() {
      for (let i = 0; i < puzzle.rot.length; i++) {
        if (puzzle.present[i]) puzzle.rot[i] += (4 - (puzzle.rot[i] % 4)) % 4
      }
      lit = computeLit(puzzle)
      litPrev = lit.slice()
      const cc = countOnline(puzzle, lit)
      online = cc.online
      total = cc.total
      if (moves === 0) moves = 1
      if (startTime === 0) startTime = performance.now()
      solved = true
      solveAnimT = 0
      depth = computeDepth(puzzle)
      maxDepth = depth.reduce((a, b) => Math.max(a, b), 0)
    },
    startStage,
    startRandom,
  }
}
