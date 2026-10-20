#!/usr/bin/env node
// Renders the ```dcb blocks of one page with the DCB Playground's own code (the `playground/`
// submodule, or DCB_PLAYGROUND_DIR), so every example is checked against exactly the version
// it links to.
//
// Reads a JSON request from stdin:
//   { blocks: [{ id, extends?, removes?, source, surface? }
//              | { excerpt, show } | { fragment }], parents: { <id>: <canonical source> } }
// and writes a JSON response to stdout, one entry per block:
//   { id, source, notationHtml, boundaryHtml, link, warnings } for a model,
//   { notationHtml } for an excerpt or a fragment.
//
// An excerpt shows some definitions of a model rendered before it ("command OrderProduct,
// event ProductOrdered"), cut from its canonical source, so a snippet is checked without being
// a complete model. A fragment is any text, only highlighted: for syntax that is not a whole
// definition. A model's `surface: "code"` makes its link open the playground's code view, and a
// model using what the playground keeps behind its experimental flag opens with the flag on.
//
// A block with `extends` holds only what changes: every definition it declares replaces the
// parent's definition of the same kind and name in place. Scenarios merge by name: a redefined
// command or projection keeps the parent's scenarios, a restated one (same name) replaces the
// parent's, and new ones are added. Everything else is inherited, except what `removes` lists ("command OrderProduct, event
// ProductOrdered"). A definition that is both removed and declared again replaces the parent's
// entirely, without inheriting its scenarios. The rendered notation is always the complete model, printed
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

// The ids the playground generates (scenario ids end up in the share link) come from
// Math.random. Seeding it per block keeps every link the same from build to build as long as
// the example does not change, which is what lets the playground recognize a link it opened before.
function seedRandom(seedText) {
  let seed = 0;
  for (const char of seedText) seed = (Math.imul(seed, 31) + char.codePointAt(0)) | 0;
  vm.runInContext('Math', playground).random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- merging ----------

const KIND_OF_KEYWORD = {
  type: 'custom-type-definition', enum: 'custom-type-definition', record: 'custom-type-definition', event: 'event-definition', entity: 'entity-definition',
  projection: 'projection-definition', command: 'command-definition',
};

// "command OrderProduct, event ProductOrdered" → ['command-definition OrderProduct', …]
function definitionKeys(list, what) {
  return (list || '').split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [keyword, name, ...rest] = entry.split(/\s+/);
    if (!KIND_OF_KEYWORD[keyword] || !name || rest.length) {
      throw new BuildError(`${what}: cannot read "${entry}", expected e.g. "command OrderProduct"`);
    }
    return `${KIND_OF_KEYWORD[keyword]} ${name}`;
  });
}

const removedKeys = (block) => definitionKeys(block.removes, `block "${block.id}" removes`);

// The lines a definition occupies, including the annotations (`@feature(…)`) above it.
function definitionRanges(lines, parsed) {
  const ranges = new Map();
  for (const span of parsed.spans) {
    let first = span.line;
    while (first > 1 && /^\s*@/.test(lines[first - 2])) first--;
    ranges.set(`${span.kind} ${span.name}`, { first, last: span.endLine });
  }
  return ranges;
}

// The line (1-based) of the `}` closing the block opened on `line` — outside strings, comments
// and ``` code.
function blockEnd(lines, line) {
  let depth = 0;
  let inString = false;
  let inCode = false;
  for (let n = line; n <= lines.length; n++) {
    const text = lines[n - 1];
    for (let i = 0; i < text.length; i++) {
      if (inCode) {
        if (text.startsWith('```', i)) { inCode = false; i += 2; }
      } else if (inString) {
        if (text[i] === '\\') i++;
        else if (text[i] === '"') inString = false;
      } else if (text.startsWith('```', i)) {
        inCode = true;
        i += 2;
      } else if (text.startsWith('//', i)) {
        break;
      } else if (text[i] === '"') {
        inString = true;
      } else if (text[i] === '{') {
        depth++;
      } else if (text[i] === '}' && --depth === 0) {
        return n;
      }
    }
  }
  return lines.length;
}

