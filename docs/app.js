// Draws the paper's figures from results.json (written by tools/build.py), and switches the scheme.

const NS = 'http://www.w3.org/2000/svg';
const nf = new Intl.NumberFormat('en-US');
const pct = (value, digits = 0) => `${(value * 100).toFixed(digits)}%`;
let results;

const el = (tag, attrs = {}, parent) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (parent) parent.append(node);
  return node;
};

// ---- The scheme ----

function setupScheme() {
  const button = document.getElementById('scheme-switch');
  button.addEventListener('click', () => {
    const light = document.documentElement.dataset.scheme !== 'light';
    if (light) document.documentElement.dataset.scheme = 'light';
    else delete document.documentElement.dataset.scheme;
    try { localStorage.setItem('scheme', light ? 'light' : 'dark'); } catch {}
    drawCharts();
  });
}

// ---- Figures in the text ----

function billions(value) {
  return `${(value / 1e9).toFixed(1)} billion`;
}

function fillValues() {
  const t = results.totals;
  const c = results.coverage;
  const lib = results.library;
  const values = {
    positions: nf.format(t.positions),
    mistakes: nf.format(t.mistakes),
    texts: nf.format(t.texts),
    chapters: nf.format(t.chapters),
    chaptersEn: results.languages.en.chapters,
    chaptersFr: results.languages.fr.chapters,
    maxCharsEn: nf.format(results.languages.en.maxChars),
    namedLines: nf.format(c.namedLines),
    families: nf.format(c.families),
    namedCovered: nf.format(c.namedCovered),
    explorerGames: billions(c.explorerGames),
    positionsWithGames: nf.format(c.positionsWithGames),
    tokMove: nf.format(t.tokens.move),
    tokSeq: nf.format(t.tokens.sequence),
    tokSquare: nf.format(t.tokens.square),
    tokLater: nf.format(t.tokens.later),
    shapes: nf.format(t.shapes),
    punishMoves: nf.format(t.punishMoves),
    frequentErrors: nf.format(results.errors[0].errors),
    mistakesAdded: results.review ? nf.format(results.review.totals.mistakesAdded) : undefined,
    mistakesRemoved: results.review ? nf.format(results.review.totals.mistakesRemoved) : undefined,
    deep: nf.format(results.plies.filter(([ply]) => ply > 16).reduce((sum, [, count]) => sum + count, 0)),
  };
  if (lib) {
    const source = name => lib.sources.find(row => row.source === name) || {};
    const ideas = lib.ideas;
    Object.assign(values, {
      ideasCount: nf.format(ideas.count),
      videosCited: nf.format(ideas.videosCited),
      channelsCited: nf.format(ideas.channelsCited),
      ideasConfirmed: nf.format(ideas.status.confirmed),
      ideasRejected: nf.format(ideas.status.rejected),
      ideasWithVideo: nf.format(ideas.withVideo),
      videoConfirmed: nf.format(ideas.withVideoStatus.confirmed),
      videos: nf.format(source('YouTube catalog').count),
      transcripts: nf.format(source('YouTube transcripts').count),
      transcriptWords: `${(source('YouTube transcripts').words / 1e6).toFixed(1)} million`,
    });
    const [hours, channels] = (source('YouTube catalog').detail || '').match(/\d[\d,]*/g) || [];
    if (hours) values.hours = hours;
    if (channels) values.channels = channels;
  }
  for (const node of document.querySelectorAll('[data-value]')) {
    const value = values[node.dataset.value];
    if (value !== undefined) node.textContent = value;
  }
}

// ---- Chart frame and tooltip ----

