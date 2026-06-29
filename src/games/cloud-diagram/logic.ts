// Re:Wire — 純粋なパズルロジック（DOM 非依存・テスト可能）
//
// AWS 構成図を模した Netwalk。各タイルは AWS サービスで、接続端子の向きを
// 90° ずつ回して全タイルを 1 本のネットワークに繋ぐと正解。
// レイヤー（行帯）に沿った重み付き全域木で生成するので、完成すると
// 上から下へ流れる「構成図」の形になる。

// ===== 方向 =====
// N=0, E=1, S=2, W=3（時計回り）。mask は 4bit で「その向きに端子あり」。
export const DX = [0, 1, 0, -1] // col 方向
export const DY = [-1, 0, 1, 0] // row 方向（N は上）

export function opposite(dir: number): number {
  return (dir + 2) % 4
}

/** mask を時計回りに times 回（90°×times）回した結果 */
export function rotateMask(mask: number, times: number): number {
  let m = mask
  let t = ((times % 4) + 4) % 4
  for (let i = 0; i < t; i++) m = ((m << 1) | (m >> 3)) & 0xf
  return m
}

export function popcount(mask: number): number {
  let n = 0
  for (let i = 0; i < 4; i++) if (mask & (1 << i)) n++
  return n
}

// ===== サービスカタログ =====
export type Category =
  | 'network'
  | 'compute'
  | 'integration'
  | 'database'
  | 'storage'

export interface ServiceDef {
  key: string
  label: string // タイルに出す短い名前
  category: Category
  ideal: number // 接続本数の理想値（次数からサービスを選ぶのに使う）
}

export const SERVICES: Record<string, ServiceDef> = {
  cloudfront: { key: 'cloudfront', label: 'CloudFront', category: 'network', ideal: 1 },
  route53: { key: 'route53', label: 'Route 53', category: 'network', ideal: 2 },
  alb: { key: 'alb', label: 'ALB', category: 'network', ideal: 3 },
  apigw: { key: 'apigw', label: 'API GW', category: 'network', ideal: 3 },
  ec2: { key: 'ec2', label: 'EC2', category: 'compute', ideal: 2 },
  ecs: { key: 'ecs', label: 'ECS', category: 'compute', ideal: 2 },
  lambda: { key: 'lambda', label: 'Lambda', category: 'compute', ideal: 2 },
  sqs: { key: 'sqs', label: 'SQS', category: 'integration', ideal: 2 },
  sns: { key: 'sns', label: 'SNS', category: 'integration', ideal: 3 },
  rds: { key: 'rds', label: 'RDS', category: 'database', ideal: 1 },
  dynamodb: { key: 'dynamodb', label: 'DynamoDB', category: 'database', ideal: 1 },
  redis: { key: 'redis', label: 'ElastiCache', category: 'database', ideal: 1 },
  s3: { key: 's3', label: 'S3', category: 'storage', ideal: 1 },
  backup: { key: 'backup', label: 'Backup', category: 'storage', ideal: 1 },
}

// レイヤー（上→下）。各行帯がどのサービス群かを決める。
export interface Layer {
  name: string // 左に出すラベル
  pool: string[]
}

export const LAYERS: Layer[] = [
  { name: 'Edge', pool: ['cloudfront', 'route53'] },
  { name: 'Gateway', pool: ['alb', 'apigw'] },
  { name: 'Compute', pool: ['ec2', 'ecs'] },
  { name: 'Serverless', pool: ['lambda', 'sqs', 'sns'] },
  { name: 'Database', pool: ['rds', 'dynamodb', 'redis'] },
  { name: 'Storage', pool: ['s3', 'backup'] },
]

// ===== 乱数（seed 可能・テスト用） =====
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ===== パズル =====
export interface Puzzle {
  rows: number
  cols: number
  base: number[] // 正解状態の mask（インデックス = row*cols+col）
  rot: number[] // 現在の回転数（累積。表示が常に右回りで進むよう mod しない）
  service: string[] // 各セルのサービス key（present でないセルは ''）
  layer: number[] // 各セルのレイヤー index
  present: boolean[] // タイルが存在するセル（false = 空き＝盤面に描かない）
  source: number // ネットワークの始点（Internet 入口）
}

export function idx(p: { cols: number }, row: number, col: number): number {
  return row * p.cols + col
}

