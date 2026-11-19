// Lichess Neo's Boxwood sounds (sounds/boxwood): the sound of a move from what it does, as the
// extension picks it (src/page/sounds in Lichess Neo). A take at random, never the last one played
// for that sound; a slide's takes grouped by how far the piece goes.

const TAKES = {
  'move-self': 6, 'move-opponent': 6, 'move-knight': 6, 'move-check': 3,
  'move-slide': 18, 'move-slide-check': 18,
  capture: 8, 'capture-check': 2, 'capture-slide': 18, 'capture-slide-check': 18,
  castle: 4, promote: 4, 'capture-promote': 4, checkmate: 1,
};
const SLIDES = new Set(['move-slide', 'move-slide-check', 'capture-slide', 'capture-slide-check']);
const VOLUME = 0.8;
const KEY = 'explorer-sound';
const FILES = 'abcdefgh';

let on = true;
try { on = localStorage.getItem(KEY) !== 'off'; } catch {}
const last = new Map();

export const soundOn = () => on;

export function setSound(value) {
  on = Boolean(value);
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
}

/** The sound of a chess.js move (verbose), and how far it went. */
function soundOf(move) {
  const reach = Math.max(
    Math.abs(FILES.indexOf(move.from[0]) - FILES.indexOf(move.to[0])),
    Math.abs(Number(move.from[1]) - Number(move.to[1])),
  );
  // A bishop, a rook, a queen or a pawn that goes two squares or more slides.
  const slide = 'brqp'.includes(move.piece) && reach >= 2;
  const capture = Boolean(move.captured);
  if (move.san.includes('#')) return ['checkmate', reach];
  if (capture && move.promotion) return ['capture-promote', reach];
  if (move.san.includes('+')) {
    if (capture) return [slide ? 'capture-slide-check' : 'capture-check', reach];
    return [slide ? 'move-slide-check' : 'move-check', reach];
  }
  if (move.san.startsWith('O-O')) return ['castle', reach];
  if (move.promotion) return ['promote', reach];
  if (capture) return [slide ? 'capture-slide' : 'capture', reach];
  if (move.piece === 'n') return ['move-knight', reach];
  if (slide) return ['move-slide', reach];
  return [move.color === 'w' ? 'move-self' : 'move-opponent', reach];
}

function take(name, reach) {
  const count = TAKES[name];
  let first = 0;
  let end = count;
  if (SLIDES.has(name)) {
    // Six groups, one for each reach from 2 to 7, the shortest first.
    const group = Math.min(Math.max(reach, 2), 7) - 2;
    first = Math.min(Math.floor((group * count) / 6), count - 1);
    end = Math.max(Math.floor(((group + 1) * count) / 6), first + 1);
  }
  const takes = [];
  for (let i = first; i < end; i++) if (i !== last.get(name) || end - first === 1) takes.push(i);
  const chosen = takes[Math.floor(Math.random() * takes.length)];
  last.set(name, chosen);
  return chosen + 1;
}

/** Plays a move's sound, if the sound is on. */
export function playMove(move) {
  if (!on || !move) return;
  const [name, reach] = soundOf(move);
  const audio = new Audio(`./sounds/boxwood/${name}-${take(name, reach)}.ogg`);
  audio.volume = VOLUME;
  audio.play().catch(() => undefined);
}
