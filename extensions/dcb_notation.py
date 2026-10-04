"""Renders ```dcb fenced blocks - DCB models in the notation of the DCB Playground - as examples.

    ```dcb id="course_subscription_02" extends="course_subscription_01"
    ...
    ```

A block that extends another can drop some of its definitions with
`removes="command OrderProduct, event ProductOrdered"`.

Each example gets a "DCB notation" tab with the complete model, a "Consistency boundary" tab
with the Query and AppendCondition every command derives, and a link to open it in the DCB
Playground. Blocks are checked and rendered by `scripts/dcb-render/render.js` with the
playground's own code; see there for how `extends` works and what fails the build. A block
containing ``` itself (a script) can be fenced with four or more backticks.
"""
import html
import json
import logging
import re
import subprocess
from pathlib import Path

import markdown
import material

log = logging.getLogger('mkdocs.extensions.dcb_notation')

RENDERER = Path(__file__).resolve().parent.parent / 'scripts' / 'dcb-render' / 'render.js'
ICONS = Path(material.__file__).resolve().parent / 'templates' / '.icons' / 'material'
FENCE_START = re.compile(r'^(?P<fence>`{3,})dcb(?P<attributes>(?:\s+[\w-]+="[^"]*")*)\s*$')
ATTRIBUTE = re.compile(r'([\w-]+)="([^"]*)"')
ID = re.compile(r'^[\w-]+$')

# The canonical source of every example rendered in this build, so one can extend another
# that was defined on an earlier page.
_rendered = {}


def _icon(name):
    return (ICONS / f'{name}.svg').read_text(encoding='utf-8')


class DcbNotationPreprocessor(markdown.preprocessors.Preprocessor):
    def run(self, lines):
        blocks = self._find_blocks(lines)
        if not blocks:
            return lines
        request = {
            'blocks': [{key: block[key] for key in ('id', 'extends', 'removes', 'source') if block[key]} for block in blocks],
            'parents': _rendered,
        }
        result = subprocess.run(['node', str(RENDERER)], input=json.dumps(request), text=True, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(f'DCB example could not be rendered:\n{result.stderr.strip()}')
        rendered = json.loads(result.stdout)['blocks']

        out = []
        position = 0
        for number, (block, example) in enumerate(zip(blocks, rendered), start=1):
            for warning in example['warnings']:
                log.warning(warning)
            _rendered[example['id']] = example['source']
            out.extend(lines[position:block['start']])
            out.extend(['', self.md.htmlStash.store(self._html(number, example)), ''])
            position = block['end'] + 1
        out.extend(lines[position:])
        return out

    @staticmethod
    def _find_blocks(lines):
        blocks = []
        i = 0
        while i < len(lines):
            match = FENCE_START.match(lines[i])
            if not match:
                i += 1
                continue
            attributes = dict(ATTRIBUTE.findall(match.group('attributes')))
            block_id = attributes.get('id', '')
            if not ID.match(block_id):
                raise RuntimeError(f'DCB example needs an id="…" of letters, digits, _ and -: {lines[i]}')
            end = next((j for j in range(i + 1, len(lines)) if lines[j].strip() == match.group('fence')), None)
            if end is None:
                raise RuntimeError(f'DCB example "{block_id}" is never closed with {match.group("fence")}')
            blocks.append({
                'id': block_id,
                'extends': attributes.get('extends'),
                'removes': attributes.get('removes'),
                'source': '\n'.join(lines[i + 1:end]),
                'start': i,
                'end': end,
            })
            i = end + 1
        return blocks

    @staticmethod
    def _html(number, example):
        name = f'__dcb_{number}'
        link = html.escape(example['link'])
        return (
            '<div class="dcb-example">'
            '<div class="dcb-example__actions">'
            f'<a class="md-button md-button--primary" href="{link}" target="_blank" rel="noopener" '
            f'title="Open this model in the DCB Playground">{_icon("play-box-outline")} Open in Playground</a>'
            '</div>'
            '<div class="tabbed-set tabbed-alternate">'
            f'<input checked="checked" id="{name}_1" name="{name}" type="radio">'
            f'<input id="{name}_2" name="{name}" type="radio">'
            '<div class="tabbed-labels">'
            f'<label for="{name}_1">DCB notation</label>'
            f'<label for="{name}_2">Consistency boundary</label>'
            '</div>'
            '<div class="tabbed-content">'
            f'<div class="tabbed-block">{example["notationHtml"]}</div>'
            f'<div class="tabbed-block">{example["boundaryHtml"]}</div>'
            '</div>'
            '</div>'
            '</div>'
        )


class DcbNotationExtension(markdown.Extension):
    def extendMarkdown(self, md):
        # After whitespace normalization (30), which would strip the stash placeholders, and before
        # pymdownx.superfences (25) would read the block as an ordinary fence.
        md.preprocessors.register(DcbNotationPreprocessor(md), 'dcb_notation', 28)


def makeExtension(**kwargs):
    return DcbNotationExtension(**kwargs)
