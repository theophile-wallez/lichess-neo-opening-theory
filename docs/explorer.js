// The explorer at the top of the paper: a board, the coach's text for the position on it, the
// moves theory goes on with and the classic mistakes, in English or French. It reads
// data/index.json and data/keys.json at once, and a chapter's file only when the board reaches
// one of its positions (tools/build.py writes them all).

import { Coach } from './coach.js';
import { markSvg } from './marks.js';
import { playMove, setSound, soundOn } from './sounds.js';
import { Chess } from './vendor/chess.js';

const MARK = /\{(?:([wb]):)?([^{}]+)\}|\[([a-h][1-8])\]/g;
// The study's brushes, in Lichess Neo's review colors (src/shared/board/colors.ts), as RGB.
const BRUSH = { G: '159,207,63', R: '235,88,72', Y: '250,180,40', B: '72,193,249' };
const PREVIEW = '72,193,249';
const SHAPE_OPACITY = 0.8;
// The review's arrow, in squares (src/shared/board/geometry.ts).
const SHAFT_WIDTH = 0.22;
const HEAD_WIDTH = 0.52;
const HEAD_LENGTH = 0.34;
const START_GAP = 0.35;
// A word of the coach's text every WORD_MS, as the review types it (src/shared/coach-voice.ts).
const WORD_MS = 35;
const MOODS = { '?!': 'doubt', '?': 'worry', '??': 'angry' };
const FRENCH_PIECES = { N: 'C', B: 'F', R: 'T', Q: 'D', K: 'R' };
const FILES = 'abcdefgh';
const STEP_MS = 360;
const SVG = 'http://www.w3.org/2000/svg';

const UI = {
  en: {
    start: 'Play a move on the board, pick a family, or search for an opening by name or ECO code.',
    startTitle: 'The starting position',
    next: 'Theory goes on with',
    mistakes: 'Classic mistakes',
    mistakesHint: 'Play one to see why it fails and how to punish it.',
    punish: 'Play the punishment',
    punishing: 'The punishment',
    before: 'Back to the move before',
    study: 'Open this chapter in the Lichess study',
    none: 'The coach has nothing on this position.',
    noneHint: 'The theory of this line stops here, or the move left it.',
    back: 'Back to the last explained position',
    search: 'Search for an opening: Najdorf, Caro-Kann, C42…',
    family: 'Family',
    groups: { e4: '1.e4', d4: '1.d4', other: 'Other first moves' },
    noFamily: 'Pick a family',
    filter: 'Filter the families',
    noMatch: 'No family matches.',
    explained: depth => `explained to move ${Math.ceil(depth / 2)}`,
    noMatch: 'No named line matches.',
    loading: 'Loading the chapter…',
    sound: 'Sound',
    coach: 'The coach',
    verdicts: { book: '{m} is a book move', '?!': '{m} is an inaccuracy', '?': '{m} is a mistake', '??': '{m} is a blunder' },
    marks: { '?!': 'Inaccuracy', '?': 'Mistake', '??': 'Blunder' },
    flip: 'Flip the board',
    first: 'Starting position',
    prev: 'Previous move',
    nextMove: 'Next move',
    last: 'Last move',
    pinned: 'later in the plan',
  },
  fr: {
    start: 'Jouez un coup sur l’échiquier, choisissez une famille ou cherchez une ouverture par son nom ou son code ECO.',
    startTitle: 'La position de départ',
    next: 'La théorie continue par',
    mistakes: 'Erreurs classiques',
    mistakesHint: 'Jouez-en une pour voir pourquoi elle échoue et comment la punir.',
    punish: 'Jouer la réfutation',
    punishing: 'La réfutation',
    before: 'Revenir au coup d’avant',
    study: 'Ouvrir ce chapitre dans l’étude Lichess',
    none: 'Le coach n’a rien sur cette position.',
    noneHint: 'La théorie de cette ligne s’arrête ici, ou le coup en est sorti.',
    back: 'Revenir à la dernière position expliquée',
    search: 'Chercher une ouverture : Najdorf, Caro-Kann, C42…',
    family: 'Famille',
    groups: { e4: '1.e4', d4: '1.d4', other: 'Autres premiers coups' },
    noFamily: 'Choisir une famille',
    filter: 'Filtrer les familles',
    noMatch: 'Aucune famille ne correspond.',
    explained: depth => `expliquée jusqu’au coup ${Math.ceil(depth / 2)}`,
    noMatch: 'Aucune ligne nommée ne correspond.',
    loading: 'Chargement du chapitre…',
    sound: 'Son',
    coach: 'Le coach',
    verdicts: { book: '{m} est un coup théorique', '?!': '{m} est une imprécision', '?': '{m} est une erreur', '??': '{m} est une gaffe' },
    marks: { '?!': 'Imprécision', '?': 'Erreur', '??': 'Gaffe' },
    flip: 'Retourner l’échiquier',
    first: 'Position de départ',
    prev: 'Coup précédent',
    nextMove: 'Coup suivant',
    last: 'Dernier coup',
    pinned: 'plus tard dans le plan',
  },
};

const state = {
  lang: 'en',
  index: null,
  keys: null,
  names: null,
  chapters: new Map(),
  loading: new Map(),
  moves: [],
  cursor: 0,
  flipped: false,
  selected: null,
  preview: null,
  run: 0,
};

