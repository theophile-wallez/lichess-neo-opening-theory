"""Writes theory/*.json in the one layout the repository keeps: two spaces,
an object's keys one a line, a list of strings on one line. A pull request
then shows only the texts it changes.

  python3 tools/format.py           # formats every chapter
  python3 tools/format.py --check   # lists the chapters not formatted
"""

import json
import sys
from pathlib import Path

SOURCES = Path(__file__).resolve().parents[1] / 'theory'


def dump(value, depth=0):
    pad = '  ' * depth
    if isinstance(value, dict):
        if not value:
            return '{}'
        items = [
            f'{pad}  {json.dumps(key, ensure_ascii=False)}: {dump(item, depth + 1)}'
            for key, item in value.items()
        ]
        return '{\n' + ',\n'.join(items) + f'\n{pad}}}'
    if isinstance(value, list):
        if all(not isinstance(item, (dict, list)) for item in value):
            return '[' + ', '.join(json.dumps(item, ensure_ascii=False) for item in value) + ']'
        return '[\n' + ',\n'.join(f'{pad}  {dump(item, depth + 1)}' for item in value) + f'\n{pad}]'
    return json.dumps(value, ensure_ascii=False)


def formatted(path):
    return dump(json.loads(path.read_text(encoding='utf8'))) + '\n'


def misformatted(folder=SOURCES):
    return [
        path.name
        for path in sorted(folder.glob('*.json'))
        if formatted(path) != path.read_text(encoding='utf8')
    ]


def main():
    if '--check' in sys.argv[1:]:
        bad = misformatted()
        if bad:
            sys.exit(f'Not formatted: {", ".join(bad)}. Run python3 tools/format.py')
        print('Every chapter is formatted')
        return
    for path in sorted(SOURCES.glob('*.json')):
        path.write_text(formatted(path), encoding='utf8')


if __name__ == '__main__':
    main()
