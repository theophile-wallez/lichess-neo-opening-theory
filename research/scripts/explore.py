"""What Lichess players and masters play in every position of the named lines
of lichess-org/chess-openings, from Lichess's opening explorer: each move's
games, results and average rating. Slow on purpose: Lichess asks for one
request at a time and answers a burst with 429s. Resumes where it stopped.
Writes explorer-<db>.json in <out>, which snapshot.py reads.

  python3 research/scripts/explore.py <file holding a Lichess token> <out> [lichess|masters]
"""

import csv
import io
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import chess
import chess.pgn

OPENINGS = Path(__file__).resolve().parents[1] / 'chess-openings'
UA = (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/130 Safari/537.36'
)
DBS = {
    'lichess': 'https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical'
    '&ratings=1000,1200,1400,1600,1800,2000,2200,2500&moves=15&topGames=0&recentGames=0&play=',
    'masters': 'https://explorer.lichess.ovh/masters?moves=15&topGames=0&play=',
}


def positions():
    """Each position on a named line, by key, with the first moves found to reach it."""
    found = {}
    for letter in 'abcde':
        for row in csv.DictReader((OPENINGS / f'{letter}.tsv').open(), delimiter='\t'):
            game = chess.pgn.read_game(io.StringIO(row['pgn']))
            board, ucis = game.board(), []
            found.setdefault(' '.join(board.fen().split()[:2]), [])
            for move in game.mainline_moves():
                board.push(move)
                ucis.append(move.uci())
                found.setdefault(' '.join(board.fen().split()[:2]), list(ucis))
    return found


def ask(url, token):
    while True:
        request = urllib.request.Request(
            url, headers={'User-Agent': UA, 'Authorization': f'Bearer {token}'}
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
            print('429, waiting a minute', flush=True)
            time.sleep(61)
        except (urllib.error.URLError, TimeoutError):
            time.sleep(10)


def main():
    token = Path(sys.argv[1]).read_text().strip()
    db = sys.argv[3] if len(sys.argv) > 3 else 'lichess'
    out = Path(sys.argv[2]) / f'explorer-{db}.json'
    known = json.loads(out.read_text()) if out.exists() else {}
    todo = [(key, ucis) for key, ucis in positions().items() if key not in known]
    total = len(known) + len(todo)
    print(f'{db}: {len(known)} known, {len(todo)} to ask', flush=True)
    for i, (key, ucis) in enumerate(todo, 1):
        answer = ask(DBS[db] + ','.join(ucis), token)
        known[key] = {
            'play': ucis,
            **{name: answer[name] for name in ('white', 'draws', 'black', 'moves', 'opening')},
        }
        if i % 25 == 0 or i == len(todo):
            out.write_text(json.dumps(known))
        # One line a request: the dashboard reads the last one.
        print(f'{len(known)}/{total} {time.time():.0f}', flush=True)
        time.sleep(1)


if __name__ == '__main__':
    main()