const $ = id => document.getElementById(id);
const keyOf = fen => fen.split(' ').slice(0, 2).join(' ');
const t = () => UI[state.lang];
const langIndex = () => (state.lang === 'fr' ? 1 : 0);
const san = text => (state.lang === 'fr' ? text.replace(/[NBRQK]/g, piece => FRENCH_PIECES[piece]) : text);
const fold = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const uciMove = uci => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });

function node(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'class') el.className = value;
    else if (name.startsWith('on')) el.addEventListener(name.slice(2), value);
    else if (value !== false && value != null) el.setAttribute(name, value === true ? '' : value);
  }
  el.append(...children.flat().filter(child => child != null && child !== false));
  return el;
}

function svg(tag, attrs = {}, parent) {
  const el = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  if (parent) parent.append(el);
  return el;
}

// ---- Data ----

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function loadChapter(slug) {
  if (state.chapters.has(slug)) return Promise.resolve(state.chapters.get(slug));
  if (!state.loading.has(slug)) {
    state.loading.set(slug, fetchJson(`./data/${slug}.json`).then(data => {
      const byKey = new Map(data.positions.map(row => [row.k, row]));
      const chapter = { slug, byKey };
      state.chapters.set(slug, chapter);
      return chapter;
    }));
  }
  return state.loading.get(slug);
}

/** The row of the position `key`, null when there's none, undefined while its chapter loads. */
function lookup(key) {
  if (!state.keys) {
    for (const chapter of state.chapters.values()) if (chapter.byKey.has(key)) return chapter.byKey.get(key);
    return undefined;
  }
  const at = state.keys[key];
  if (at === undefined) return null;
  const slug = state.index.chapters[at].slug;
  const chapter = state.chapters.get(slug);
  if (chapter) return chapter.byKey.get(key) || null;
  loadChapter(slug).then(render);
  return undefined;
}

// ---- The game on the board ----

function positionAt(ply) {
  const game = new Chess();
  for (const uci of state.moves.slice(0, ply)) game.move(uciMove(uci));
  return game;
}

function sanHistory() {
  const game = new Chess();
  return state.moves.map(uci => game.move(uciMove(uci)).san);
}

function play(uci) {
  state.moves = state.moves.slice(0, state.cursor).concat(uci);
  state.cursor += 1;
}

function playLine(ucis, from = state.cursor) {
  const run = ++state.run;
  state.moves = state.moves.slice(0, from);
  state.cursor = from;
  state.selected = null;
  ucis.forEach((uci, i) => {
    setTimeout(() => {
      if (run !== state.run) return;
      play(uci);
      render();
    }, i * STEP_MS);
  });
  if (!ucis.length) render();
}

function goTo(ply) {
  state.run += 1;
  state.cursor = Math.max(0, Math.min(state.moves.length, ply));
  state.selected = null;
  state.preview = null;
  render();
}

function sansToUcis(line) {
  const game = new Chess();
  return line.split(' ').filter(Boolean).map(move => {
    const done = game.move(move);
    return done.from + done.to + (done.promotion || '');
  });
}

// ---- What the coach says about the position ----

/** The position on the board, as the theory knows it. */
function context() {
  const game = positionAt(state.cursor);
  const key = keyOf(game.fen());
  const row = lookup(key);
  if (row === undefined) return { game, loading: true };
  if (row) return { game, row };
  // A mistake of the position before, or a move of its punishment.
  for (let ply = state.cursor - 1; ply >= 0; ply--) {
    const parent = lookup(keyOf(positionAt(ply).fen()));
    if (parent === undefined) return { game, loading: true };
    if (!parent) continue;
    const mistake = (parent.m || []).find(m => m.u === state.moves[ply]);
    const after = state.moves.slice(ply + 1, state.cursor);
    if (mistake && after.every((uci, i) => mistake.pu[i] === uci)) {
      return { game, mistake, parent, at: ply, step: after.length };
    }
    return { game, lost: ply };
  }
  return { game, start: state.cursor === 0 };
}

// ---- Moves with their piece, as the review writes them ----

const PIECE_OF = { K: 'k', Q: 'q', R: 'r', B: 'b', N: 'n' };

/** A move in SAN, with the icon of its piece in `color` ('w' or 'b') before the rest of it. */
function figurine(text, color) {
  const out = document.createDocumentFragment();
  for (const [i, move] of text.split(' ').entries()) {
    if (i) out.append(' ');
    const side = i % 2 === 0 ? color : color === 'w' ? 'b' : 'w';
    const role = move.startsWith('O-O') ? 'k' : PIECE_OF[move[0]] || 'p';
    const rest = PIECE_OF[move[0]] ? move.slice(1) : move;
    out.append(node('i', { class: `pc pc-${side}${role}`, 'aria-hidden': 'true' }), san(rest));
  }
  return out;
}

/** Who plays the first move of a chip: its color tag, or the piece on its first square, or the side to move. */
function chipColor(colorTag, moves, board) {
  if (colorTag) return colorTag;
  const piece = moves.length ? board.get(moves[0].slice(0, 2)) : null;
  return piece ? piece.color : board.turn();
}

