# The research

What the book was written from, as far as it can be published. The coverage figures of the
[paper](https://openings.lichessneo.com/#coverage) read these files.

| Path               | What it holds                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chess-openings/`  | Lichess's list of named openings, [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0): 3,865 lines with their ECO code                                            |
| `explorer.csv`     | each position of the explorer sample reached by at least 1,000 games, with that count: `position` (pieces and side to move), `games`                                                           |
| `errors.csv`       | each move played in at least 2% of a position's games (of 1,000 or more) that loses at least 100 centipawns at depth 15: the position, the line to it, the move, its share, the position's games, the engine's best score and the move's |
| `library.json`     | the volumes of the private research library, by source; the index of ideas, by status, kind and channel cited; the ideas behind one position, 3.Bc4, with the videos and the seconds they cite; and the 20 most viewed videos that the ideas cite (id, title, channel, views), at most three from one channel, for the previews on the page |
| `review.json`      | the adversarial review's findings, by family group                                                                                                                                            |
| `scripts/`         | the collection: `explore.py` (the explorer, a request a second), `errors.py` (Stockfish on the frequent moves), `snapshot.py` (writes the two CSV files), `ideas.py` (counts the index of ideas into `library.json`), `wikibooks.py` (Wikibooks' pages, from Wikimedia's dump) |

The explorer sample is Lichess's opening explorer for blitz, rapid and classical games between players rated
1000 and up, read on 11 November 2026 for every position on a named line. Its counts and Stockfish's scores are
facts about games, not texts, and name no player.

## What isn't here

The library itself: YouTube transcripts, publisher samples, pages and comments of third-party studies and sites.
Those texts belong to their authors, so they stay private, with the index of ideas drawn from them, which cites
them closely: only its counts, and the ideas behind the one position the paper follows, are published. The texts of the book were written from them in new words, with no run of eight words or more
matching any of them.
