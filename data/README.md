# The data

Built by `tools/build.py` from the chapters in [`theory/`](../theory), which are the files to edit. Don't
edit these by hand: the check fails when they don't match their sources. Under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) ([`LICENSE-DATA`](../LICENSE-DATA)). The
[paper](https://openings.lichessneo.com/#data) says how they were made.

## `en.pgn` and `fr.pgn`

The PGN of the two public Lichess studies, as `tools/study.py` pushes it:
[English](https://lichess.org/study/gADVcG4j) and [French](https://lichess.org/study/nKXcgQ3x). One game per
study chapter. Each position's comment is its text, its first variations are the moves theory goes on with, and
each mistake is a variation of its own, marked `$2` (?), `$4` (??) or `$6` (?!), followed by the moves that
punish it. Arrows and circles are written as Lichess writes them, `[%cal Ge2e4]` and `[%csl Rd5]`, after the
comment. A comment can't hold a brace, so a move is written `[Nf3]`, a sequence `[Nc3 Nf6 O-O]`, a later move
`[w:Re1]`, and a square as it is.

A family too long for one chapter (100,000 characters or 3,000 moves) is cut into parts, `Sicilian Defence (1)`
to `(4)`: each comment is in one part only.

## `positions.jsonl`

One position per line, in the chapters' order.

| Field       | What it holds                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| `key`       | the position: the FEN's pieces and side to move. Two move orders that reach it share it               |
| `fen`       | the full FEN, after `line`                                                                            |
| `chapter`   | the source chapter, a file of `theory/`                                                               |
| `line`      | the moves from the start, in SAN, without move numbers                                                |
| `ply`       | the number of half-moves in `line`                                                                    |
| `opening`   | `{"eco", "name"}`, when the position ends one of Lichess's named lines                                |
| `next`      | the moves theory goes on with, main move first                                                        |
| `shapes`    | what to draw: `Ge2e4` an arrow, `Rd5` a circled square, in Lichess's brushes (Green, Red, Yellow, Blue) |
| `en`, `fr`  | the coach's text, in the markup below                                                                 |
| `mistakes`  | the classic mistakes of the position, below                                                           |
| `study`     | `{"en", "fr"}`: the study chapter that holds the position's comment                                   |

Each mistake is `{"move", "mark", "punish", "shapes", "en", "fr"}`: the move in SAN, its mark (`?!`, `?` or
`??`), the moves that punish it in SAN, what to draw, and the coach's text, read in the position after the
mistake.

In a text, `{Nf3}` is a move, legal in the position or playable by either side after one more move of its own,
or one of the line's own moves. `{Nc3 Nf6 O-O}` is a sequence, each move legal after the one before. `{w:Re1}`
and `{b:Re8}` are later moves of White and of Black, further on in the plan. `[e5]` is a square.

## `stats.json`

Every figure of the paper, which reads the same file as `docs/results.json`: counts of positions, mistakes,
marks, words and markup; each chapter's size and parts; the coverage of Lichess's named lines and of the
explorer's games; the frequent errors the book names; the volumes of the research library and of its index of ideas; the most viewed videos that the ideas cite (`famous`); the adversarial
review's findings; and the book's entry for the position the paper follows from the videos to the text
(`trace`).