function chipButton(chip, colorTag, board, playable) {
  const [text, ucis, canPlay] = chip;
  const moves = ucis ? ucis.split(' ') : [];
  const later = Boolean(colorTag) || !canPlay;
  const label = node('span', { class: 'chip-label', 'aria-label': san(text) }, figurine(text, chipColor(colorTag, moves, board)));
  const button = node('button', {
    type: 'button',
    class: `chip${later ? ' later' : ''}`,
    title: later ? t().pinned : '',
    onmouseenter: () => { state.preview = { arrows: moves, from: board }; drawBoard(); },
    onmouseleave: () => { state.preview = null; drawBoard(); },
    onfocus: () => { state.preview = { arrows: moves, from: board }; drawBoard(); },
    onblur: () => { state.preview = null; drawBoard(); },
    onclick: () => {
      if (!later && playable && moves.length) {
        state.preview = null;
        playLine(moves);
      }
    },
  }, label);
  return button;
}

/** A text with its moves as chips and its squares marked. */
function richText([text, chips], board, playable) {
  const out = node('p', { class: 'coach-text' });
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(MARK)) {
    out.append(text.slice(last, match.index));
    const [, colorTag, , square] = match;
    if (square) {
      out.append(node('span', {
        class: 'square',
        onmouseenter: () => { state.preview = { squares: [square] }; drawBoard(); },
        onmouseleave: () => { state.preview = null; drawBoard(); },
      }, square));
    } else {
      out.append(chipButton(chips[i++], colorTag, board, playable));
    }
    last = match.index + match[0].length;
  }
  out.append(text.slice(last));
  return out;
}

function studyLink(row) {
  const name = row.c[langIndex()];
  const study = state.index.studies[state.lang];
  const found = study.chapters.find(([chapter]) => chapter === name);
  const url = `https://lichess.org/study/${study.id}${found && found[1] ? `/${found[1]}` : ''}`;
  return node('a', { class: 'study-link', href: url, target: '_blank', rel: 'noopener' },
    `${t().study}${state.lang === 'fr' ? '\u00a0:' : ':'} ${name || study.name}`, node('span', { 'aria-hidden': 'true' }, ' ↗'));
}

function moveButton(text, onclick, extra = '', color = null) {
  return node('button', { type: 'button', class: `move ${extra}`, onclick, 'aria-label': san(text) }, color ? figurine(text, color) : san(text));
}

// A button with a sentence on it: its capitals are words, not pieces to translate.
function actionButton(text, onclick, extra = '') {
  return node('button', { type: 'button', class: `move action ${extra}`.trim(), onclick }, text);
}

function markBadge(mark) {
  const badge = node('span', { class: 'mark-icon', role: 'img', title: t().marks[mark], 'aria-label': `${mark} ${t().marks[mark]}` });
  badge.innerHTML = markSvg(mark);
  return badge;
}

// ---- The coach's card, and what follows it ----

let coach = null;
let said = '';
let typing = 0;

/** Types the card's words out, one every WORD_MS, while the coach talks; at once when motion is reduced. */
function typeOut(words) {
  const run = ++typing;
  const units = [];
  const walk = parent => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const pieces = child.textContent.split(/(\s+)/);
        const spans = pieces.map(piece => (piece.trim() ? node('span', { class: 'w off' }, piece) : document.createTextNode(piece)));
        child.replaceWith(...spans);
        units.push(...spans.filter(span => span.nodeType === Node.ELEMENT_NODE));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        child.classList.add('off');
        units.push(child);
      }
    }
  };
  walk(words);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !units.length) {
    for (const unit of units) unit.classList.remove('off');
    return;
  }
  coach?.setTalking(true);
  // By the clock, not by timer ticks: a busy frame shows every word whose time has come.
  const start = performance.now();
  let shown = 0;
  const step = now => {
    if (run !== typing) return;
    const due = Math.min(units.length, Math.floor((now - start) / WORD_MS) + 1);
    while (shown < due) units[shown++].classList.remove('off');
    if (shown < units.length) requestAnimationFrame(step);
    else coach?.setTalking(false);
  };
  requestAnimationFrame(step);
}

/** The card: the coach's mood, a head (an icon, a title, a tag) and the coach's words, as the review's. */
function sayCard({ mood, icon = null, title, tag = null, words, key }) {
  coach?.setMood(mood);
  if (key === said) return;
  said = key;
  const head = node('div', { class: 'coach-head' }, icon, node('h3', { class: 'coach-title' }, title), tag);
  $('coach-say').replaceChildren(head, node('div', { class: 'coach-words' }, words));
  $('coach-say').querySelector('.coach-words').scrollTop = 0;
  typeOut(words);
}

/** The review's verdict for a move: "{m} is a book move", the move with its piece. */
function verdict(kind, sanText, color) {
  const [before, after] = t().verdicts[kind].split('{m}');
  return node('span', {}, before, node('span', { class: 'verdict-move' }, figurine(sanText, color)), after);
}

/** The opening's name under the card, as the review shows it under its own. */
function openingLine(row) {
  if (!row.o) return null;
  const [name, variation] = row.o[1].split(/:\s*/, 2);
  const icon = node('span', { class: 'mark-icon', 'aria-hidden': 'true' });
  icon.innerHTML = markSvg('book');
  return node('div', { class: 'opening-line' }, icon, node('span', { class: 'eco' }, row.o[0]),
    node('span', {}, node('b', {}, name), variation ? `: ${variation}` : ''));
}