function layerOfRow(row: number, rows: number, nLayers: number): number {
  return Math.min(nLayers - 1, Math.floor((row * nLayers) / rows))
}

// Union-Find
function makeDSU(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  const union = (a: number, b: number): boolean => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return false
    parent[ra] = rb
    return true
  }
  return { find, union }
}

/**
 * レイヤー重み付き全域木でパズルを生成する。
 * 縦辺（レイヤー間）を安く、横辺を高くすることで、上から下へ流れる
 * 「構成図」状のツリーになる。
 */
export function generatePuzzle(
  rows: number,
  cols: number,
  rng: Rng = Math.random,
): Puzzle {
  const n = rows * cols
  const cell = (r: number, c: number) => r * cols + c

  // --- 重み付き辺リスト ---
  interface Edge {
    a: number
    b: number
    dirFromA: number
    w: number
  }
  const edges: Edge[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) {
        // 横辺（高コスト）
        edges.push({ a: cell(r, c), b: cell(r, c + 1), dirFromA: 1, w: 1.5 + rng() * 3 })
      }
      if (r + 1 < rows) {
        // 縦辺（低コスト＝優先）
        edges.push({ a: cell(r, c), b: cell(r + 1, c), dirFromA: 2, w: rng() * 3 })
      }
    }
  }
  edges.sort((x, y) => x.w - y.w)

  // --- Kruskal で全域木 ---
  const base = new Array(n).fill(0)
  const dsu = makeDSU(n)
  let added = 0
  for (const e of edges) {
    if (added === n - 1) break
    if (dsu.union(e.a, e.b)) {
      base[e.a] |= 1 << e.dirFromA
      base[e.b] |= 1 << opposite(e.dirFromA)
      added++
    }
  }

  // --- レイヤー & サービス割り当て（次数 × 行帯） ---
  const nLayers = LAYERS.length
  const layer = new Array<number>(n)
  const service = new Array<string>(n)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = cell(r, c)
      const lyr = layerOfRow(r, rows, nLayers)
      layer[i] = lyr
      const deg = popcount(base[i])
      service[i] = pickService(LAYERS[lyr].pool, deg, rng)
    }
  }

  // --- 始点（最上行で最も次数が高いセル） ---
  let source = 0
  let bestDeg = -1
  for (let c = 0; c < cols; c++) {
    const i = cell(0, c)
    const d = popcount(base[i])
    if (d > bestDeg) {
      bestDeg = d
      source = i
    }
  }

  // --- スクランブル（既に解けていたら振り直す） ---
  const rot = new Array(n).fill(0)
  const present = new Array(n).fill(true)
  const puzzle: Puzzle = { rows, cols, base, rot, service, layer, present, source }
  for (let attempt = 0; attempt < 30; attempt++) {
    for (let i = 0; i < n; i++) rot[i] = Math.floor(rng() * 4)
    if (!isSolved(puzzle)) break
  }
  // それでも解けている（対称タイルだらけ等）なら 1 枚ずらす
  if (isSolved(puzzle)) {
    for (let i = 0; i < n; i++) {
      if (popcount(base[i]) > 0 && popcount(base[i]) < 4) {
        rot[i] = (rot[i] + 1) % 4
        break
      }
    }
  }
  return puzzle
}

/** プール内から、次数に最も近い ideal を持つサービスを選ぶ（同点はランダム） */
function pickService(pool: string[], deg: number, rng: Rng): string {
  let best: string[] = []
  let bestDiff = Infinity
  for (const key of pool) {
    const diff = Math.abs(SERVICES[key].ideal - deg)
    if (diff < bestDiff) {
      bestDiff = diff
      best = [key]
    } else if (diff === bestDiff) {
      best.push(key)
    }
  }
  return best[Math.floor(rng() * best.length)]
}

/** 現在の見えている mask（base を rot 回回したもの） */
export function currentMask(p: Puzzle, i: number): number {
  return rotateMask(p.base[i], p.rot[i])
}

