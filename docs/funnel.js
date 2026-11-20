// The small scenes on the cards of the funnel (app.js): each one shows its step at work, in a loop.
// They use only the book and the published counts: no transcript text and no third-party image.
// A scene runs only while the funnel is on the screen. When motion is reduced, each scene shows one still frame.

(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const make = (tag, className, parent) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    parent?.append(element);
    return element;
  };
  // The next item of a list in a shuffled order, so that the same item does not come twice in a row.
  const deck = list => {
    let order = [];
    return () => {
      if (!order.length) order = [...list].sort(() => Math.random() - 0.5);
      return order.pop();
    };
  };

  /** A small board of a FEN placement: one svg, its pieces from ./pieces. */
  function miniBoard(placement, size) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 8 8');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.classList.add('mini-board');
    for (let i = 0; i < 64; i++) {
      const square = document.createElementNS(ns, 'rect');
      Object.entries({ x: i % 8, y: Math.floor(i / 8), width: 1, height: 1, class: (i % 8 + Math.floor(i / 8)) % 2 ? 'dark' : 'light' })
        .forEach(([key, value]) => square.setAttribute(key, value));
      svg.append(square);
    }
    placement.split('/').forEach((rank, y) => {
      let x = 0;
      for (const char of rank) {
        if (/\d/.test(char)) { x += Number(char); continue; }
        const piece = document.createElementNS(ns, 'image');
        const color = char === char.toUpperCase() ? 'w' : 'b';
        Object.entries({ href: `./pieces/${color}${char.toUpperCase()}.svg`, x, y, width: 1, height: 1 })
          .forEach(([key, value]) => piece.setAttribute(key, value));
        svg.append(piece);
        x++;
      }
    });
    return svg;
  }

  /** Calls `step` every `ms` while the scene is on the screen and the page is visible. */
  function loop(scene, ms, step) {
    let timer = 0;
    const tick = () => {
      if (scene.live && !document.hidden) step();
      timer = setTimeout(tick, ms);
    };
    timer = setTimeout(tick, ms);
    return () => clearTimeout(timer);
  }

  // ---- 1. Videos catalogued: previews come in from the right, one after the other. ----

  const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

  /** A preview of a video: its YouTube thumbnail, its title, its channel and its views. */
  function videoTile(video) {
    const tile = make('a', 'video-tile');
    tile.href = `https://www.youtube.com/watch?v=${video.id}`;
    tile.target = '_blank';
    tile.rel = 'noopener';
    tile.tabIndex = -1;
    const thumb = make('span', 'video-thumb', tile);
    const image = make('img', '', thumb);
    image.src = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    make('span', 'video-play', thumb);
    make('span', 'video-name', tile).textContent = video.title;
    make('span', 'video-meta', tile).textContent = `${video.channel} · ${compact.format(video.views)} views`;
    return tile;
  }

  function videos(scene, data) {
    const list = (data.famous || []).filter(video => video.id && video.views);
    if (!list.length) return;
    const next = deck(list);
    const track = make('div', 'video-track', make('div', 'video-window', scene.art));
    for (let i = 0; i < 4; i++) track.append(videoTile(next()));
    if (still.matches) return;
    loop(scene, 1600, () => {
      const tile = videoTile(next());
      tile.classList.add('pop');
      track.append(tile);
      const first = track.firstElementChild;
      const shift = first.offsetWidth + 8;
      track.style.transition = 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)';
      track.style.transform = `translateX(${-shift}px)`;
      setTimeout(() => {
        track.style.transition = 'none';
        track.style.transform = 'none';
        first.remove();
      }, 720);
    });
  }

  // ---- 2. Transcribed: a sound wave, and lines of words that the page writes. ----

  function words(scene) {
    const wave = make('div', 'wave', scene.art);
    for (let i = 0; i < 14; i++) make('i', '', wave).style.setProperty('--i', i);
    const page = make('div', 'transcript', scene.art);
    // The lines sit on the bottom of the page; a new line moves them all up together, as a teleprompter does.
    const roll = make('div', 'transcript-roll', page);
    const STEP = 15; // the height of a line and its gap
    const newLine = animate => {
      const line = make('div', 'transcript-line', roll);
      // The lines above the top fade are out of view, so their removal moves nothing.
      while (roll.children.length > 5) roll.firstElementChild.remove();
      if (animate) {
        roll.style.transition = 'none';
        roll.style.transform = `translateY(${STEP}px)`;
        void roll.offsetHeight;
        roll.style.transition = 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
        roll.style.transform = 'none';
      }
      return line;
    };
    let line = newLine(false);
    let room = 0;
    const word = animate => {
      const width = 10 + Math.round(Math.random() * 28);
      if (room + width > (page.clientWidth || 160)) { line = newLine(animate); room = 0; }
      room += width + 4;
      const piece = make('i', animate ? 'pop' : '', line);
      piece.style.width = `${width}px`;
    };
    for (let i = 0; i < 9; i++) word(false);
    if (still.matches) { wave.classList.add('still'); return; }
    loop(scene, 170, () => word(true));
  }

  // ---- 3. Ideas noted: the sources of an idea flow into it, one idea after the other. ----

  const KIND_NAMES = { plan: 'plan', mistake: 'mistake', trap: 'trap', idea: 'idea', history: 'history', 'move-order': 'move order', structure: 'structure' };

  // The positions that the paper follows (library.trace), and an arrow for each kind of idea there.
  const TRACES = {
    'e4 e5 Nf3 Nc6 Bc4': {
      placement: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R',
      arrows: { plan: ['c4', 'f7', '159 207 63'], idea: ['d8', 'g5', '72 193 249'], mistake: ['h7', 'h6', '235 88 72'] },
    },
  };
  const ns = 'http://www.w3.org/2000/svg';
  const svgNode = (tag, attrs, parent) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent?.append(node);
    return node;
  };
  const sleep = ms => new Promise(done => setTimeout(done, ms));

  /** An arrow from one square to another, in the colors of the Lichess Neo board. */
  function boardArrow(svg, [from, to, rgb]) {
    const at = square => [square.charCodeAt(0) - 96.5, 8.5 - Number(square[1])];
    const [ax, ay] = at(from), [bx, by] = at(to);
    const length = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / length, uy = (by - ay) / length;
    const color = `rgb(${rgb} / 85%)`;
    const group = svgNode('g', { class: 'flow-arrow' }, svg);
    svgNode('line', { x1: ax + ux * 0.3, y1: ay + uy * 0.3, x2: bx - ux * 0.4, y2: by - uy * 0.4, stroke: color, 'stroke-width': 0.2, 'stroke-linecap': 'round' }, group);
    const tipX = bx - ux * 0.08, tipY = by - uy * 0.08, baseX = bx - ux * 0.48, baseY = by - uy * 0.48, side = 0.28;
    svgNode('path', { d: `M${tipX} ${tipY}L${baseX - uy * side} ${baseY + ux * side}L${baseX + uy * side} ${baseY - ux * side}Z`, fill: color }, group);
  }

  /** A source as a chip: a YouTube channel and its time, a Lichess study, or a reference. */
  function sourceChip(source) {
    const chip = make('span', 'flow-src');
    if (source.channel) {
      make('i', 'icon-yt', chip);
      make('span', 'flow-name', chip).textContent = source.channel;
      if (source.t) make('time', '', chip).textContent = source.t;
    } else {
      const study = /lichess study/i.test(source.name);
      make('i', 'icon-ref', chip).textContent = study ? '♞' : 'W';
      make('span', 'flow-name', chip).textContent = study ? 'A Lichess study' : source.name;
    }
    return chip;
  }

  /** Three sources of an idea: the videos first, then one reference, so that each set shows the mix. */
  function threeSources(sources) {
    const videos = sources.filter(source => source.channel), others = sources.filter(source => !source.channel);
    return [videos[0], others[0], videos[1], others[1], videos[2]].filter(Boolean).slice(0, 3);
  }

  function ideas(scene, data) {
    const trace = data.trace, known = TRACES[trace?.line];
    const list = (trace?.ideas || []).filter(idea => idea.sources?.length);
    if (!known || !list.length) return;
    const art = make('div', 'flow', scene.art);
    const column = make('div', 'flow-sources', art);
    const wires = svgNode('svg', { class: 'flow-wires' }, art);
    const card = make('div', 'flow-card empty', art);
    const boardHost = make('span', 'flow-board', card);
    const slot = make('span', 'flow-slot', card);
    const tag = make('span', 'idea-chip', slot);
    const wait = make('span', 'flow-wait', slot);
    for (let i = 0; i < 3; i++) make('i', '', wait);

    const show = idea => {
      card.classList.remove('empty');
      boardHost.replaceChildren(miniBoard(known.placement, 62));
      const arrow = known.arrows[idea.kind];
      if (arrow) boardArrow(boardHost.firstChild, arrow);
      tag.className = `idea-chip kind-${idea.kind}`;
      tag.textContent = KIND_NAMES[idea.kind] || idea.kind;
    };
    // As in a node editor: every wire leaves the chips' common right edge and arrives level on the card,
    // the three ends one above the other, so that the wires never cross. Only the end on the card has a port.
    const SPREAD = 13;
    const draw = () => {
      wires.replaceChildren();
      const box = wires.getBoundingClientRect(), side = column.getBoundingClientRect(), end = card.getBoundingClientRect();
      const ax = side.right - box.left, bx = end.left - box.left, centre = end.top + end.height / 2 - box.top;
      const chips = [...column.children];
      const paths = chips.map((chip, n) => {
        const rect = chip.getBoundingClientRect();
        const ay = rect.top + rect.height / 2 - box.top, by = centre + (n - (chips.length - 1) / 2) * SPREAD, pull = (bx - ax) / 2;
        const path = svgNode('path', { d: `M${ax} ${ay}C${ax + pull} ${ay} ${bx - pull} ${by} ${bx} ${by}`, class: 'flow-wire' }, wires);
        const length = path.getTotalLength();
        // Hidden at once: the length above already gave the wire a style, and a transition would undraw it first.
        path.style.transition = 'none';
        path.style.strokeDasharray = length;
        path.style.strokeDashoffset = length;
        path.port = svgNode('circle', { cx: bx, cy: by, r: 3, class: 'flow-port' }, wires);
        return path;
      });
      void wires.getBoundingClientRect();
      for (const path of paths) path.style.transition = '';
      return paths;
    };
    // A spark runs along a wire and lights the port on the card when it arrives.
    const spark = (path, ms) => new Promise(done => {
      const dot = svgNode('circle', { r: 2.6, class: 'flow-spark' }, wires);
      const length = path.getTotalLength(), start = performance.now();
      const step = now => {
        const t = Math.min(1, (now - start) / ms), eased = t * t * (3 - 2 * t);
        const point = path.getPointAtLength(eased * length);
        dot.setAttribute('cx', point.x);
        dot.setAttribute('cy', point.y);
        if (t < 1) requestAnimationFrame(step);
        else { dot.remove(); path.port.classList.add('lit'); done(); }
      };
      requestAnimationFrame(step);
    });
    const fill = idea => {
      column.classList.remove('out');
      column.replaceChildren(...threeSources(idea.sources).map(sourceChip));
      [...column.children].forEach((chip, n) => { chip.style.animationDelay = `${n * 90}ms`; });
    };

    // The card holds a board from the start, so that its size does not change; it shows no idea until the sparks arrive.
    show(list[0]);
    card.classList.add('empty');
    if (still.matches) {
      fill(list[0]);
      show(list[0]);
      requestAnimationFrame(() => draw().forEach(path => { path.style.strokeDashoffset = 0; path.port.classList.add('lit'); }));
      return;
    }
    const ready = async () => { while (!scene.live || document.hidden) await sleep(300); };
    (async () => {
      for (let i = 0; ; i++) {
        await ready();
        const idea = list[i % list.length];
        fill(idea);
        await sleep(380);
        const paths = draw();
        paths.forEach((path, n) => setTimeout(() => { path.style.strokeDashoffset = 0; }, n * 90));
        await sleep(420);
        const runs = paths.map((path, n) => sleep(n * 140).then(() => spark(path, 750)));
        await Promise.race(runs);
        show(idea);
        card.classList.remove('hit');
        void card.offsetWidth;
        card.classList.add('hit');
        await Promise.all(runs);
        await sleep(1700);
        // The idea leaves with its sources, so that the next one starts on an empty card.
        column.classList.add('out');
        card.classList.add('empty');
        wires.querySelectorAll('path, circle').forEach(node => { node.style.transition = 'opacity 0.3s'; node.style.opacity = 0; });
        await sleep(340);
      }
    })();
  }

  // ---- 4. Confirmed: three checks go green, one after the other. ----

  function checks(scene) {
    const list = make('div', 'check-list', scene.art);
    const rows = ['Stockfish 19', 'Played on the board', 'A human source'].map(text => {
      const row = make('div', 'check-row', list);
      make('span', 'check-dot', row);
      make('span', 'check-text', row).textContent = text;
      return row;
    });
    if (still.matches) { rows.forEach(row => row.classList.add('done')); return; }
    let step = 0;
    loop(scene, 650, () => {
      if (step < rows.length) rows[step].classList.add('done');
      step++;
      if (step > rows.length + 4) { rows.forEach(row => row.classList.remove('done')); step = 0; }
    });
  }

  // ---- 5. Positions written: a board plays a line, and the two texts fill. ----

  const LINE = [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['f8', 'c5']];
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

  function board(scene) {
    const wrap = make('div', 'write-board', scene.art);
    const boardBox = make('div', 'write-squares', wrap);
    const size = 76;
    const unit = size / 8;
    boardBox.append(miniBoard('8/8/8/8/8/8/8/8', size));
    const at = square => [square.charCodeAt(0) - 97, 8 - Number(square[1])];
    const pieces = new Map();
    const place = () => {
      boardBox.querySelectorAll('.write-piece, .write-badge').forEach(node => node.remove());
      pieces.clear();
      START.split('/').forEach((rank, y) => {
        let x = 0;
        for (const char of rank) {
          if (/\d/.test(char)) { x += Number(char); continue; }
          const piece = make('img', 'write-piece', boardBox);
          piece.src = `./pieces/${char === char.toUpperCase() ? 'w' : 'b'}${char.toUpperCase()}.svg`;
          piece.alt = '';
          piece.style.width = piece.style.height = `${unit}px`;
          piece.style.transform = `translate(${x * unit}px, ${y * unit}px)`;
          pieces.set(`${String.fromCharCode(97 + x)}${8 - y}`, piece);
          x++;
        }
      });
    };
    const texts = make('div', 'write-texts', wrap);
    const bars = ['EN', 'FR'].map(language => {
      const row = make('div', 'write-row', texts);
      make('span', 'write-lang', row).textContent = language;
      return make('i', 'write-bar', make('span', 'write-track', row));
    });
    const move = ([from, to]) => {
      const piece = pieces.get(from);
      if (!piece) return;
      const [x, y] = at(to);
      piece.style.transform = `translate(${x * unit}px, ${y * unit}px)`;
      pieces.delete(from);
      pieces.set(to, piece);
    };
    const badge = to => {
      const [x, y] = at(to);
      const mark = make('span', 'write-badge', boardBox);
      mark.innerHTML = globalThis.markSvg?.('book') || '';
      mark.style.left = `${(x + 1) * unit}px`;
      mark.style.top = `${y * unit}px`;
    };
    place();
    if (still.matches) {
      LINE.forEach(move);
      badge(LINE.at(-1)[1]);
      bars.forEach(bar => { bar.style.width = '100%'; });
      return;
    }
    let ply = 0;
    loop(scene, 700, () => {
      if (ply < LINE.length) {
        move(LINE[ply]);
        bars.forEach((bar, i) => { bar.style.width = `${Math.min(100, ((ply + 1 - i * 0.4) / LINE.length) * 100)}%`; });
        if (ply === LINE.length - 1) badge(LINE[ply][1]);
      } else if (ply === LINE.length + 3) {
        bars.forEach(bar => { bar.style.width = '0'; });
        place();
        ply = -1;
      }
      ply++;
    });
  }

  const SCENES = { videos, words, ideas, checks, board };

  /** Puts a scene in each card that has a data-art, and runs it while the funnel is on the screen. */
  globalThis.funnelScenes = (box, data) => {
    const scenes = [...box.querySelectorAll('[data-art]')].map(card => {
      const art = make('div', `funnel-art art-${card.dataset.art}`);
      art.setAttribute('aria-hidden', 'true');
      card.prepend(art);
      const scene = { art, live: false };
      SCENES[card.dataset.art]?.(scene, data);
      return scene;
    });
    new IntersectionObserver(([entry]) => {
      for (const scene of scenes) scene.live = entry.isIntersecting;
    }).observe(box);
  };
})();
