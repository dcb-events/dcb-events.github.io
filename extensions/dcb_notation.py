"""Renders ```dcb fenced blocks - DCB models in the notation of the DCB Playground - as examples.

    ```dcb id="course_subscription_02" extends="course_subscription_01"
    ...
    ```

A block that extends another can drop some of its definitions with
`removes="command OrderProduct, event ProductOrdered"`. A block with `hidden="true"` is checked
and can be extended or excerpted, but is not shown.

Two more kinds of block show notation without being a model of their own:

    ```dcb excerpt="course_subscription_03" show="projection CourseCapacity, command DefineCourse"
    ```

shows some definitions of a model rendered before it, exactly as that model has them, and

    ```dcb-fragment
    require <operand> <operator> <operand>
    ```

only highlights its text, for syntax that is no complete definition.

Each example gets a "DCB notation" tab with the complete model, a "Consistency boundary" tab
with the Query and AppendCondition every command derives, and a link to open it in the DCB
Playground, and a link to the page explaining the notation. On those pages themselves
(`notation/`, see `hooks/dcb_notation.py`), that link is left out and the playground opens
in its code view. Blocks are checked and rendered by `scripts/dcb-render/render.js` with the
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
FENCE_START = re.compile(r'^(?P<fence>`{3,})dcb(?P<fragment>-fragment)?(?P<attributes>(?:\s+[\w-]+="[^"]*")*)\s*$')
ATTRIBUTE = re.compile(r'([\w-]+)="([^"]*)"')
ID = re.compile(r'^[\w-]+$')

NOTATION_PAGES = 'notation/'
NOTATION_URL = '/notation/'

# The canonical source of every example rendered in this build, so one can extend another
# that was defined on an earlier page.
_rendered = {}

# The source path of the page being rendered, set by hooks/dcb_notation.py.
current_page = None


def _on_notation_pages():
    return current_page is not None and current_page.startswith(NOTATION_PAGES)


def _icon(name):
    return (ICONS / f'{name}.svg').read_text(encoding='utf-8')


class DcbNotationPreprocessor(markdown.preprocessors.Preprocessor):
    def run(self, lines):
        blocks = self._find_blocks(lines)
        if not blocks:
            return lines
        surface = 'code' if _on_notation_pages() else None
        request = {
            'blocks': [
                {key: block[key] for key in ('excerpt', 'show', 'fragment') if block.get(key) is not None}
                if block['kind'] != 'model' else
                {**{key: block[key] for key in ('id', 'extends', 'removes', 'source') if block[key]},
                 **({'surface': surface} if surface else {})}
                for block in blocks
            ],
            'parents': _rendered,
        }
        result = subprocess.run(['node', str(RENDERER)], input=json.dumps(request), text=True, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(f'DCB example could not be rendered:\n{result.stderr.strip()}')
        rendered = json.loads(result.stdout)['blocks']

        out = []
        position = 0
        for number, (block, example) in enumerate(zip(blocks, rendered), start=1):
            out.extend(lines[position:block['start']])
            position = block['end'] + 1
            if block['kind'] != 'model':
                out.extend(['', self.md.htmlStash.store(f'<div class="dcb-snippet">{example["notationHtml"]}</div>'), ''])
                continue
            for warning in example['warnings']:
                log.warning(warning)
            _rendered[example['id']] = example['source']
            if not block['hidden']:
                out.extend(['', self.md.htmlStash.store(self._html(number, example)), ''])
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
            end = next((j for j in range(i + 1, len(lines)) if lines[j].strip() == match.group('fence')), None)
            if end is None:
                raise RuntimeError(f'DCB block is never closed with {match.group("fence")}: {lines[i]}')
            source = '\n'.join(lines[i + 1:end])
            if match.group('fragment'):
                block = {'kind': 'fragment', 'fragment': source}
            elif 'excerpt' in attributes:
                if source.strip():
                    raise RuntimeError(f'A DCB excerpt shows definitions of another block and has no text of its own: {lines[i]}')
                block = {'kind': 'excerpt', 'excerpt': attributes['excerpt'], 'show': attributes.get('show', '')}
            else:
                block_id = attributes.get('id', '')
                if not ID.match(block_id):
                    raise RuntimeError(f'DCB example needs an id="…" of letters, digits, _ and -: {lines[i]}')
                block = {
                    'kind': 'model',
                    'id': block_id,
                    'extends': attributes.get('extends'),
                    'removes': attributes.get('removes'),
                    'hidden': attributes.get('hidden') == 'true',
                    'source': source,
                }
            blocks.append({**block, 'start': i, 'end': end})
            i = end + 1
        return blocks

    @staticmethod
    def _html(number, example):
        name = f'__dcb_{number}'
        link = html.escape(example['link'])
        explanation = '' if _on_notation_pages() else (
            f'<a class="md-button" href="{NOTATION_URL}" title="What is this notation?" aria-label="What is this notation?">'
            f'{_icon("help-circle-outline")}</a>'
        )
        return (
            '<div class="dcb-example">'
            '<div class="dcb-example__actions">'
            f'{explanation}'
            f'<a class="md-button md-button--primary" href="{link}" target="_blank" rel="noopener" '
            f'title="Open this model in the DCB Playground" aria-label="Open in Playground">'
            f'{_icon("play-box-outline")}<span class="dcb-example__label">Open in Playground</span></a>'
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