/** 全端子が隣と噛み合い、かつ source から全タイルに到達できれば正解 */
export function isSolved(p: Puzzle): boolean {
  const { rows, cols } = p
  const n = rows * cols
  // 端子のマッチング検査（盤外・空きセル・開放端があれば不正解）
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      if (!p.present[i]) continue
      const m = currentMask(p, i)
      for (let d = 0; d < 4; d++) {
        if (!(m & (1 << d))) continue
        const nr = r + DY[d]
        const nc = c + DX[d]
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return false
        const j = nr * cols + nc
        if (!p.present[j]) return false
        if (!(currentMask(p, j) & (1 << opposite(d)))) return false
      }
    }
  }
  // 連結性（孤立した島が無いこと）
  const lit = computeLit(p)
  for (let i = 0; i < n; i++) {
    if (p.present[i] && !lit[i]) return false
  }
  return true
}

/** source から噛み合った端子を辿って到達できるセル（点灯表現用） */
export function computeLit(p: Puzzle): boolean[] {
  const { rows, cols, source } = p
  const n = rows * cols
  const lit = new Array(n).fill(false)
  const queue = [source]
  lit[source] = true
  while (queue.length) {
    const i = queue.pop() as number
    const r = Math.floor(i / cols)
    const c = i % cols
    const m = currentMask(p, i)
    for (let d = 0; d < 4; d++) {
      if (!(m & (1 << d))) continue
      const nr = r + DY[d]
      const nc = c + DX[d]
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      const j = nr * cols + nc
      if (lit[j] || !p.present[j]) continue
      const nm = currentMask(p, j)
      if (!(nm & (1 << opposite(d)))) continue // 双方向に繋がっている時だけ
      lit[j] = true
      queue.push(j)
    }
  }
  return lit
}

/** source からの BFS 深さ（クリア演出のフロー用）。未到達は -1 */
export function computeDepth(p: Puzzle): number[] {
  const { rows, cols, source } = p
  const n = rows * cols
  const depth = new Array(n).fill(-1)
  let frontier = [source]
  depth[source] = 0
  let d0 = 0
  while (frontier.length) {
    const next: number[] = []
    for (const i of frontier) {
      const r = Math.floor(i / cols)
      const c = i % cols
      const m = currentMask(p, i)
      for (let d = 0; d < 4; d++) {
        if (!(m & (1 << d))) continue
        const nr = r + DY[d]
        const nc = c + DX[d]
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
        const j = nr * cols + nc
        if (depth[j] !== -1 || !p.present[j]) continue
        const nm = currentMask(p, j)
        if (!(nm & (1 << opposite(d)))) continue
        depth[j] = d0 + 1
        next.push(j)
      }
    }
    frontier = next
    d0++
  }
  return depth
}

export function rotateCell(p: Puzzle, i: number): void {
  // 累積値で持つ（mod しない）。表示アニメが常に右回りで進むようにするため。
  // currentMask() 側の rotateMask が内部で mod するのでロジックには影響しない。
  p.rot[i] += 1
}

/** present なタイル数 / そのうち lit な数 */
export function countOnline(p: Puzzle, lit: boolean[]): { online: number; total: number } {
  let online = 0
  let total = 0
  for (let i = 0; i < p.present.length; i++) {
    if (!p.present[i]) continue
    total++
    if (lit[i]) online++
  }
  return { online, total }
}

// ===== 固定ステージ（実在の構成図を手作りで配置） =====
export interface LevelNode {
  r: number
  c: number
  svc: string
}
export interface Level {
  name: string
  subtitle: string
  rows: number
  cols: number
  nodes: LevelNode[]
  edges: [number, number][] // nodes[] のインデックス対
  source: number // nodes[] のインデックス
}

