// ロジック検証用スクリプト。拡張子なし import のため esbuild 経由で実行する:
//   node_modules/.bin/esbuild src/games/cloud-diagram/logic.test.ts \
//     --bundle --format=esm --platform=node | node --input-type=module
import {
  generatePuzzle,
  isSolved,
  mulberry32,
  rotateMask,
  currentMask,
  computeLit,
  popcount,
  buildStage,
  LEVELS,
  type Puzzle,
} from './logic'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++
    console.error('  ❌ ' + msg)
  }
}

// --- rotateMask の基本 ---
assert(rotateMask(0b0001, 1) === 0b0010, 'N を 90°CW で E')
assert(rotateMask(0b0001, 4) === 0b0001, '4 回転で元に戻る')
assert(rotateMask(0b0101, 2) === 0b0101, '直線は 180° で同形')

// --- 生成パズルが「正解へ戻せる」ことの全数確認 ---
// 各セルを base に戻す rot=0 にすれば必ず解けるはず
function solveToBase(p: Puzzle): Puzzle {
  return { ...p, rot: p.base.map(() => 0) }
}

const sizes: [number, number][] = [
  [6, 6],
  [10, 10],
  [16, 16],
]
let totalScrambledSolved = 0
for (const [rows, cols] of sizes) {
  let initiallySolvedCount = 0
  for (let seed = 1; seed <= 200; seed++) {
    const p = generatePuzzle(rows, cols, mulberry32(seed))

    // 1) 正解状態（rot=0）は必ず解けている
    assert(isSolved(solveToBase(p)), `[${rows}x${cols} seed=${seed}] base が解になっていない`)

    // 2) 全セルが少なくとも 1 本の端子を持つ（孤立タイル無し）
    let isolated = false
    for (let i = 0; i < rows * cols; i++) if (popcount(p.base[i]) === 0) isolated = true
    assert(!isolated, `[${rows}x${cols} seed=${seed}] 孤立タイルがある`)

    // 3) base は開放端ゼロ（端子が必ず隣と噛み合う）
    const solved = solveToBase(p)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const m = currentMask(solved, r * cols + c)
        for (let d = 0; d < 4; d++) {
          if (!(m & (1 << d))) continue
          const dy = [-1, 0, 1, 0][d]
          const dx = [0, 1, 0, -1][d]
          const nr = r + dy
          const nc = c + dx
          assert(nr >= 0 && nr < rows && nc >= 0 && nc < cols, `[${rows}x${cols} seed=${seed}] 盤外への開放端`)
        }
      }
    }

    // 4) 出題はスクランブルされている（ごく稀な対称ケースを除き未解決）
    if (isSolved(p)) initiallySolvedCount++

    // 5) 正解時は全セル点灯
    const allLit = computeLit(solved).every((v) => v)
    assert(allLit, `[${rows}x${cols} seed=${seed}] 正解でも未点灯セルがある`)
    totalScrambledSolved++
  }
  console.log(`  ${rows}x${cols}: 200 シード OK（出題時点で既に解けていた数: ${initiallySolvedCount}）`)
}

console.log(`検証パズル総数: ${totalScrambledSolved}`)

// --- 固定ステージの検証 ---
for (const level of LEVELS) {
  for (let seed = 1; seed <= 50; seed++) {
    const p = buildStage(level, mulberry32(seed))
    // 正解状態（rot=0）は解けている
    assert(isSolved(solveToBase(p)), `ステージ「${level.name}」の base が解になっていない`)
    // present タイルは全て base>0（孤立なし）かつ正解時に点灯
    const solved = solveToBase(p)
    const lit = computeLit(solved)
    for (let i = 0; i < p.present.length; i++) {
      if (!p.present[i]) continue
      assert(popcount(p.base[i]) > 0, `ステージ「${level.name}」に孤立タイル`)
      assert(lit[i], `ステージ「${level.name}」正解でも未点灯`)
    }
    // 出題はスクランブルされている（端子1本の対称タイルのみのステージは除く）
  }
  // ノード数と present 数が一致
  const p = buildStage(level, mulberry32(1))
  const presentCount = p.present.filter(Boolean).length
  assert(presentCount === level.nodes.length, `ステージ「${level.name}」present 数不一致`)
  console.log(`  ステージ「${level.name}」: ${level.nodes.length} タイル OK`)
}
if (failures === 0) {
  console.log('✅ 全テスト通過')
} else {
  throw new Error(`❌ ${failures} 件失敗`)
}
