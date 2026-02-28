/** マウスクリック・タッチを統合して座標を返す */
export interface PointerEvent {
  x: number
  y: number
}

type PointerCallback = (e: PointerEvent) => void

export function setupPointer(canvas: HTMLCanvasElement, onTap: PointerCallback): void {
  // マウスクリック
  canvas.addEventListener('click', (e) => {
    onTap({ x: e.offsetX, y: e.offsetY })
  })

  // タッチ
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault()
    const touch = e.touches[0]
    const rect = canvas.getBoundingClientRect()
    onTap({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    })
  }, { passive: false })
}
