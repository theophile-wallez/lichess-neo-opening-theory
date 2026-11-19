"""Brings the two public Lichess studies in line with the compiled PGN
(theory.py's data/en.pgn and data/fr.pgn). Readers load a study's export once
and ask again with If-Modified-Since, so a change here reaches them without a
new release of anything.

  python3 tools/study.py data --dry-run                       # what would change, no token needed
  LICHESS_TOKEN=<token> python3 tools/study.py data           # push the changes
  LICHESS_TOKEN=<token> python3 tools/study.py data --rebuild # import every chapter anew

Each language's study is read from its public export and compared, chapter by
chapter, with the local PGN. Both are parsed and written again by python-chess,
so the formatting of Lichess's export doesn't count as a change.

- Same chapters, in the same order: each chapter that differs is replaced in
  place, by POST /api/study/{id}/{chapterId}/moves. Its id, its URL and its
  place in the study stay; Lichess marks the study updated, which moves the
  export's Last-Modified.
- Chapters added, removed, renamed or moved (split.py cut a family in one more
  part, say): the study is rebuilt. A study holds 64 chapters at most, so all
  old chapters but one are deleted, the new ones imported in order, then the
  last old one is deleted (a study left with no chapter gets an empty one of
  Lichess's). Chapter URLs change.

The token is a personal one of the studies' owner, with the study:write scope
(lichess.org/account/oauth/token/create?scopes[]=study:write). studies.json
holds each study's id and its chapters' ids, which the explorer of the paper
links to: a rebuild writes the new ones there (and --record, from the live
studies, without changing them).
"""

import argparse
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import chess.pgn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from split import commented

ROOT = Path(__file__).resolve().parents[1]
IDS = ROOT / 'studies.json'
# Lichess answers a script it takes for a crawler with a 404 page.
AGENT = (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/130 Safari/537.36'
)
MAX_CHAPTERS = 64
EXPORT = '/api/study/{}.pgn?comments=true&variations=true&clocks=false&orientation=false'
CHAPTER_URL = re.compile(r'https://lichess\.org/study/\w{8}/(\w{8})')


def call(method, path, token=None, form=None):
    data = urllib.parse.urlencode(form).encode() if form else None
    request = urllib.request.Request(f'https://lichess.org{path}', data=data, method=method)
    if token:
        request.add_header('Authorization', f'Bearer {token}')
    request.add_header('User-Agent', AGENT)
    for wait in (3, 10, 30, 60, 60, 60, 60, 60, 60, 60, 0):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return response.read().decode('utf8')
        except urllib.error.HTTPError as error:
            if error.code != 429:
                sys.exit(
                    f'{method} {path}: {error.code} {error.read().decode("utf8", "replace")[:300]}'
                )
            # Lichess serves one export at a time per address: wait for the other one to end.
            print(f'{method} {path}: 429, waiting {wait} s', flush=True)
            time.sleep(wait)
    sys.exit(f'{method} {path}: still 429 after ten minutes')


class Chapter:
    def __init__(self, game, text):
        self.name = game.headers.get('ChapterName') or game.headers.get('Event', '')
        found = CHAPTER_URL.search(game.headers.get('ChapterURL', ''))
        self.id = found[1] if found else None
        self.text = text
        # The tree as python-chess writes it: moves, comments, marks and shapes.
        self.body = game.accept(
            chess.pgn.StringExporter(headers=False, variations=True, comments=True)
        )


def chapters(pgn):
    """The chapters of a PGN, in order, each with its own text."""
    texts = [
        text if text.startswith('[Event ') else f'[Event {text}'
        for text in pgn.strip().split('\n\n[Event ')
    ]
    found = []
    for text in texts:
        game = chess.pgn.read_game(io.StringIO(text))
        if game is not None:
            found.append(Chapter(game, text.strip() + '\n'))
    return found


def describe(local, live):
    """What changes in a chapter, counted in commented positions."""
    new, old = commented([local.text]), commented([live.text])
    added = len(new.keys() - old.keys())
    removed = len(old.keys() - new.keys())
    changed = sum(1 for key in new.keys() & old.keys() if new[key] != old[key])
    parts = [
        f'{count} {what}'
        for count, what in ((changed, 'changed'), (added, 'added'), (removed, 'removed'))
        if count
    ]
    return f'commented positions: {", ".join(parts)}' if parts else 'bare moves only'


