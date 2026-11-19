"""Builds everything the repository publishes from theory/*.json, and checks
it on the way (theory.py):

- data/en.pgn, data/fr.pgn: the studies' PGN, as study.py pushes it;
- data/positions.jsonl: one line per position, with its texts and mistakes;
- data/stats.json and docs/results.json: the figures of the paper;
- docs/data/: what the explorer of the paper loads, a file per chapter.

  python3 tools/build.py           # writes them
  python3 tools/build.py --check   # fails if a file differs from what it would write

The coverage figures read the snapshot in research/ (explorer.csv, errors.csv,
chess-openings/, library.json, review.json). Needs python-chess.
"""

import argparse
import collections
import contextlib
import csv
import io
import json
import re
import sys
import tempfile
from pathlib import Path

import chess
import chess.pgn

sys.path.insert(0, str(Path(__file__).resolve().parent))
import theory
from format import dump, misformatted
from split import iter_nodes

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'research'
LANGUAGES = theory.LANGUAGES
WORD = re.compile(r"[^\W\d_]+(?:['\u2019][^\W\d_]+)*")
START = theory.key_of(chess.Board())


# ---- Moves in the texts, resolved for the explorer ----


def color_board(board, color):
    """The board with `color` to move: passing once if it's the other side's turn."""
    return board if board.turn == color else theory.passed(board)


def plan_move(board, san):
    """(SAN, move) of `san` for the side to move, now or after one more move of its own.

    Mirrors theory.planned.
    """
    if move := theory.parse(board, san):
        return board.san(move), move
    for first in list(board.legal_moves):
        later = board.copy()
        later.push(first)
        later.push(chess.Move.null())
        if not later.is_check() and (move := theory.parse(later, san)):
            return later.san(move), move
    return None


def resolve(board, played, text, color):
    """[the move or moves as SAN, their UCIs, 1 if they can be played from the position].

    In theory.Entry.chip's order: a later move of one side, a sequence, a move now, a move of
    the line, a plan.
    """
    if color:
        found = plan_move(color_board(board, chess.WHITE if color == 'w' else chess.BLACK), text)
        return [found[0], found[1].uci(), 0] if found else [text, '', 0]
    if ' ' in text:
        for start in (board, theory.passed(board)):
            replay, sans, ucis = start.copy(), [], []
            for san in text.split():
                move = theory.parse(replay, san)
                if not move:
                    break
                sans.append(replay.san(move))
                ucis.append(move.uci())
                replay.push(move)
            else:
                return [' '.join(sans), ' '.join(ucis), int(start is board)]
        raise ValueError(f'{{{text}}}')
    if move := theory.parse(board, text):
        return [board.san(move), move.uci(), 1]
    if text.rstrip('+#') in played:
        return [text, played[text.rstrip('+#')], 0]
    for side in (theory.passed(board), board):
        if found := plan_move(side, text):
            return [found[0], found[1].uci(), 0]
    raise ValueError(f'{{{text}}}')


def chips(board, played, text):
    """Each move of the text, in order."""
    found = []
    for match in theory.MARK.finditer(text):
        color, san, square = match.groups()
        if not square:
            found.append(resolve(board, played, san.strip(), color))
    return found


def played_moves(moves):
    board, found = chess.Board(), {}
    for move in moves:
        found[board.san(move).rstrip('+#')] = move.uci()
        board.push(move)
    return found


# ---- The positions ----


def opening_names():
    """Lichess's names (lichess-org/chess-openings), by the position each line reaches."""
    rows = []
    for letter in 'abcde':
        with (RESEARCH / 'chess-openings' / f'{letter}.tsv').open(encoding='utf8') as file:
            for row in csv.DictReader(file, delimiter='\t'):
                game = chess.pgn.read_game(io.StringIO(row['pgn']))
                board, keys, sans = game.board(), [], []
                for move in game.mainline_moves():
                    sans.append(board.san(move))
                    board.push(move)
                    keys.append(theory.key_of(board))
                rows.append({'eco': row['eco'], 'name': row['name'], 'sans': sans, 'keys': keys})
    return rows


