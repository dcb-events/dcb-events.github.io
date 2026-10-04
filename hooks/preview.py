"""Keeps preview builds out of search engines.

Cloudflare Pages builds every pushed branch for preview (and sets `CF_PAGES`); the site
itself is published to GitHub Pages, so any build on Cloudflare is a preview.
"""
import os


def on_config(config, **kwargs):
    if os.environ.get('CF_PAGES'):
        config.extra['noindex'] = True