function frame(box, { aspect = 0.42, margin = {}, x, y, xTicks = [], yTicks, yFormat = nf.format, xFormat = String, yTitle, xTitle, minH = 200, maxH = 380 }) {
  box.querySelector('svg')?.remove();
  const W = Math.max(280, box.clientWidth);
  const H = Math.round(Math.min(maxH, Math.max(minH, W * aspect)));
  const m = { l: 46, r: 10, t: 12, b: xTitle ? 42 : 26, ...margin };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
  box.prepend(svg);
  const X = v => m.l + ((v - x[0]) / (x[1] - x[0])) * (W - m.l - m.r);
  const Y = v => H - m.b - ((v - y[0]) / (y[1] - y[0])) * (H - m.t - m.b);
  for (const v of yTicks) {
    el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: v === y[0] ? 'axis-line' : 'grid-line' }, svg);
    el('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = yFormat(v);
  }
  for (const v of xTicks) el('text', { x: X(v), y: H - m.b + 17, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = xFormat(v);
  if (xTitle) el('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-title' }, svg).textContent = xTitle;
  if (yTitle) {
    const mid = (m.t + H - m.b) / 2;
    el('text', { x: 11, y: mid, transform: `rotate(-90 11 ${mid})`, 'text-anchor': 'middle', class: 'axis-title' }, svg).textContent = yTitle;
  }
  return { svg, X, Y, W, H, m };
}

function tooltip(box) {
  let tip = box.querySelector('.tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tooltip';
    box.append(tip);
  }
  return {
    show(html, event) {
      const bounds = box.getBoundingClientRect();
      tip.innerHTML = html;
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      const width = tip.offsetWidth;
      tip.style.left = `${x + 14 + width > bounds.width ? Math.max(0, x - 14 - width) : x + 14}px`;
      tip.style.top = `${Math.max(0, y - 30)}px`;
      tip.style.opacity = 1;
    },
    hide() { tip.style.opacity = 0; },
  };
}