function renderPanel(ctx) {
  const parts = [];
  const sans = sanHistory();
  const where = `${state.lang}|${state.moves.slice(0, state.cursor).join(',')}`;
  if (ctx.loading) {
    sayCard({ mood: 'thinking', title: t().loading, words: node('p', { class: 'coach-text muted' }), key: `${where}|loading` });
  } else if (ctx.start) {
    sayCard({ mood: 'happy', title: t().startTitle, words: node('p', { class: 'coach-text' }, t().start), key: `${where}|start` });
    const first = state.chapters.get('core')?.byKey;
    if (first) {
      const options = ['e4', 'd4', 'c4', 'Nf3'];
      parts.push(node('div', { class: 'label' }, t().next),
        node('div', { class: 'moves' }, options.map(move => moveButton(move, () => playLine(sansToUcis(move)), 'theory', 'w'))));
    }
  } else if (ctx.row) {
    const row = ctx.row;
    const turn = ctx.game.turn();
    const played = state.cursor ? sans[state.cursor - 1] : null;
    const book = node('span', { class: 'mark-icon', 'aria-hidden': 'true' });
    book.innerHTML = markSvg('book');
    sayCard({
      mood: 'happy',
      icon: played ? book : null,
      title: played ? verdict('book', played, turn === 'w' ? 'b' : 'w') : state.index.chapters[state.keys?.[row.k] ?? 0][state.lang],
      words: richText(row.t[state.lang], ctx.game, true),
      key: `${where}|row`,
    });
    parts.push(openingLine(row));
    if (row.n.length) {
      parts.push(node('div', { class: 'label' }, t().next),
        node('div', { class: 'moves' }, row.n.map((move, i) => moveButton(move, () => playLine([row.nu[i]]), 'theory', turn))));
    }
    if (row.m?.length) {
      parts.push(node('div', { class: 'label' }, t().mistakes, node('span', { class: 'hint' }, ` · ${t().mistakesHint}`)),
        node('div', { class: 'moves' }, row.m.map(m => node('button', {
          type: 'button', class: 'move mistake-move', onclick: () => playLine([m.u]), 'aria-label': `${san(m.mv)} ${t().marks[m.mk]}`,
        }, figurine(m.mv, turn), markBadge(m.mk)))));
    }
    parts.push(studyLink(row));
  } else if (ctx.mistake) {
    const { mistake, parent, at, step } = ctx;
    const board = positionAt(at + 1);
    const mover = board.turn() === 'w' ? 'b' : 'w';
    const title = verdict(mistake.mk, mistake.mv, mover);
    sayCard({
      mood: step >= mistake.p.length && mistake.p.length ? 'proud' : MOODS[mistake.mk] || 'worry',
      icon: markBadge(mistake.mk),
      title,
      words: richText(mistake.t[state.lang], board, step === 0),
      key: `${state.lang}|${state.moves.slice(0, at + 1).join(',')}|mistake|${step === 0}`,
    });
    if (mistake.p.length) {
      const line = mistake.p.map((move, i) => node('span', { class: `punish-move${i < step ? ' done' : ''}` },
        figurine(move, i % 2 === 0 ? board.turn() : mover)));
      parts.push(node('div', { class: 'label' }, t().punishing),
        node('div', { class: 'punish-line' }, line));
    }
    parts.push(node('div', { class: 'moves' },
      step < mistake.p.length ? actionButton(t().punish, () => playLine(mistake.pu.slice(step), state.cursor)) : null,
      actionButton(t().before, () => goTo(at), 'subtle')));
    parts.push(studyLink(parent));
  } else {
    sayCard({ mood: 'thinking', title: t().none, words: node('p', { class: 'coach-text muted' }, t().noneHint), key: `${where}|none` });
    parts.push(node('div', { class: 'moves' }, actionButton(t().back, () => goTo(ctx.lost))));
  }
  $('explorer-panel-body').replaceChildren(...parts.filter(Boolean));
  renderLine(sans);
}

function renderLine(sans) {
  const line = $('explorer-line');
  const items = [];
  sans.forEach((move, i) => {
    if (i % 2 === 0) items.push(node('span', { class: 'num' }, `${i / 2 + 1}.`));
    items.push(node('button', {
      type: 'button', class: `ply${i + 1 === state.cursor ? ' current' : ''}${i + 1 > state.cursor ? ' ahead' : ''}`,
      onclick: () => goTo(i + 1), 'aria-label': san(move),
    }, figurine(move, i % 2 === 0 ? 'w' : 'b')));
  });
  line.replaceChildren(...items);
  const current = line.querySelector('.current');
  if (current) line.scrollLeft = current.offsetLeft - line.clientWidth / 2;
}

// ---- The board ----

const view = square => {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return state.flipped ? [7 - file, rank] : [file, 7 - rank];
};
const squareAt = (x, y) => {
  const [file, rank] = state.flipped ? [7 - x, y] : [x, 7 - y];
  return FILES[file] + (rank + 1);
};

/** The squares an arrow passes through, centre to centre: a knight's goes in an L, its long leg first. */
function arrowPath(from, to) {
  const start = view(from).map(v => v + 0.5);
  const tip = view(to).map(v => v + 0.5);
  const across = Math.abs(tip[0] - start[0]);
  const down = Math.abs(tip[1] - start[1]);
  const knight = (across === 1 && down === 2) || (across === 2 && down === 1);
  if (!knight) return [start, tip];
  const corner = across > down ? [tip[0], start[1]] : [start[0], tip[1]];
  return [start, corner, tip];
}