// The scenarios nested in a definition, in order: `{ name, first, last }` (name null if unnamed).
function scenariosOf(lines, parsed, key) {
  return parsed.scenarios
    .filter((record) => record.block && `${record.block.kind} ${record.block.name}` === key)
    .map((record) => ({
      name: (record.body && record.body.name) || null,
      first: record.head.line,
      last: blockEnd(lines, record.head.line),
    }));
}

// The parent's text with every definition the child declares again replaced in place (so the
// model keeps its order), followed by the child's new definitions. Returns `{ text, origin }`,
// where `origin[i]` names the block line i + 1 of the merged text came from, for messages.
function merge(parentSource, childSource, child, block) {
  const parentLines = parentSource.split('\n');
  const childLines = childSource.split('\n');
  const childRanges = definitionRanges(childLines, child);
  const parent = playground.parseModelSource(parentSource);
  const parentRanges = definitionRanges(parentLines, parent);
  const fromChild = (first, last) => childLines.slice(first - 1, last)
    .map((line, i) => ({ line, origin: `line ${first + i} of block "${block.id}"` }));
  // A redefined command or projection keeps the parent's scenarios it does not restate: one
  // with the same name replaces the parent's in place, new ones follow the inherited ones, all
  // in the one `scenarios { … }` group that ends the definition.
  const redefinition = (key, range) => {
    const inherited = scenariosOf(parentLines, parent, key);
    if (!inherited.length) return fromChild(range.first, range.last);
    const own = scenariosOf(childLines, child, key);
    const restated = new Map(own.filter((s) => s.name !== null).map((s) => [s.name, s]));
    const scenarios = [
      ...inherited.map((s) => (restated.has(s.name) ? fromChild(restated.get(s.name).first, restated.get(s.name).last)
        : parentLines.slice(s.first - 1, s.last).map((line) => ({
          line,
          origin: `scenario "${s.name}", which block "${block.id}" inherits from "${block.extends}" `
            + '(restate it under the same name to replace it)',
        })))),
      ...own.filter((s) => s.name === null || !inherited.some((p) => p.name === s.name))
        .map((s) => fromChild(s.first, s.last)),
    ];
    const group = child.groups.find((g) => g.block && `${g.block.kind} ${g.block.name}` === key);
    const lines = fromChild(range.first, group ? group.head.line - 1 : range.last - 1);
    while (lines.length && lines[lines.length - 1].line.trim() === '') lines.pop();
    lines.push({ line: '', origin: '' }, { line: '  scenarios {', origin: '' });
    scenarios.forEach((scenario, i) => lines.push(...(i ? [{ line: '', origin: '' }] : []), ...scenario));
    lines.push({ line: '  }', origin: '' });
    return [...lines, ...fromChild(range.last, range.last)];
  };
  const removed = removedKeys(block);
  for (const key of removed) {
    if (!parentRanges.has(key)) throw new BuildError(`block "${block.id}" removes ${key}, which "${block.extends}" does not define`);
  }
  const replacing = new Map([...parentRanges].filter(([key]) => childRanges.has(key) || removed.includes(key))
    .map(([key, range]) => [range.first, { ...range, key }]));
  const out = [];
  for (let n = 1; n <= parentLines.length; n++) {
    const replaced = replacing.get(n);
    if (replaced) {
      const range = childRanges.get(replaced.key);
      if (range) out.push(...(removed.includes(replaced.key) ? fromChild(range.first, range.last) : redefinition(replaced.key, range)));
      n = replaced.last;
    } else if (child.name !== null && /^\s*model\s+"/.test(parentLines[n - 1])) {
      const modelLine = childLines.findIndex((line) => /^\s*model\s+"/.test(line)) + 1;
      out.push(...fromChild(modelLine, modelLine));
    } else {
      out.push({ line: parentLines[n - 1], origin: `the model "${block.id}" extends ("${block.extends}")` });
    }
  }
  for (const [key, range] of childRanges) {
    if (!parentRanges.has(key)) out.push({ line: '', origin: '' }, ...fromChild(range.first, range.last));
  }
  return { text: out.map((entry) => entry.line).join('\n'), origin: out.map((entry) => entry.origin) };
}

// ---------- checks ----------

function check(block, text, where) {
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

function checkModel(block, model, parsed, where) {
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

// The colours of the playground's code view for a text that is only shown: the playground's
// own lexer, its tokens classed by the keyword lists its editor highlights with, so a word is
// never read differently from the parser. The comments the lexer skips are the gaps between
// tokens. Returns `[class, text]` runs that concatenate back to `text`; class is null for
// what the editor leaves uncoloured.
const [lexSource, KEYWORDS, STATEMENTS, BASE_TYPES] = vm.runInContext(
  '[lexSource, SOURCE_KEYWORDS, SOURCE_STATEMENTS, SOURCE_BASE_TYPES]', playground);

function highlight(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  const offset = (line, col) => starts[line - 1] + col - 1;
  const tokens = lexSource(text).tokens.filter((token) => token.t !== 'eof');
  const runs = [];
  const gap = (from, to) => {
    const between = text.slice(from, to);
    let at = 0;
    for (const match of between.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/g)) {
      if (match.index > at) runs.push([null, between.slice(at, match.index)]);
      runs.push(['comment', match[0]]);
      at = match.index + match[0].length;
    }
    if (at < between.length) runs.push([null, between.slice(at)]);
  };
  let at = 0;
  tokens.forEach((token, i) => {
    const from = offset(token.line, token.col);
    const to = offset(token.endLine, token.endCol);
    gap(at, from);
    const following = tokens[i + 1];
    let cls = null;
    if (token.t === 'string') cls = 'string';
    else if (token.t === 'number') cls = 'number';
    else if (token.t === 'code') cls = 'code';
    else if (token.t === 'punct' && token.v === '@' && following && following.t === 'ident') cls = 'annotation';
    else if (token.t === 'ident') {
      const previous = tokens[i - 1];
      if (previous && previous.t === 'punct' && previous.v === '@') cls = 'annotation';
      else if (token.v === 'event' && following && following.v === '.') cls = 'keyword';
      else if (/^[A-Z]/.test(token.v)) cls = 'type';
      else if (STATEMENTS.includes(token.v)) cls = 'flow';
      else if (KEYWORDS.includes(token.v)) cls = 'keyword';
      else if (BASE_TYPES.includes(token.v)) cls = 'type';
    }
    runs.push([cls, text.slice(from, to)]);
    at = to;
  });
  gap(at, text.length);
  return runs;
}

function notationHtml(source, parentSource = null, { foldScenarios = false } = {}) {
  const lines = [[]];
  for (const [cls, text] of highlight(source)) {
    text.split('\n').forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push(cls ? `<span class="dcb-hl-${cls}">${escapeHtml(part)}</span>` : escapeHtml(part));
    });
  }
  const text = source.split('\n');
  const changed = parentSource ? changedLines(parentSource.split('\n'), text) : new Set();
  let items = lines.map((parts, i) => ({
    html: `<span class="dcb-line${changed.has(i + 1) ? ' dcb-line--changed' : ''}">${parts.join('')}</span>`,
    text: text[i],
    changed: changed.has(i + 1),
    lines: 1,
  }));
  if (foldScenarios) items = foldScenarioGroups(items);
  if (changed.size) items = foldUnchanged(items);
  const body = joinItems(items);
  // The copy button copies what is shown, unless told otherwise: the folded lines, too.
  const copy = body.includes('dcb-fold') ? ` data-copy="${escapeHtml(source)}"` : '';
  return `<pre class="dcb-notation"${copy}><code>${body}</code></pre>`;
}

