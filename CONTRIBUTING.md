# Contributing

A wrong move, a plan that doesn't hold, a clumsy sentence, a missing mistake: corrections are welcome, in
English or in French. Each one is a pull request on a file of [`theory/`](theory). Once it's merged, the two
Lichess studies follow on their own, and so does every Lichess Neo coach that reads them.

## Fixing a text

1. Find the position. In the [explorer](https://openings.lichessneo.com/), play the moves and note the line, or
   search a chapter of `theory/` for its `"line"`, the moves from the start in SAN: `"e4 e5 Nf3 Nc6 Bc4"`.
2. Edit its `"en"` or `"fr"` text, or both. A change of meaning belongs in both languages.
3. Open a pull request. Say what was wrong, and how you know: an engine line, a game, a book.

In a text, `{Nf3}` is a move, `{Nc3 Nf6 O-O}` moves one after the other, `{w:Re1}` and `{b:Re8}` later moves of
White and of Black, and `[e5]` a square. A move in braces has to be legal in the position (or playable after one
more move of its own side, for a plan): the check refuses one that isn't.

## Adding a mistake

Add it to the position's `"mistakes"`:

```json
{
  "move": "Bb4+",
  "mark": "?!",
  "punish": "Nc3 Nf6 O-O",
  "en": "The check looks active, but {Nc3} blocks it and develops …",
  "fr": "L'échec paraît actif, mais {Nc3} le pare en développant …",
  "shapes": ["Gb1c3"]
}
```

`punish` is the line that punishes it, from the position after the mistake, and the texts are read in that
position too. The mark follows the cost at depth 22 or more: about 70 to 89 centipawns is `?!`, 90 to 399 is
`?`, 400 or more (or a piece) is `??`. Give the engine line in the pull request.

## Adding a position

Add an entry to the chapter of its family, after its parent position: `line`, `en`, `fr`, `next` (the moves
theory goes on with, main move first), `shapes`, and `mistakes` if there are any. A position may be in the book
only once, whatever the move order, and not as both an entry and a mistake's position: the check says which entry
already holds it.

## Checking your change

```sh
pip install -r tools/requirements.txt
python3 tools/format.py   # lays the JSON out as the repository keeps it
python3 tools/build.py    # checks every chapter, then rebuilds data/ and docs/data/
```

Commit the rebuilt files with your change. The pull request's check runs the same build and fails if they're out
of date, and its summary lists the chapters of the live studies your change would rewrite.

A change to the Python tools must also pass ruff, as the check runs it:
`uvx ruff@0.16.9 check tools research/scripts` and `uvx ruff@0.16.9 format --check tools research/scripts`.

`python3 -m http.server -d docs` serves the explorer on <http://localhost:8000>, with your change in it.

## What happens after the merge

`sync-studies.yml` compares the new PGN with the live studies and rewrites only the chapters that changed, in
place, through Lichess's `POST /api/study/{id}/{chapterId}/moves`: chapter links stay. If the list of chapters
changes (a family grows past a chapter's budget and gets one more part), the study is rebuilt in order and the new
chapter ids are committed back to `studies.json`.

For the maintainer: the workflow needs one repository secret, `LICHESS_TOKEN`, a personal token of the studies'
owner with the `study:write` scope
([create one](https://lichess.org/account/oauth/token/create?scopes[]=study:write&description=lichess-neo-opening-theory)).
Without it, the workflow only reports what it would change. It can also be run by hand, as a dry run or as a full
rebuild.

## License

By contributing, you agree that your texts are published under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and your code under the MIT license.