/** The outline of an arrow along `points`, as one polygon: its parts never darken where they overlap. */
function arrowOutline(points) {
  const unit = ([x1, y1], [x2, y2]) => {
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    return [(x2 - x1) / length, (y2 - y1) / length];
  };
  const normal = ([x, y]) => [-y, x];
  const half = SHAFT_WIDTH / 2;
  const first = unit(points[0], points[1]);
  const begin = [points[0][0] + first[0] * START_GAP, points[0][1] + first[1] * START_GAP];
  const lastDir = unit(points[points.length - 2], points[points.length - 1]);
  const tip = points[points.length - 1];
  const base = [tip[0] - lastDir[0] * HEAD_LENGTH, tip[1] - lastDir[1] * HEAD_LENGTH];
  const spine = [begin, ...points.slice(1, -1), base];
  const offset = side => spine.map((point, i) => {
    if (i === 0 || i === spine.length - 1) {
      const n = normal(i === 0 ? first : lastDir);
      return [point[0] + n[0] * half * side, point[1] + n[1] * half * side];
    }
    // At the L's corner, along the miter of its two legs.
    const a = normal(unit(spine[i - 1], point));
    const b = normal(unit(point, spine[i + 1]));
    const miter = [a[0] + b[0], a[1] + b[1]];
    const scale = half / ((miter[0] * a[0] + miter[1] * a[1]) || 1);
    return [point[0] + miter[0] * scale * side, point[1] + miter[1] * scale * side];
  });
  const left = offset(1);
  const right = offset(-1).reverse();
  const n = normal(lastDir);
  const wing = side => [base[0] + n[0] * (HEAD_WIDTH / 2) * side, base[1] + n[1] * (HEAD_WIDTH / 2) * side];
  const outline = [...left, wing(1), tip, wing(-1), ...right];
  return outline.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
}

function arrow(layer, from, to, rgb) {
  svg('polygon', { points: arrowOutline(arrowPath(from, to)), fill: `rgba(${rgb},${SHAPE_OPACITY})` }, layer);
}

function circle(layer, square, rgb) {
  const [x, y] = view(square);
  svg('circle', { cx: x + 0.5, cy: y + 0.5, r: 0.44, fill: 'none', stroke: `rgba(${rgb},${SHAPE_OPACITY})`, 'stroke-width': 0.08 }, layer);
}

/** The review's verdict badge, on the top-right corner of the square a move lands on. */
function placeBadge(mark, uci) {
  const frame = $('board').parentElement;
  const current = frame.querySelector('.board-badge');
  const [x, y] = mark && uci ? view(uci.slice(2, 4)) : [];
  const where = mark && uci ? `${mark}|${x}|${y}` : '';
  // The same badge stays as it is: a click or a hover redraws the board, and its entrance would play again.
  if (current && current.dataset.where === where) return;
  current?.remove();
  if (!where) return;
  const badge = node('div', { class: `board-badge${mark === 'book' ? ' book' : ''}`, 'aria-hidden': 'true', 'data-where': where });
  badge.style.left = `${(x + 1) * 12.5}%`;
  badge.style.top = `${y * 12.5}%`;
  badge.innerHTML = markSvg(mark);
  frame.append(badge);
}

function shapesOf(ctx) {
  if (ctx.row) return ctx.row.s || [];
  if (ctx.mistake && ctx.step === 0) return ctx.mistake.s || [];
  return [];
}

let lastContext = null;

function drawBoard(ctx = lastContext) {
  if (!ctx) return;
  lastContext = ctx;
  const board = $('board');
  board.replaceChildren();
  const game = ctx.game;
  const last = state.cursor > 0 ? state.moves[state.cursor - 1] : null;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const square = squareAt(x, y);
      const dark = (x + y) % 2 === 1;
      svg('rect', { x, y, width: 1, height: 1, class: dark ? 'sq dark' : 'sq light' }, board);
      if (last && (square === last.slice(0, 2) || square === last.slice(2, 4))) {
        svg('rect', { x, y, width: 1, height: 1, class: 'sq last' }, board);
      }
      if (state.selected === square) svg('rect', { x, y, width: 1, height: 1, class: 'sq selected' }, board);
      const coordClass = dark ? 'coord on-dark' : 'coord on-light';
      if (y === 7) svg('text', { x: x + 0.94, y: y + 0.95, 'text-anchor': 'end', class: coordClass }, board).textContent = square[0];
      if (x === 0) svg('text', { x: x + 0.05, y: y + 0.2, class: coordClass }, board).textContent = square[1];
    }
  }
  if (game.inCheck()) {
    const king = game.board().flat().find(piece => piece && piece.type === 'k' && piece.color === game.turn());
    if (king) {
      const [x, y] = view(king.square);
      svg('circle', { cx: x + 0.5, cy: y + 0.5, r: 0.5, class: 'check' }, board);
    }
  }
  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const [x, y] = view(piece.square);
      svg('image', {
        href: `./pieces/${piece.color}${piece.type.toUpperCase()}.svg`, x, y, width: 1, height: 1,
        class: `piece${dragging && dragging.from === piece.square ? ' lifted' : ''}`,
      }, board);
    }
  }
  if (state.selected) {
    for (const move of game.moves({ square: state.selected, verbose: true })) {
      const [x, y] = view(move.to);
      if (move.captured) svg('circle', { cx: x + 0.5, cy: y + 0.5, r: 0.45, class: 'dest capture' }, board);
      else svg('circle', { cx: x + 0.5, cy: y + 0.5, r: 0.155, class: 'dest' }, board);
    }
  }
  const layer = svg('g', { class: 'shapes' }, board);
  if (state.preview) {
    for (const square of state.preview.squares || []) circle(layer, square, PREVIEW);
    for (const uci of state.preview.arrows || []) arrow(layer, uci.slice(0, 2), uci.slice(2, 4), PREVIEW);
  } else {
    for (const shape of shapesOf(ctx)) {
      const color = BRUSH[shape[0]];
      if (shape.length === 3) circle(layer, shape.slice(1), color);
      else arrow(layer, shape.slice(1, 3), shape.slice(3, 5), color);
    }
  }
  // A mistake's mark, or the book's, on the square the last move landed on.
  if (ctx.mistake && ctx.step === 0) placeBadge(ctx.mistake.mk, last);
  else if (ctx.row && last) placeBadge('book', last);
  else placeBadge(null);
  if (dragging?.point) {
    const piece = game.get(dragging.from);
    if (piece) {
      svg('image', {
        href: `./pieces/${piece.color}${piece.type.toUpperCase()}.svg`,
        x: dragging.point[0] - 0.5, y: dragging.point[1] - 0.5, width: 1, height: 1, class: 'piece dragged',
      }, board);
    }
  }
}