// A run of lines folded into a <details> that expands on click, as one item.
function fold(items, summary, modifier) {
  const changed = items.some((item) => item.changed);
  const classes = ['dcb-fold', `dcb-fold--${modifier}`, ...(changed ? ['dcb-fold--changed'] : [])].join(' ');
  return {
    html: `<details class="${classes}"><summary>${summary}</summary>${joinItems(items)}</details>`,
    text: '',
    changed,
    lines: items.reduce((sum, item) => sum + item.lines, 0),
    block: true,
  };
}

const marker = '<span class="dcb-fold__marker"></span>';

// Joins items by line breaks. A <details> is a block of its own: the lines next to it are not
// joined to it by a line break, which would show as an empty line – except an empty line
// before it, which needs one to show at all.
function joinItems(items) {
  return items.map((item, n) => {
    const previous = items[n - 1];
    const joint = n > 0 && (item.block ? !previous.block && previous.text.trim() === '' : !previous.block);
    return (joint ? '\n' : '') + item.html;
  }).join('');
}

// Folds the `scenarios { … }` group of each command, so a model reads as its definitions first.
function foldScenarioGroups(items) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const open = /^(\s*)scenarios \{\s*$/.exec(items[i].text);
    const close = open && items.findIndex((item, j) => j > i && item.text.trimEnd() === `${open[1]}}`);
    if (!open || close < 0) { out.push(items[i]); continue; }
    const group = items.slice(i, close + 1);
    const count = group.filter((item) => /^\s*scenario "/.test(item.text)).length;
    out.push(fold(group, `${open[1]}${marker}${count} scenario${count === 1 ? '' : 's'}`, 'scenarios'));
    i = close;
  }
  return out;
}