// A bar with rounded data end, anchored to the baseline.
function bar(svg, x, y, width, height, fill, radius = 4) {
  const r = Math.min(radius, width / 2, height);
  const d = height <= 0 ? '' : `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
  return el('path', { d, fill, class: 'bar' }, svg);
}

function hbar(svg, x, y, width, height, fill, radius = 4) {
  const r = Math.min(radius, height / 2, width);
  const d = width <= 0 ? '' : `M${x},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height - r}Q${x + width},${y + height} ${x + width - r},${y + height}H${x}Z`;
  return el('path', { d, fill, class: 'bar' }, svg);
}

const legend = (id, items) => {
  document.getElementById(id).innerHTML = items.map(([color, label]) => `<span><i style="background:${color}"></i>${label}</span>`).join('');
};

// ---- The figures ----

function reachChart() {
  const box = document.getElementById('chart-reach');
  const rows = results.coverage.gamesByPly.slice(0, 16);
  const f = frame(box, { x: [0.5, rows.length + 0.5], y: [0, 1], yTicks: [0, 0.25, 0.5, 0.75, 1], yFormat: v => pct(v), xTicks: rows.map(([ply]) => ply), xTitle: 'Half-move', aspect: 0.34 });
  const tip = tooltip(box);
  const width = (f.X(2) - f.X(1)) * 0.72;
  for (const [ply, share] of rows) {
    const x = f.X(ply) - width / 2;
    const node = bar(f.svg, x, f.Y(share), width, f.Y(0) - f.Y(share), 'var(--series-1)');
    if ([2, 4, 6, 8, 10].includes(ply)) {
      el('text', { x: f.X(ply), y: f.Y(share) - 6, 'text-anchor': 'middle', class: 'direct' }, f.svg).textContent = pct(share);
    }
    const move = Math.ceil(ply / 2);
    node.addEventListener('pointermove', event => tip.show(`Half-move <b>${ply}</b> (${move}.${ply % 2 ? '' : '..'})<br><b>${pct(share, 1)}</b> of the games`, event));
    node.addEventListener('pointerleave', () => tip.hide());
  }
}

function bandsChart() {
  const box = document.getElementById('chart-bands');
  const bands = results.coverage.namedByGames;
  const label = ([low, high]) => (high == null ? `over ${short(low)}` : low === 0 ? `under ${short(high)}` : `${short(low)}–${short(high)}`);
  legend('bands-legend', [['var(--series-1)', 'Position explained'], ['var(--series-2)', 'Not explained']]);
  box.querySelector('svg')?.remove();
  const W = Math.max(280, box.clientWidth);
  const rowH = 30, gap = 12, left = 104, right = 128;
  const H = bands.length * (rowH + gap) + 4;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
  box.prepend(svg);
  const tip = tooltip(box);
  const max = Math.max(...bands.map(b => b[2]));
  const scale = v => (v / max) * (W - left - right);
  bands.forEach((band, i) => {
    const [, , lines, covered] = band;
    const y = i * (rowH + gap);
    el('text', { x: left - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = `${label(band)} games`;
    const a = hbar(svg, left, y, Math.max(0, scale(covered) - 1), rowH, 'var(--series-1)', 0);
    const b = hbar(svg, left + scale(covered) + 1, y, Math.max(0, scale(lines - covered) - 1), rowH, 'var(--series-2)');
    el('text', { x: left + scale(lines) + 8, y: y + rowH / 2 + 4, class: 'direct' }, svg).textContent = `${pct(covered / lines)} · ${nf.format(covered)} of ${nf.format(lines)}`;
    for (const node of [a, b]) {
      node.addEventListener('pointermove', event => tip.show(`Reached by ${label(band)} games<br><b>${nf.format(covered)}</b> of ${nf.format(lines)} lines explained`, event));
      node.addEventListener('pointerleave', () => tip.hide());
    }
  });
}

const short = v => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : String(v));

function pliesChart() {
  const box = document.getElementById('chart-plies');
  const rows = results.plies.filter(([ply]) => ply <= 24);
  legend('plies-legend', [['var(--series-1)', 'Positions'], ['var(--mistake)', 'Mistakes']]);
  const max = Math.max(...rows.map(([, p, m]) => p + m));
  const top = Math.ceil(max / 200) * 200;
  const f = frame(box, { x: [0.5, rows.length + 0.5], y: [0, top], yTicks: [0, top / 4, top / 2, (3 * top) / 4, top], xTicks: rows.map(([ply]) => ply).filter(ply => ply % 2 === 0), xTitle: 'Half-move', aspect: 0.48 });
  const tip = tooltip(box);
  const width = (f.X(2) - f.X(1)) * 0.72;
  for (const [ply, positions, mistakes] of rows) {
    const x = f.X(ply) - width / 2;
    const a = bar(f.svg, x, f.Y(positions), width, f.Y(0) - f.Y(positions), 'var(--series-1)', 0);
    const b = bar(f.svg, x, f.Y(positions + mistakes), width, Math.max(0, f.Y(positions) - f.Y(positions + mistakes) - 2), 'var(--mistake)');
    for (const node of [a, b]) {
      node.addEventListener('pointermove', event => tip.show(`Half-move <b>${ply}</b><br>${nf.format(positions)} positions · ${nf.format(mistakes)} mistakes`, event));
      node.addEventListener('pointerleave', () => tip.hide());
    }
  }
}

// ---- From the videos to the book ----

function funnel() {
  const lib = results.library;
  const box = document.getElementById('funnel');
  if (!lib || !box) return;
  const source = name => lib.sources.find(row => row.source === name) || {};
  const steps = [
    [source('YouTube catalog').count, 'videos catalogued', `${source('YouTube catalog').detail}, in five languages`],
    [source('YouTube transcripts').count, 'transcribed', `${(source('YouTube transcripts').words / 1e6).toFixed(1)} million words`],
    [lib.ideas.count, 'ideas noted', 'each tied to its position and its sources'],
    [lib.ideas.status.confirmed, 'confirmed', 'by the engine, the board and a human source'],
    [results.totals.positions, 'positions written', `and ${nf.format(results.totals.mistakes)} classic mistakes`],
  ];
  box.innerHTML = steps.map(([value, label, note]) => `<li><b>${nf.format(value)}</b><span class="label">${label}</span><span class="note">${note}</span></li>`).join('');
}

function rankChart(id, rows, format, color = 'var(--series-1)') {
  const box = document.getElementById(id);
  if (!box) return;
  box.querySelector('svg')?.remove();
  const W = Math.max(280, box.clientWidth);
  const rowH = 22, gap = 9, left = Math.min(176, W * 0.46), right = 52;
  const H = rows.length * (rowH + gap) - gap + 2;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
  box.prepend(svg);
  const tip = tooltip(box);
  const max = Math.max(...rows.map(([, value]) => value));
  rows.forEach(([name, value], i) => {
    const y = i * (rowH + gap);
    el('text', { x: left - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'tick rank-name' }, svg).textContent = name;
    const width = Math.max(2, (value / max) * (W - left - right));
    const node = hbar(svg, left, y, width, rowH, color);
    el('text', { x: left + width + 7, y: y + rowH / 2 + 4, class: 'direct' }, svg).textContent = nf.format(value);
    node.addEventListener('pointermove', event => tip.show(`<b>${name}</b><br>${format(value)}`, event));
    node.addEventListener('pointerleave', () => tip.hide());
  });
}

function channelsChart() {
  const lib = results.library;
  if (!lib?.ideas?.topChannels) return;
  rankChart('chart-channels', lib.ideas.topChannels, value => `cited by ${nf.format(value)} ideas`);
}

function kindsChart() {
  const lib = results.library;
  if (!lib?.ideas?.kinds) return;
  const names = { plan: 'Plans', mistake: 'Typical mistakes', trap: 'Traps', idea: 'Tactical ideas', history: 'History', 'move-order': 'Move-order tricks', structure: 'Pawn structures' };
  const rows = Object.entries(lib.ideas.kinds).filter(([kind]) => names[kind]).map(([kind, count]) => [names[kind], count]);
  rankChart('chart-kinds', rows, value => `${nf.format(value)} ideas`);
}

const escape = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// The theory's markup, for reading: moves in bold, squares underlined.
function markup(text) {
  return escape(text)
    .replace(/\{(?:[wb]:)?([^}]+)\}/g, '<b class="move">$1</b>')
    .replace(/\[([a-h][1-8])\]/g, '<span class="square">$1</span>');
}

const seconds = stamp => stamp.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);

function traceFigure() {
  const trace = results.trace;
  const ideas = results.library?.trace?.ideas;
  const figure = document.getElementById('trace-figure');
  if (!trace || !ideas) { if (figure) figure.hidden = true; return; }
  const kinds = { plan: 'Plan', history: 'History', idea: 'Idea', mistake: 'Mistake', trap: 'Trap' };
  document.getElementById('trace-ideas').innerHTML = ideas.map(idea => `<li>
      <span class="kind">${kinds[idea.kind] || idea.kind}</span>
      <p>${escape(idea.idea)}</p>
      <p class="sources">${idea.sources.map(source => source.video
        ? `<a class="source video" href="https://www.youtube.com/watch?v=${encodeURIComponent(source.video)}&amp;t=${seconds(source.t)}s" target="_blank" rel="noopener"><svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M5 3.5v9l7-4.5z" fill="currentColor"/></svg>${escape(source.channel)} <span>${escape(source.t)}</span></a>`
        : `<span class="source">${escape(source.name)}</span>`).join('')}</p>
    </li>`).join('');
  document.getElementById('trace-text').innerHTML = markup(trace.en);
}

// ---- Tables ----

function table(id, head, rows) {
  const html = `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
  document.getElementById(id).innerHTML = html;
}

