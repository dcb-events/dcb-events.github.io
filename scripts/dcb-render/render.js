#!/usr/bin/env node
// Renders the ```dcb blocks of one page with the DCB Playground's own code (the `playground/`
// submodule, or DCB_PLAYGROUND_DIR), so every example is checked against exactly the version
// it links to.
//
// Reads a JSON request from stdin:
//   { blocks: [{ id, extends?, source }], parents: { <id>: <canonical source> } }
// and writes a JSON response to stdout:
//   { blocks: [{ id, source, notationHtml, boundaryHtml, link, warnings }] }
//
// A block with `extends` holds only what changes: every definition it declares replaces the
// parent's definition of the same kind and name (scenarios included, as they sit inside it),
// everything else is inherited. The rendered notation is always the complete model, printed
// canonically, with the lines that differ from the parent marked.
//
// Any parse error, any definition the printer can only write as JSON, any scenario without a
// written `then`, and any scenario that does not hold fails the build (exit code 1).
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const APP = path.resolve(process.env.DCB_PLAYGROUND_DIR || path.join(__dirname, '../../playground'), 'app');
const PLAYGROUND_URL = '/playground/';

class BuildError extends Error {}

function loadPlayground() {
  const store = new Map();
  const context = {
    console,
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    setTimeout, clearTimeout, TextEncoder, TextDecoder, URL,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  const source = ['model.js', 'evaluate.js', 'dsl.js']
    .map((file) => fs.readFileSync(path.join(APP, file), 'utf8'))
    .join('\n;\n');
  vm.runInContext(source, context, { filename: 'playground.js' });
  return context;
}

const playground = loadPlayground();

// ---------- merging ----------

// The parent's text without the definitions the child declares again (and without its
// `model` line, when the child names the model itself).
function withoutRedefined(parentSource, child) {
  const parent = playground.parseModelSource(parentSource);
  const redefined = new Set(child.spans.map((span) => `${span.kind} ${span.name}`));
  const lines = parentSource.split('\n');
  const drop = new Set();
  for (const span of parent.spans) {
    if (!redefined.has(`${span.kind} ${span.name}`)) continue;
    for (let line = span.line; line <= span.endLine; line++) drop.add(line);
    for (let line = span.line - 1; line >= 1 && /^\s*@/.test(lines[line - 1]); line--) drop.add(line);
  }
  if (child.name !== null) lines.forEach((line, i) => { if (/^\s*model\s+"/.test(line)) drop.add(i + 1); });
  return lines.filter((_, i) => !drop.has(i + 1)).join('\n');
}

// ---------- checks ----------

function check(block, text, offset) {
  const where = (line) => (line > offset
    ? `line ${line - offset} of block "${block.id}"`
    : `line ${line} of the model "${block.id}" extends ("${block.extends}")`);
  const parsed = playground.parseModelSource(text);
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length) throw new BuildError(errors.map((e) => `${where(e.line)}: ${e.message}`).join('\n'));
  if (!parsed.name) throw new BuildError(`block "${block.id}" has no model "…" line`);
  for (const record of parsed.scenarios) {
    if (!record.thenRange) {
      throw new BuildError(`${where(record.head.line)}: a scenario on dcb.events has to state its "then"`);
    }
  }
  return parsed;
}

function checkModel(block, model, parsed, offset) {
  const where = (line) => (line > offset ? `line ${line - offset} of block "${block.id}"` : `the parent of "${block.id}"`);
  const report = playground.sourceScenarioReport(model, parsed);
  const problems = [...report.errors, ...report.warnings];
  if (problems.length) {
    throw new BuildError(problems.map((p) => `${where(p.line)}: scenario ${p.message}`).join('\n'));
  }
  const source = playground.modelToSource(model);
  if (source.includes('// Written as JSON:')) {
    const reason = source.split('\n').filter((line) => line.startsWith('// Written as JSON:')).join('\n');
    throw new BuildError(`block "${block.id}" cannot be written in the DCB notation:\n${reason}`);
  }
  return source;
}

// ---------- rendering ----------

const escapeHtml = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Line numbers (1-based) of `lines` that do not appear, in order, in `base` (an LCS diff).
function changedLines(base, lines) {
  const n = base.length;
  const m = lines.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = base[i] === lines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const changed = new Set();
  let i = 0;
  let j = 0;
  while (j < m) {
    if (i < n && base[i] === lines[j]) { i++; j++; } else if (i < n && lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else { if (lines[j].trim() !== '') changed.add(j + 1); j++; }
  }
  return changed;
}

function notationHtml(source, parentSource) {
  const lines = [[]];
  for (const [cls, text] of playground.sourceHighlight(source)) {
    text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push(cls ? `<span class="dcb-hl-${cls}">${escapeHtml(part)}</span>` : escapeHtml(part));
    });
  }
  const changed = parentSource ? changedLines(parentSource.split('\n'), source.split('\n')) : new Set();
  const body = lines
    .map((parts, i) => `<span class="dcb-line${changed.has(i + 1) ? ' dcb-line--changed' : ''}">${parts.join('')}</span>`)
    .join('\n');
  return `<pre class="dcb-notation"><code>${body}</code></pre>`;
}

// "CourseId:courseId" → CourseId:{courseId}
const tagHtml = (tag) => {
  const at = tag.indexOf(':');
  return at < 0 ? `<code>${escapeHtml(tag)}</code>`
    : `<code>${escapeHtml(tag.slice(0, at))}:{${escapeHtml(tag.slice(at + 1))}}</code>`;
};
const listHtml = (values, render, empty) => (values.length ? values.map(render).join(', ') : empty);

function boundaryHtml(model) {
  const sections = Object.entries(model['command-definitions']).map(([name, body]) => {
    const summary = playground.boundarySummary(model, body);
    const head = `<p class="dcb-boundary__command"><code>${escapeHtml(name)}</code> `
      + `<span class="dcb-boundary__summary">${escapeHtml(summary.words)}</span></p>`;
    const writes = `<p class="dcb-boundary__writes">Tags of the appended events: `
      + `${listHtml(summary.writes, tagHtml, 'none')}</p>`;
    if (!summary.items.length) {
      return `${head}<p>No Query: the events are appended without an <code>AppendCondition</code>.</p>${writes}`;
    }
    const queryOf = new Map();
    summary.queries.forEach((items, i) => items.forEach((item) => queryOf.set(item, i + 1)));
    const several = summary.queries.length > 1;
    const rows = summary.items.map((item) => '<tr>'
      + (several ? `<td>${queryOf.get(item) || ''}</td>` : '')
      + `<td><code>${escapeHtml(item.alias)}</code>${item.fannedOut ? ' (one per element)' : ''}</td>`
      + `<td>${listHtml(item.types, (t) => `<code>${escapeHtml(t)}</code>`, 'any type')}</td>`
      + `<td>${listHtml(item.tags, tagHtml, 'none')}</td>`
      + '</tr>').join('');
    const table = '<table><thead><tr>'
      + (several ? '<th>Query</th>' : '')
      + '<th>Query Item</th><th>Event Types</th><th>Tags</th></tr></thead>'
      + `<tbody>${rows}</tbody></table>`;
    const condition = '<p><code>AppendCondition</code>: <code>failIfEventsMatch</code> '
      + `${several ? 'all Query Items above' : 'the Query above'}, <code>after</code> the position of the last Event read</p>`;
    return head + table + condition + writes;
  });
  return `<div class="dcb-boundary">${sections.join('')}</div>`;
}

function shareLink(model) {
  const envelope = playground.buildShareEnvelope(model, []);
  return PLAYGROUND_URL + '#model=' + zlib.gzipSync(JSON.stringify(envelope)).toString('base64url');
}

// ---------- main ----------

function renderBlock(block, parents) {
  const child = playground.parseModelSource(block.source);
  let text = block.source;
  let offset = 0;
  let parentSource = null;
  if (block.extends) {
    parentSource = parents[block.extends];
    if (parentSource === undefined) {
      throw new BuildError(`block "${block.id}" extends "${block.extends}", which is not defined before it`);
    }
    const base = withoutRedefined(parentSource, child);
    text = `${base}\n\n${block.source}`;
    offset = base.split('\n').length + 1;
  }
  const parsed = check(block, text, offset);
  const modelId = playground.createDcbModel(parsed.name);
  try {
    playground.applyModelSource(modelId, text);
  } catch (error) {
    throw new BuildError(`block "${block.id}": ${error.message}`);
  }
  const model = playground.projectState()[modelId];
  const source = checkModel(block, model, parsed, offset);
  const warnings = playground.modelAdvisories(model).map((a) => `block "${block.id}", ${a.name}: ${a.message}`);
  return {
    id: block.id,
    source,
    notationHtml: notationHtml(source, parentSource),
    boundaryHtml: boundaryHtml(model),
    link: shareLink(model),
    warnings,
  };
}

function main() {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const parents = { ...(request.parents || {}) };
  const blocks = [];
  for (const block of request.blocks) {
    const rendered = renderBlock(block, parents);
    parents[block.id] = rendered.source;
    blocks.push(rendered);
  }
  process.stdout.write(JSON.stringify({ blocks }));
}

try {
  main();
} catch (error) {
  process.stderr.write((error instanceof BuildError ? '' : `${error.stack}\n`) + error.message + '\n');
  process.exit(1);
}
