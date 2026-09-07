/** Inverse of the fixed (25,30,25) camera's ground-plane projection. */
export function screenDirection(held) {
  const right=Number(held.has('d')||held.has('ArrowRight'))-Number(held.has('a')||held.has('ArrowLeft'));
  const down=Number(held.has('s')||held.has('ArrowDown'))-Number(held.has('w')||held.has('ArrowUp'));
  // Vertical foreshortening compensation keeps diagonals at 45 degrees on screen.
  const vertical=30/Math.hypot(25,30,25);
  const x=right+down/vertical, z=-right+down/vertical;
  const length=Math.hypot(x,z);
  return length?[x/length,z/length]:null;
}
