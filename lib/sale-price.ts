function roundTo(value: number, places: number): number {
  return Math.round(Number(`${value.toFixed(8)}e${places}`)) / 10 ** places;
}

export function pieceArea(lengthFt: number | null, breadthFt: number | null): number | null {
  if (lengthFt === null || breadthFt === null) return null;
  return roundTo(lengthFt * breadthFt, 4);
}

export function salePricePerPiece(areaSqft: number | null, saleRate: number): number {
  return roundTo((areaSqft ?? 1) * saleRate, 2);
}
