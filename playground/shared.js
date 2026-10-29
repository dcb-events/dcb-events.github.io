// ============================================================
// Everything the interface needs that is not the model: DOM helpers,
// the experimental-features flag, and the *slice* view – everything one
// command touches, gathered here so the page never has to walk the
// definition graph itself.
//
// The slice is the idea the page is built around: a command, what it
// reads, in how many trips to the log, what it decides, what it emits,
// and what those events change. The model layer stores none of that as
// a unit; it is derived here, from the definitions. The overview pages
// read the same material across every command at once – the coupling
// matrix, and each entity's status as a lifecycle machine – and those
// derivations live here too.
// ============================================================

// ---------- DOM ----------

// Text is always text: a string child becomes a text node and an
// attribute value an attribute. The two ways a string could become code
// are refused – markup goes through `svg`, and a handler must be a
// function (a string `onclick` would be an attribute the browser runs).
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'html') throw new Error('h(): markup goes through svg(), not an attribute');
    if (k.startsWith('on')) {
      if (typeof v !== 'function') throw new Error(`h(): "${k}" must be a function`);
      el[k.toLowerCase()] = v;
    } else if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
  return el;
}

// The one sink for markup: an icon, a band's wires – SVG written in
// this code, its only interpolations numbers and fixed ids. Never pass
// it a string that came from a model. A fragment, appended whole by `h`.
function svg(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content || null;
}

let toastTimer = null;
// A refusal has to be read, not glimpsed, so it stays up well past the
// acknowledgements.
function toast(message, isError) {
  document.querySelectorAll('#toast').forEach((n) => n.remove());
  const el = h('div', { id: 'toast', class: isError ? 'err' : '' }, message);
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), isError ? 8000 : 5000);
}

// Runs a model command, reports a domain error rather than throwing it
// at the console, and repaints on success.
function run(fn) {
  try {
    const out = fn();
    if (typeof render === 'function') render();
    return out;
  } catch (err) {
    if (err instanceof DomainError) toast(err.message, true);
    else { console.error(err); toast('Unexpected error: ' + err.message, true); }
  }
}

// ---------- the scripted-handler editor ----------
//
// The one part of a model the tooling neither runs nor checks is the
// scripted handler – but what its code can *see* is still knowable
// from the definitions. This turns that knowledge into TypeScript: a
// synthesized preamble typing `state`, `event` and `args` for one
// handler, fed to Monaco (the app's one vendored dependency, pinned
// by generate-vendor-monaco.js) so typing gets completion, hover and
// squiggles that actually understand the model.
//
// The synthesis is the tested part, and it is pure. The choices it
// bakes in:
//   - every named scalar custom type is *branded* (`string & { __type:
//     'CourseId' }`), so comparing a CourseId to a StudentId – or to a
//     bare string literal – draws the no-overlap squiggle;
//   - enums become literal unions, so `===` completes the legal values;
//   - `state` is inferred from the initial state but stays *loose*
//     (`& { [key: string]: any }` at every level), because a script
//     may legitimately grow keys the initial state never had;
//   - a dangling type or event reference types as `any` – a defective
//     model must still load and edit, the same rule as everywhere.
//
// Each handler's preamble is its own file-scope (`export {};` makes
// the model a module), which is what lets several editors with
// different `event` types coexist in one TypeScript project. The
// preamble ends by opening a `__check(` call whose parameter is what
// a handler must return – the projection's value type (through
// `exposes` when the state is bookkeeping around one exposed field),
// allowing the initial state's type too when it differs, a null start
// being how "nullable" is spelled. Brands are widened to their bases
// there: code *produces* values, and no expression can produce a
// brand. The call also makes a bare object literal read as an
// expression, exactly as evaluate.js compiles it. All of it is
// prepended to the author's code in the editor model and hidden from
// view; only the code between the wrapper lines is ever written back.
//
// Monaco itself loads lazily, the first time a scripted handler row
// is actually on screen: models without scripts never pay for it, and
// if the assets are missing the row falls back to the plain textarea
// it always was. Editor instances are cached across repaints (the
// page rebuilds its whole DOM per render) and disposed once their row
// is gone.

// --- the synthesis: model + script + handler → TypeScript preamble ---

function scriptTsKey(name) {
  return /^[\p{ID_Start}_$][\p{ID_Continue}$\u200C\u200D]*$/u.test(name) ? name : JSON.stringify(name);
}

// A value's own JSON, safe inside the /** … */ it is hinted in.
function scriptTsHint(value) {
  const text = String(JSON.stringify(value)).replace(/\*\//g, '*\\/');
  return text.length > 32 ? text.slice(0, 31) + '…' : text;
}

// The TypeScript shape of a JSON value – how `state` is typed from
// the initial state. Objects stay walkable but loose; arrays type
// their elements when the elements are uniform primitives and give up
// honestly (`any[]`) when they are not.
function scriptTsOfValue(value, indent) {
  if (value === null || value === undefined) return 'any';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) {
    if (!value.length) return 'any[]';
    const parts = [...new Set(value.map((element) =>
      (element !== null && typeof element === 'object') ? 'any' : scriptTsOfValue(element)))];
    if (parts.includes('any')) return 'any[]';
    return (parts.length === 1 ? parts[0] : '(' + parts.join(' | ') + ')') + '[]';
  }
  const pad = ' '.repeat((indent || 0) + 2);
  const fields = Object.entries(value).map(([key, inner]) =>
    pad + '/** starts at ' + scriptTsHint(inner) + ' */\n'
    + pad + scriptTsKey(key) + ': ' + scriptTsOfValue(inner, (indent || 0) + 2) + ';');
  if (!fields.length) return '{ [key: string]: any }';
  return '{\n' + fields.join('\n') + '\n' + ' '.repeat(indent || 0) + '} & { [key: string]: any }';
}

// What a handler must return, as an inline TypeScript type. This is
// return position, so brands widen to their bases – an expression can
// compare branded values it was given, but never mint one – while
// enums stay literal unions and composites stay structural.
function scriptReturnType(model, body) {
  const inline = (typeName, depth) => {
    if (typeName === 'boolean') return 'boolean';
    if (typeName === 'integer') return 'number';
    if (typeName === 'string') return 'string';
    const definition = (model['custom-type-definitions'] || {})[typeName];
    if (!definition || depth > 2) return 'any';
    if (Array.isArray(definition.properties)) {
      return '{ ' + definition.properties
        .map((field) => scriptTsKey(field.name) + ': ' + inline(field.propertyType, depth + 1))
        .join('; ') + ' }';
    }
    const members = definition.schema && Array.isArray(definition.schema.enum)
      && definition.schema.enum.length ? definition.schema.enum : null;
    if (members) return members.map((member) => JSON.stringify(member)).join(' | ');
    return ({ string: 'string', integer: 'number', number: 'number', boolean: 'boolean' })[
      definition.schema && definition.schema.type] || 'string';
  };

  let value = inline(body.valueType, 0);
  if (value === 'any') return 'any';
  if (body.isList) value = (/[|&]/.test(value) ? '(' + value + ')' : value) + '[]';
  // With `exposes`, the state is bookkeeping around one exposed field:
  // the value type constrains that field, the rest is the script's own.
  const script = body.script || {};
  if (script.exposes) {
    value = '{ ' + scriptTsKey(script.exposes) + ': ' + value + ' } & { [key: string]: any }';
  }
  // Where the projection starts is also a legal thing to hand back – a
  // null start is how "nullable" is spelled.
  const initial = script.initialState;
  const initialTs = initial === null || initial === undefined ? 'null' : scriptTsOfValue(initial);
  return initialTs === value || initialTs === 'any' ? value : value + ' | ' + initialTs;
}

// What one scripted handler can see, as the TypeScript preamble its
// editor model is prefixed with. Ends opening the `__check(` call
// that both types the returned state and makes the code parse as the
// expression evaluate.js runs; the widget hides everything up to and
// including that line.
function scriptHandlerPreamble(model, body, handler) {
  const script = body.script || {};
  const lines = ['export {};'];
  const aliased = new Map(); // typeName → true once its alias line is out

  const resolveType = (typeName) => {
    if (typeName === 'boolean') return 'boolean';
    if (typeName === 'integer') return 'number';
    if (typeName === 'string') return 'string';
    const body = (model['custom-type-definitions'] || {})[typeName];
    if (body === undefined || !/^[\p{ID_Start}_$][\p{ID_Continue}$\u200C\u200D]*$/u.test(typeName)) return 'any';
    if (aliased.has(typeName)) return aliased.get(typeName) ? typeName : 'any';
    aliased.set(typeName, false);
    let rhs;
    if (Array.isArray(body.properties)) {
      rhs = '{ ' + body.properties
        .map((field) => scriptTsKey(field.name) + ': ' + resolveType(field.propertyType))
        .join('; ') + ' }';
    } else {
      const members = body.schema && Array.isArray(body.schema.enum) && body.schema.enum.length
        ? body.schema.enum : null;
      if (members) {
        rhs = members.map((member) => JSON.stringify(member)).join(' | ');
      } else {
        const base = ({ string: 'string', integer: 'number', number: 'number', boolean: 'boolean' })[
          body.schema && body.schema.type] || 'string';
        rhs = base + ' & { readonly __type: ' + JSON.stringify(typeName) + ' }';
      }
    }
    aliased.set(typeName, true);
    lines.push('type ' + typeName + ' = ' + rhs + ';');
    return typeName;
  };

  const propertyType = (property) => {
    let type = resolveType(property.propertyType);
    if (property.isList) type += '[]';
    if (property.isOptional) type += ' | null';
    return type;
  };

  const event = (model['event-definitions'] || {})[handler.event];
  const eventLines = [];
  if (event) {
    // Read-only, as at run time (`evFrozenEvent`, evaluate.js): the
    // editor flags a write before the run refuses it.
    eventLines.push('declare const event: {');
    eventLines.push('  readonly type: ' + JSON.stringify(handler.event) + ';');
    eventLines.push('  readonly data: {');
    for (const property of event.properties || []) {
      if (property.isOptional) {
        eventLines.push('    /** optional – null when the event carries no value */');
      } else if (property.propertyType === 'integer') {
        eventLines.push('    /** integer */');
      }
      eventLines.push('    readonly ' + scriptTsKey(property.name) + ': ' + propertyType(property) + ';');
    }
    eventLines.push('  };');
    eventLines.push('};');
  } else {
    eventLines.push('declare const event: { readonly type: string; readonly data: { readonly [key: string]: any } };');
  }

  const argFields = projectionSlots(body).filter((argument) => argument.name);
  const argsType = argFields.length
    ? '{ ' + argFields
        .map((argument) => scriptTsKey(argument.name) + ': ' + resolveType(argument.propertyType))
        .join('; ') + ' }'
    : '{}';

  // Alias lines were pushed by the resolve calls above; the declares
  // come after them, whatever order the resolving happened in.
  lines.push(...eventLines);
  lines.push('declare const state: ' + scriptTsOfValue(script.initialState, 0) + ';');
  lines.push('declare const args: ' + argsType + ';');
  lines.push('declare function __check(nextState: ' + scriptReturnType(model, body) + '): void;');
  lines.push('__check(');
  return lines.join('\n');
}

// --- the widget: a cached Monaco editor per handler row ---

// Rows are keyed by the draft object being edited (stable across
// repaints – the page state holds it) plus the handler's index.
const scriptEditorDraftIds = new WeakMap();
let scriptEditorDraftSeq = 0;
function scriptEditorKey(draft, index) {
  if (!scriptEditorDraftIds.has(draft)) scriptEditorDraftIds.set(draft, ++scriptEditorDraftSeq);
  return scriptEditorDraftIds.get(draft) + ':' + index;
}

