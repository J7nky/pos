/**
 * Banker's rounding (half-to-even) to `decimals` fractional digits.
 */
export function roundHalfEven(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  if (decimals < 0) return value;

  const sign = value < 0 ? -1 : 1;
  const absVal = Math.abs(value);
  const factor = 10 ** decimals;
  const scaled = absVal * factor;
  const intPart = Math.floor(scaled + 1e-12);
  let frac = scaled - intPart;
  if (frac < 0) {
    frac = 0;
  }

  let roundedInt: number;
  if (frac + 1e-12 < 0.5) {
    roundedInt = intPart;
  } else if (frac - 1e-12 > 0.5) {
    roundedInt = intPart + 1;
  } else {
    roundedInt = intPart % 2 === 0 ? intPart : intPart + 1;
  }

  return sign * (roundedInt / factor);
}
