"""Publishes the DCB Playground at /playground/ and its model schema at the URL of its `$id`.

The playground is a static app without a build step, included as a git submodule
(`playground/`, override with the `DCB_PLAYGROUND_DIR` environment variable). Its `app/`
folder is copied as is, minus tests and generators, and a small script is injected that
lets the playground share the site's light/dark setting (see `DCB_PLAYGROUND_HOST` in the
playground's `shared.js`).

The playground's help links to the reference of the DCB notation on this site, anchor by
anchor. The build fails if one of those pages or anchors does not exist.
"""
import json
import logging
import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

log = logging.getLogger('mkdocs.hooks.playground')

EXCLUDE = ('*.test.js', 'test-harness.js', 'generate-*.js', '.DS_Store')


def on_post_build(config, **kwargs):
    source = Path(os.environ.get('DCB_PLAYGROUND_DIR', 'playground'))
    if not (source / 'app' / 'index.html').is_file():
        log.warning(f'DCB Playground not found in "{source}" (run `git submodule update --init`), skipping /playground/')
        return
    site = Path(config['site_dir'])

    target = site / 'playground'
    shutil.rmtree(target, ignore_errors=True)
    shutil.copytree(source / 'app', target, ignore=shutil.ignore_patterns(*EXCLUDE))
    index = target / 'index.html'
    html = index.read_text(encoding='utf-8')
    if '<head>' not in html:
        raise RuntimeError('DCB Playground: no <head> in index.html to inject the host script into')
    index.write_text(html.replace('<head>', '<head>\n' + _host_script(config), 1), encoding='utf-8')

    schema_file = source / 'dcb-model.schema.json'
    schema_id = urlparse(json.loads(schema_file.read_text(encoding='utf-8'))['$id'])
    schema_target = site / schema_id.path.lstrip('/')
    schema_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(schema_file, schema_target)

    _check_help_links(config, site)


def _check_help_links(config, site):
    script = Path(__file__).resolve().parent.parent / 'scripts' / 'dcb-render' / 'help-links.js'
    result = subprocess.run(['node', str(script)], text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(f'DCB Playground: the links of its help could not be read:\n{result.stderr.strip()}')
    site_url = config['site_url'].rstrip('/') + '/'
    broken = []
    for link in json.loads(result.stdout):
        if not link.startswith(site_url):
            continue
        page, _, anchor = link[len(site_url):].partition('#')
        file = site / page / 'index.html'
        if not file.is_file() or (anchor and f'id="{anchor}"' not in file.read_text(encoding='utf-8')):
            broken.append(link)
    if broken:
        raise RuntimeError('DCB Playground: its help links to pages or anchors this site does not have:\n'
                           + '\n'.join(broken))


def _host_script(config):
    """Maps the playground's theme setting onto Material's palette toggle.

    Material stores the selected palette as `{index, color}` in localStorage, keyed by the
    site's root path, and selects the toggle by `index` - so the options are taken from
    `mkdocs.yml` in order, spelled the way Material's palette partial spells them.
    """
    options = []
    for option in config['theme']['palette']:
        options.append({
            'media': option.get('media') or '',
            'scheme': (option.get('scheme') or 'default').replace(' ', '-'),
            'primary': (option.get('primary') or 'indigo').replace(' ', '-'),
            'accent': (option.get('accent') or 'indigo').replace(' ', '-'),
        })
    scope = config['extra'].get('scope') or urlparse(config['site_url']).path or '/'
    key = scope.rstrip('/') + '/.__palette'
    return f'''<script>
window.DCB_PLAYGROUND_HOST = {{ theme: (function () {{
  var KEY = {json.dumps(key)};
  var OPTIONS = {json.dumps(options)};
  function kind(o) {{ return o.media === '(prefers-color-scheme)' ? 'system' : o.scheme === 'slate' ? 'dark' : 'light'; }}
  function stored() {{ try {{ return JSON.parse(localStorage.getItem(KEY)); }} catch (e) {{ return null; }} }}
  return {{
    get: function () {{
      var p = stored();
      if (p && OPTIONS[p.index]) return kind(OPTIONS[p.index]);
      for (var i = 0; i < OPTIONS.length; i++) if (matchMedia(OPTIONS[i].media).matches) return kind(OPTIONS[i]);
      return null;
    }},
    set: function (value) {{
      for (var i = 0; i < OPTIONS.length; i++) if (kind(OPTIONS[i]) === value) {{
        try {{ localStorage.setItem(KEY, JSON.stringify({{ index: i, color: OPTIONS[i] }})); }} catch (e) {{}}
        return;
      }}
    }},
    onChange: function (fn) {{ window.addEventListener('storage', function (e) {{ if (e.key === KEY) fn(); }}); }}
  }};
}})() }};
</script>'''