function familiesTable() {
  const rows = results.coverage.topFamilies.slice(0, 10);
  table('table-families', ['Family', 'Named lines', 'Explained'], rows.map(([name, lines, covered]) => [
    name, nf.format(lines),
    `${nf.format(covered)} <span class="share">${pct(covered / lines)}</span><span class="meter-cell"><i style="width:${pct(covered / lines)}"></i></span>`,
  ]));
}

function libraryTable() {
  const lib = results.library;
  if (!lib) return;
  const size = row => row.words ? `${nf.format(row.words)} words` : row.chars ? `${nf.format(row.chars)} characters` : row.detail || '';
  table('table-library', ['Source', 'Count', 'Volume'], lib.sources.map(row => [
    row.source, `${nf.format(row.count)} <span class="share">${row.unit}</span>`, `<span class="share">${row.detail && (row.words || row.chars) ? `${size(row)}` : size(row)}</span>`,
  ]));
}

function errorsTable() {
  const rows = results.errors;
  table('table-errors', ['Played in', 'Loses', 'Frequent errors', 'Covered', 'Covered, by games'], rows.map(row => [
    `${pct(row.share)}+ of games${row.inTheory ? ', in the book’s positions' : ''}`,
    `${row.loss}+ cp`,
    nf.format(row.errors),
    `${nf.format(row.mistakes + row.entries)} <span class="share">${pct((row.mistakes + row.entries) / row.errors)}</span>`,
    `<b>${pct(row.gamesShare, 1)}</b>`,
  ]));
}

