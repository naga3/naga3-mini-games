import { setupCanvas, getCanvasSize } from '../../common/canvas'
import { startLoop } from '../../common/game-loop'
import { setupPointer } from '../../common/input'
import { loadBest, saveBest } from '../../common/storage'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = setupCanvas(canvas)

// ---------- 定数 ----------
const G_SWING = 2100        // 振り子中の重力
const G_FLY = 1150          // 飛行中の重力（低めでふわっと滞空）
const DAMP = 0.9995         // 振り子の空気抵抗
const MAX_OMEGA = 7         // 角速度の上限
const R = 18                // ねこの半径
const MAX_REACH = 340       // フックを掴める距離
const ROPE_MIN = 70
const ROPE_MAX = 320
const GAP_MIN = 120
const GAP_MAX = 185
const MAX_DY = 80           // 隣り合うフックの高低差の上限（理不尽な届かないギャップを防ぐ）
const ANCHOR_TOP = 60       // フックの最上位置
const START_OMEGA = 1.4     // スタート時の振り出し

// 魚（報酬）：飛行ラインを通すと回収。位置で取りやすさが変わる＝リスク/リターン
const FISH_R = 11
const FISH_BONUS = 15       // 1匹あたりのスコア加算
const FISH_GAP_MIN = 230
const FISH_GAP_MAX = 460

// ---------- 型 ----------
interface Anchor { id: number; x: number; y: number }
interface Fish { x: number; y: number; phase: number; got: boolean }

// ---------- 状態 ----------
type State = 'swing' | 'fly'
let state: State = 'swing'
let started = false
let dead = false

let fish: Fish[] = []
let nextFishX = 0
let fishCount = 0
let t = 0   // 経過時間（魚のゆらぎ用）

let anchors: Anchor[] = []
let anchorId = 0
let nextAnchorX = 0
let cur: Anchor = { id: -1, x: 0, y: 0 }   // 現在ぶら下がっているフック
let lastId = -1                             // これより新しいフックしか掴めない（前進保証）

let theta = 0   // 真下からの角度（+で右）
let omega = 0   // 角速度
let L = 150     // ロープ長

let catX = 0
let catY = 0
let vx = 0
let vy = 0

let camX = 0
let maxX = 0
let dist = 0
let lastAnchorY = 0   // 直前フックの高さ（高低差を抑える生成に使う）
let best = loadBest('cat-swing-best')

// 背景の星（一度だけ生成・ちらつかせない）
const stars = Array.from({ length: 70 }, () => ({
  fx: Math.random(),
  fy: Math.random() * 0.55,
  r: Math.random() * 1.4 + 0.4,
  a: Math.random() * 0.5 + 0.3,
}))

// ---------- フック生成 ----------
function anchorBottom() { return getCanvasSize().h * 0.42 }

function addAnchor() {
  // 隣のフックとの高低差を MAX_DY 以内に抑える → どのギャップも必ず届く
  lastAnchorY += (Math.random() * 2 - 1) * MAX_DY
  lastAnchorY = Math.max(ANCHOR_TOP, Math.min(anchorBottom(), lastAnchorY))
  anchors.push({ id: anchorId++, x: nextAnchorX, y: lastAnchorY })
  // 進むほど間隔が広がる（距離とともに難しくなる＝いつかは必ず落ちる）
  const gapMax = GAP_MAX + Math.min(240, dist * 0.04)
  nextAnchorX += GAP_MIN + Math.random() * (gapMax - GAP_MIN)
}

function addFish() {
  const top = ANCHOR_TOP + 10
  const bot = anchorBottom() + 150        // 低い魚ほど谷に近く、回収はハイリスク
  const y = top + Math.random() * (bot - top)
  fish.push({ x: nextFishX, y, phase: Math.random() * Math.PI * 2, got: false })
  nextFishX += FISH_GAP_MIN + Math.random() * (FISH_GAP_MAX - FISH_GAP_MIN)
}

