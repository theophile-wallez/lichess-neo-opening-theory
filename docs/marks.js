// The marks of a classic mistake, drawn as in Lichess Neo's Game Review: the
// annotation symbol in its class's color, over a rounded square tinted with it
// (src/page/review/classes in Lichess Neo). In a 20 x 20 viewBox.

const COLORS = { '?!': '#53b2ea', '?': '#e69d00', '??': '#df5353', book: '#ba9978' };

const round = value => Math.round(value * 100) / 100;
const DOT_Y = 14.6;
const STEM_END = 11.4;

/** An exclamation mark centered on `x`; a dot is a zero-length line, drawn by its round cap. */
const exclamation = x => `M${x} 5V${STEM_END}M${x} ${DOT_Y}v0`;

/** A question mark centered on `x`, its hook of the given radius. */
function question(x, radius) {
  const centerY = round(5 + radius);
  const diagonal = round(radius * Math.SQRT1_2);
  const hookEnd = { x: round(x + diagonal), y: round(centerY + diagonal) };
  const stemTop = round(centerY + radius + 0.6);
  return (
    `M${round(x - radius)} ${centerY}A${radius} ${radius} 0 1 1 ${hookEnd.x} ${hookEnd.y}` +
    `C${round(hookEnd.x - diagonal / 2)} ${round(hookEnd.y + diagonal / 2)} ${x} ${round(stemTop - 1)} ${x} ${stemTop}` +
    `V${STEM_END}M${x} ${DOT_Y}v0`
  );
}

const GLYPHS = {
  '?!': [question(7.6, 2.3), exclamation(13.6)],
  '?': [question(10, 2.3)],
  '??': [question(6.8, 1.9), question(13.2, 1.9)],
  // A book move: three lines, as a page.
  book: ['M5.6 6.4h8.8M5.6 10h8.8M5.6 13.6h8.8'],
};

/** The mark's icon, as SVG markup; '' for a mark it doesn't know. */
export function markSvg(mark) {
  const color = COLORS[mark];
  if (!color) return '';
  const paths = GLYPHS[mark].map(d => `<path d="${d}"/>`).join('');
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><rect width="20" height="20" rx="5" fill="${color}" fill-opacity="0.18"/><g fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}

/** Draws the icon into each element with a `data-mark`, keeping the symbol as its accessible name. */
export function drawMarks(root = document) {
  for (const element of root.querySelectorAll('[data-mark]')) {
    if (element.dataset.drawn) continue;
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', element.getAttribute('aria-label') || element.dataset.mark);
    element.innerHTML = markSvg(element.dataset.mark);
    element.dataset.drawn = '1';
  }
}

// For the page's other script, which isn't a module.
globalThis.markSvg = markSvg;
globalThis.drawMarks = drawMarks;
drawMarks();
