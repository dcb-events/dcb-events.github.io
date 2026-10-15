"""Tells the DCB notation extension which page it is rendering.

Examples on the pages explaining the notation open the playground in its code view and need no
link to those pages (see `extensions/dcb_notation.py`).
"""
from extensions import dcb_notation


def on_page_markdown(markdown, page, **kwargs):
    dcb_notation.current_page = page.file.src_uri
    return markdown
