/** シンプルな requestAnimationFrame ゲームループ */
export type UpdateFn = (dt: number) => void
export type DrawFn = () => void

export function startLoop(update: UpdateFn, draw: DrawFn): void {
  let prev = performance.now()

  const frame = (now: number) => {
    const dt = (now - prev) / 1000 // 秒単位
    prev = now
    update(Math.min(dt, 0.1)) // スパイク防止で最大 0.1s
    draw()
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}