function marksTiles() {
  const marks = results.totals.marks;
  const names = { '?!': ['inaccuracy', 'inaccuracies, about 70 to 89 centipawns'], '?': ['mistake', 'mistakes, 90 to 399 centipawns'], '??': ['blunder', 'blunders, 400 or more, or a piece'] };
  document.getElementById('marks').innerHTML = Object.entries(names).map(([mark, [kind, note]]) => `<div class="tile"><div class="value"><span class="mark-icon" data-mark="${mark}" aria-label="${mark}">${globalThis.markSvg ? globalThis.markSvg(mark) : mark}</span>${nf.format(marks[mark])}</div><div class="note">${note}</div></div>`).join('');
}

function reviewFigure() {
  const review = results.review;
  const figure = document.getElementById('review-figure');
  if (!review) { figure.hidden = true; return; }
  const dash = v => (v == null ? '–' : nf.format(v));
  const span = ([before, after]) => `${nf.format(before)} <span class="share">→</span> ${nf.format(after)}`;
  table('table-review', ['Family group', 'Positions', 'Mistakes', 'Board errors', 'Marks'], review.lots.map(lot => [
    lot.name, span(lot.positions), span(lot.mistakes), dash(lot.board), dash(lot.marks),
  ]).concat([[
    '<b>All sixteen</b>', `<b>${span(review.totals.positions)}</b>`, `<b>${span(review.totals.mistakes)}</b>`,
    `<b>${nf.format(review.totals.board)}</b>`, `<b>${nf.format(review.totals.marks)}</b>`,
  ]]));
}

function drawCharts() {
  if (!results) return;
  reachChart();
  bandsChart();
  pliesChart();
  channelsChart();
  kindsChart();
}

// A link to a position of the explorer: the explorer reads the address again.
function setupExploreLinks() {
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#moves=')) window.dispatchEvent(new CustomEvent('explore'));
  });
  // Delegated, so the links drawn from the data later work too.
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-explore]')) return;
    setTimeout(() => document.getElementById('explorer').scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  });
}

// The bar's star button shows the count of the Lichess Neo repository, read from GitHub's API once the page
// is up. Offline or rate-limited, the star shows alone.
async function showStars() {
  const figure = document.querySelector('.star-link__count b');
  if (!figure) return;
  const response = await fetch('https://api.github.com/repos/theophile-wallez/LichessNeo', { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) return;
  const stars = (await response.json())?.stargazers_count;
  if (!Number.isFinite(stars)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { figure.textContent = nf.format(stars); return; }
  const start = performance.now();
  const duration = Math.min(1200, 500 + stars * 4);
  const step = now => {
    const progress = Math.min(1, (now - start) / duration);
    figure.textContent = nf.format(Math.round(stars * (1 - (1 - progress) ** 3)));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function main() {
  setupScheme();
  setupExploreLinks();
  showStars().catch(() => undefined);
  results = await (await fetch('./results.json')).json();
  fillValues();
  drawCharts();
  familiesTable();
  libraryTable();
  errorsTable();
  marksTiles();
  reviewFigure();
  funnel();
  traceFigure();
  let width = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    drawCharts();
  });
}

main();