// Lines kept visible around a change, and the fewest lines worth folding away.
const FOLD_CONTEXT = 2;
const FOLD_MINIMUM = 4;

// Folds each long run of items that did not change, so a block that extends another shows
// what it changes first. Closing braces after a fold are folded with it, they say nothing on
// their own.
function foldUnchanged(items) {
  const out = [];
  let i = 0;
  while (i < items.length) {
    if (items[i].changed) { out.push(items[i++]); continue; }
    let end = i;
    while (end < items.length && !items[end].changed) end++;
    const from = i === 0 ? 0 : i + FOLD_CONTEXT;
    let to = end === items.length ? end : end - FOLD_CONTEXT;
    while (to < end && /^\s*}\s*$/.test(items[to].text)) to++;
    const hidden = items.slice(from, Math.max(from, to));
    const count = hidden.reduce((sum, item) => sum + item.lines, 0);
    if (count < FOLD_MINIMUM) {
      out.push(...items.slice(i, end));
    } else {
      out.push(...items.slice(i, from), fold(hidden, `${marker}${count} unchanged lines`, 'unchanged'), ...items.slice(to, end));
    }
    i = end;
  }
  return out;
}

// "CourseId:{courseId}" as it is; "ProductId:{each items.productId}" (one tag per list element)
// → ProductId:{items.productId} per element
const tagHtml = (tag) => {
  const each = /^([^:]*):\{each (.*)\}$/.exec(tag);
  if (!each) return `<code>${escapeHtml(tag)}</code>`;
  return `<code>${escapeHtml(each[1])}:{${escapeHtml(each[2])}}</code> per element`;
};
const listHtml = (values, render, empty) => (values.length ? values.map(render).join(', ') : empty);

// A Query Item is named by its alias, or, for a read written in place, by the read as written:
// CourseStatus(courseId).
const readLabel = (item) => item.alias || playground.operandText(JSON.parse(item.inline));

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
      + `<td><code>${escapeHtml(readLabel(item))}</code>${item.fannedOut ? ' (one per element)' : ''}</td>`
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

function shareLink(model, surface) {
  const envelope = playground.buildShareEnvelope(model, []);
  return PLAYGROUND_URL + '#model=' + zlib.gzipSync(JSON.stringify(envelope)).toString('base64url')
    + (surface ? `&surface=${surface}` : '')
    + (playground.experimentalFeatures(model).length ? '&experimental' : '');
}