def chapter_names(games):
    """The chapter each commented position is in, by its key."""
    found = {}
    for pgn in games:
        game = chess.pgn.read_game(io.StringIO(pgn))
        name = game.headers['Event']
        for node in iter_nodes(game):
            if node.comment.strip():
                found.setdefault(theory.key_of(node.board()), name)
    return found


def position_records(chapters, games, names):
    """Each entry as the dataset writes it."""
    where = {language: chapter_names(games[language]) for language in LANGUAGES}
    named = {}
    for row in names:
        named.setdefault(row['keys'][-1], {'eco': row['eco'], 'name': row['name']})
    records = []
    for slug, entries in chapters:
        for entry in entries:
            board, source = entry.board, entry.source
            key = theory.key_of(board)
            played = played_moves(entry.moves)
            record = {
                'key': key,
                'fen': board.fen(),
                'chapter': slug,
                'line': ' '.join(san.rstrip('+#') for san in entry.line_sans()),
                'ply': len(entry.moves),
                'opening': named.get(key),
                'next': [board.san(move) for move in entry.next()],
                'shapes': source.get('shapes', []),
                'en': source['en'],
                'fr': source['fr'],
                'mistakes': [],
                'study': {language: where[language].get(key) for language in LANGUAGES},
                '_chips': {
                    language: chips(board, played, source[language]) for language in LANGUAGES
                },
                '_next': [move.uci() for move in entry.next()],
            }
            for mistake in source.get('mistakes', []):
                move = theory.parse(board, mistake['move'])
                after = board.copy()
                after.push(move)
                punish, ucis, replay = [], [], after.copy()
                for san in mistake.get('punish', '').split():
                    answer = theory.parse(replay, san)
                    punish.append(replay.san(answer))
                    ucis.append(answer.uci())
                    replay.push(answer)
                after_played = played_moves([*entry.moves, move])
                record['mistakes'].append(
                    {
                        'move': board.san(move),
                        'mark': mistake.get('mark', '?'),
                        'punish': punish,
                        'shapes': mistake.get('shapes', []),
                        'en': mistake['en'],
                        'fr': mistake['fr'],
                        '_uci': move.uci(),
                        '_punish': ucis,
                        '_chips': {
                            language: chips(after, after_played, mistake[language])
                            for language in LANGUAGES
                        },
                    }
                )
            records.append(record)
    return records


def public(record):
    """The record without the explorer's own fields."""
    out = {key: value for key, value in record.items() if not key.startswith('_')}
    out['mistakes'] = [
        {key: value for key, value in m.items() if not key.startswith('_')}
        for m in record['mistakes']
    ]
    if out['opening'] is None:
        del out['opening']
    return out


# ---- The explorer's files ----


def explorer_files(records, chapters, games, names, ids):
    slugs = [slug for slug, _ in chapters]
    index = {slug: i for i, slug in enumerate(slugs)}
    files = {}
    by_chapter = collections.defaultdict(list)
    for record in records:
        by_chapter[record['chapter']].append(record)
    counts = {}
    for slug in slugs:
        rows = []
        for record in by_chapter[slug]:
            row = {
                'k': record['key'],
                'l': record['line'],
                'n': record['next'],
                'nu': record['_next'],
                's': record['shapes'],
                'c': [record['study'][language] for language in LANGUAGES],
                't': {
                    language: [record[language], record['_chips'][language]]
                    for language in LANGUAGES
                },
            }
            if record.get('opening'):
                row['o'] = [record['opening']['eco'], record['opening']['name']]
            if record['mistakes']:
                row['m'] = [
                    {
                        'mv': m['move'],
                        'u': m['_uci'],
                        'mk': m['mark'],
                        'p': m['punish'],
                        'pu': m['_punish'],
                        's': m['shapes'],
                        't': {
                            language: [m[language], m['_chips'][language]] for language in LANGUAGES
                        },
                    }
                    for m in record['mistakes']
                ]
            rows.append(row)
        files[f'{slug}.json'] = {'chapter': slug, 'positions': rows}
        counts[slug] = (len(rows), sum(len(record['mistakes']) for record in by_chapter[slug]))
    covered = {record['key']: index[record['chapter']] for record in records}
    files['keys.json'] = covered
    # The named lines, each with how far into it the theory goes.
    found = []
    for row in names:
        depth = max((i + 1 for i, key in enumerate(row['keys']) if key in covered), default=0)
        if depth:
            found.append(
                [row['eco'], row['name'], ' '.join(san.rstrip('+#') for san in row['sans']), depth]
            )
    files['names.json'] = found
    study_chapters = {language: [] for language in LANGUAGES}
    for language in LANGUAGES:
        for pgn in games[language]:
            name = chess.pgn.read_headers(io.StringIO(pgn))['Event']
            study_chapters[language].append(
                [name, ids.get(language, {}).get('chapters', {}).get(name)]
            )
    files['index.json'] = {
        'chapters': [
            {
                'slug': slug,
                'en': theory.title(slug, 'en'),
                'fr': theory.title(slug, 'fr'),
                'positions': counts[slug][0],
                'mistakes': counts[slug][1],
                'start': by_chapter[slug][0]['line'] if by_chapter[slug] else '',
            }
            for slug in slugs
        ],
        'studies': {
            language: {
                'id': ids[language]['id'],
                'name': ids[language]['name'],
                'chapters': study_chapters[language],
            }
            for language in LANGUAGES
        },
    }
    return files