const SCRIPT_EDITOR_LINE = 17;
const SCRIPT_EDITOR_MAX_LINES = 16;
let scriptEditorPhase = 'unloaded'; // → 'loading' → 'ready' | 'failed'
const scriptEditors = new Map();

function ensureScriptEditorLoaded() {
  if (scriptEditorPhase !== 'unloaded') return;
  // No real head to load into (the test stub) – the textarea is it.
  if (typeof document === 'undefined' || !document.head || !document.head.appendChild) {
    scriptEditorPhase = 'failed';
    return;
  }
  scriptEditorPhase = 'loading';
  // The stock worker bootstrap resolves its `vs` root from its own
  // URL, so everything stays under vendor/monaco.
  window.MonacoEnvironment = {
    getWorkerUrl: () => 'vendor/monaco/vs/base/worker/workerMain.js',
  };
  const fail = () => {
    scriptEditorPhase = 'failed';
    if (typeof render === 'function') render();
  };
  document.head.appendChild(h('link', { rel: 'stylesheet', href: 'vendor/monaco/vs/editor/editor.main.css' }));
  const loader = h('script', { src: 'vendor/monaco/vs/loader.js' });
  loader.onload = () => {
    window.require.config({ paths: { vs: 'vendor/monaco/vs' } });
    window.require(['vs/editor/editor.main'], () => {
      const ts = monaco.languages.typescript;
      ts.typescriptDefaults.setCompilerOptions({
        target: ts.ScriptTarget.ES2020,
        lib: ['es2020'],
        allowNonTsExtensions: true,
        noEmit: true,
        // Null is a value here (the model's one spelling of "no
        // value"), so it must be visible to the checker: without this
        // it is assignable to everything and every `| null` in the
        // synthesized types would be decoration.
        strictNullChecks: true,
      });
      ts.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
        // No unused-variable hints: the preamble declares all three
        // roots whether or not this handler reads them.
        noSuggestionDiagnostics: true,
      });
      scriptEditorPhase = 'ready';
      if (typeof render === 'function') render();
    }, fail);
  };
  loader.onerror = fail;
  document.head.appendChild(loader);
}

// The element for one handler's code. Before Monaco is up (or if it
// never comes up) this is the plain textarea it always was; after,
// the cached editor, its content resynced when the draft changed
// underneath it (undo, a switched event) but left alone mid-typing.
function scriptCodeEditor(key, spec) {
  if (scriptEditorPhase !== 'ready') {
    ensureScriptEditorLoaded();
    return h('textarea', {
      class: 'mono', rows: Math.min(16, String(spec.code || '').split('\n').length + 1),
      value: spec.code || '',
      oninput: (e) => spec.onCode(e.target.value),
    });
  }
  let entry = scriptEditors.get(key);
  if (!entry) {
    entry = createScriptEditorEntry(key);
    scriptEditors.set(key, entry);
  }
  entry.spec = spec;
  if (entry.preamble !== spec.preamble
      || (!entry.editor.hasTextFocus() && entry.currentCode() !== (spec.code || ''))) {
    entry.load(spec.preamble, spec.code || '');
  }
  monaco.editor.setTheme(isDark() ? 'vs-dark' : 'vs');
  return entry.root;
}

// Editors whose row a repaint dropped. Called after every paint; an
// entry whose root did not make it back into the document is done.
function sweepScriptEditors() {
  if (scriptEditorPhase !== 'ready') return;
  for (const [key, entry] of scriptEditors) {
    if (entry.root.isConnected) continue;
    entry.editor.dispose();
    entry.model.dispose();
    scriptEditors.delete(key);
  }
}

function scriptEditorFont() {
  const declared = getComputedStyle(document.documentElement).getPropertyValue('--mono');
  return (declared && declared.trim()) || 'ui-monospace, Menlo, Consolas, monospace';
}

function createScriptEditorEntry(key) {
  const root = h('div', { class: 'script-editor' });
  const uri = monaco.Uri.parse('inmemory://scripted/' + encodeURIComponent(key) + '.ts');
  const model = monaco.editor.getModel(uri) || monaco.editor.createModel('', 'typescript', uri);
  const editor = monaco.editor.create(root, {
    model,
    automaticLayout: true,
    minimap: { enabled: false },
    lineNumbers: 'off',
    glyphMargin: false,
    folding: false,
    lineDecorationsWidth: 6,
    scrollBeyondLastLine: false,
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    renderLineHighlight: 'none',
    wordWrap: 'on',
    wordBasedSuggestions: 'off',
    // The suggest widget must escape this small, clipped container.
    fixedOverflowWidgets: true,
    contextmenu: false,
    links: false,
    fontSize: 11,
    lineHeight: SCRIPT_EDITOR_LINE,
    fontFamily: scriptEditorFont(),
    tabSize: 2,
    padding: { top: 6, bottom: 6 },
    scrollbar: { alwaysConsumeMouseWheel: false },
  });
  const entry = { root, editor, model, spec: null, preamble: '', headerLines: 0, loading: false };

  // `setHiddenAreas` is internal API, stable here because the vendored
  // version is pinned. Without it the wrapper lines stay visible –
  // degraded, not broken.
  const hideWrapper = (force) => {
    if (typeof editor.setHiddenAreas !== 'function') return;
    // setValue drops the view's hidden areas while the widget keeps
    // its cached ranges, so re-applying identical ranges is swallowed
    // as a no-op – clear first when the model was reloaded wholesale.
    if (force) editor.setHiddenAreas([]);
    const last = model.getLineCount();
    editor.setHiddenAreas([
      new monaco.Range(1, 1, entry.headerLines, 1),
      new monaco.Range(last, 1, last, 1),
    ]);
  };

  const resize = () => {
    const height = Math.min(editor.getContentHeight(), SCRIPT_EDITOR_MAX_LINES * SCRIPT_EDITOR_LINE + 12);
    root.style.height = Math.max(height, 2 * SCRIPT_EDITOR_LINE + 12) + 'px';
  };
  // Content height reflects the hidden areas only once the view has
  // taken them in, and how soon that is is not promised – measure a
  // frame after any wholesale load, and once more for good measure.
  const resizeSoon = () => {
    requestAnimationFrame(resize);
    setTimeout(resize, 80);
  };

  entry.currentCode = () => {
    const all = model.getLinesContent();
    return all.slice(entry.headerLines, all.length - 1).join('\n');
  };

  entry.load = (preamble, code) => {
    entry.loading = true;
    entry.preamble = preamble;
    entry.headerLines = preamble.split('\n').length;
    model.setValue(preamble + '\n' + code + '\n)');
    hideWrapper(true);
    // setValue parks the cursor at 1:1 – inside the hidden preamble,
    // where typing would land invisibly. Park it at the code's end.
    const lastCodeLine = model.getLineCount() - 1;
    editor.setPosition({ lineNumber: lastCodeLine, column: model.getLineMaxColumn(lastCodeLine) });
    resizeSoon();
    entry.loading = false;
  };

  // The wrapper is hidden, not protected – a select-all delete can
  // still take it out. Whatever survived is the author's code; put the
  // frame back around it. Asynchronously, and that is load-bearing:
  // inside the change event the editing command has not yet placed its
  // final cursor, so a synchronous setValue would be re-cursored into
  // the hidden preamble and the next keystroke would land there.
  // What of the author's code survived a wrapper-damaging edit. Walks
  // the preamble line by line rather than as one prefix: a deletion at
  // the code's edge merges a code line into the last preamble line,
  // and a whole-prefix comparison would then mistake the entire
  // preamble for code and paste it into view.
  const recoverCode = (text) => {
    const preambleLines = entry.preamble.split('\n');
    const lines = text.split('\n');
    let at = 0;
    while (at < preambleLines.length && at < lines.length && lines[at] === preambleLines[at]) at += 1;
    let rest = lines.slice(at);
    // A merged boundary line: the preamble part survives as a prefix.
    if (at < preambleLines.length && rest.length && rest[0].startsWith(preambleLines[at])) {
      rest = [rest[0].slice(preambleLines[at].length), ...rest.slice(1)];
    }
    let code = rest.join('\n');
    if (code.endsWith('\n)')) code = code.slice(0, -2);
    else if (code.endsWith(')')) code = code.slice(0, -1); // merged into the last code line
    return code;
  };

  let restoreQueued = false;
  const queueRestore = () => {
    if (restoreQueued) return;
    restoreQueued = true;
    setTimeout(() => {
      restoreQueued = false;
      const text = model.getValue();
      const head = entry.preamble + '\n';
      if (text.startsWith(head) && text.endsWith('\n)')) return; // undo beat us to it
      entry.load(entry.preamble, recoverCode(text));
      if (entry.spec) entry.spec.onCode(entry.currentCode());
      root.dispatchEvent(new Event('input', { bubbles: true }));
    }, 0);
  };

  // Better than repairing: the two deletions that would eat into the
  // wrapper – Backspace at the code's first character, Delete at its
  // last – simply do nothing, the same as at a document edge.
  editor.onKeyDown((e) => {
    if (e.keyCode !== monaco.KeyCode.Backspace && e.keyCode !== monaco.KeyCode.Delete) return;
    const selection = editor.getSelection();
    if (!selection || !selection.isEmpty()) return;
    const at = selection.getStartPosition();
    const lastCodeLine = model.getLineCount() - 1;
    const atStart = at.lineNumber === entry.headerLines + 1 && at.column === 1;
    const atEnd = at.lineNumber === lastCodeLine && at.column === model.getLineMaxColumn(lastCodeLine);
    if ((e.keyCode === monaco.KeyCode.Backspace && atStart)
        || (e.keyCode === monaco.KeyCode.Delete && atEnd)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  model.onDidChangeContent(() => {
    if (entry.loading) return;
    const text = model.getValue();
    const head = entry.preamble + '\n';
    if (!text.startsWith(head) || !text.endsWith('\n)')) return queueRestore();
    hideWrapper(); // the last line's number moves as lines come and go
    if (entry.spec) entry.spec.onCode(entry.currentCode());
    // A real, bubbling event: the page's delegated autosave must see
    // an edit here exactly as it would see one typed in a field.
    root.dispatchEvent(new Event('input', { bubbles: true }));
  });
  editor.onDidContentSizeChange(resize);

  // Escape belongs to the editor (dismissing its own widgets), never
  // to the page's close-the-form handler while typing code.
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.stopPropagation(); });

  return entry;
}

// ---------- experimental features ----------
//
// Everything that is DCB is always on screen: types, events, projections,
// the consistency boundary each command derives. What the examples on
// dcb.events never need – entities and their lifecycles, scripted
// projections, guarded emissions, the overview pages
// (`EXPERIMENTAL_FEATURES`, model.js) – waits behind this flag.
//
// It gates *authoring*, never reading: a model that already uses an
// experimental feature still loads, renders and evaluates it, and the
// page says which ones it found (`experimentalFeatures`). A share link
// may switch it on for one session (`&experimental`) without touching
// the stored choice – following a link never changes a setting.
//
// How it is offered is the page's business, not this file's: it is one
// of the interface's own settings, and they are collected in one place
// rather than scattered along the top of the window.

const EXPERIMENTAL_KEY = 'dcb-playground:experimental';
let experimentalThisSession = false;
function experimental() {
  return experimentalThisSession || localStorage.getItem(EXPERIMENTAL_KEY) === 'on';
}
function setExperimental(on) {
  experimentalThisSession = false;
  if (on) localStorage.setItem(EXPERIMENTAL_KEY, 'on');
  else localStorage.removeItem(EXPERIMENTAL_KEY);
  if (typeof render === 'function') render();
}
function enableExperimentalForSession() { experimentalThisSession = true; }

// ---------- the documentation ----------
//
// The notation is explained by its guide and reference on dcb.events,
// not here: an `ⓘ` says the one line a section needs and links the
// reference's anchor for it, and the help modal links the reference.
//
// The anchors are a contract with the website: its build fails on a
// link `helpReferenceLinks` lists that it does not define, so renaming
// one is a change on both sides. Until the website has pages for what
// 8.0 added (a projection's and an event's `tag`, `untagged`, `alias`,
// reads in place), those link the nearest page it has – the list of
// what is owed is in docs/research/2026-10-05-explicit-tags-and-aliases.md.

const NOTATION_GUIDE_URL = 'https://dcb.events/notation/';
const NOTATION_REFERENCE_URL = 'https://dcb.events/notation/reference/';
// The example models live on dcb.events too, each page opening its
// model here through a share link.
const EXAMPLES_URL = 'https://dcb.events/examples/';
// Where to reach us: feedback through the site's About page, issues in
// the website's repository – the playground's own takes pull requests
// only. The title prefix tells playground issues apart in the shared
// tracker; the label sticks only for those allowed to triage. The page
// footer and the disclaimer spell the same two links in index.html.
const FEEDBACK_URL = 'https://dcb.events/about/';
const ISSUES_URL = 'https://github.com/dcb-events/dcb-events.github.io/issues/new'
  + '?labels=playground&title=%5BPlayground%5D%20';
const NOTATION_ANCHORS = [
  'model', 'comments', 'literals', 'annotations', 'json', 'tag-type', 'type', 'enum', 'record', 'event',
  'projection', 'on', 'event-data', 'successor', 'current-value', 'entity', 'lifecycle', 'require',
  'derived', 'script', 'command', 'read', 'read-entity', 'fan-out', 'optional-read', 'with', 'emit',
  'emit-when', 'consistency-boundary', 'scenario', 'projection-scenario',
];

function notationReference(anchor) {
  return NOTATION_ANCHORS.includes(anchor) ? NOTATION_REFERENCE_URL + '#' + anchor : NOTATION_GUIDE_URL;
}

// Every page of dcb.events this page links to, with its anchor: what
// the site's build checks against the pages it has just built.
function helpReferenceLinks() {
  return [NOTATION_GUIDE_URL, ...NOTATION_ANCHORS.map((anchor) => NOTATION_REFERENCE_URL + '#' + anchor)];
}

// ---------- light / dark ----------
//
// Defaults to whatever the system says, same as any other well-behaved
// page; the sun/moon button in the bar overrides that per browser. `isDark` is the one
// question the rest of the page asks – nothing downstream needs to know
// whether that answer came from the system or from a stored choice.
//
// A page hosting the playground can own the choice instead, so that one
// switch serves both (dcb.events shares its own light/dark setting this
// way): it defines `window.DCB_PLAYGROUND_HOST.theme` before these
// scripts run, with `get()` answering 'system' | 'light' | 'dark' (or
// null for "no opinion"), `set(value)`, and optionally `onChange(fn)`
// for a choice made elsewhere, e.g. in another tab. How the host stores
// it is the host's business – nothing here knows it.

const THEME_KEY = 'dcb-playground:theme';
// Guarded, like the listeners below: dcb.events loads this file outside
// a browser to read `helpReferenceLinks`, and nothing at load may need
// a window there.
function hostTheme() {
  const host = typeof window !== 'undefined' ? window.DCB_PLAYGROUND_HOST : null;
  return host && host.theme && typeof host.theme.get === 'function' ? host.theme : null;
}
function theme() {
  const host = hostTheme();
  const hosted = host ? host.get() : null;
  if (hosted === 'system' || hosted === 'light' || hosted === 'dark') return hosted;
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}
function setTheme(next) {
  const host = hostTheme();
  if (host) host.set(next);
  else localStorage.setItem(THEME_KEY, next);
  if (typeof render === 'function') render();
}
// The bar's button flips whatever is on screen, so the first click
// away from "system" always changes something.
function toggleTheme() { setTheme(isDark() ? 'light' : 'dark'); }
if (hostTheme() && typeof hostTheme().onChange === 'function') {
  hostTheme().onChange(() => { if (typeof render === 'function') render(); });
}
function isDark() {
  const t = theme();
  if (t !== 'system') return t === 'dark';
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
// Only "system" cares about this firing – an explicit choice already
// repaints itself the moment it is made.
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme() === 'system' && typeof render === 'function') render();
  });
}