function genAnchors() {
  const { w } = getCanvasSize()
  while (nextAnchorX < camX + w * 2) addAnchor()
  while (nextFishX < camX + w * 2) addFish()
  // 画面後方のフック・魚は破棄（現在のフックは残す）
  anchors = anchors.filter(a => a.x > camX - w * 0.6 || a.id === cur.id)
  fish = fish.filter(f => f.x > camX - w * 0.6)
}

function score() { return dist + fishCount * FISH_BONUS }

// ---------- 初期化 ----------
function updateCatFromSwing() {
  catX = cur.x + L * Math.sin(theta)
  catY = cur.y + L * Math.cos(theta)
}

function init() {
  const { w } = getCanvasSize()
  anchors = []
  anchorId = 0
  fish = []
  fishCount = 0
  dist = 0
  maxX = 0
  nextAnchorX = w * 0.32
  nextFishX = w * 0.7
  lastAnchorY = (ANCHOR_TOP + anchorBottom()) / 2
  addAnchor()
  cur = anchors[0]
  lastId = cur.id
  L = 150
  theta = -0.9
  omega = 0
  state = 'swing'
  started = false
  dead = false
  updateCatFromSwing()
  camX = catX - w * 0.32
  genAnchors()
}

// ---------- 入力 ----------
// タップ = ロープを離す（前方=右に振れている時だけ有効）。
// 次のフックは飛行中に自動でキャッチするので、操作は「離すタイミング」だけ。
function release() {
  // 接線速度に変換して放り出す
  vx = L * omega * Math.cos(theta)
  vy = -L * omega * Math.sin(theta)
  lastId = cur.id
  state = 'fly'
}

// 飛行中、届く範囲で一番「近い」フックに自動で掴まる。
// → 高度は自動で保たれない。雑に離すと低いフックしか掴めず沈んで落ちる＝離し方が生死を分ける。
function autoGrab() {
  let target: Anchor | null = null
  let bestD = Infinity
  for (const a of anchors) {
    if (a.id <= lastId) continue          // 前のフックには戻れない
    if (a.y > catY - 12) continue         // フックは頭上にある必要
    const d = Math.hypot(a.x - catX, a.y - catY)
    if (d <= MAX_REACH && d < bestD) { bestD = d; target = a }
  }
  if (!target) return                     // 届くフックなし → そのまま落下
  cur = target
  L = Math.max(ROPE_MIN, Math.min(ROPE_MAX, bestD))
  theta = Math.atan2(catX - cur.x, catY - cur.y)
  // 線速度の接線成分を角速度へ
  omega = (vx * Math.cos(theta) - vy * Math.sin(theta)) / L
  omega = Math.max(-MAX_OMEGA, Math.min(MAX_OMEGA, omega))
  state = 'swing'
}

function onTap() {
  if (dead) { init(); return }
  if (!started) { started = true; omega = START_OMEGA; return }
  // 離せるのは前方(右)に振れている時だけ。後ろ向きのタップは無視＝理不尽な落下を防ぐ
  if (state === 'swing' && omega > 0) release()
}
setupPointer(canvas, onTap)

// ---------- 更新 ----------
function update(dt: number) {
  if (!started || dead) return
  t += dt

  if (state === 'swing') {
    omega += -(G_SWING / L) * Math.sin(theta) * dt
    omega *= DAMP
    omega = Math.max(-MAX_OMEGA, Math.min(MAX_OMEGA, omega))
    theta += omega * dt
    updateCatFromSwing()
  } else {
    vy += G_FLY * dt
    catX += vx * dt
    catY += vy * dt
    autoGrab()   // 届くフックがあれば自動でキャッチ
  }

  camX = catX - getCanvasSize().w * 0.32
  maxX = Math.max(maxX, catX)
  dist = Math.floor(maxX / 40)
  genAnchors()

  // 魚の回収
  for (const f of fish) {
    if (f.got) continue
    if (Math.hypot(catX - f.x, catY - f.y) < R + FISH_R) {
      f.got = true
      fishCount++
    }
  }

  // 谷へ落下 → ゲームオーバー
  if (catY > getCanvasSize().h + R * 2) {
    dead = true
    if (score() > best) { best = score(); saveBest('cat-swing-best', best) }
  }
}

