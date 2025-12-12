export interface Pixel {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
  hue: number;
  saturation: number;
  lightness: number;
  sortedX?: number;
  sortedY?: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}
