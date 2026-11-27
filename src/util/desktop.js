// Desktop helpers for headed runs: screen geometry, window tiling and parking the user's cursor.
import { execFile } from 'node:child_process';

const run = (args, timeout = 3000) =>
  new Promise((resolve) => {
    execFile('osascript', args, { timeout }, (err, stdout) => resolve(err ? null : String(stdout).trim()));
  });

const FALLBACK = Object.freeze({ x: 0, y: 25, width: 1440, height: 875, screenWidth: 1440, screenHeight: 900 });

/** Usable screen area (below the menu bar, above the Dock), in screen points with a top-left origin. */
export async function getScreen() {
  if (process.platform !== 'darwin') return FALLBACK;
  const script =
    "ObjC.import('AppKit'); var s=$.NSScreen.mainScreen; var f=s.frame; var v=s.visibleFrame; " +
    'JSON.stringify({sw:f.size.width, sh:f.size.height, vx:v.origin.x, vy:v.origin.y, vw:v.size.width, vh:v.size.height})';
  const out = await run(['-l', 'JavaScript', '-e', script]);
  try {
    const g = JSON.parse(out);
    return { x: g.vx, y: g.sh - (g.vy + g.vh), width: g.vw, height: g.vh, screenWidth: g.sw, screenHeight: g.sh };
  } catch {
    return FALLBACK;
  }
}

/** Split the usable area into a grid: 2×2 for up to four windows, 3 or 4 columns × 2 rows beyond. */
export function tileLayout(count, screen) {
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : Math.ceil(count / 2);
  const rows = count <= 2 ? 1 : 2;
  const w = Math.floor(screen.width / cols);
  const h = Math.floor(screen.height / rows);
  return Array.from({ length: count }, (_, i) => ({
    left: Math.round(screen.x + (i % cols) * w),
    top: Math.round(screen.y + Math.floor(i / cols) * h),
    width: w,
    height: h,
  }));
}

/** Move the real mouse pointer out of the way (onto the menu bar), so it never hovers an agent window. */
export async function parkCursor(screen) {
  if (process.platform !== 'darwin') return false;
  const x = Math.round(screen.screenWidth / 2);
  const y = 4;
  const script = `ObjC.import('CoreGraphics'); $.CGWarpMouseCursorPosition($.CGPointMake(${x}, ${y})); $.CGAssociateMouseAndMouseCursorPosition(true); 'ok'`;
  return (await run(['-l', 'JavaScript', '-e', script])) === 'ok';
}