let dragging = null;

function boardPoint(event) {
  const box = $('board').getBoundingClientRect();
  return [((event.clientX - box.left) / box.width) * 8, ((event.clientY - box.top) / box.height) * 8];
}

function tryMove(from, to) {
  const game = positionAt(state.cursor);
  const legal = game.moves({ square: from, verbose: true }).find(move => move.to === to);
  if (!legal) return false;
  state.run += 1;
  state.selected = null;
  play(from + to + (legal.promotion ? 'q' : ''));
  render();
  return true;
}

function setupBoard() {
  const board = $('board');
  board.addEventListener('pointerdown', event => {
    const [px, py] = boardPoint(event);
    const square = squareAt(Math.floor(px), Math.floor(py));
    const game = positionAt(state.cursor);
    const piece = game.get(square);
    if (state.selected && state.selected !== square && tryMove(state.selected, square)) return;
    if (piece && piece.color === game.turn()) {
      state.selected = square;
      dragging = { from: square, point: null, start: [px, py] };
      board.setPointerCapture(event.pointerId);
    } else {
      state.selected = null;
    }
    drawBoard();
  });
  board.addEventListener('pointermove', event => {
    if (!dragging) return;
    const point = boardPoint(event);
    if (!dragging.point && Math.hypot(point[0] - dragging.start[0], point[1] - dragging.start[1]) < 0.2) return;
    dragging.point = point;
    drawBoard();
  });
  const drop = event => {
    if (!dragging) return;
    const moved = dragging.point;
    const from = dragging.from;
    dragging = null;
    if (moved) {
      const [px, py] = boardPoint(event);
      const to = squareAt(Math.max(0, Math.min(7, Math.floor(px))), Math.max(0, Math.min(7, Math.floor(py))));
      if (to !== from && tryMove(from, to)) return;
    }
    drawBoard();
  };
  board.addEventListener('pointerup', drop);
  board.addEventListener('pointercancel', () => { dragging = null; drawBoard(); });
}

// ---- Search and controls ----

async function setupSearch() {
  const input = $('explorer-search');
  const list = $('explorer-results');
  let active = -1;
  let found = [];
  const close = () => { list.hidden = true; active = -1; };
  const choose = row => {
    close();
    input.value = row[1];
    input.blur();
    playLine(sansToUcis(row[2]).slice(0, row[3]), 0);
  };
  const show = () => {
    list.replaceChildren(...(found.length ? found.map((row, i) => node('li', {
      class: i === active ? 'active' : '', role: 'option',
      onpointerdown: event => { event.preventDefault(); choose(row); },
    }, node('span', { class: 'eco' }, row[0]), node('span', { class: 'name' }, row[1]),
    node('span', { class: 'depth' }, t().explained(row[3])))) : [node('li', { class: 'empty' }, t().noMatch)]));
    list.hidden = false;
  };
  const search = async () => {
    if (!state.names) state.names = await fetchJson('./data/names.json');
    const words = fold(input.value).split(/\s+/).filter(Boolean);
    if (!words.length) return close();
    found = state.names
      .filter(row => { const text = fold(`${row[0]} ${row[1]}`); return words.every(word => text.includes(word)); })
      .sort((a, b) => a[1].length - b[1].length)
      .slice(0, 12);
    active = found.length ? 0 : -1;
    show();
  };
  input.addEventListener('focus', () => { if (!state.names) fetchJson('./data/names.json').then(names => { state.names = names; }); });
  input.addEventListener('input', search);
  input.addEventListener('blur', () => setTimeout(close, 100));
  input.addEventListener('keydown', event => {
    if (list.hidden) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length;
      show();
    } else if (event.key === 'Enter' && found[active]) {
      event.preventDefault();
      choose(found[active]);
    } else if (event.key === 'Escape') {
      close();
    }
  });
}

// ---- The family picker: a filterable listbox in a popover, in the style of the landing page ----

