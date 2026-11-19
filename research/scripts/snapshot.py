"""Writes the published snapshot of the research inventory, from the private
library's explorer and engine files (explore.py's explorer-lichess.json and
errors.py's errors.json):

- research/explorer.csv: each position of the explorer sample reached by at
  least 1,000 games, with that count;
- research/errors.csv: each move played in at least 2% of a position's games
  (of 1,000 or more) that loses at least 100 centipawns at depth 15.

Both hold counts and engine scores only. Needs python-chess.

  python3 research/scripts/snapshot.py <folder of explorer-lichess.json and errors.json>
"""

import csv
import json
import sys
from pathlib import Path

import chess

OUT = Path(__file__).resolve().parents[1]
MIN_GAMES = 1000
MIN_LOSS = 100


def key_of(board):
    return ' '.join(board.fen().split()[:2])


def board_of(ucis):
    board = chess.Board()
    for uci in ucis:
        board.push_uci(uci)
    return board


def explorer(source):
    counts = {}
    for key, entry in source.items():
        counts[key] = entry['white'] + entry['draws'] + entry['black']
    for entry in source.values():
        board = board_of(entry['play'])
        for move in entry['moves']:
            after = board.copy()
            after.push_uci(move['uci'])
            counts.setdefault(key_of(after), move['white'] + move['draws'] + move['black'])
    rows = sorted(
        ((key, games) for key, games in counts.items() if games >= MIN_GAMES),
        key=lambda row: -row[1],
    )
    with (OUT / 'explorer.csv').open('w', newline='', encoding='utf8') as file:
        writer = csv.writer(file, lineterminator='\n')
        writer.writerow(['position', 'games'])
        writer.writerows(rows)
    return len(rows)


def errors(source):
    rows = []
    for key, entry in source.items():
        if entry['best'] is None:
            continue
        line = []
        replay = chess.Board()
        for uci in entry['play']:
            move = chess.Move.from_uci(uci)
            line.append(replay.san(move))
            replay.push(move)
        for move in entry['moves']:
            if move['score'] is None:
                continue
            loss = entry['best'] - move['score']
            if loss < MIN_LOSS:
                continue
            rows.append(
                [
                    key,
                    ' '.join(line),
                    move['san'],
                    move['uci'],
                    move['share'],
                    entry['games'],
                    entry['best'],
                    move['score'],
                ]
            )
    rows.sort(key=lambda row: -row[4] * row[5])
    with (OUT / 'errors.csv').open('w', newline='', encoding='utf8') as file:
        writer = csv.writer(file, lineterminator='\n')
        writer.writerow(['position', 'line', 'move', 'uci', 'share', 'games', 'best_cp', 'move_cp'])
        writer.writerows(rows)
    return len(rows)


def main(folder):
    folder = Path(folder)
    print(explorer(json.loads((folder / 'explorer-lichess.json').read_text())), 'positions')
    print(errors(json.loads((folder / 'errors.json').read_text())), 'errors')


if __name__ == '__main__':
    main(sys.argv[1])
