"""Adds the idea index's counts to research/library.json, from the private
library's ideas/*.jsonl (one idea per line: its position, its kind, its sources
with their video and time, its engine checks and its status) and its video
catalog (sources/catalog/videos.json).

Only counts and the public video ids, channels and times that the ideas cite
are written; no transcript text.

  python3 research/scripts/ideas.py <folder of ideas/ and sources/>
"""

import json
import sys
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'library.json'
TRACE = 'e4 e5 Nf3 Nc6 Bc4'  # the position the paper follows from the videos to the book


def main(folder):
    folder = Path(folder)
    ideas = [
        json.loads(line)
        for path in sorted((folder / 'ideas').glob('*.jsonl'))
        for line in path.open(encoding='utf-8')
        if line.strip()
    ]
    videos, channels, cited = set(), Counter(), 0
    for idea in ideas:
        clips = [source['yt'] for source in idea.get('sources', []) if 'yt' in source]
        cited += bool(clips)
        for clip in clips:
            videos.add(clip['id'])
            channels[clip['channel']] += 1
    catalog = json.loads((folder / 'sources/catalog/videos.json').read_text(encoding='utf-8'))
    languages = Counter(video.get('language') or 'other' for video in catalog)

    def source(entry):
        if 'yt' in entry:
            clip = entry['yt']
            return {'channel': clip['channel'], 'video': clip['id'], 't': clip['t']}
        name, value = next(iter(entry.items()))
        if name == 'study':
            return {'name': f'a Lichess study by {value}'}
        return {'name': {'wikipedia': 'Wikipedia', 'wikibooks': 'Wikibooks'}.get(name, name)}

    trace = [
        {
            'kind': idea['kind'],
            'idea': idea['idea'],
            'sources': [source(entry) for entry in idea['sources']],
        }
        for idea in ideas
        if idea['line'] == TRACE and idea['status'] == 'confirmed'
    ]

    library = json.loads(OUT.read_text(encoding='utf-8'))
    library['ideas'] = {
        'count': len(ideas),
        'status': dict(Counter(idea['status'] for idea in ideas).most_common()),
        'kinds': dict(Counter(idea['kind'] for idea in ideas).most_common()),
        'withVideo': cited,
        'withVideoStatus': dict(
            Counter(
                idea['status']
                for idea in ideas
                if any('yt' in source for source in idea.get('sources', []))
            ).most_common()
        ),
        'videosCited': len(videos),
        'channelsCited': len(channels),
        'topChannels': channels.most_common(10),
        'engineChecked': library.get('ideas', {}).get('engineChecked'),
    }
    library['catalog'] = {'languages': dict(languages.most_common())}
    library['trace'] = {'line': TRACE, 'ideas': trace}
    OUT.write_text(json.dumps(library, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(ideas)} ideas, {len(videos)} videos cited from {len(channels)} channels')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
