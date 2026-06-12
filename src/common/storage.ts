/** ハイスコア等の最高記録を localStorage に保存・読み込みする */
export function loadBest(key: string): number {
  return Number(localStorage.getItem(key) ?? 0)
}

export function saveBest(key: string, value: number): void {
  localStorage.setItem(key, String(value))
}