export const LEVELS: Level[] = [
  {
    name: '静的サイト',
    subtitle: 'Route 53 → CloudFront → S3',
    rows: 2,
    cols: 2,
    nodes: [
      { r: 0, c: 0, svc: 'route53' },
      { r: 0, c: 1, svc: 'cloudfront' },
      { r: 1, c: 1, svc: 's3' },
    ],
    edges: [
      [0, 1],
      [1, 2],
    ],
    source: 0,
  },
  {
    name: '3層 Web アプリ',
    subtitle: 'CloudFront → ALB → EC2 → RDS',
    rows: 4,
    cols: 2,
    nodes: [
      { r: 0, c: 0, svc: 'cloudfront' },
      { r: 1, c: 0, svc: 'alb' },
      { r: 2, c: 0, svc: 'ec2' },
      { r: 2, c: 1, svc: 'ec2' },
      { r: 3, c: 0, svc: 'rds' },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [2, 4],
    ],
    source: 0,
  },
  {
    name: 'サーバーレス API',
    subtitle: 'API Gateway → Lambda → DynamoDB',
    rows: 4,
    cols: 2,
    nodes: [
      { r: 0, c: 1, svc: 'route53' },
      { r: 1, c: 1, svc: 'apigw' },
      { r: 2, c: 0, svc: 'lambda' },
      { r: 2, c: 1, svc: 'lambda' },
      { r: 3, c: 1, svc: 'dynamodb' },
    ],
    edges: [
      [0, 1],
      [1, 3],
      [3, 2],
      [3, 4],
    ],
    source: 0,
  },
  {
    name: 'イベント駆動',
    subtitle: 'S3 → SNS → SQS → Lambda → DynamoDB',
    rows: 5,
    cols: 2,
    nodes: [
      { r: 0, c: 1, svc: 's3' },
      { r: 1, c: 1, svc: 'sns' },
      { r: 2, c: 0, svc: 'lambda' },
      { r: 2, c: 1, svc: 'sqs' },
      { r: 3, c: 1, svc: 'lambda' },
      { r: 4, c: 1, svc: 'dynamodb' },
    ],
    edges: [
      [0, 1],
      [1, 3],
      [3, 2],
      [3, 4],
      [4, 5],
    ],
    source: 0,
  },
  {
    name: '本格構成',
    subtitle: 'CloudFront → ALB → ECS/EC2 → RDS/Redis',
    rows: 4,
    cols: 3,
    nodes: [
      { r: 0, c: 1, svc: 'cloudfront' },
      { r: 1, c: 1, svc: 'alb' },
      { r: 2, c: 0, svc: 'ec2' },
      { r: 2, c: 1, svc: 'ecs' },
      { r: 3, c: 0, svc: 'redis' },
      { r: 3, c: 1, svc: 'rds' },
    ],
    edges: [
      [0, 1],
      [1, 3],
      [3, 2],
      [2, 4],
      [3, 5],
    ],
    source: 0,
  },
]

/** 隣接する 2 セルの、a から見た方向を返す（隣接でなければ -1） */
function dirBetween(cols: number, a: number, b: number): number {
  const ar = Math.floor(a / cols)
  const ac = a % cols
  const br = Math.floor(b / cols)
  const bc = b % cols
  for (let d = 0; d < 4; d++) {
    if (ar + DY[d] === br && ac + DX[d] === bc) return d
  }
  return -1
}

/** Level からパズルを組み立てて出題状態（スクランブル済み）にする */
export function buildStage(level: Level, rng: Rng = Math.random): Puzzle {
  const { rows, cols } = level
  const n = rows * cols
  const base = new Array(n).fill(0)
  const rot = new Array(n).fill(0)
  const service = new Array<string>(n).fill('')
  const present = new Array(n).fill(false)
  const layer = new Array<number>(n)
  const nLayers = LAYERS.length
  for (let i = 0; i < n; i++) layer[i] = layerOfRow(Math.floor(i / cols), rows, nLayers)

  const cellOf = (idx: number) => level.nodes[idx].r * cols + level.nodes[idx].c
  for (const node of level.nodes) {
    const i = node.r * cols + node.c
    present[i] = true
    service[i] = node.svc
  }
  for (const [a, b] of level.edges) {
    const ca = cellOf(a)
    const cb = cellOf(b)
    const d = dirBetween(cols, ca, cb)
    if (d < 0) throw new Error(`Level "${level.name}": 非隣接の辺 ${a}-${b}`)
    base[ca] |= 1 << d
    base[cb] |= 1 << opposite(d)
  }

  const source = cellOf(level.source)
  const puzzle: Puzzle = { rows, cols, base, rot, service, layer, present, source }

  // スクランブル（present タイルのみ。既に解けていたら振り直す）
  for (let attempt = 0; attempt < 40; attempt++) {
    for (let i = 0; i < n; i++) rot[i] = present[i] ? Math.floor(rng() * 4) : 0
    if (!isSolved(puzzle)) break
  }
  if (isSolved(puzzle)) {
    for (let i = 0; i < n; i++) {
      if (present[i] && popcount(base[i]) > 0 && popcount(base[i]) < 4) {
        rot[i] += 1
        break
      }
    }
  }
  return puzzle
}