const picker = { value: '', open: false, active: -1 };
const plain = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function pickerOptions() {
  return [...$('explorer-family-list').querySelectorAll('[role="option"]:not([hidden])')];
}

function fillPicker() {
  const list = $('explorer-family-list');
  const groups = { e4: [], d4: [], other: [] };
  for (const chapter of state.index.chapters) {
    const first = chapter.start.split(' ')[0];
    groups[first in groups ? first : 'other'].push(chapter);
  }
  const check = () => {
    const icon = document.createElementNS(SVG, 'svg');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    icon.classList.add('select-check');
    icon.innerHTML = '<path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
    return icon;
  };
  list.replaceChildren(...Object.entries(groups).filter(([, chapters]) => chapters.length).map(([group, chapters]) =>
    node('div', { class: 'select-group', role: 'group', 'aria-label': t().groups[group] },
      node('div', { class: 'select-label', 'aria-hidden': 'true' }, t().groups[group]),
      chapters.map(chapter => node('div', {
        class: 'select-item', role: 'option', id: `family-${chapter.slug}`, 'data-value': chapter.slug,
        // Both names match, so a French reader can type "Italian" and an English one "italienne".
        'data-search': plain(`${chapter.en} ${chapter.fr} ${chapter.start}`),
        'aria-selected': String(chapter.slug === picker.value),
        onpointermove: event => highlight(pickerOptions().indexOf(event.currentTarget), false),
        onclick: () => choosePicker(chapter.slug),
      }, check(), node('span', {}, chapter[state.lang]))))));
  const filter = $('explorer-family-filter');
  filter.placeholder = t().filter;
  filter.setAttribute('aria-label', t().filter);
  $('explorer-family-empty').textContent = t().noMatch;
  setPicker(picker.value);
  if (picker.open) filterPicker();
}

function setPicker(slug) {
  picker.value = slug || '';
  const chapter = state.index.chapters.find(each => each.slug === picker.value);
  const value = $('explorer-family-value');
  value.textContent = chapter ? chapter[state.lang] : t().noFamily;
  value.classList.toggle('placeholder', !chapter);
  for (const option of $('explorer-family-list').querySelectorAll('[role="option"]')) {
    option.setAttribute('aria-selected', String(option.dataset.value === picker.value));
  }
}

function highlight(index, scroll = true) {
  const options = pickerOptions();
  picker.active = options.length ? Math.max(0, Math.min(index, options.length - 1)) : -1;
  for (const option of $('explorer-family-list').querySelectorAll('[role="option"]')) option.classList.remove('active');
  const option = options[picker.active];
  const filter = $('explorer-family-filter');
  if (!option) { filter.removeAttribute('aria-activedescendant'); return; }
  option.classList.add('active');
  filter.setAttribute('aria-activedescendant', option.id);
  if (scroll) option.scrollIntoView({ block: 'nearest' });
}

function filterPicker() {
  const words = plain($('explorer-family-filter').value).split(/\s+/).filter(Boolean);
  for (const group of $('explorer-family-list').querySelectorAll('.select-group')) {
    let shown = 0;
    for (const option of group.querySelectorAll('[role="option"]')) {
      option.hidden = !words.every(word => option.dataset.search.includes(word));
      shown += !option.hidden;
    }
    group.hidden = !shown;
  }
  const options = pickerOptions();
  $('explorer-family-empty').hidden = options.length > 0;
  const selected = options.findIndex(option => option.dataset.value === picker.value);
  highlight(words.length || selected < 0 ? 0 : selected);
}

function openPicker() {
  if (picker.open) return;
  picker.open = true;
  const root = $('explorer-family');
  const rect = root.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - 16;
  const above = rect.top - (document.querySelector('.nav')?.getBoundingClientRect().bottom || 0) - 16;
  const up = below < 260 && above > below;
  root.classList.toggle('up', up);
  // The list's room, after the filter field (about 52 pixels).
  $('explorer-family-list').style.maxHeight = `${Math.max(140, Math.min(320, (up ? above : below) - 52))}px`;
  $('explorer-family-popover').hidden = false;
  $('explorer-family-trigger').setAttribute('aria-expanded', 'true');
  const filter = $('explorer-family-filter');
  filter.value = '';
  filterPicker();
  pickerOptions()[picker.active]?.scrollIntoView({ block: 'center' });
  filter.focus({ preventScroll: true });
}

function closePicker(refocus = true) {
  if (!picker.open) return;
  picker.open = false;
  $('explorer-family-popover').hidden = true;
  $('explorer-family-trigger').setAttribute('aria-expanded', 'false');
  if (refocus) $('explorer-family-trigger').focus({ preventScroll: true });
}

function choosePicker(slug) {
  closePicker();
  const chapter = state.index.chapters.find(each => each.slug === slug);
  if (!chapter) return;
  setPicker(slug);
  playLine(sansToUcis(chapter.start), 0);
}

function setupPicker() {
  const trigger = $('explorer-family-trigger');
  const filter = $('explorer-family-filter');
  trigger.addEventListener('click', () => (picker.open ? closePicker() : openPicker()));
  trigger.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); openPicker(); }
  });
  filter.addEventListener('input', filterPicker);
  filter.addEventListener('keydown', event => {
    const options = pickerOptions();
    const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
    if (event.key in steps) { event.preventDefault(); highlight(picker.active + steps[event.key]); }
    else if (event.key === 'Enter') { event.preventDefault(); if (options[picker.active]) choosePicker(options[picker.active].dataset.value); }
    else if (event.key === 'Escape') { event.preventDefault(); closePicker(); }
    else if (event.key === 'Tab') { closePicker(false); }
  });
  document.addEventListener('pointerdown', event => {
    if (picker.open && !$('explorer-family').contains(event.target)) closePicker(false);
  });
  window.addEventListener('resize', () => closePicker(false));
}

