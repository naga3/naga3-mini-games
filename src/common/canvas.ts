/** Canvas の初期化とレスポンシブリサイズを管理する */
export function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')!

  const resize = () => {
    const dpr = window.devicePixelRatio || 1
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`
    ctx.scale(dpr, dpr)
  }

  resize()
  window.addEventListener('resize', resize)

  return ctx
}

/** CSS ピクセル単位でのキャンバスサイズを返す */
export function getCanvasSize(): { w: number; h: number } {
  return { w: window.innerWidth, h: window.innerHeight }
}
