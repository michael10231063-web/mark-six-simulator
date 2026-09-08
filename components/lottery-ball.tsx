const RED = new Set([1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46]);
const BLUE = new Set([3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48]);

function ballColor(n: number) { return RED.has(n) ? "red" : BLUE.has(n) ? "blue" : "green"; }
export function Ball({ number, extra = false, small = false, muted = false }: { number: number; extra?: boolean; small?: boolean; muted?: boolean }) {
  return <span className={`ball ball-${ballColor(number)} ${extra ? "ball-extra" : ""} ${small ? "ball-small" : ""} ${muted ? "ball-muted" : ""}`}><span className="ball-number">{number}</span></span>;
}