// ---------- which model is open ----------

//
// Each tab keeps its own answer, in sessionStorage: opening model B in
// one tab used to switch every other tab to B as well. The browser-wide
// copy in localStorage is only the last one opened anywhere – what a
// fresh tab starts on, and where a tab lands when its own model was
// deleted elsewhere.
const MODEL_KEY = 'dcb-playground:model';

// `null` is a real answer here, not an edge case to work around: a
// browser that has never loaded anything has nothing stored, and the
// Models modal is what asks the question rather than the page silently
// picking an example on someone's behalf.
function activeModelId() {
  for (const stored of [sessionStorage.getItem(MODEL_KEY), localStorage.getItem(MODEL_KEY)]) {
    if (stored && projectState()[stored]) return stored;
  }
  return null;
}
function setActiveModelId(id) {
  sessionStorage.setItem(MODEL_KEY, id);
  localStorage.setItem(MODEL_KEY, id);
}
function clearActiveModelId() {
  sessionStorage.removeItem(MODEL_KEY);
  localStorage.removeItem(MODEL_KEY);
}
function activeModel() {
  const id = activeModelId();
  return id ? projectState()[id] : null;
}

// ---------- copies opened from a link ----------
//
// A link – an example's "Open in Playground" on dcb.events, a shared
// model – imports a copy, and nothing here ever writes back to where
// it came from. Testers took their first edit of an example for an
// edit of the example itself, so a copy's first change is where the
// page says otherwise and offers to name it (`namePromptField`,
// index.html). Kept per browser and outside the event log: it is a
// fact about how this browser came by the model, not part of it.
const LINKED_COPIES_KEY = 'dcb-playground:linked-copies';