def plan(local, live):
    """('same' | 'update' | 'rebuild', the chapters to replace in place)."""
    if [chapter.name for chapter in local] != [chapter.name for chapter in live]:
        return 'rebuild', []
    changed = [
        (mine, theirs) for mine, theirs in zip(local, live, strict=True) if mine.body != theirs.body
    ]
    return ('update' if changed else 'same'), changed


def rebuild(study, local, live, token):
    room = MAX_CHAPTERS - min(len(live), 1)
    if len(local) > room:
        sys.exit(
            f'{len(local)} chapters: the study has room for {room}, with one old one kept meanwhile'
        )
    for chapter in live[1:]:
        call('DELETE', f'/api/study/{study}/{chapter.id}', token)
    for chapter in local:
        # Lichess answers a chapter it refuses with a 200 too:
        # {"chapters": [], "error": "PGN too large"}.
        answer = json.loads(
            call(
                'POST',
                f'/api/study/{study}/import-pgn',
                token,
                {'pgn': chapter.text, 'orientation': 'white'},
            )
        )
        if answer.get('error') or not answer.get('chapters'):
            sys.exit(
                f'{chapter.name}: refused ({answer.get("error") or "no chapter made"}), '
                'the study is half rebuilt'
            )
    for chapter in live[:1]:
        call('DELETE', f'/api/study/{study}/{chapter.id}', token)


def live_chapters(study):
    return chapters(call('GET', EXPORT.format(study)))


def sync(language, study, pgn, token, dry_run, force, report):
    """Brings the study in line with `pgn`; whether its chapters' ids changed."""
    live = live_chapters(study)
    local = chapters(pgn)
    action, changed = ('rebuild', []) if force else plan(local, live)
    url = f'https://lichess.org/study/{study}'
    if action == 'same':
        report(f'\n**{language}**: the study is up to date ({len(live)} chapters). {url}')
        return False
    if action == 'rebuild':
        report(
            f'\n**{language}**: the chapters differ ({len(live)} live, {len(local)} here): '
            f'{"would rebuild" if dry_run else "rebuilding"} the study. {url}'
        )
        old, new = [c.name for c in live], [c.name for c in local]
        for name in new:
            if name not in old:
                report(f'- new chapter: {name}')
        for name in old:
            if name not in new:
                report(f'- chapter gone: {name}')
        if not dry_run:
            rebuild(study, local, live, token)
        return not dry_run
    report(
        f'\n**{language}**: {len(changed)} of {len(local)} chapters changed, '
        f'{"would update" if dry_run else "updating"} them in place. {url}'
    )
    for mine, theirs in changed:
        report(f'- {mine.name} ({describe(mine, theirs)}): {url}/{theirs.id}')
        if not dry_run:
            call('POST', f'/api/study/{study}/{theirs.id}/moves', token, {'pgn': mine.text})
    return False


def record(ids, language):
    """Writes the live study's chapter ids into studies.json."""
    ids[language]['chapters'] = {
        chapter.name: chapter.id for chapter in live_chapters(ids[language]['id'])
    }
    IDS.write_text(json.dumps(ids, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def main():
    parser = argparse.ArgumentParser(
        description='Brings the public Lichess studies in line with the compiled PGN.'
    )
    parser.add_argument('folder', type=Path, help='the folder of en.pgn and fr.pgn')
    parser.add_argument(
        '--dry-run', action='store_true', help='say what would change, write nothing'
    )
    parser.add_argument('--rebuild', action='store_true', help='import every chapter anew')
    parser.add_argument(
        '--language', choices=('en', 'fr'), action='append', help='only this language'
    )
    parser.add_argument(
        '--record', action='store_true', help="write the live chapters' ids into studies.json"
    )
    parser.add_argument('--summary', type=Path, help='also write the report to this Markdown file')
    args = parser.parse_args()
    token = os.environ.get('LICHESS_TOKEN')
    if not token and not args.dry_run:
        sys.exit('No LICHESS_TOKEN: set it, or pass --dry-run')
    ids = json.loads(IDS.read_text(encoding='utf8'))
    lines = []

    def report(line):
        print(line, flush=True)
        lines.append(line)

    for language in args.language or ids:
        pgn = args.folder / f'{language}.pgn'
        if not pgn.exists():
            report(f'\n**{language}**: no {pgn.name}, left as it is')
            continue
        study = ids[language]['id']
        if (
            sync(
                language,
                study,
                pgn.read_text(encoding='utf8'),
                token,
                args.dry_run,
                args.rebuild,
                report,
            )
            or args.record
        ):
            record(ids, language)
    if args.summary:
        with args.summary.open('a', encoding='utf8') as file:
            file.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