// ---------- 描画 ----------
function drawHills(off: number, baseY: number, color: string) {
  const { w } = getCanvasSize()
  ctx.fillStyle = color
  const step = 260
  ctx.beginPath()
  ctx.moveTo(-step, baseY + 200)
  for (let hx = -(off % step) - step; hx < w + step; hx += step) {
    ctx.quadraticCurveTo(hx + step / 2, baseY - 70, hx + step, baseY)
  }
  ctx.lineTo(w + step, baseY + 200)
  ctx.closePath()
  ctx.fill()
}

function drawAnchor(sx: number, sy: number) {
  ctx.strokeStyle = '#caa472'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(sx, sy, 7, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#8a6a44'
  ctx.beginPath()
  ctx.arc(sx, sy, 2.5, 0, Math.PI * 2)
  ctx.fill()
}

function drawFish(x: number, y: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#ffd24d'
  ctx.beginPath()
  ctx.ellipse(0, 0, FISH_R, FISH_R * 0.62, 0, 0, Math.PI * 2)
  ctx.fill()
  // 尾びれ
  ctx.beginPath()
  ctx.moveTo(FISH_R * 0.8, 0)
  ctx.lineTo(FISH_R * 1.55, -FISH_R * 0.55)
  ctx.lineTo(FISH_R * 1.55, FISH_R * 0.55)
  ctx.closePath()
  ctx.fill()
  // 目
  ctx.fillStyle = '#3a2a10'
  ctx.beginPath()
  ctx.arc(-FISH_R * 0.45, -FISH_R * 0.12, FISH_R * 0.14, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(0, 0, FISH_R, FISH_R * 0.62, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawCat(x: number, y: number, angle: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)

  // しっぽ
  ctx.strokeStyle = '#e08a3e'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-R * 0.7, R * 0.2)
  ctx.quadraticCurveTo(-R * 1.6, R * 0.1, -R * 1.3, -R * 0.7)
  ctx.stroke()

  // 体
  ctx.fillStyle = '#f6a35c'
  ctx.beginPath()
  ctx.arc(0, 0, R, 0, Math.PI * 2)
  ctx.fill()

  // 耳
  ctx.beginPath()
  ctx.moveTo(R * 0.15, -R * 0.7); ctx.lineTo(R * 0.45, -R * 1.2); ctx.lineTo(R * 0.68, -R * 0.55)
  ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(R * 0.6, -R * 0.55); ctx.lineTo(R * 0.95, -R * 0.95); ctx.lineTo(R * 1.0, -R * 0.2)
  ctx.closePath(); ctx.fill()

  // 模様
  ctx.strokeStyle = '#e08a3e'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(-R * 0.3, -R * 0.5); ctx.lineTo(-R * 0.55, -R * 0.4); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-R * 0.45, -R * 0.05); ctx.lineTo(-R * 0.7, 0); ctx.stroke()

  // 目
  ctx.fillStyle = '#2b2b3a'
  ctx.beginPath(); ctx.arc(R * 0.28, -R * 0.1, R * 0.13, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(R * 0.64, -R * 0.1, R * 0.13, 0, Math.PI * 2); ctx.fill()

  // 鼻
  ctx.fillStyle = '#d4607a'
  ctx.beginPath(); ctx.arc(R * 0.48, R * 0.18, R * 0.1, 0, Math.PI * 2); ctx.fill()

  ctx.restore()
}

function centerText(lines: { text: string; size: number; color: string; dy: number }[]) {
  const { w, h } = getCanvasSize()
  ctx.textAlign = 'center'
  for (const l of lines) {
    ctx.fillStyle = l.color
    ctx.font = `${l.size}px sans-serif`
    ctx.fillText(l.text, w / 2, h / 2 + l.dy)
  }
  ctx.textAlign = 'left'
}

function draw() {
  const { w, h } = getCanvasSize()

  // 空
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#241841')
  sky.addColorStop(0.55, '#3a2456')
  sky.addColorStop(1, '#5b3a6e')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // 星
  for (const s of stars) {
    ctx.globalAlpha = s.a
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(s.fx * w, s.fy * h, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // 遠景の丘（パララックス）
  drawHills(camX * 0.15, h * 0.62, '#2f1d4d')
  drawHills(camX * 0.3, h * 0.74, '#241539')

  // 谷の闇
  const fog = ctx.createLinearGradient(0, h * 0.7, 0, h)
  fog.addColorStop(0, 'rgba(10,5,20,0)')
  fog.addColorStop(1, 'rgba(8,4,16,0.9)')
  ctx.fillStyle = fog
  ctx.fillRect(0, h * 0.7, w, h * 0.3)

  // フック
  for (const a of anchors) {
    const sx = a.x - camX
    if (sx < -20 || sx > w + 20) continue
    drawAnchor(sx, a.y)
  }

  // 魚（未回収のみ・ゆらゆら）
  for (const f of fish) {
    if (f.got) continue
    const sx = f.x - camX
    if (sx < -20 || sx > w + 20) continue
    drawFish(sx, f.y + Math.sin(t * 3 + f.phase) * 4)
  }

  // ロープ
  if (state === 'swing') {
    ctx.strokeStyle = '#d8c9a8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(cur.x - camX, cur.y)
    ctx.lineTo(catX - camX, catY)
    ctx.stroke()
  }

  // 照準（前方=右に振れている＝離せる時だけ表示。飛ぶ向きと強さの目安）
  if (started && !dead && state === 'swing' && omega > 0) {
    const sp = L * omega
    const len = Math.min(80, 18 + sp * 0.09)
    const dx = Math.cos(theta), dy = -Math.sin(theta)
    const ox = catX - camX, oy = catY
    const ex = ox + dx * len, ey = oy + dy * len
    const ah = Math.atan2(dy, dx)
    ctx.strokeStyle = 'rgba(255,238,140,0.75)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(ex, ey); ctx.lineTo(ex - 10 * Math.cos(ah - 0.4), ey - 10 * Math.sin(ah - 0.4))
    ctx.moveTo(ex, ey); ctx.lineTo(ex - 10 * Math.cos(ah + 0.4), ey - 10 * Math.sin(ah + 0.4))
    ctx.stroke()
  }

  // ねこ
  const ang = state === 'swing' ? theta * 0.8 : Math.atan2(vy, vx)
  drawCat(catX - camX, catY, ang)

  // HUD（スコア = 距離 + 魚ボーナス）
  ctx.textAlign = 'right'
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 26px sans-serif'
  ctx.fillText(`${score()}`, w - 16, 42)
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#ffe08c'
  ctx.fillText(`${dist}m ・ Fish ${fishCount}`, w - 16, 62)
  if (best > 0) {
    ctx.fillStyle = '#cbb8e0'
    ctx.fillText(`Best: ${best}`, w - 16, 80)
  }
  ctx.textAlign = 'left'

  // スタート画面
  if (!started && !dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, w, h)
    centerText([
      { text: 'ねこロープスイング', size: 26, color: '#fff', dy: -70 },
      { text: '黄色い矢印が出たらタップで離す！', size: 15, color: 'rgba(255,255,255,0.85)', dy: -28 },
      { text: '次のフックは自動でキャッチ', size: 15, color: 'rgba(255,255,255,0.85)', dy: -2 },
      { text: '魚を通って集めるとスコアUP', size: 14, color: '#ffe08c', dy: 26 },
      { text: '雑に離すと沈んで谷へ…', size: 13, color: 'rgba(255,255,255,0.6)', dy: 50 },
      { text: 'タップでスタート', size: 14, color: 'rgba(255,255,255,0.55)', dy: 82 },
    ])
  }

  // ゲームオーバー
  if (dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, w, h)
    centerText([
      { text: 'おっこちた…', size: 30, color: '#fff', dy: -52 },
      { text: `Score ${score()}`, size: 26, color: '#fff', dy: -10 },
      { text: `${dist} m ・ Fish ${fishCount}`, size: 15, color: '#ffe08c', dy: 18 },
      { text: `Best ${best}`, size: 18, color: '#cbb8e0', dy: 48 },
      { text: 'タップでリトライ', size: 16, color: '#aaa', dy: 86 },
    ])
  }
}

init()
startLoop(update, draw)