function linkedCopies() {
  try {
    const ids = JSON.parse(localStorage.getItem(LINKED_COPIES_KEY));
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function setLinkedCopies(ids) {
  if (ids.length) localStorage.setItem(LINKED_COPIES_KEY, JSON.stringify(ids));
  else localStorage.removeItem(LINKED_COPIES_KEY);
}

// Marked once its import has landed, so the import is not its own
// first change. Ids of models gone since are dropped on the way.
function markLinkedCopy(id) {
  const models = projectState();
  setLinkedCopies([...linkedCopies().filter((other) => other !== id && models[other]), id]);
}

// The linked copy these appended events first change, if any – and
// every copy they touch is unmarked, so each is asked about once. A
// rename or a delete unmarks without asking: the one has answered the
// question already, the other has made it moot.
function takeFirstChange(appended) {
  const marked = linkedCopies();
  if (!marked.length) return null;
  const left = new Set(marked);
  let changed = null;
  for (const event of appended) {
    const id = event.data && event.data['dcb-model-id'];
    if (!left.has(id)) continue;
    left.delete(id);
    if (!changed && !event.type.startsWith('dcb-model-')) changed = id;
  }
  if (left.size !== marked.length) setLinkedCopies([...left]);
  return changed;
}

// A model with nothing in it at all – no entities, no events, no
// commands. Everything downstream has to cope with that, because it is
// where a real model actually starts.
//
// The name is collected by the page (there are no browser dialogs in
// here); this only does the creating.
//
// `openNewModel` is the unwrapped core – one definition of what
// opening a fresh model means – shared with the WebMCP `start_model`
// tool, which needs the refusal to reach the agent rather than only
// the toast `run` turns it into.
function openNewModel(name) {
  const id = createDcbModel(name);
  setActiveModelId(id);
  setPendingFeatures([]);
  return id;
}

function createNamedModel(name) {
  if (!name || !name.trim()) return null;
  return run(() => openNewModel(name));
}

// ---------- sharing a model ----------
//
// Two ways a model leaves or enters this browser: a self-contained
// link (`#model=<gzipped, base64url-encoded envelope>`, so a static
// page with no backend can still hand someone a working copy of what
// it built) and a URL someone else hosts, fetched and inflated on
// demand – typed into Import, or carried by a link of its own
// (`#url=<URI-encoded address>`). Both carry the same envelope – see
// `buildShareEnvelope` in model.js. Compression is the native Streams API only, matching the
// rest of this project's lack of a dependency story; there is no
// fallback for a browser that lacks it.

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(text.length + (4 - (text.length % 4)) % 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function gzipToBase64Url(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return base64UrlEncode(new Uint8Array(buffer));
}

// What a model may unpack to, and how long a link to one may be. The
// largest shipped model is about 20 KB as JSON and under 2 KB as a
// link; the caps leave room for a hundred times that, and still stop a
// few hundred kilobytes of gzip from unpacking to gigabytes the moment
// a link is opened.
const UNPACKED_MAX_BYTES = 5 * 1024 * 1024;
const SHARE_LINK_MAX_LENGTH = 1000 * 1000;

// A stream's text, read a chunk at a time and abandoned past the cap –
// so an oversized one is never held whole.
async function readCappedText(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > UNPACKED_MAX_BYTES) {
      reader.cancel().catch(() => {});
      throw new DomainError(`it unpacks to more than ${UNPACKED_MAX_BYTES / 1024 / 1024} MB, far more than any model.`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

async function gunzipFromBase64Url(encoded) {
  if (encoded.length > SHARE_LINK_MAX_LENGTH) {
    throw new DomainError(`it is too long – over ${SHARE_LINK_MAX_LENGTH / 1000 / 1000} million characters, far more than any model.`);
  }
  return readCappedText(new Blob([base64UrlDecode(encoded)]).stream().pipeThrough(new DecompressionStream('gzip')));
}

async function buildShareLink(model) {
  const steps = session.steps.map(({ command, args }) => ({ command, args }));
  const envelope = buildShareEnvelope(model, steps);
  const encoded = await gzipToBase64Url(JSON.stringify(envelope));
  return location.origin + location.pathname + '#model=' + encoded;
}

function decodeShareLink(encoded) {
  return gunzipFromBase64Url(encoded).then((json) => JSON.parse(json));
}

// What a link to this page carries after its `#`: a model packed into
// it (`#model=…`) or the address of a file holding one (`#url=…`), then
// `&`-separated options. Null for any other fragment. An address that
// does not decode is taken as written – the fetch reports what is
// wrong with it.
function readModelLink(hash) {
  for (const kind of ['model', 'url']) {
    const prefix = '#' + kind + '=';
    if (!hash.startsWith(prefix)) continue;
    const [value, ...options] = hash.slice(prefix.length).split('&');
    let decoded = value;
    if (kind === 'url') { try { decoded = decodeURIComponent(value); } catch { /* as written */ } }
    return { kind, value: decoded, options: new URLSearchParams(options.join('&')) };
  }
  return null;
}

// The fragment that links to a hosted file: its address as typed when
// that reads back unchanged – a gist's stays legible – and URI-encoded
// when it holds what would end or garble it.
function modelUrlLink(address) {
  return '#url=' + (/[&#%\s]/.test(address) ? encodeURIComponent(address) : address);
}

// This page's address, up to where a hosted file's address goes.
function modelUrlLinkBase() {
  return location.origin + location.pathname + '#url=';
}

// A gist's page (`gist.github.com/<user>/<id>`) is HTML; its files come
// from the API, which any site may read. The page address is the one
// people copy, so it is read as the gist it names; every other address
// – a gist's Raw link among them – is fetched as it is.
const GIST_PAGE_URL = /^https:\/\/gist\.github\.com\/(?:[\w-]+\/)?([0-9a-f]+)\/?(?:[?#].*)?$/i;

function modelSourceUrl(url) {
  const match = GIST_PAGE_URL.exec(url.trim());
  return match
    ? { url: 'https://api.github.com/gists/' + match[1], gist: true }
    : { url: url.trim(), gist: false };
}

// The file in a gist that holds the model: its first `.dcb.json` file,
// else its first `.json` file, or its only file when none is named so.
function gistModelFile(gist) {
  const files = Object.values((gist && gist.files) || {});
  const named = (pattern) => files.find((f) => pattern.test(f.filename || ''));
  const file = named(/\.dcb\.json$/i) || named(/\.json$/i) || (files.length === 1 ? files[0] : null);
  if (!file) throw new DomainError('That file was not loaded: the gist holds no .json file.');
  return file;
}

// A URL someone else hosts – a gist, a bucket, another tool's export.
// `fetch` only auto-decompresses a gzip `Content-Encoding`; a file whose
// *content type* says gzip (a plain `.dcb.json.gz` sitting on a static
// host) arrives untouched over the wire and has to be inflated by hand.
// Every way it can fail says so as a DomainError – the reader of the
// message is whoever pasted or followed the address.
async function loadModelFromUrl(url) {
  const source = modelSourceUrl(url);
  const text = await fetchCappedText(source.url, { gist: source.gist });
  if (!source.gist) return parseFetchedJson(text);
  const file = gistModelFile(parseFetchedJson(text));
  return parseFetchedJson(file.truncated ? await fetchCappedText(file.raw_url) : file.content);
}

function notLoaded(reason) {
  return new DomainError('That file was not loaded: ' + reason);
}

async function fetchCappedText(url, { gist = false } = {}) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw notLoaded('its host could not be reached, or does not let other sites read it.');
  }
  if (gist && (response.status === 403 || response.status === 429)) {
    throw notLoaded('GitHub refused to serve the gist – likely its limit of 60 requests an hour. '
      + 'Use the file’s Raw link instead.');
  }
  if (!response.ok) throw notLoaded(`its host answered ${response.status} ${response.statusText}`.trim() + '.');
  if (!response.body) throw notLoaded('the response was empty.');
  const contentType = response.headers.get('Content-Type') || '';
  const body = contentType.includes('gzip') ? response.body.pipeThrough(new DecompressionStream('gzip')) : response.body;
  try {
    return await readCappedText(body);
  } catch (error) {
    throw error instanceof DomainError ? notLoaded(error.message) : error;
  }
}

function parseFetchedJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw notLoaded('it is not JSON. For a gist, use its page or its Raw link.');
  }
}

// The async twin of `run`: same error reporting, for a flow that has to
// await a fetch or a compression stream before it knows whether it
// worked.
async function runAsync(fn) {
  try {
    const out = await fn();
    if (typeof render === 'function') render();
    return out;
  } catch (err) {
    if (err instanceof DomainError) toast(err.message, true);
    else { console.error(err); toast('Unexpected error: ' + err.message, true); }
  }
}

// ---------- the slice ----------

// Every entity property that handles this event – i.e. everything the
// event changes. This is the link the original interface made you go
// and find for yourself, one entity at a time.
//
// A property is a binding, so what handles the event is the projection
// behind it; `property` carries both halves, since a reader wants the
// name the entity calls it and the fold that answers for it.
function effectsOf(model, eventName) {
  const out = [];
  for (const [entityName, entity] of Object.entries(model['entity-definitions'])) {
    for (const binding of entity.properties || []) {
      const projection = model['projection-definitions'][(binding || {}).projection];
      for (const handler of (projection && projection.handlers) || []) {
        if (handler && handler.event === eventName) {
          out.push({
            entity: entityName,
            property: { ...binding, ...projection },
            projectionName: binding.projection,
            handler,
          });
        }
      }
    }
  }
  return out;
}

// Every command that publishes this event – zero, one, or many. An
// event has no single owner the way an entity does, so this answers
// "who records this" instead of a boundary binding.
function publishersOf(model, eventName) {
  const out = [];
  for (const [name, body] of Object.entries(model['command-definitions'])) {
    for (const emission of body.publishes || []) {
      if (emission && emission.name === eventName) out.push({ command: name, emission });
    }
  }
  return out;
}

// Every projection that handles this event and is *not* bound as some
// entity's property – the ones `effectsOf` does not already name,
// listed beside it rather than twice.
function projectionsHandling(model, eventName) {
  const out = [];
  for (const [name, body] of Object.entries(model['projection-definitions'])) {
    if (boundAs(model, name).length) continue;
    for (const handler of body.handlers || []) {
      if (handler && handler.event === eventName) out.push({ projection: name, body, handler });
    }
  }
  return out;
}

// Every entity property binding this projection – `{entity, property}`
// each. Empty for one no entity binds, which is what everywhere else
// calls a standalone projection.
function boundAs(model, projectionName) {
  const out = [];
  for (const [entityName, entity] of Object.entries(model['entity-definitions'])) {
    for (const binding of entity.properties || []) {
      if (binding && binding.projection === projectionName) {
        out.push({ entity: entityName, property: binding.name });
      }
    }
  }
  return out;
}

// Every scenario – over a command or over projections – whose Given or
// Then names this event. `overProjections` says which of the two, since
// they are opened and named differently.
function scenariosReferencingEvent(model, eventName) {
  const scenarios = Object.entries(model['scenario-definitions'] || {})
    .filter(([, body]) =>
      (body.given || []).some((s) => s && s.event === eventName)
      || ((body.then || {}).events || []).some((e) => e && e.type === eventName))
    .map(([key, body]) => ({ key, body, overProjections: false }));
  const projectionScenarios = Object.entries(model['projection-scenario-definitions'] || {})
    .filter(([, body]) => (body.given || []).some((s) => s && s.event === eventName))
    .map(([key, body]) => ({ key, body, overProjections: true }));
  return [...scenarios, ...projectionScenarios];
}

// Everything one feature touches, in the order a reader meets it.
function sliceOf(model, commandName) {
  const body = model['command-definitions'][commandName];
  if (!body) return null;
  return {
    name: commandName,
    body,
    payload: body.properties || [],
    reads: body.boundary || [],
    rules: body.conditions || [],
    emits: (body.publishes || []).map((emission) => ({
      emission,
      event: model['event-definitions'][emission.name] || null,
      effects: effectsOf(model, emission.name),
      standalone: projectionsHandling(model, emission.name),
    })),
    projections: projectionsRead(body),
    // Grouped by the query to the store each read actually happens in,
    // which is the depth of the boundary's dependency graph and not
    // its length. Derived here so nothing has to author it.
    rounds: deriveRounds(body),
    dcb: deriveDcb(model, body),
    coverage: coverageIssues(model, body),
  };
}

function allSlices(model) {
  return Object.keys(model['command-definitions']).map((n) => sliceOf(model, n));
}

// ---------- coupling ----------
//
// Every command against every event type it writes (`publishes`) or
// reads back to decide – the same relationship each command's own page
// already shows one at a time (its derived boundary), gathered once
// into a matrix. "Consumes" is read straight off `deriveDcb`: an event
// type is in a command's boundary the moment some read property's
// handler names it, whether or not that command ever publishes it –
// which is what lets a cell be produce-only, consume-only, or both.
function couplingMatrix(model) {
  const events = Object.keys(model['event-definitions']).sort();
  const groups = featureGroups(model)
    .map((group) => ({ name: group.name, commands: group.commands.map((n) => couplingRow(model, n, events)) }))
    .filter((group) => group.commands.length);
  return { events, groups };
}

function couplingRow(model, name, events) {
  const slice = sliceOf(model, name);
  const produces = new Set((slice.body.publishes || []).map((e) => e && e.name).filter(Boolean));
  // event type -> Set of readable "where from" text.
  const via = {};
  for (const item of slice.dcb.items) {
    if (!item.types.length) continue;
    const binding = !item.projection && (slice.body.boundary || []).find((b) => b.alias === item.alias);
    const entity = binding && model['entity-definitions'][binding.entity];
    for (const eventType of item.types) {
      if (!via[eventType]) via[eventType] = new Set();
      if (item.projection) {
        via[eventType].add(readable(item.projection));
        continue;
      }
      const sources = (item.readProperties || []).filter((propName) => {
        const projection = entity && entityPropertyTarget(model, binding.entity, propName).projection;
        return projection && (projection.handlers || []).some((h) => h && h.event === eventType);
      });
      if (sources.length) sources.forEach((propName) => via[eventType].add(memberWords(item.alias, propName)));
      else via[eventType].add(item.alias);
    }
  }
  return {
    name,
    cells: events.map((event) => ({
      event,
      produces: produces.has(event),
      consumes: !!via[event],
      via: via[event] ? [...via[event]] : [],
    })),
  };
}

// ---------- coupling clusters ----------
//
// The matrix as a plain undirected graph – one node per command and
// per event, an edge wherever a cell has any coupling at all (produce
// or consume; direction does not matter for reachability). Two things
// fall out of that graph for free: which commands and events could be
// lifted into their own bounded context together (a connected
// component), and which single command or event is the one thing
// still holding two such components together (an articulation point –
// sever that one coupling and the model splits along the seam it
// names).
function couplingGraph(matrix) {
  const adj = new Map(); // id -> Set(id)
  const commandId = (name) => 'cmd:' + name;
  const eventId = (name) => 'evt:' + name;
  const addNode = (id) => { if (!adj.has(id)) adj.set(id, new Set()); };
  const addEdge = (a, b) => { adj.get(a).add(b); adj.get(b).add(a); };

  for (const event of matrix.events) addNode(eventId(event));
  for (const group of matrix.groups) {
    for (const row of group.commands) {
      addNode(commandId(row.name));
      for (const cell of row.cells) {
        if (cell.produces || cell.consumes) addEdge(commandId(row.name), eventId(cell.event));
      }
    }
  }
  return adj;
}

// Every node's connected-component index, assigned in the order
// `nodeOrder` first meets each component – so the numbering is stable
// and reproducible rather than an artefact of `Map` iteration order.
function connectedComponentsOf(adj, nodeOrder) {
  const componentOf = new Map();
  let next = 0;
  for (const start of nodeOrder) {
    if (componentOf.has(start)) continue;
    const stack = [start];
    componentOf.set(start, next);
    while (stack.length) {
      const id = stack.pop();
      for (const neighbor of adj.get(id)) {
        if (!componentOf.has(neighbor)) { componentOf.set(neighbor, next); stack.push(neighbor); }
      }
    }
    next += 1;
  }
  return componentOf;
}

// Articulation points (Tarjan): nodes whose removal would split the
// component they belong to into two or more pieces. Standard
// discovery/low-link DFS – recursive, since a DCB model's coupling
// graph is small enough that the call depth never approaches what
// would trouble the interpreter.
function articulationPointsOf(adj) {
  const disc = new Map();
  const low = new Map();
  const cut = new Set();
  let timer = 0;

  function dfs(id, parent) {
    disc.set(id, timer); low.set(id, timer); timer += 1;
    let children = 0;
    for (const neighbor of adj.get(id)) {
      if (neighbor === parent) continue;
      if (disc.has(neighbor)) {
        low.set(id, Math.min(low.get(id), disc.get(neighbor)));
      } else {
        children += 1;
        dfs(neighbor, id);
        low.set(id, Math.min(low.get(id), low.get(neighbor)));
        if (parent !== null && low.get(neighbor) >= disc.get(id)) cut.add(id);
      }
    }
    if (parent === null && children > 1) cut.add(id);
  }

  for (const id of adj.keys()) {
    if (!disc.has(id)) dfs(id, null);
  }
  return cut;
}

// Commands and events reordered so that coupled clusters sit together
// and, within a cluster, the most-coupled things – the likeliest
// bridges – settle toward the far edge. Clusters are numbered by size,
// largest first, so the model's core sits at the top-left and its
// loosest ends trail off toward the bottom-right.
function couplingClusters(matrix) {
  const adj = couplingGraph(matrix);
  const commandIds = matrix.groups.flatMap((g) => g.commands.map((r) => 'cmd:' + r.name));
  const eventIds = matrix.events.map((e) => 'evt:' + e);
  const nodeOrder = [...commandIds, ...eventIds];

  const componentOf = connectedComponentsOf(adj, nodeOrder);
  const bridges = articulationPointsOf(adj);

  const commandCount = new Map();
  const eventCount = new Map();
  const firstSeen = new Map();
  nodeOrder.forEach((id, i) => {
    const c = componentOf.get(id);
    if (!firstSeen.has(c)) firstSeen.set(c, i);
    (id.startsWith('cmd:') ? commandCount : eventCount).set(c, ((id.startsWith('cmd:') ? commandCount : eventCount).get(c) || 0) + 1);
  });
  const rankOrder = [...firstSeen.keys()].sort((a, b) => {
    const sizeA = (commandCount.get(a) || 0) + (eventCount.get(a) || 0);
    const sizeB = (commandCount.get(b) || 0) + (eventCount.get(b) || 0);
    return sizeB - sizeA || firstSeen.get(a) - firstSeen.get(b);
  });
  const rankOf = new Map(rankOrder.map((c, i) => [c, i]));

  const degree = (id) => adj.get(id).size;
  const byClusterThenDegree = (a, b) =>
    rankOf.get(componentOf.get(a)) - rankOf.get(componentOf.get(b))
    || (bridges.has(a) === bridges.has(b) ? degree(b) - degree(a) : bridges.has(a) ? 1 : -1);

  const commandOrder = [...commandIds].sort(byClusterThenDegree).map((id) => id.slice(4));
  const eventOrder = [...eventIds].sort(byClusterThenDegree).map((id) => id.slice(4));

  const clusters = rankOrder.map((c, rank) => ({
    rank, commands: commandCount.get(c) || 0, events: eventCount.get(c) || 0,
  }));

  return {
    commandOrder,
    eventOrder,
    clusterOfCommand: (name) => rankOf.get(componentOf.get('cmd:' + name)),
    clusterOfEvent: (name) => rankOf.get(componentOf.get('evt:' + name)),
    isBridgeCommand: (name) => bridges.has('cmd:' + name),
    isBridgeEvent: (name) => bridges.has('evt:' + name),
    clusters,
  };
}

// ---------- lifecycles ----------
//
// Each entity's lifecycle read as a state machine. Nothing here is
// authored – every part is derived from definitions that already exist,
// through the designation `model.js` resolves: an entity's `lifecycle`
// names one of its own properties, and `lifecycleOf` flattens the two
// spellings that property may have (a boolean, or an enum) into one
// list of states.
//
//   states       `lifecycleOf`'s states – an enum's members, or
//                `false`/`true` for the two-state boolean case;
//   transitions  the lifecycle projection's declared handlers – a
//                handler that sets a state is an arrow into it, and the
//                arrow starts wherever the commands publishing its
//                event are allowed to run;
//   commands     every command binding the entity, placed by its
//                conditions over the lifecycle.
//
// A command with no condition over a lifecycle it touches is
// *unguarded*: nothing refuses it at any state. That is a fact worth
// surfacing, not papering over – an unguarded transition is drawn from
// the initial state only as a convention, and flagged as such, so a
// missing guard stays visible. It is also why the two-state machines
// are on this page at all rather than filtered off it: a command that
// creates a thing without checking that it does not exist yet is
// exactly this bug, and it is commonest in the simplest machine.

// Which of `lifecycle`'s states a condition allows, or `null` when this
// condition says nothing readable about it.
//
// An enum is read off `equals` against a member reference and
// `equalsAny` against a list whose every entry is one – a bare literal
// in the list makes it unreadable rather than guessed at. A boolean is
// read off the unary `isTrue`/`isFalse` and off `equals` against a bare
// `true`/`false`. Any other predicate leaves it unread.
function lifecycleAllowedStates(condition, lifecycle, other) {
  const states = lifecycle.states;
  const only = (keep) => (condition.negate
    ? states.filter((state) => !keep.includes(state))
    : states.filter((state) => keep.includes(state)));

  if (lifecycle.isBoolean) {
    if (condition.predicate === 'isTrue') return only(['true']);
    if (condition.predicate === 'isFalse') return only(['false']);
    if (condition.predicate === 'equals' && typeof other === 'boolean') {
      return only([String(other)]);
    }
    return null;
  }
  if (condition.predicate === 'equals' && operandSource(other) === 'enum-member') {
    return only([String(other.enumMember)]);
  }
  if (condition.predicate === 'equalsAny' && Array.isArray(other)
      && other.length && other.every((entry) => operandSource(entry) === 'enum-member')) {
    return only(other.map((entry) => String(entry.enumMember)));
  }
  // An empty `equalsAny` list is still read: "one of nothing" allows no
  // state, which is what it evaluates to – unreadable would claim the
  // opposite.
  if (condition.predicate === 'equalsAny' && Array.isArray(other) && !other.length) {
    return only([]);
  }
  return null;
}

// The states `body`'s conditions allow `entityName`'s lifecycle to be
// in, read off every condition over an alias binding that entity.
// `states: null` means unguarded: the command binds the entity but no
// condition constrains its lifecycle. Several conditions (or several
// aliases) intersect: each is one more thing that must hold.
function lifecycleConstraint(model, body, entityName, lifecycle) {
  const aliases = new Set((body.boundary || [])
    .filter((binding) => binding && binding.entity === entityName)
    .map((binding) => binding.alias));
  if (!aliases.size) return { binds: false, states: null };
  let allowed = null;
  for (const condition of body.conditions || []) {
    for (const side of ['leftHandSide', 'rightHandSide']) {
      const operand = condition[side];
      if (operandSource(operand) !== 'alias-property') continue;
      if (!aliases.has(operand.alias) || operand.property !== lifecycle.property) continue;
      const other = condition[side === 'leftHandSide' ? 'rightHandSide' : 'leftHandSide'];
      const these = lifecycleAllowedStates(condition, lifecycle, other);
      if (these === null) continue;
      allowed = allowed === null ? these : allowed.filter((state) => these.includes(state));
    }
  }
  return { binds: true, states: allowed };
}

// Every entity's machine, plus the entities that do not yield one and
// why – an entity whose lifecycle cannot be read is not an error, it is
// simply not drawable, and the page should say so rather than silently
// thin out.
//
// Per machine:
//   compact               a boolean lifecycle: two states, existence
//                         and nothing else, which the page draws in one
//                         row rather than as a diagram;
//   states / initial      off `lifecycleOf` and the projection's initial
//                         value;
//   transitions           `{event, target, publishers, sources,
//                         unguarded, conventional}` – `sources` is the
//                         union of the publishing commands' allowed
//                         states; a transition only unguarded
//                         publishers reach is drawn from the initial
//                         state (`conventional: true`);
//   perState              state -> the commands allowed there, each
//                         `{command, movesTo, unguarded}`;
//   terminal              states no drawn transition leaves – with the
//                         conventional arrows counted, so "terminal"
//                         matches what the page draws;
//   opaque                events whose handler touches the lifecycle in
//                         a way this cannot read (a computed value, an
//                         operation other than `set`).
function lifecycleMachines(model) {
  const machines = [];
  const excluded = [];
  for (const entityName of Object.keys(model['entity-definitions'])) {
    const lifecycle = lifecycleOf(model, entityName);
    if (!lifecycle) {
      excluded.push({ entity: entityName, reason: lifecycleRefusal(model, entityName) });
      continue;
    }
    const { projection, states } = lifecycle;

    const initialOperand = projection.initialValue;
    const initial = lifecycle.isBoolean
      ? (typeof initialOperand === 'boolean' ? String(initialOperand) : null)
      : (operandSource(initialOperand) === 'enum-member'
        && states.includes(String(initialOperand.enumMember))
        ? String(initialOperand.enumMember) : null);

    const transitions = [];
    const opaque = [];
    for (const handler of projection.handlers || []) {
      if (!handler || !handler.event) continue;
      const target = handler.operation !== 'set' ? null
        : (lifecycle.isBoolean
          ? (typeof handler.value === 'boolean' ? String(handler.value) : null)
          : (operandSource(handler.value) === 'enum-member'
            ? String(handler.value.enumMember) : null));
      if (target === null || !states.includes(target)) {
        opaque.push(handler.event);
        continue;
      }
      const publishers = publishersOf(model, handler.event).map(({ command }) => ({
        command,
        sources: lifecycleConstraint(
          model, model['command-definitions'][command], entityName, lifecycle
        ).states,
      }));
      const sources = [...new Set(publishers.flatMap((p) => p.sources || []))];
      const unguarded = publishers.some((p) => p.sources === null);
      const conventional = !sources.length && unguarded && initial !== null && initial !== target;
      transitions.push({
        event: handler.event, target, publishers, unguarded, conventional,
        sources: conventional ? [initial] : sources,
        unpublished: !publishers.length,
      });
    }

    const perState = {};
    for (const state of states) perState[state] = [];
    for (const [commandName, body] of Object.entries(model['command-definitions'])) {
      const constraint = lifecycleConstraint(model, body, entityName, lifecycle);
      if (!constraint.binds) continue;
      const moved = transitions.find((t) =>
        (body.publishes || []).some((emission) => emission && emission.name === t.event));
      const entry = {
        command: commandName,
        movesTo: moved ? moved.target : null,
        unguarded: constraint.states === null,
      };
      for (const state of constraint.states === null ? states : constraint.states) {
        perState[state].push(entry);
      }
    }

    const leads = new Set();
    for (const t of transitions) {
      for (const from of t.sources) if (from !== t.target) leads.add(from);
    }

    machines.push({
      entity: entityName,
      property: lifecycle.property,
      projection: lifecycle.projectionName,
      valueType: lifecycle.valueType,
      isBoolean: lifecycle.isBoolean,
      compact: lifecycle.isBoolean,
      states, initial, transitions, opaque, perState,
      terminal: states.filter((state) => !leads.has(state)),
    });
  }
  return { machines, excluded };
}

// The initial state leads; the rest keep the enum's declared order,
// which is the order the modeller wrote the lifecycle in.
function lifecycleOrder(machine) {
  if (machine.initial === null) return machine.states;
  return [machine.initial, ...machine.states.filter((s) => s !== machine.initial)];
}

// ---------- event model ----------
//
// The model laid out the way eventmodeling.org draws a system: time
// running left to right, each command with its payload above it and
// the events it appends below, and a read model after it for every
// piece of state those events move for the first time.
//
// The event lanes are tags, not streams. An event belongs to every
// instance it is tagged with, so one carrying a course id and a student
// id is one card across both lanes – the fact a stream-per-aggregate
// model would have to split in two, which is the whole case for DCB.
//
// A definition holds no time, so the order is derived, along the
// lifecycles: a command that brings something into being comes first,
// one that only works on what exists next, and one that moves a thing
// further along – or back to where it started, which ends it – after
// that. Feature order breaks every tie, which is all it is for a model
// without lifecycles.
function eventModel(model) {
  const commands = model['command-definitions'];
  const CREATES = 1;
  const WORKS_ON = 1.5;
  const rank = {};
  for (const machine of lifecycleMachines(model).machines) {
    const order = lifecycleOrder(machine);
    for (const transition of machine.transitions) {
      const step = order.indexOf(transition.target);
      if (step < 0) continue;
      const position = step === 0 ? order.length : Math.max(step, CREATES);
      for (const { command } of transition.publishers) {
        rank[command] = Math.max(rank[command] === undefined ? -Infinity : rank[command], position);
      }
    }
  }
  const featureOrder = featureGroups(model).flatMap((group) => group.commands);
  const ordered = Object.keys(commands)
    .map((name) => ({ name, rank: rank[name] === undefined ? WORKS_ON : rank[name], at: featureOrder.indexOf(name) }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map((entry) => entry.name);

  const lanes = [];
  const laneOf = (tag) => {
    if (!lanes.includes(tag)) lanes.push(tag);
    return lanes.indexOf(tag);
  };
  const tagsOf = (eventName) => {
    const definition = model['event-definitions'][eventName];
    const tags = eventTagLeaves(model, definition).map((leaf) => leaf.identifierType);
    return [...new Set(tags)];
  };

  // Lanes are claimed in timeline order, so the first lane is the tag
  // the story starts with; untagged events share one lane, last.
  const columns = [];
  const shown = new Set();
  const untagged = [];
  for (const name of ordered) {
    const body = commands[name];
    const emits = (body.publishes || []).filter((emission) => emission && emission.name);
    const events = emits.map((emission) => {
      const tags = tagsOf(emission.name);
      const event = { name: emission.name, tags, guarded: !!(emission.when && emission.when.length), lanes: tags.map(laneOf) };
      if (!tags.length) untagged.push(event);
      return event;
    });
    columns.push({
      kind: 'command', command: name,
      payload: body.properties || [],
      rules: (body.conditions || []).length,
      guards: emits.reduce((n, emission) => n + (emission.when ? emission.when.length : 0), 0),
      reads: (body.boundary || []).map((binding) => binding.alias),
      events,
    });

    for (const event of events) {
      const fresh = new Map();
      for (const effect of effectsOf(model, event.name)) {
        const key = effect.entity + '.' + effect.property.name;
        if (shown.has(key)) continue;
        shown.add(key);
        if (!fresh.has(effect.entity)) fresh.set(effect.entity, []);
        fresh.get(effect.entity).push(effect.property.name);
      }
      // In lane order, so the read models under a two-tag event come
      // in the order its lanes do.
      const laneRank = (entity) => {
        const at = lanes.indexOf(idTypeOf(model, entity));
        return at < 0 ? lanes.length : at;
      };
      for (const [entity, properties] of [...fresh].sort((a, b) => laneRank(a[0]) - laneRank(b[0]))) {
        columns.push({ kind: 'read', entity, properties, from: event.name });
      }
      for (const { projection } of projectionsHandling(model, event.name)) {
        if (shown.has(projection)) continue;
        shown.add(projection);
        columns.push({ kind: 'read', projection, properties: [], from: event.name });
      }
    }
  }
  if (untagged.length) {
    const lane = laneOf(null);
    for (const event of untagged) event.lanes = [lane];
  }
  return { lanes, columns };
}

// ---------- promoting a lifecycle ----------
//
// Whether a boolean property is a *one-way door*: every handler sets it
// away from where it starts, and none sets it back.
//
// This is the whole discriminator behind the promotion suggestion, and
// it is worth being exact about why. `exists && !archived` folds into a
// three-state lifecycle soundly, because archiving never un-archives –
// the states are successive and a thing is in exactly one of them.
// `exists && !isPublic` must not: a course can be existent-and-public
// or existent-and-private, those are not stages, and collapsing them
// into one enum destroys a dimension the model was using. Monotonicity
// is the readable difference. A property nothing sets at all is not a
// door either way, so it does not qualify.
function isMonotoneBoolean(model, entityName, propertyName) {
  const { binding, projection } = entityPropertyTarget(model, entityName, propertyName);
  if (!binding || !projection) return false;
  if (projection.valueType !== 'boolean' || projection.isList) return false;
  if (scriptOf(projection) || derivedOf(projection)) return false;
  if (typeof projection.initialValue !== 'boolean') return false;
  const handlers = (projection.handlers || []).filter((handler) => handler && handler.event);
  if (!handlers.length) return false;
  return handlers.every((handler) => handler.operation === 'set'
    && typeof handler.value === 'boolean'
    && handler.value !== projection.initialValue);
}

// Which of an entity's properties could be designated its lifecycle:
// single-valued, folded (not scripted or derived), and holding either a
// boolean or an enum – the two things that have states to be in.
//
// This is what the designation picker offers, and it is deliberately
// the same test `lifecycleOf` applies, so the picker can never offer a
// property that would then fail to resolve.
function lifecycleCandidates(model, entityName) {
  const entity = model['entity-definitions'][entityName];
  if (!entity) return [];
  return (entity.properties || []).filter((binding) => {
    const projection = model['projection-definitions'][binding.projection];
    if (!projection || projection.isList) return false;
    if (scriptOf(projection) || derivedOf(projection)) return false;
    return projection.valueType === 'boolean' || !!enumMembersFor(model, projection.valueType);
  }).map((binding) => binding.name);
}

// What the one-click existence lifecycle would do for this entity:
// `'create'` the `exists` boolean, `'designate'` the one it already has
// (the round trip after removing a lifecycle, which leaves the property
// behind), or `null` when `exists` is taken by something that cannot
// be one – then the option is not offered at all, rather than inventing
// `exists2`. The projection name is uniquified like any property's;
// the property name is what conditions read, so it is not.
function existenceLifecycleOffer(model, entityName) {
  const entity = model['entity-definitions'][entityName];
  if (!entity) return null;
  const existing = (entity.properties || []).find((p) => p && p.name === LIFECYCLE_PROPERTY);
  if (!existing) return 'create';
  const projection = model['projection-definitions'][existing.projection];
  return projection && projection.valueType === 'boolean'
    && lifecycleCandidates(model, entityName).includes(LIFECYCLE_PROPERTY) ? 'designate' : null;
}

// The monotone booleans of one entity that `body` guards – the raw
// material of a merge. In the entity's own declaration order, with the
// designated lifecycle first when it is one of them, because existence
// is always the first stage of anything.
function guardedMonotoneBooleans(model, body, entityName, alias) {
  const found = new Set();
  const walk = (condition) => {
    const operand = condition.leftHandSide;
    if (operandSource(operand) !== 'alias-property') return;
    if (operand.alias !== alias || !operand.property) return;
    if (isMonotoneBoolean(model, entityName, operand.property)) found.add(operand.property);
  };
  for (const condition of body.conditions || []) walk(condition);
  for (const emission of body.publishes || []) {
    for (const condition of emission.when || []) walk(condition);
  }
  return orderedMonotoneBooleans(model, entityName, found);
}

// Declaration order, lifecycle first. Shared by the rule wizard's offer
// and the entity page's, so the two can never propose different
// progressions for the same booleans.
function orderedMonotoneBooleans(model, entityName, names) {
  const entity = model['entity-definitions'][entityName];
  if (!entity) return [];
  const lifecycle = lifecycleOf(model, entityName);
  const declared = (entity.properties || []).map((p) => p.name).filter((n) => names.has(n));
  if (lifecycle && lifecycle.isBoolean && names.has(lifecycle.property)) {
    return [lifecycle.property, ...declared.filter((n) => n !== lifecycle.property)];
  }
  return declared;
}

// The promotion this command's rules are asking for, or null.
//
// Two or more monotone booleans of one entity, guarded by one command.
// Whether one of them is the designated lifecycle does not matter – what
// matters is that they are successive one-way doors, which is the same
// question either way. (It mattered in the first cut of this, and that
// was a bug: two booleans an author had just added by hand – `registered`
// and `expelled` – are exactly the shape this is for, and neither of
// them was the designation.)
//
// Still narrow in the way that counts: **monotone**. `registered` and
// `expelled` are stages; `registered` and `isPublic` are not, and
// collapsing the second pair into one enum would destroy a dimension.
// See `isMonotoneBoolean`.
function lifecycleMergeSuggestion(model, body) {
  for (const binding of body.boundary || []) {
    if (!binding || !binding.entity) continue;
    const booleans = guardedMonotoneBooleans(model, body, binding.entity, binding.alias);
    if (booleans.length < 2) continue;
    return { entity: binding.entity, alias: binding.alias, booleans };
  }
  return null;
}

// The same offer, for the entity's own page – where an author who has
// just added two booleans by hand is actually looking, and where no
// command need exist yet. Every monotone boolean the entity has, not
// only the ones some command guards.
function entityMergeCandidates(model, entityName) {
  const entity = model['entity-definitions'][entityName];
  if (!entity) return [];
  const monotone = new Set((entity.properties || []).map((p) => p.name)
    .filter((name) => isMonotoneBoolean(model, entityName, name)));
  return orderedMonotoneBooleans(model, entityName, monotone);
}

// ---------- features ----------
//
// A feature groups the commands that make it up. It is not a definition
// of its own: it exists because commands name it, which means a feature
// cannot be empty. Groups you have named but not filled yet are held
// here in the interface until they earn a command.

const UNGROUPED = 'Ungrouped';
const GROUPS_KEY = 'dcb-playground:pending-features';

function pendingFeatures() {
  try { return JSON.parse(localStorage.getItem(GROUPS_KEY)) || []; } catch (e) { return []; }
}
function setPendingFeatures(list) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify([...new Set(list)]));
}
function addPendingFeature(name) { setPendingFeatures([...pendingFeatures(), name]); }

function featureOf(body) {
  return (body && typeof body.feature === 'string' && body.feature.trim()) || UNGROUPED;
}

// Features in the order their first command appears, then the ones still
// waiting for one, then the catch-all – so the rail never reshuffles
// under you as you edit. *Within* a feature the commands sit
// alphabetically, by the name they are shown under: a command's place
// in a group carries no meaning, so a fixed order beats an accidental
// one – and it is what lets dropping a command anywhere in a group
// mean only "into this group".
function featureGroups(model) {
  const order = [];
  const byFeature = {};
  for (const [name, body] of Object.entries(model['command-definitions'])) {
    const feature = featureOf(body);
    if (!byFeature[feature]) { byFeature[feature] = []; if (feature !== UNGROUPED) order.push(feature); }
    byFeature[feature].push(name);
  }
  const live = new Set(order);
  for (const name of pendingFeatures()) {
    if (!live.has(name) && name !== UNGROUPED) { order.push(name); byFeature[name] = []; }
  }
  if (byFeature[UNGROUPED]) order.push(UNGROUPED);
  return order.map((name) => ({
    name,
    commands: (byFeature[name] || []).sort((a, b) => readable(a).localeCompare(readable(b))),
  }));
}

// Events no feature emits, and entities nothing reads – the loose ends
// a command-centred view would otherwise hide.
function orphans(model) {
  const emitted = new Set();
  const boundEntities = new Set();
  for (const body of Object.values(model['command-definitions'])) {
    for (const e of body.publishes || []) emitted.add(e.name);
    for (const b of body.boundary || []) boundEntities.add(b.entity);
  }
  return {
    events: Object.keys(model['event-definitions']).filter((n) => !emitted.has(n)),
    entities: Object.keys(model['entity-definitions']).filter((n) => !boundEntities.has(n)),
  };
}

// Everything that happens to one property: which features move it, and
// which features consult it. The inspector needs both halves to answer
// "is this still earning its place?".
function propertyUsage(model, entityName, propertyName) {
  const { binding, projection } = entityPropertyTarget(model, entityName, propertyName);
  // `property` is what a caller renders: the binding's name over the
  // bound projection's shape, which between them is everything the old
  // single definition carried.
  const property = binding ? { ...binding, ...(projection || {}) } : undefined;
  const changedBy = [];
  const readBy = [];
  for (const [command, body] of Object.entries(model['command-definitions'])) {
    for (const emission of body.publishes || []) {
      const handler = ((projection && projection.handlers) || []).find((x) => x.event === emission.name);
      if (handler) changedBy.push({ command, event: emission.name, handler });
    }
    const aliases = (body.boundary || []).filter((b) => b.entity === entityName).map((b) => b.alias);
    let reads = false;
    forEachCommandOperand(body, (operand) => {
      if (operandSource(operand) === 'alias-property'
          && aliases.includes(operand.alias) && operand.property === propertyName) reads = true;
    });
    if (reads) readBy.push(command);
  }
  return { property, binding, projection, changedBy, readBy };
}

// Which commands read a projection, however they reach it: directly by
// name when nothing binds it, and through an entity alias when
// something does. One question rather than two, because a projection
// does not know which of the two it is – that is the whole point of a
// property being a binding.
function projectionReaders(model, projectionName) {
  const owners = boundAs(model, projectionName);
  const readers = [];
  for (const [command, body] of Object.entries(model['command-definitions'])) {
    // An alias's read, or one in place – the same read either way.
    let reads = (body.boundary || []).some((b) => b.projection === projectionName)
      || inlineReads(body).some(({ read }) => read.projection === projectionName);
    if (!reads) {
      // Every (alias, property) pair that lands on this projection: an
      // alias bound to an entity that calls it something, under the
      // name that entity calls it.
      const pairs = new Set();
      for (const binding of body.boundary || []) {
        if (!binding.entity) continue;
        for (const owner of owners) {
          if (owner.entity === binding.entity) pairs.add(binding.alias + '\0' + owner.property);
        }
      }
      forEachCommandOperand(body, (operand) => {
        if (operandSource(operand) === 'alias-property'
            && pairs.has(operand.alias + '\0' + operand.property)) reads = true;
      });
    }
    if (reads) readers.push(command);
  }
  return readers;
}

// ---------- names ----------
//
// A modeler types "define course"; the model stores `DefineCourse`. The
// PascalCase is the schema's business, not the author's, so it is
// derived on the way in and unwound on the way out. The stored
// identifier rides beside the label, for anyone who wants it.

function toPascal(label) {
  return String(label || '').split(/[^\p{L}\p{M}\p{Nd}]+/u).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join('');
}

function toCamel(label) {
  const pascal = toPascal(label);
  return pascal ? pascal[0].toLowerCase() + pascal.slice(1) : '';
}

function splitWords(name) {
  return String(name || '')
    .replace(/([\p{Ll}\p{Nd}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/\s+/).filter(Boolean);
}

// `CourseDefined` -> "Course defined". For things with a name of their
// own: a command, an event, an entity, a value type, a status.
function readable(name) {
  const words = splitWords(name);
  if (!words.length) return '';
  return words.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase())).join(' ');
}

// `courseId` -> "course id". For the things that belong to something
// else – a property, a parameter, a field. They are never capitalised,
// and they read the same wherever they turn up: in the list that
// declares them and in the sentence that refers back to them.
function propertyWords(name) {
  return splitWords(name).map((w) => w.toLowerCase()).join(' ');
}

// A property reached through the alias it was bound under.
function memberWords(alias, property) {
  return `${alias} · ${propertyWords(property)}`;
}

function pastTense(verb) {
  if (/e$/i.test(verb)) return verb + 'd';
  if (/[^aeiou]y$/i.test(verb)) return verb.slice(0, -1) + 'ied';
  return verb + 'ed';
}

const PREPOSITIONS = ['To', 'From', 'In', 'On', 'For', 'With', 'At', 'Of'];

// An event is usually the command in the past tense, with the verb
// moved behind the thing it acted on: DefineCourse -> CourseDefined,
// SubscribeStudentToCourse -> StudentSubscribedToCourse. Only ever a
// suggestion – it is offered in an editable field, never imposed.
function suggestEventName(commandName) {
  const words = splitWords(toPascal(commandName));
  if (!words.length) return '';
  if (words.length === 1) return pastTense(words[0]);
  const [verb, ...rest] = words;
  const at = rest.findIndex((w) => PREPOSITIONS.includes(w));
  const past = pastTense(verb);
  if (at > 0) return rest.slice(0, at).join('') + past + rest.slice(at).join('');
  return rest.join('') + past;
}

// ---------- saying it in words ----------

function operandWords(operand) {
  // `equalsAny`'s literal list – the entries, said in order.
  if (Array.isArray(operand)) {
    return operand.length ? operand.map(operandWords).join(', ') : '[]';
  }
  switch (operandSource(operand)) {
    case 'alias-property':
      // No property means a bound projection's single value, which the
      // alias already names.
      if (!operand.property) return propertyWords(operand.alias);
      return memberWords(operand.alias, operand.property);
    case 'parameter':
      return operand.property
        ? memberWords(propertyWords(operand.parameterName), operand.property)
        : propertyWords(operand.parameterName);
    case 'enum-member': return readable(operand.enumMember);
    // A path, not a name: the same `event.data.capacity` a scripted
    // handler writes, so the stored spelling stays – humanizing inside
    // a dotted path reads as a typo. It is also what tells a value the
    // event carried apart from a constant at a glance.
    case 'event-property': return `event.data.${operand.eventProperty}`;
    // Both are operand *kinds*, not prose: the schema names them and
    // nothing an author typed is being unwound here, so they read as
    // the tokens they are rather than as descriptions of themselves.
    case 'current-value': return 'currentValue';
    case 'successor': return `successor(${operandWords(operand.successor)})`;
    // A projection read in place, as a call: the name, then the values
    // it gives its tags and arguments – `Developer seniority level
    // (developer)`. The code view's spelling with the words a reader
    // reads; `projectionReadParts` hands the pieces to a renderer.
    case 'projection-read': {
      const { name, values } = projectionReadParts(operand);
      return values.length ? `${name} (${values.map((v) => v.words).join(', ')})` : name;
    }
    case 'tag-literal': return operandText(operand);
    case 'each': return 'each ' + operandWords(operand.each);
    default:
      if (typeof operand === 'string') return `"${operand}"`;
      // A record a scripted projection folded to is a static value
      // with no operand shape – it reads as the JSON it is rather
      // than as "[object Object]".
      if (operand !== null && typeof operand === 'object') return JSON.stringify(operand);
      return String(operand);
  }
}

// Where a projection starts, as the literal it is.
//
// `null`, `""` and `[]` are three different answers and each keeps its
// own spelling: a value that has not arrived is not the empty string,
// and an empty list is neither. None of them is softened into words –
// this reader gets the literal faster than a description of it.
function initialValueWords(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return value.length ? value.map(operandWords).join(', ') : '[]';
  }
  return operandWords(value);
}

const PREDICATE_WORDS = {
  equals: ['is', 'is not'],
  equalsAny: ['is one of', 'is not one of'],
  lessThan: ['is less than', 'is not less than'],
  lessThanOrEquals: ['is at most', 'is more than'],
  greaterThan: ['is more than', 'is not more than'],
  greaterThanOrEquals: ['is at least', 'is less than'],
  contains: ['contains', 'does not contain'],
  containsAny: ['overlaps', 'does not overlap'],
  countEquals: ['has exactly', 'does not have exactly'],
  countLessThan: ['has fewer than', 'does not have fewer than'],
  countGreaterThan: ['has more than', 'does not have more than'],
  startsWith: ['starts with', 'does not start with'],
  endsWith: ['ends with', 'does not end with'],
  isEmpty: ['is empty', 'is not empty'],
  isNotEmpty: ['is not empty', 'is empty'],
  isTrue: ['holds', 'does not hold'],
  isFalse: ['does not hold', 'holds'],
};

// A boolean property is named as a predicate, so its false state is
// that predicate denied. Two shapes cover what the one-click lifecycle
// and ordinary naming produce – `isArchived` -> "is not archived",
// `exists` -> "does not exist" – and anything else falls back to a bare
// "not …", which is graceless but never wrong. This is the one thing
// the two-state spelling gives up: an enum's states are named, a
// boolean's have to be said.
function negatedPredicateWords(words) {
  if (/^is\b/.test(words)) return words.replace(/^is\b/, 'is not');
  const single = /^([a-z]{3,})(e?s)$/.exec(words);
  if (single) return `does not ${single[1]}`;
  return 'not ' + words;
}

// One of a machine's states, in words. An enum state is its member's
// name; a boolean state has none, so it is said off the property –
// which is why the page labels the two nodes "exists" and "does not
// exist" rather than "true" and "false".
function lifecycleStateWords(machine, state) {
  if (!machine.isBoolean) return readable(state);
  const words = propertyWords(machine.property);
  return state === 'true' ? words : negatedPredicateWords(words);
}

// A read of a *boolean* designated lifecycle, or null. This is what
// licenses saying "the course exists" instead of "course · exists
// holds": the entity designated that property, so the condition is
// about the thing's existence and can be said that way. Nothing is
// stored differently – the condition is an ordinary `isTrue` over an
// ordinary property, and this only decides how it reads.
//
// An enum lifecycle is deliberately not sugared. Its states are named,
// those names are what the modeller chose, and "document · status is
// one of Draft, Published" is already the sentence they wrote.
function existenceRead(model, body, operand) {
  if (!model || !body) return null;
  if (operandSource(operand) !== 'alias-property' || !operand.property) return null;
  const binding = (body.boundary || []).find((b) => b && b.alias === operand.alias);
  if (!binding || !binding.entity) return null;
  const lifecycle = lifecycleOf(model, binding.entity);
  if (!lifecycle || !lifecycle.isBoolean) return null;
  if (lifecycle.property !== operand.property) return null;
  return { alias: operand.alias, lifecycle };
}

// A condition as a sentence. Returns parts so a renderer can style the
// operands without re-parsing the text.
//
// `model` and `body` are optional and only buy the existence wording: a
// caller without them gets the literal reading, which is correct, just
// less fluent.
function conditionParts(condition, model, body) {
  const read = existenceRead(model, body, condition.leftHandSide);
  if (read) {
    // Only when the condition pins the lifecycle to exactly one of its
    // two states. Anything else is not "it exists" or "it does not" and
    // is left to say itself.
    const states = lifecycleAllowedStates(condition, read.lifecycle, condition.rightHandSide);
    if (states && states.length === 1) {
      const words = propertyWords(read.lifecycle.property);
      return {
        // No article: every other condition row starts with the bare
        // alias, and "the course exists" beside "course · capacity is at
        // most 10" is one sentence pretending to be a different kind of
        // thing from the other.
        left: propertyWords(read.alias),
        verb: states[0] === 'true' ? words : negatedPredicateWords(words),
        right: null,
      };
    }
  }
  const words = PREDICATE_WORDS[condition.predicate] || [condition.predicate, 'not ' + condition.predicate];
  const verb = words[condition.negate ? 1 : 0];
  const left = operandWords(condition.leftHandSide);
  if (condition.rightHandSide === undefined) return { left, verb, right: null };
  return { left, verb, right: operandWords(condition.rightHandSide) };
}

// A read in place in pieces: the projection's name, and each value
// it is read with – tags first, then arguments as `name = value` – with
// the operand each came from, so a renderer can point back at it.
function projectionReadParts(operand) {
  const tagWords = (tag) => (operandSource(tag) === 'tag-literal' ? operandText(tag) : operandWords(tag));
  return {
    name: readable(operand.projection || '?'),
    values: [
      ...readTagOperands(operand).map((tag) => ({ operand: tag, words: tagWords(tag) })),
      ...Object.entries(operand.arguments || {})
        .map(([name, value]) => ({ operand: value, words: `${name} = ${operandWords(value)}` })),
    ],
  };
}

// The message a rule is refused with when its author wrote none: the
// condition, said as what the command requires – `Developer seniority
// level must be at least Required seniority level`. A read in place is
// named without its tags, an alias's property as words: the message is
// static text, and what a refusal read is never part of it.
function derivedRejection(model, body, condition) {
  // "Is one of" a list held in data is stored with its sides swapped
  // (`contains`, the list first); said the way the rule adder asks it.
  const swapped = condition.predicate === 'contains'
    && operandSource(condition.leftHandSide) === 'parameter'
    && operandSource(condition.rightHandSide) === 'alias-property';
  const said = swapped
    ? { ...condition, predicate: 'equalsAny', leftHandSide: condition.rightHandSide, rightHandSide: condition.leftHandSide }
    : condition;
  const p = conditionParts(said, model, body);
  // Only where the sentence named the operand itself – "course exists"
  // already said the lifecycle property its own way.
  const words = (operand, fallback) => {
    if (fallback !== operandWords(operand)) return fallback;
    if (operandSource(operand) === 'projection-read') return readable(operand.projection || '?');
    if (operandSource(operand) === 'alias-property' && operand.property) {
      return `${propertyWords(operand.alias)} ${propertyWords(operand.property)}`;
    }
    return fallback;
  };
  const left = words(said.leftHandSide, p.left);
  const right = p.right === null ? null
    : Array.isArray(said.rightHandSide) ? p.right : words(said.rightHandSide, p.right);
  const text = [left, requirementVerb(p.verb), right].filter(Boolean).join(' ');
  const message = text[0].toUpperCase() + text.slice(1);
  return message.length > REJECTION_MAX_LENGTH ? message.slice(0, REJECTION_MAX_LENGTH - 1) + '…' : message;
}

// A rule's verb, as a requirement: "is at least" -> "must be at least",
// "does not contain" -> "must not contain", "has fewer than" -> "must
// have fewer than", "exists" -> "must exist".
function requirementVerb(verb) {
  if (/^is not\b/.test(verb)) return verb.replace(/^is not\b/, 'must not be');
  if (/^is\b/.test(verb)) return verb.replace(/^is\b/, 'must be');
  if (/^does not\b/.test(verb)) return verb.replace(/^does not\b/, 'must not');
  if (/^not\b/.test(verb)) return verb.replace(/^not\b/, 'must not');
  if (/^has\b/.test(verb)) return verb.replace(/^has\b/, 'must have');
  const [first, ...rest] = verb.split(' ');
  const base = /(ss|sh|ch|x)es$/.test(first) ? first.slice(0, -2) : first.replace(/s$/, '');
  return ['must', base, ...rest].join(' ');
}

// A condition as one plain sentence – the same words `conditionParts`
// hands the slice page's rule editor, joined into a string for a
// read-only overview that has nowhere to hang per-operand styling.
function ruleSentence(model, body, condition) {
  const p = conditionParts(condition, model, body);
  const quantifier = quantifierWords(model, body, condition);
  return (quantifier ? quantifier + ', ' : '') + p.left + ' ' + p.verb + (p.right ? ' ' + p.right : '');
}

function effectParts(effect) {
  // A standalone projection (`projectionsHandling`) is its own subject;
  // an entity property is named through its entity.
  const subject = effect.entity
    ? memberWords(readable(effect.entity), effect.property.name)
    : readable(effect.projection);
  // A scripted handler has no operation and no operand to name – the
  // code is both, and nothing here reads it.
  if (effect.handler.code !== undefined) {
    return { subject, verb: 'scripted', object: null };
  }
  return {
    subject,
    // The operation's own token, as the Code view spells it – see
    // _The interface register_ in docs/design-notes.md.
    verb: effect.handler.operation,
    object: operandWords(effect.handler.value),
  };
}

// A binding, in words: what it is and how the command found it.
function readParts(model, body, binding) {
  if (binding.projection) {
    const projection = model['projection-definitions'][binding.projection] || {};
    return {
      alias: binding.alias,
      projection: binding.projection,
      plural: false,
      // What it is read by – a value for each tag it declares, in the
      // command's scope or a literal with its type – and the values a
      // script's code reads besides.
      tags: readTagEntries(binding).map(([name, operand]) => ({
        name,
        operand,
        words: operandSource(operand) === 'tag-literal' ? operandText(operand) : operandWords(operand),
      })),
      arguments: projectionSlots(projection).map((p) => ({
        name: p.name,
        words: operandWords((binding.arguments || {})[p.name]),
      })),
    };
  }
  return {
    alias: binding.alias,
    entity: binding.entity,
    plural: isFannedOut(model, body, binding),
    from: operandWords(binding.id),
    excluding: binding.excluding !== undefined ? operandWords(binding.excluding) : null,
    // What the command hands a scripted property it reads.
    arguments: Object.entries(binding.arguments || {})
      .map(([name, operand]) => ({ name, words: operandWords(operand) })),
  };
}

// The type a member or projection holds, written the way a reader
// reads it. `propertyType` on anything that declares one (an event
// field, a command input, a composite's field); `valueType` on a
// projection – the two never both appear on one object.
function typeLabel(member) {
  const type = member.propertyType !== undefined ? member.propertyType : member.valueType;
  return `${type}${member.isList ? '[]' : ''}${member.isOptional ? '?' : ''}`;
}

// ---------- what a thing looks like ----------
//
// An entity is named in a dozen places – the rail, a read, a change, a
// loose end – and a page with five kinds of thing on it is scanned by
// shape long before it is read by name. So every entity carries one
// mark, and the mark goes wherever the entity does.
//
// An entity's mark is authored and only authored. An unmarked entity
// carries no glyph: a hashed stand-in was tried and did not earn its
// place – a shape nobody chose says nothing about the thing, so every
// page paid a column of noise for a legibility that never arrived. What
// the picker offers is `ICON_CHOICES` (index.html).
//
// Commands and events are the exception: an unmarked one shows its
// kind's mark (`COMMAND_FALLBACK_ICON`, `EVENT_FALLBACK_ICON`) – one
// mark per kind, not per name, so it says only what the thing is. The
// glyph carries the meaning (an intent pushed in, something that
// happened) and the stylesheet the colour: a plain text glyph takes
// the colour of what it sits in, and `fallbackIconClass` lets a slot
// that is not already kind-coloured paint it. It is a rendering, never
// stored: the code view and the wire format see only an authored icon.

// The icon a body actually carries, or '' when it carries none worth
// showing – the one place the trim-or-fall-back rule lives.
function chosenIcon(model, collection, name) {
  const body = model && model[collection] ? model[collection][name] : null;
  return body && typeof body.icon === 'string' ? body.icon.trim() : '';
}

// A mark in front of a label, for the places that build one string
// rather than two elements. Unmarked things are the common case now, so
// the separator belongs to the mark and not to the label – otherwise
// every unmarked name renders behind a space nobody can see but every
// alignment can.
function iconPrefix(icon, separator) {
  return icon ? icon + (separator === undefined ? ' ' : separator) : '';
}

function entityIcon(model, name) {
  return chosenIcon(model, 'entity-definitions', name);
}

const COMMAND_FALLBACK_ICON = '➜';
const EVENT_FALLBACK_ICON = '↯';

// The class a mark's element takes when the mark is a kind's fallback.
// An authored icon that happens to be the same glyph reads the same,
// which is what it looks like anyway.
function fallbackIconClass(icon) {
  if (icon === COMMAND_FALLBACK_ICON) return ' fallback-command';
  if (icon === EVENT_FALLBACK_ICON) return ' fallback-event';
  return '';
}

function commandIcon(model, name) {
  return chosenIcon(model, 'command-definitions', name) || COMMAND_FALLBACK_ICON;
}

// Every command that publishes this event – usually none or one, since
// every shipped example records one event per command, but nothing
// stops two commands recording the same fact.
function commandsPublishing(model, eventName) {
  return Object.entries(model['command-definitions'] || {})
    .filter(([, body]) => (body.publishes || []).some((emission) => emission.name === eventName))
    .map(([name]) => name);
}

function eventIcon(model, name) {
  const chosen = chosenIcon(model, 'event-definitions', name);
  if (chosen) return chosen;
  // Unmarked, and the outcome of exactly one command: read as that
  // command's doing, the same mark and all – a modeler who wants this
  // event to look like its own thing gives it its own icon, same as
  // always. Only an *authored* command mark is borrowed – the command's
  // fallback would make the event read as a command. Two commands
  // recording the same event agree on nothing, so that case falls back.
  const commands = commandsPublishing(model, name);
  const borrowed = commands.length === 1 ? chosenIcon(model, 'command-definitions', commands[0]) : '';
  return borrowed || EVENT_FALLBACK_ICON;
}

// Shown beside the type, never behind a gate: a value
// arrived at by code, or worked out from other projections, is a
// different kind of claim from one arrived at by a declaration, and a
// rule reading it should say so on the page.
function scriptLabel(property) {
  if (property && property.script) return 'scripted';
  if (property && property.derived) return 'derived';
  return null;
}

// The payload as operand choices, expanded one level into composite
// fields. A composite is offered whole *and* field by field: the whole
// value is what an emission wants, a field is what a boundary binding
// or a rule wants.
function payloadChoices(model, payload) {
  const out = [];
  for (const p of payload || []) {
    const label = 'given · ' + propertyWords(p.name);
    const fields = compositeFieldsOf(model, p.propertyType);
    if (!fields) {
      out.push([JSON.stringify({ parameterName: p.name }), label]);
      continue;
    }
    out.push([JSON.stringify({ parameterName: p.name }), label + ' (all of it)']);
    for (const f of fields) {
      out.push([
        JSON.stringify({ parameterName: p.name, property: f.name }),
        `${label} · ${propertyWords(f.name)}`,
      ]);
    }
  }
  return out;
}

// The quantifier a condition carries but never states. A fanned-out
// alias makes it universal; an operand rooted at the same list makes
// the pairing by index. Both follow from the operands' types, so the
// reader is told rather than left to work it out.
function quantifierWords(model, body, condition) {
  const roots = conditionFanRoots(model, body, condition);
  if (roots.length !== 1) return '';
  const operands = conditionOperands(condition);
  if (operands.some((o) => isZipped(model, body, condition, o))) {
    return `for each entry of ${roots[0].replace(/^parameter:/, '')}`;
  }
  const alias = operands.find((o) =>
    operandSource(o) === 'alias-property' && fanRootOf(model, body, o) === roots[0]);
  return `for every ${alias ? alias.alias : roots[0].replace(/^binding:|^parameter:/, '')}`;
}