# ---- The figures ----


def read_csv(path):
    with path.open(encoding='utf8') as file:
        return list(csv.DictReader(file))


def words(text):
    # A move or a square counts as one word.
    return len(WORD.findall(theory.MARK.sub(' x ', text)))


def pgn_weight(pgn):
    game = chess.pgn.read_game(io.StringIO(pgn))
    return len(pgn), sum(1 for _ in iter_nodes(game))


def statistics(records, chapters, games, parts, names):
    keys = {record['key']: record for record in records}
    mistakes = [m for record in records for m in record['mistakes']]
    marks = collections.Counter(m['mark'] for m in mistakes)
    texts = [record[language] for record in records for language in LANGUAGES]
    texts += [m[language] for m in mistakes for language in LANGUAGES]
    tokens = collections.Counter()
    for text in texts:
        for match in theory.MARK.finditer(text):
            color, san, square = match.groups()
            tokens[
                'square'
                if square
                else 'later'
                if color
                else 'sequence'
                if ' ' in san.strip()
                else 'move'
            ] += 1
    shapes = sum(len(record['shapes']) for record in records) + sum(
        len(m['shapes']) for m in mistakes
    )
    by_language = {}
    for language in LANGUAGES:
        weights = [pgn_weight(pgn) for pgn in games[language]]
        by_language[language] = {
            'words': sum(words(record[language]) for record in records)
            + sum(words(m[language]) for m in mistakes),
            'chapters': len(games[language]),
            'maxChars': max(chars for chars, _ in weights),
            'maxNodes': max(nodes for _, nodes in weights),
            'pgnChars': sum(len(pgn) for pgn in games[language]),
            'parts': [
                [chess.pgn.read_headers(io.StringIO(pgn))['Event'], chars, nodes]
                for pgn, (chars, nodes) in zip(games[language], weights, strict=True)
            ],
        }
    per_chapter = []
    for slug, _ in chapters:
        own = [record for record in records if record['chapter'] == slug]
        per_chapter.append(
            {
                'slug': slug,
                'en': theory.title(slug, 'en'),
                'fr': theory.title(slug, 'fr'),
                'positions': len(own),
                'mistakes': sum(len(record['mistakes']) for record in own),
                'words': sum(words(record['en']) for record in own)
                + sum(words(m['en']) for record in own for m in record['mistakes']),
                'parts': {language: parts[language][slug] for language in LANGUAGES},
            }
        )
    plies = collections.Counter(record['ply'] for record in records)
    mistake_plies = collections.Counter(
        record['ply'] + 1 for record in records for _ in record['mistakes']
    )

    # How many games reach a commented position, ply by ply.
    explorer = {row['position']: int(row['games']) for row in read_csv(RESEARCH / 'explorer.csv')}
    total = explorer[START]
    reached = collections.Counter()
    for key, record in keys.items():
        reached[record['ply']] += explorer.get(key, 0)
    games_by_ply = [[ply, round(reached[ply] / total, 4)] for ply in range(1, 21)]

    # The named lines.
    families = collections.OrderedDict()
    for row in names:
        family = families.setdefault(
            row['name'].split(':')[0], {'lines': 0, 'covered': 0, 'games': 0}
        )
        family['lines'] += 1
        family['covered'] += row['keys'][-1] in keys
        family['games'] = max(family['games'], explorer.get(row['keys'][-1], 0))
    named_covered = sum(row['keys'][-1] in keys for row in names)
    # Covered named lines, by how often their position is reached.
    bands = [[10**6, None], [10**5, 10**6], [10**4, 10**5], [1000, 10**4], [0, 1000]]
    named_bands = []
    for low, high in bands:
        found = [
            row
            for row in names
            if explorer.get(row['keys'][-1], 0) >= low
            and (high is None or explorer.get(row['keys'][-1], 0) < high)
        ]
        named_bands.append([low, high, len(found), sum(row['keys'][-1] in keys for row in found)])
    top = sorted(families.items(), key=lambda kv: -kv[1]['games'])

    # The frequent errors: documented as a mistake, or explained as a position of their own.
    documented = {(record['key'], m['_uci']) for record in records for m in record['mistakes']}
    errors = []
    for row in read_csv(RESEARCH / 'errors.csv'):
        board = chess.Board()
        for san in row['line'].split():
            board.push_san(san)
        board.push_uci(row['uci'])
        errors.append(
            {
                'share': float(row['share']),
                'games': int(row['games']),
                'loss': int(row['best_cp']) - int(row['move_cp']),
                'mistake': (row['position'], row['uci']) in documented,
                'entry': theory.key_of(board) in keys,
                'inTheory': row['position'] in keys,
            }
        )

    def error_counts(share, loss, only_theory=False):
        found = [
            e
            for e in errors
            if e['share'] >= share and e['loss'] >= loss and (e['inTheory'] or not only_theory)
        ]
        weight = sum(e['share'] * e['games'] for e in found) or 1
        return {
            'share': share,
            'loss': loss,
            'errors': len(found),
            'mistakes': sum(e['mistake'] for e in found),
            'entries': sum(e['entry'] and not e['mistake'] for e in found),
            'gamesShare': round(
                sum(e['share'] * e['games'] for e in found if e['mistake'] or e['entry']) / weight,
                4,
            ),
        }

    def research(name):
        path = RESEARCH / name
        return json.loads(path.read_text(encoding='utf8')) if path.exists() else None

    return {
        'totals': {
            'chapters': len(chapters),
            'positions': len(records),
            'mistakes': len(mistakes),
            'marks': {mark: marks[mark] for mark in ('?!', '?', '??')},
            'nodes': len(records) + len(mistakes),
            'texts': len(texts),
            'tokens': dict(tokens),
            'shapes': shapes,
            'punishMoves': sum(len(m['punish']) for m in mistakes),
            'next': sum(len(record['next']) for record in records),
        },
        'languages': by_language,
        'chapters': per_chapter,
        'plies': [[ply, plies[ply], mistake_plies[ply]] for ply in range(1, max(plies) + 2)],
        'coverage': {
            'namedLines': len(names),
            'families': len(families),
            'namedCovered': named_covered,
            'namedByGames': named_bands,
            'explorerGames': total,
            'positionsWithGames': sum(1 for key in keys if key in explorer),
            'gamesByPly': games_by_ply,
            'topFamilies': [[name, f['lines'], f['covered'], f['games']] for name, f in top[:24]],
        },
        'errors': [error_counts(share, loss) for share in (0.02, 0.05) for loss in (100, 200)]
        + [dict(error_counts(0.02, 100, True), inTheory=True)],
        'library': research('library.json'),
        'review': research('review.json'),
        'trace': traced(research('library.json')),
    }


