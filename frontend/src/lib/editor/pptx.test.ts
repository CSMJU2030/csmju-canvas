import { describe, expect, it } from 'vitest';
import { slideSizeEmu } from './pptx';

describe('pptx slide size', () => {
  it('converts pixels to EMU', () => {
    expect(slideSizeEmu(1920, 1080)).toEqual({ cx: 18288000, cy: 10287000 });
  });

  it('keeps sizes inside the range PowerPoint accepts', () => {
    const big = slideSizeEmu(10000, 5000);
    const small = slideSizeEmu(50, 50);

    expect(big.cx).toBeLessThanOrEqual(51206400);
    expect(big.cx / big.cy).toBeCloseTo(2);
    expect(small.cx).toBeGreaterThanOrEqual(914400);
  });
});