function setupControls() {
  setupPicker();
  for (const button of document.querySelectorAll('#explorer-lang button')) {
    button.addEventListener('click', () => setLanguage(button.dataset.lang));
  }
  $('nav-first').addEventListener('click', () => goTo(0));
  $('nav-prev').addEventListener('click', () => goTo(state.cursor - 1));
  $('nav-next').addEventListener('click', () => goTo(state.cursor + 1));
  $('nav-last').addEventListener('click', () => goTo(state.moves.length));
  $('nav-flip').addEventListener('click', () => { state.flipped = !state.flipped; drawBoard(); });
  const toggle = $('nav-sound');
  toggle.setAttribute('aria-pressed', String(soundOn()));
  toggle.addEventListener('click', () => {
    setSound(!soundOn());
    toggle.setAttribute('aria-pressed', String(soundOn()));
  });
  document.addEventListener('keydown', event => {
    if (event.target.closest('input, textarea, select, [role="listbox"]') || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!$('explorer').contains(document.activeElement) && document.activeElement !== document.body) return;
    const moves = { ArrowLeft: -1, ArrowRight: 1 };
    if (event.key in moves) { event.preventDefault(); goTo(state.cursor + moves[event.key]); }
    if (event.key === 'Home') { event.preventDefault(); goTo(0); }
    if (event.key === 'End') { event.preventDefault(); goTo(state.moves.length); }
    if (event.key === 'f') { state.flipped = !state.flipped; drawBoard(); }
  });
}

function setLanguage(lang) {
  state.lang = lang === 'fr' ? 'fr' : 'en';
  try { localStorage.setItem('explorer-lang', state.lang); } catch {}
  const group = $('explorer-lang');
  group.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === state.lang)));
  $('explorer').setAttribute('lang', state.lang);
  $('explorer-search').placeholder = t().search;
  $('coach-avatar').setAttribute('aria-label', t().coach);
  said = '';
  $('explorer-family-label').textContent = t().family;
  fillPicker();
  for (const [id, label] of [['nav-first', 'first'], ['nav-prev', 'prev'], ['nav-next', 'nextMove'], ['nav-last', 'last'], ['nav-flip', 'flip'], ['nav-sound', 'sound']]) {
    $(id).title = t()[label];
    $(id).setAttribute('aria-label', t()[label]);
  }
  render();
}

// ---- The page's address ----

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const moves = (params.get('moves') || '').split(',').filter(uci => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci));
  const game = new Chess();
  const legal = [];
  for (const uci of moves) {
    try { game.move(uciMove(uci)); legal.push(uci); } catch { break; }
  }
  return { moves: legal, lang: params.get('lang') };
}

function writeHash() {
  const moves = state.moves.slice(0, state.cursor);
  const hash = moves.length ? `#moves=${moves.join(',')}` : '';
  if (location.hash.startsWith('#moves=') || moves.length) {
    window.history.replaceState(null, '', hash || location.pathname + location.search);
  }
}

let heard = 0;

/** The sound of the move just played, when the board went one move on. */
function sound() {
  if (state.cursor === heard + 1) {
    const game = positionAt(heard);
    try { playMove(game.move(uciMove(state.moves[heard]))); } catch {}
  }
  heard = state.cursor;
}

function render() {
  sound();
  const ctx = context();
  drawBoard(ctx);
  renderPanel(ctx);
  const at = ctx.row ? state.keys?.[ctx.row.k] : ctx.parent ? state.keys?.[ctx.parent.k] : undefined;
  if (at !== undefined) setPicker(state.index.chapters[at].slug);
  else if (ctx.start) setPicker('');
  $('nav-prev').disabled = $('nav-first').disabled = state.cursor === 0;
  $('nav-next').disabled = $('nav-last').disabled = state.cursor >= state.moves.length;
  writeHash();
}

async function main() {
  setupBoard();
  const start = readHash();
  let saved = null;
  try { saved = localStorage.getItem('explorer-lang'); } catch {}
  state.lang = start.lang || saved || 'en';
  state.moves = start.moves;
  state.cursor = start.moves.length;
  heard = state.cursor;
  coach = new Coach($('coach-avatar'));
  lastContext = { game: positionAt(state.cursor) };
  drawBoard();
  try {
    [state.index, state.keys] = await Promise.all([fetchJson('./data/index.json'), fetchJson('./data/keys.json'), loadChapter('core')]);
  } catch (error) {
    $('coach-say').replaceChildren(node('div', { class: 'coach-head' }, node('h3', { class: 'coach-title' }, `The theory could not be loaded (${error.message}).`)));
    return;
  }
  setupControls();
  setupSearch();
  setLanguage(state.lang);
  // A link of the paper to a position (app.js).
  window.addEventListener('explore', () => {
    const next = readHash();
    state.run += 1;
    state.moves = next.moves;
    state.cursor = next.moves.length;
    heard = state.cursor;
    state.selected = null;
    render();
  });
}

main();