def traced(library):
    """The book's entry for the position the paper follows from the videos to the text."""
    line = ((library or {}).get('trace') or {}).get('line')
    for path in sorted(theory.SOURCES.glob('*.json')) if line else ():
        for entry in json.loads(path.read_text(encoding='utf8')):
            if entry.get('line') == line:
                return {
                    'line': line,
                    'chapter': path.stem,
                    **{language: entry[language] for language in LANGUAGES},
                    'next': entry.get('next', []),
                }
    return None


# ---- Writing ----


def compile_all():
    """The chapters, checked, and each language's games."""
    captured = io.StringIO()
    try:
        with contextlib.redirect_stdout(captured):
            chapters, languages, _ = theory.read_sources(theory.SOURCES, list(LANGUAGES))
    except SystemExit:
        # The errors only: the later moves to look over are theory.py's own listing.
        print(
            ''.join(
                line for line in captured.getvalue().splitlines(True) if ': unchecked ' not in line
            ),
            end='',
        )
        raise
    games, parts = {}, {}
    for language in languages:
        games[language], parts[language] = [], {}
        for name, entries in chapters:
            written = theory.write_chapter(name, entries, language)
            parts[language][name] = len(written)
            games[language] += written
        if len(games[language]) > theory.MAX_CHAPTERS:
            sys.exit(
                f'{language}: {len(games[language])} chapters, '
                f'past the {theory.MAX_CHAPTERS} a study holds'
            )
    return chapters, games, parts


