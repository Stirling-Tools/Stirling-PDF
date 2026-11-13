/** Separable box blur of the first `channels` of every `stride`-wide pixel into a copy, `radius` pixels each way; other channels keep their values. */
export function boxBlur<T extends Float32Array | Uint8Array>(
  src: T,
  width: number,
  height: number,
  radius: number,
  channels = 1,
  stride = channels,
): T {
  let data = src;
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ]) {
    const out = data.slice() as T;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let c = 0; c < channels; c++) {
          let sum = 0;
          let n = 0;
          for (let k = -radius; k <= radius; k++) {
            const xx = x + k * dx;
            const yy = y + k * dy;
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
            sum += data[(yy * width + xx) * stride + c];
            n++;
          }
          out[(y * width + x) * stride + c] = sum / n;
        }
    data = out;
  }
  return data;
}