// The definitions `show` names, in that order, each with the annotations above it and the
// scenarios inside it, spaced the way the printer spaces them: one-liners together, a blank
// line around anything longer.
function renderExcerpt(block, parents) {
  const source = parents[block.excerpt];
  if (source === undefined) throw new BuildError(`excerpt of "${block.excerpt}", which is not defined before it`);
  const lines = source.split('\n');
  const ranges = definitionRanges(lines, playground.parseModelSource(source));
  const keys = definitionKeys(block.show, `excerpt of "${block.excerpt}"`);
  if (!keys.length) throw new BuildError(`excerpt of "${block.excerpt}" shows nothing, name definitions in show="…"`);
  const out = [];
  let previousWasLine = false;
  for (const key of keys) {
    const range = ranges.get(key);
    if (!range) throw new BuildError(`excerpt of "${block.excerpt}" shows ${key}, which that model does not define`);
    const oneLine = range.first === range.last;
    if (out.length && !(oneLine && previousWasLine)) out.push('');
    out.push(...lines.slice(range.first - 1, range.last));
    previousWasLine = oneLine;
  }
  return { notationHtml: notationHtml(out.join('\n'), null, { foldScenarios: true }) };
}

// ---------- main ----------

function renderBlock(block, parents) {
  seedRandom(block.id);
  const child = playground.parseModelSource(block.source);
  let text = block.source;
  let where = (line) => `line ${line} of block "${block.id}"`;
  let parentSource = null;
  if (block.removes && !block.extends) throw new BuildError(`block "${block.id}" removes definitions but extends nothing`);
  if (block.extends) {
    parentSource = parents[block.extends];
    if (parentSource === undefined) {
      throw new BuildError(`block "${block.id}" extends "${block.extends}", which is not defined before it`);
    }
    // A block on its own may read projections only its parent declares, so it is checked as
    // part of the merged model, whose messages point back to the block's lines. Its own errors
    // are reported only if it cannot even be merged.
    let merged;
    try {
      merged = merge(parentSource, block.source, child, block);
    } catch (error) {
      const childErrors = child.diagnostics.filter((d) => d.severity === 'error');
      if (!childErrors.length) throw error;
      throw new BuildError(childErrors.map((e) => `${where(e.line)}: ${e.message}`).join('\n'));
    }
    text = merged.text;
    where = (line) => merged.origin[line - 1] || `line ${line} of the merged model "${block.id}"`;
  }
  const parsed = check(block, text, where);
  const modelId = playground.createDcbModel(parsed.name);
  try {
    playground.applyModelSource(modelId, text);
  } catch (error) {
    throw new BuildError(`block "${block.id}": ${error.message}`);
  }
  const model = playground.projectState()[modelId];
  const source = checkModel(block, model, parsed, where);
  const warnings = playground.modelAdvisories(model).map((a) => `block "${block.id}", ${a.name}: ${a.message}`);
  return {
    id: block.id,
    source,
    notationHtml: notationHtml(source, parentSource, { foldScenarios: true }),
    boundaryHtml: boundaryHtml(model),
    link: shareLink(model, block.surface),
    warnings,
  };
}

function main() {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  const parents = { ...(request.parents || {}) };
  const blocks = [];
  for (const block of request.blocks) {
    if (block.excerpt !== undefined) {
      blocks.push(renderExcerpt(block, parents));
    } else if (block.fragment !== undefined) {
      blocks.push({ notationHtml: notationHtml(block.fragment.replace(/\n+$/, '')) });
    } else {
      const rendered = renderBlock(block, parents);
      parents[block.id] = rendered.source;
      blocks.push(rendered);
    }
  }
  process.stdout.write(JSON.stringify({ blocks }));
}

try {
  main();
} catch (error) {
  process.stderr.write((error instanceof BuildError ? '' : `${error.stack}\n`) + error.message + '\n');
  process.exit(1);
}