def write_all(out):
    bad = misformatted(theory.SOURCES)
    if bad:
        sys.exit(f'Not formatted: {", ".join(bad)}. Run python3 tools/format.py')
    chapters, games, parts = compile_all()
    names = opening_names()
    ids = json.loads((ROOT / 'studies.json').read_text(encoding='utf8'))
    records = position_records(chapters, games, names)
    (out / 'data').mkdir(parents=True, exist_ok=True)
    (out / 'docs' / 'data').mkdir(parents=True, exist_ok=True)
    for language in LANGUAGES:
        (out / 'data' / f'{language}.pgn').write_text(
            '\n\n'.join(games[language]) + '\n', encoding='utf8'
        )
    with (out / 'data' / 'positions.jsonl').open('w', encoding='utf8') as file:
        for record in records:
            file.write(json.dumps(public(record), ensure_ascii=False) + '\n')
    stats = statistics(records, chapters, games, parts, names)
    text = dump(stats) + '\n'
    (out / 'data' / 'stats.json').write_text(text, encoding='utf8')
    (out / 'docs' / 'results.json').write_text(text, encoding='utf8')
    for name, content in explorer_files(records, chapters, games, names, ids).items():
        (out / 'docs' / 'data' / name).write_text(
            json.dumps(content, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8'
        )
    return stats


OUTPUTS = [
    'data/en.pgn',
    'data/fr.pgn',
    'data/positions.jsonl',
    'data/stats.json',
    'docs/results.json',
    'docs/data',
]


def files_under(root, path):
    target = root / path
    if target.is_dir():
        return {p.relative_to(root).as_posix() for p in target.rglob('*') if p.is_file()}
    return {path} if target.exists() else set()


def main():
    parser = argparse.ArgumentParser(
        description="Builds the data, the studies' PGN and the paper's figures."
    )
    parser.add_argument(
        '--check', action='store_true', help='fail if a published file is out of date'
    )
    args = parser.parse_args()
    if not args.check:
        stats = write_all(ROOT)
        t = stats['totals']
        print(
            f'{t["positions"]} positions, {t["mistakes"]} mistakes in {t["chapters"]} chapters; '
            f'studies of {stats["languages"]["en"]["chapters"]} (en) '
            f'and {stats["languages"]["fr"]["chapters"]} (fr) chapters'
        )
        return
    with tempfile.TemporaryDirectory() as folder:
        out = Path(folder)
        write_all(out)
        stale = []
        for path in OUTPUTS:
            for name in sorted(files_under(out, path) | files_under(ROOT, path)):
                mine, theirs = out / name, ROOT / name
                if (
                    not theirs.exists()
                    or not mine.exists()
                    or mine.read_bytes() != theirs.read_bytes()
                ):
                    stale.append(name)
        if stale:
            print('Out of date: ' + ', '.join(stale))
            sys.exit('Run python3 tools/build.py and commit what it writes')
        print('Everything is up to date')


if __name__ == '__main__':
    main()
