"""The errors Lichess players make in the openings: in each position the
explorer gave (explore.py), the moves played in at least MIN_SHARE of its
games, evaluated together by Stockfish in one search, and how much each loses
against the best of them and the engine's own. Resumes where it stopped.
Reads explore.py's explorer-lichess.json in <folder>, writes errors.json there.

  python3 research/scripts/errors.py <folder>
"""

import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import chess

BASE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path()
SOURCE, OUT = BASE / 'explorer-lichess.json', BASE / 'errors.json'
MIN_SHARE, MIN_GAMES, DEPTH = 0.02, 1000, 15


class Engine:
    def __init__(self):
        self.process = subprocess.Popen(
            [shutil.which('stockfish')],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self.send('uci')
        self.wait('uciok')
        self.send('setoption name Threads value 6')
        self.send('setoption name Hash value 512')
        self.send('isready')
        self.wait('readyok')

    def send(self, line):
        self.process.stdin.write(line + '\n')

    def wait(self, word):
        lines = []
        for line in self.process.stdout:
            lines.append(line.strip())
            if line.startswith(word):
                return lines
        raise RuntimeError('Stockfish stopped')

    def scores(self, fen, ucis):
        """Each move's score in centipawns for the side to move, and the engine's own best."""
        self.send(f'setoption name MultiPV value {len(ucis) + 1}')
        self.send(f'position fen {fen}')
        # The moves played, and the engine's choice: a search of its own, short.
        self.send(f'go depth {DEPTH} searchmoves {" ".join(ucis)}')
        played = self.read(self.wait('bestmove'))
        self.send('setoption name MultiPV value 1')
        self.send(f'go depth {DEPTH}')
        best = self.read(self.wait('bestmove'))
        return played, max(best.values(), default=None)

    @staticmethod
    def read(lines):
        scores = {}
        for line in lines:
            parts = line.split()
            if 'multipv' not in parts or ' pv ' not in line:
                continue
            kind, value = parts[parts.index('score') + 1], int(parts[parts.index('score') + 2])
            uci = parts[parts.index('pv') + 1]
            scores[uci] = (
                value if kind == 'cp' else (100000 - abs(value)) * (1 if value > 0 else -1)
            )
        return scores


def main():
    explorer = json.loads(SOURCE.read_text())
    done = json.loads(OUT.read_text()) if OUT.exists() else {}
    engine, start, count = Engine(), time.time(), 0
    for key, entry in explorer.items():
        if key in done:
            continue
        total = entry['white'] + entry['draws'] + entry['black']
        if total < MIN_GAMES:
            continue
        frequent = [
            move
            for move in entry['moves']
            if (move['white'] + move['draws'] + move['black']) / total >= MIN_SHARE
        ]
        if not frequent:
            continue
        board = chess.Board()
        for uci in entry['play']:
            board.push_uci(uci)
        played, best = engine.scores(board.fen(), [move['uci'] for move in frequent])
        done[key] = {
            'play': entry['play'],
            'games': total,
            'best': best,
            'moves': [
                {
                    'san': move['san'],
                    'uci': move['uci'],
                    'share': round((move['white'] + move['draws'] + move['black']) / total, 4),
                    'score': played.get(move['uci']),
                }
                for move in frequent
            ],
        }
        count += 1
        if count % 50 == 0:
            OUT.write_text(json.dumps(done))
            print(f'{count} positions, {time.time() - start:.0f}s', flush=True)
    OUT.write_text(json.dumps(done))
    print(f'done: {len(done)} positions', flush=True)


if __name__ == '__main__':
    sys.exit(main())
