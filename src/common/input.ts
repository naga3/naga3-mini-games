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

/**
 * 「押している間だけ」の入力を統合する（押す/離す）。
 * マウスとタッチをまとめ、カーソルが外れた場合も離した扱いにする。
 */
export function setupHold(
  canvas: HTMLCanvasElement,
  onDown: () => void,
  onUp: () => void,
): void {
  canvas.addEventListener('mousedown', (e) => { e.preventDefault(); onDown() })
  canvas.addEventListener('mouseup', () => onUp())
  canvas.addEventListener('mouseleave', () => onUp())
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onDown() }, { passive: false })
  canvas.addEventListener('touchend', (e) => { e.preventDefault(); onUp() }, { passive: false })
  canvas.addEventListener('touchcancel', () => onUp())
}
