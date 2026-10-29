// ============================================================
// DCB Playground – the code view's language.
//
// The same definitions the pages edit, as text a developer can read top
// to bottom, grep, diff and paste: `modelToSource` prints a model,
// `parseModelSource` reads one back, `applyModelSource` writes the
// difference through `replaceDefinitions`. No DOM – the editor around
// it lives in index.html; the grammar Monaco highlights with is here,
// as data, so it cannot drift from the parser it describes.
//
//   model "Course Example (simple)"
//
//   tag type CourseId = string
//   enum CourseStatus { NonExistent, Existent, Archived }
//
//   event CourseDefined { tag courseId: CourseId, capacity: integer }
//
//   projection CourseStatus (tag courseId: CourseId): CourseStatus = NonExistent {
//     on CourseDefined => set Existent
//   }
//
//   projection CourseCapacity (tag courseId: CourseId): integer = 0 {
//     on CourseDefined => set event.data.capacity
//   }
//
//   untagged projection CourseNumbering: CourseId = "c1" {
//     on CourseDefined => set successor(event.data.courseId)
//   }
//
//   command ChangeCourseCapacity(courseId: CourseId, newCapacity: integer) {
//     alias capacity = CourseCapacity(courseId)
//     require CourseStatus(courseId) == Existent
//       else reject "Course does not exist"
//     require capacity != newCapacity
//       else reject "Capacity is unchanged"
//     emit CourseCapacityChanged { courseId, newCapacity }
//   }
//
// **Tags are explicit on both sides (8.0), and a projection owns its
// own.** An event marks the values it is tagged by where it declares
// them – `tag courseId: CourseId`, and `items: Item[] tag each
// productId` for a field of the records a list holds. A projection
// names the tags it is read by in its header, `(tag courseId:
// CourseId)` – several are ANDed – or says it has none: `untagged
// projection`, which folds the whole log. Saying neither is an error
// with both fixes; the partition is too easy to forget for the text to
// assume one. What a projection is kept per is its own to say, so a
// count per course and a count per student are two projections, and no
// reader can disagree with another about it.
//
// **A read gives its values in parentheses**, in the order the
// projection declares them: `CourseStatus(courseId)`, `Transfers(fromId,
// toId)`, `CourseNumbering()` for an untagged one – the parentheses are
// never left off, which is what keeps a read apart from an enum member
// by sight. A value has to be of the tag's declared type; a literal
// says its type anyway, `CourseStatus(CourseId("c1"))`, so the text
// shows which tag it fills. A scripted projection declares what it
// takes besides after its tags, `scripted projection X (tag courseId:
// CourseId, days: integer)`, and a read gives those after the tags
// too. `each` before a value reads once per element of a list. A read may sit anywhere an
// operand does – `require CourseStatus(courseId) == Existent`, an
// emission's `courseId: CourseNumbering()`, another read's value
// `OwnedCourses(CourseOwner(courseId))` – and an `alias` only names
// one; written twice, it is one query. A call is a read when a
// projection is declared by its name and a tag literal otherwise,
// settled once every declaration is known. An entity (experimental) is
// declared the same way, `entity Course (tag courseId: CourseId)`, and
// read `Course(courseId)` – `Course(each …)` for many, its scripted
// properties' arguments given by name after the identifier.
//
// The read is a function application, and spelled as one on purpose: a
// projection is a pure function of the log, its tags and its arguments.
// What a call does not say – that the read becomes part of the
// consistency boundary – no read spelling could, and the editor says
// it beside each command instead. Brackets were rejected: `X[c1]` reads
// as a lookup into a stored table, the read model DCB moves away from.
// The 8.0 draft's `X tagged courseId` and `with (…)` are errors that
// say the spelling that replaced them.
//
// **It is a spelling of the wire format, not a second model.** Every
// construct maps to exactly one schema shape, which is what lets the
// two directions be each other's inverse; nothing is inferred that the
// JSON does not store. Where a convenience would have needed inference
// it was left out: an alias is always written, since the schema stores
// it. A fan-out is marked where the schema marks it, `{each: …}`, on a
// projection read's tag and an entity read's identifier alike. A read's
// values are positional in the text and named in the stored shape –
// which is why the printer and the parser take what each projection
// declares (`sourceNamesOf`), and why a read of a projection the text
// does not declare is printed as JSON.
//
// **`alias`, not `read`.** The statement names an instance for the
// rules below it; it reads nothing at that line – the query is derived
// from what the rules use (`deriveDcb`). `read` suggested the opposite,
// and `alias` is the wire format's own word for the name.
//
// One spelling is read but never printed: `x in xs`, where `xs` is a
// list held in data rather than a literal `[..]`, is `xs contains x`
// with its sides swapped. Membership is said both ways round, and a
// rule about one value reads with that value first – but the schema
// has one shape for it, so the text comes back as `contains`. Nothing
// is inferred: which predicate it is follows from the token after
// `in`, never from a type.
//
// **Borrowed, deliberately.** heklang (git.tqwewe.com/tephra/heklang)
// is DCB-native, and its `emit Event { field }` shorthand and `on
// Event => …` fold arms are taken as they are. Weltenwanderer
// (weltenwanderer.dev) contributes `require … else reject "…"` and
// `type X = string` – and with the first, that every rule says what it
// is refused with: the message is required, as it is there.
// Where both disagree with the wire format, the wire format wins:
// heklang's `fold` is a read *and* its accumulator in one place, here
// the accumulator is a named projection the read points at, because
// that is how the model stores it and how the pages show it. The
// research note is docs/research/2026-10-03-code-view-language.md.
//
// **A few spellings are the schema's own tokens**, matching the
// interface's technical register: `currentValue`, `successor(x)`,
// `event.data.x` (the path a scripted handler writes), the predicate
// words `contains` / `containsAny` / `startsWith` / `endsWith`, and the
// script fields `initialState` / `exposes`. The rest are what a
// developer would type: `==`, `<`, `in [..]` / `in xs`, `count(x)`,
// `is empty`, `X[]` for a list, `name?:` for an optional property, and
// `X(…)` for a read.
//
// **A fold arm is a keyword, not an expression.** `on E => set x`,
// `increment` / `decrement` (integers), `append` / `remove` (lists):
// the wire format's closed operation vocabulary, spelled as itself.
// heklang writes `=> expr`, and `=> state + 1` could be parsed into
// `increment 1` without loss; it is not, because an arm that looks
// like an expression invites `state + 2 * event.data.n`, which no
// operation stores. The vocabulary is closed because it is analysed,
// not only run – what an editor offers per type (`operationsFor`),
// whether a boolean only ever moves one way (`isMonotoneBoolean`),
// which event moves a lifecycle – and a keyword shows that edge where
// an expression would hide it. Arithmetic *between* values is a derived
// projection's (9.0): `derived projection Left (…): integer { Cap(x) -
// Taken(x) }`, one operator – `+`, `-`, `*`, `min(a, b)`, `max(a, b)` –
// over two projections or literals, outside any fold, so the fold arms
// stay keywords. What neither says is what a script is for (experimental):
// its arms are expressions over `state`, `event` and `args`, behind a
// door that says analysis stops there. Expect the list to stay short:
// each new operation is a major (a reader fails on one it does not
// know) and has to earn its place by being analysable – a
// duplicate-free append is the candidate in sight.
//
// **What kind a projection is, it says in front**: `derived projection`
// holds one expression in its block, a comparison or a computation, and
// no initial value; `scripted projection` takes arguments after its
// tags and holds `initialState`, `exposes` and code arms. The header
// already knows what the block may hold, so an argument on anything but
// a script is an error at the header, not after the block.
//
// **Operand names resolve per command.** A bare or dotted lowercase
// name is an alias when some `alias` in the same command declares it
// and a payload property otherwise – the schema keeps the two apart, a
// text can only do so by scope. A name that is neither (a dangling
// reference, which the model allows and advises about) reads as a
// property when bare and as an alias when dotted, the common case of
// each.
//
// **Nothing is ever lost by printing.** Each definition is printed and
// then parsed back on the spot, and one that does not come back equal
// (`sameDefinition`) – a defective body, a name the grammar cannot
// write, a parameter and a read sharing a name – is printed as its
// stored JSON instead (`command Foo json { … }`), under a comment
// saying why. So the text always says everything the model does, and
// an untouched text applies as no change at all.
//
// **Scenarios sit in the block of what they exercise**, in one
// `scenarios` group that ends it – a command's run it, a projection's
// assert its value:
//
//   scenarios {
//     scenario "a second definition is refused" {
//       given CourseDefined { courseId: "c1", capacity: 123 }
//       when DefineCourse { courseId: "c1", capacity: 123 }
//       then rejected "Course already exists"
//     }
//
//     scenario {
//       given CourseDefined { courseId: "c1", capacity: 2 }
//       and StudentSubscribed { courseId: "c1", studentId: "s1" }
//       when SubscribeStudent { courseId: "c1", studentId: "s2" }
//       then StudentSubscribed { courseId: "c1", studentId: "s2" }
//       and CourseFullyBooked { courseId: "c1" }
//     }
//   }
//
// Each of given, when and then is said once, and what follows it
// continues with `and`, so a scenario reads as the sentence it is. A
// keyword said again is an error whose fix is `and`. There is still one
// command per scenario – `and` after a when is the same error as a
// second when.
// The group is syntax only – the wire format has no such thing – and
// it is required, because it is what the editor folds: a model's
// examples can outweigh its definitions many times over, and one fold
// per block puts them away as one line. A scenario outside a group is
// an error whose fix wraps it (`ungrouped`), so a text from before
// groups is one click from reading.
//
// The subject is named (`when DefineCourse`, `then CourseStatus(…)`)
// and must be the block's – a scenario moved into the wrong block is an
// error, not a reassignment; one whose subject is gone sits in a group
// at the top level. A Then is the scenario's assertion and is stored as written.
// Left out, it is an error that says what the text's definitions make
// of the scenario, and whose fix writes that in – one scenario, or all
// of them at once: the text says everything the model stores, so an
// apply never records an outcome nobody saw. An agent is the exception
// (`recordOutcomes`): it is not asked to predict an outcome, so its
// apply records one and says which. A refusal is named by its
// rule's message and by nothing else – not the condition, not what it
// read: rules sharing a message are one outcome, and the message is
// what the command is refused with. A Then that disagrees with
// the text is drift: shown, with a fix that accepts it, and never
// accepted by applying. Payload values are JSON, an enum member bare.
// The id a scenario is keyed by is not in the text: an apply matches
// blocks to stored scenarios by content, then by place, so an edited or
// renamed-along scenario keeps its id (`sourceScenarioCollections`).
//
// Comments are not stored – the model has nowhere to keep them – so
// they survive as long as the text in the editor does and no longer.
//
// **The editor knows what each name is** (the language service, at the
// end). The parser marks which token every part of a body came from;
// `sourceSymbols` walks the bodies and resolves each marked name to the
// one thing it means – `member CourseStatus Existent`, never a word
// that happens to match – so a rename (`sourceRename`) touches exactly
// those tokens, and refuses rather than guess: over a script or json
// body the name may also hide in, a member whose enum the text cannot
// tell, or a result that would not read back the same. A read in place
// can be named by an alias (`sourceIntroduceAlias`), proved the same
// way: the command reads back as it was. Completion
// (`sourceCompletions`) reads the cursor's place off the tokens before
// it, since a text being typed rarely parses there. And beside every
// `alias` it says how many event types that alias adds to the append
// condition, and names them on hover (`sourceReadQueries`) – only the
// used properties' – since `alias course = Course(courseId)` otherwise
// reads as the whole entity; and beside each command, what it reads in
// all (`sourceCommandQueries`), in the same words.
// ============================================================

const SOURCE_EXTENSION = '.dcb';

const SOURCE_KINDS = [
  'custom-type-definition',
  'event-definition',
  'entity-definition',
  'projection-definition',
  'command-definition',
];

const SOURCE_KEYWORD = {
  'custom-type-definition': 'type',
  'event-definition': 'event',
  'entity-definition': 'entity',
  'projection-definition': 'projection',
  'command-definition': 'command',
};

const SOURCE_SECTION = {
  'custom-type-definition': 'Types',
  'event-definition': 'Events',
  'entity-definition': 'Entities',
  'projection-definition': 'Projections',
  'command-definition': 'Commands',
};

// What the `= …` of `type X = …` may name without spelling a schema
// object out: JSON Schema's own `type` keywords.
const SOURCE_BASE_TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];

// Which annotation goes on which kind, and the body field it fills.
const SOURCE_ANNOTATIONS = {
  icon: ['entity-definition', 'event-definition', 'command-definition'],
  feature: ['command-definition'],
  tagSchema: ['custom-type-definition'],
};

const SOURCE_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SOURCE_MEMBER_RE = /^[A-Z][A-Za-z0-9_]*$/;
const SOURCE_DECL_STARTS = ['@', 'model', 'type', 'tag', 'enum', 'record', 'event', 'entity', 'untagged', 'derived', 'scripted', 'projection', 'command'];
// What a derived projection computes with, spelled as the symbols a
// developer would type; `min` and `max` are calls, `min(a, b)`.
const SOURCE_OPERATORS = { '+': 'add', '-': 'subtract', '*': 'multiply' };
const SOURCE_OPERATOR_CALLS = ['min', 'max'];
const SOURCE_WORD_PREDICATES = ['contains', 'containsAny', 'startsWith', 'endsWith'];
const SOURCE_SYMBOL_PREDICATES = { '==': 'equals', '<': 'lessThan', '<=': 'lessThanOrEquals', '>': 'greaterThan', '>=': 'greaterThanOrEquals' };
const SOURCE_COUNT_PREDICATES = { '==': 'countEquals', '<': 'countLessThan', '>': 'countGreaterThan' };
const SOURCE_UNARY_WORDS = { isEmpty: 'is empty', isNotEmpty: 'is not empty', isTrue: 'is true', isFalse: 'is false' };

// A definition with no IDENT-safe name, or an object key that is not
// one, can still be put – `__proto__` is a legal identifier, and an
// assignment would set a prototype instead of a key.
function sourcePut(target, key, value) {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

// ============================================================
// Lexing.
// ============================================================

const SOURCE_PUNCT = ['=>', '==', '!=', '<=', '>=', '<', '>', '=', '{', '}', '(', ')', '[', ']', ',', ':', '.', '?', '@', '+', '-', '*'];
const SOURCE_NUMBER_RE = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const SOURCE_WORD_RE = /[A-Za-z_][A-Za-z0-9_]*/y;

// Whether a token closes a value, so a `-` straight after it subtracts
// rather than starting a negative number: `A(x) -1`, `3 -1`.
function endsValue(token) {
  return !!token && ((token.t === 'punct' && (token.v === ')' || token.v === ']')) || token.t === 'number');
}

function lexSource(text) {
  const tokens = [];
  const diagnostics = [];
  let i = 0;
  let line = 1;
  let col = 1;
  let lastLine = 0;
  const advanceTo = (stop) => {
    while (i < stop) {
      if (text[i] === '\n') { line += 1; col = 1; } else col += 1;
      i += 1;
    }
  };
  const report = (message, at) => diagnostics.push({
    severity: 'error', message, line: at.line, col: at.col, endLine: line, endCol: Math.max(col, at.col + 1),
  });
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { advanceTo(i + 1); continue; }
    const start = { line, col };
    if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i);
      advanceTo(end < 0 ? text.length : end);
      continue;
    }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      advanceTo(end < 0 ? text.length : end + 2);
      if (end < 0) report('This comment is never closed with */.', start);
      continue;
    }
    let token;
    if (text.startsWith('```', i)) {
      const end = text.indexOf('```', i + 3);
      const value = text.slice(i + 3, end < 0 ? text.length : end);
      advanceTo(end < 0 ? text.length : end + 3);
      if (end < 0) report('This code block is never closed with ```.', start);
      token = { t: 'code', v: value };
    } else if (c === '"') {
      let j = i + 1;
      // A backslash escapes the next character – but never a line break:
      // a string does not run on past the end of its line, or one stray
      // backslash swallows the declaration below it.
      while (j < text.length && text[j] !== '"' && text[j] !== '\n') {
        j += text[j] === '\\' && text[j + 1] !== '\n' ? 2 : 1;
      }
      if (text[j] !== '"') {
        const value = text.slice(i + 1, j);
        advanceTo(j);
        report('This string is never closed with ".', start);
        token = { t: 'string', v: value };
      } else {
        const raw = text.slice(i, j + 1);
        advanceTo(j + 1);
        let value = raw.slice(1, -1);
        try { value = JSON.parse(raw); } catch { report('This string has an escape JSON does not know.', start); }
        token = { t: 'string', v: value };
      }
    } else if ((c >= '0' && c <= '9') || (c === '-' && text[i + 1] >= '0' && text[i + 1] <= '9' && !endsValue(tokens[tokens.length - 1]))) {
      SOURCE_NUMBER_RE.lastIndex = i;
      const match = SOURCE_NUMBER_RE.exec(text);
      advanceTo(i + match[0].length);
      token = { t: 'number', v: Number(match[0]) };
      // Past what a double holds, a number reads as Infinity – and is
      // stored as null, JSON having no Infinity.
      if (!Number.isFinite(token.v)) report('This number is too large to store.', start);
    } else if (/[A-Za-z_]/.test(c)) {
      SOURCE_WORD_RE.lastIndex = i;
      const match = SOURCE_WORD_RE.exec(text);
      advanceTo(i + match[0].length);
      token = { t: 'ident', v: match[0] };
    } else {
      const punct = SOURCE_PUNCT.find((p) => text.startsWith(p, i));
      advanceTo(i + (punct ? punct.length : 1));
      if (!punct) { report(`"${c}" means nothing here.`, start); continue; }
      token = { t: 'punct', v: punct };
    }
    token.line = start.line;
    token.col = start.col;
    token.endLine = line;
    token.endCol = col;
    token.first = start.line !== lastLine;
    lastLine = line;
    tokens.push(token);
  }
  tokens.push({ t: 'eof', v: '', line, col, endLine: line, endCol: col, first: true });
  return { tokens, diagnostics };
}

// ============================================================
// Parsing.
// ============================================================

// Deeper than any model is written, and far short of the stack.
const SOURCE_MAX_DEPTH = 200;

class SourceError extends Error {
  constructor(message, token) {
    super(message);
    this.token = token;
  }
}

function describeToken(token) {
  if (token.t === 'eof') return 'the end of the text';
  if (token.t === 'string') return 'a string';
  if (token.t === 'code') return 'a code block';
  return `"${token.v}"`;
}

// The text, read back: `{ name, collections, spans, diagnostics,
// implicit }`. `collections` holds one ordered `{ name: body }` map per
// source kind – the shape `replaceDefinitions` takes. `spans` says
// where each definition sits (1-based, Monaco's convention), for
// markers, navigation and the outline. `implicit` names the identifier
// types synthesized for entities whose type the text never declared:
// writing `entity Tenant {}` should not also require `tag type TenantId
// = string`, any more than creating one on its page does.
//
// Errors never stop the read: a declaration that fails is reported
// and skipped to the next line that starts one, so a typo in one
// command does not hide every other problem below it.
function parseModelSource(text, options = {}) {
  // The per-declaration net (see the read loop) covers the parse; this
  // one covers the passes after it, so no text makes the read throw.
  try {
    return parseModelSourceText(text, options);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    const collections = {};
    for (const kind of SOURCE_KINDS) collections[kind] = {};
    return {
      name: null, collections, spans: [], implicit: [], scenarios: [], groups: [], marks: new WeakMap(),
      diagnostics: [{
        severity: 'error', message: 'This text could not be read: it is nested too deeply.',
        line: 1, col: 1, endLine: 1, endCol: 2,
      }],
    };
  }
}

function parseModelSourceText(text, options) {
  const { tokens, diagnostics } = lexSource(String(text));
  const collections = {};
  for (const kind of SOURCE_KINDS) collections[kind] = {};
  const result = {
    name: null, collections, spans: [], diagnostics, implicit: [], scenarios: [], groups: [], marks: new WeakMap(),
  };
  let at = 0;

  // Which token each part of a body was read from, keyed by the object
  // that holds it: `mark(binding, 'alias', token)`. Kept beside the
  // bodies rather than in them, so what is parsed is still exactly the
  // stored shape – the language service (references, rename) is the
  // only reader.
  const mark = (object, slot, token) => {
    if (!object || typeof object !== 'object' || !token) return;
    let slots = result.marks.get(object);
    if (!slots) result.marks.set(object, slots = Object.create(null));
    slots[slot] = token;
  };
  const marksOf = (object) => (object && typeof object === 'object' && result.marks.get(object)) || null;
  const copyMarks = (from, to) => {
    const slots = marksOf(from);
    if (slots) for (const slot of Object.keys(slots)) mark(to, slot, slots[slot]);
    return to;
  };

  const peek = (k = 0) => tokens[Math.min(at + k, tokens.length - 1)];
  const next = () => {
    const token = tokens[at];
    if (at < tokens.length - 1) at += 1;
    return token;
  };
  const last = () => tokens[Math.max(0, at - 1)];
  const is = (v, k = 0) => {
    const token = peek(k);
    return (token.t === 'punct' || token.t === 'ident') && token.v === v;
  };
  const accept = (v) => (is(v) ? next() : null);
  const fail = (message, token = peek()) => { throw new SourceError(message, token); };
  const expect = (v, what) => accept(v) || fail(`Expected ${what || `"${v}"`}, found ${describeToken(peek())}.`);
  // How deep the value being read is nested – a list in a list, a read
  // in a read. Every recursive reader steps in and out through these,
  // and past SOURCE_MAX_DEPTH the read fails where it happens, as a
  // diagnostic, long before the stack would. Reset per declaration, so
  // a failure that skipped its way out leaves no count behind.
  let depth = 0;
  const enter = () => {
    if (++depth > SOURCE_MAX_DEPTH) fail(`This is nested more than ${SOURCE_MAX_DEPTH} levels deep.`);
  };
  const leave = (value) => { depth -= 1; return value; };
  const ident = (what) => (peek().t === 'ident' ? next() : fail(`Expected ${what}, found ${describeToken(peek())}.`));
  const declName = (what) => (peek().t === 'ident' || peek().t === 'string'
    ? next() : fail(`Expected ${what}, found ${describeToken(peek())}.`));
  // A line that plainly opens the next declaration – a declaration
  // word followed by a name, or an annotation – ends whatever block is
  // still open, so a missing "}" is reported where it is missing
  // rather than as nonsense about the declaration below it. "Plainly",
  // because `type: string` is a property called type.
  const startsDeclaration = () => {
    const token = peek();
    if (!token.first) return false;
    if (token.t === 'punct') return token.v === '@' && peek(1).t === 'ident';
    // `tag courseId: CourseId` is an event's property, marked.
    if (token.v === 'tag') return ['type', 'enum', 'record'].includes(peek(1).v);
    if (token.v === 'untagged') return ['projection', 'derived', 'scripted'].includes(peek(1).v);
    if (token.v === 'derived' || token.v === 'scripted') return peek(1).v === 'projection' || peek(1).v === 'untagged';
    return token.t === 'ident' && SOURCE_DECL_STARTS.includes(token.v)
      && (peek(1).t === 'ident' || peek(1).t === 'string');
  };
  const guardBlock = (close) => {
    if (!startsDeclaration()) return;
    const end = last();
    fail(`Expected "${close}" before the next declaration.`,
      { line: end.endLine, col: end.endCol, endLine: end.endLine, endCol: end.endCol + 1 });
  };
  const string = (what) => (peek().t === 'string' ? next().v : fail(`Expected ${what}, found ${describeToken(peek())}.`));

  // ---------- values ----------

  // JSON, read off the token stream – the schema object of a `type`,
  // a script's `initialState`, a definition's fallback body. Keys may
  // be bare words as well as strings; the printer writes them bare.
  const jsonValue = () => {
    const token = peek();
    if (token.t === 'string' || token.t === 'number') return next().v;
    if (accept('true')) return true;
    if (accept('false')) return false;
    if (accept('null')) return null;
    if (accept('{')) {
      enter();
      const out = {};
      while (!is('}')) {
        const key = peek().t === 'string' || peek().t === 'ident'
          ? next().v : fail(`Expected a key, found ${describeToken(peek())}.`);
        expect(':');
        sourcePut(out, key, jsonValue());
        if (!accept(',')) break;
      }
      expect('}', '"}" or ","');
      return leave(out);
    }
    if (accept('[')) {
      enter();
      const out = [];
      while (!is(']')) {
        out.push(jsonValue());
        if (!accept(',')) break;
      }
      expect(']', '"]" or ","');
      return leave(out);
    }
    return fail(`Expected a JSON value, found ${describeToken(token)}.`);
  };

  // A literal, an enum member, or a list of those – what an initial
  // value, an `in [..]` list and the literal side of any rule hold.
  const literalValue = () => {
    const token = peek();
    if (token.t === 'string' || token.t === 'number') return next().v;
    if (token.t === 'ident') {
      if (accept('true')) return true;
      if (accept('false')) return false;
      if (accept('null')) return null;
      if (token.v === 'enum' && is('(', 1)) {
        next(); next();
        enter();
        const member = literalValue();
        expect(')');
        return leave({ enumMember: member });
      }
      if (SOURCE_MEMBER_RE.test(token.v)) {
        const member = { enumMember: next().v };
        mark(member, 'enumMember', token);
        return member;
      }
    }
    if (accept('[')) {
      enter();
      const out = [];
      while (!is(']')) {
        out.push(literalValue());
        if (!accept(',')) break;
      }
      expect(']', '"]" or ","');
      return leave(out);
    }
    return fail(`Expected a value, found ${describeToken(token)}.`);
  };
  const startsLiteral = () => {
    const token = peek();
    if (token.t === 'string' || token.t === 'number' || is('[')) return true;
    return token.t === 'ident'
      && (['true', 'false', 'null', 'enum'].includes(token.v) || SOURCE_MEMBER_RE.test(token.v));
  };

  // A name in a command, resolved once the whole command is read –
  // which `alias` declares it is not known until then.
  const nameRef = () => {
    const headToken = next();
    const ref = { '%ref': [headToken.v] };
    mark(ref, 'head', headToken);
    if (accept('.')) {
      const property = ident('a property name');
      ref['%ref'].push(property.v);
      mark(ref, 'property', property);
    }
    return ref;
  };

  // An operand in a command. A capitalised name followed by `(` is a
  // call – a projection read, `CourseStatus(courseId)`, or a typed tag
  // literal, `CourseId("c1")` – and bare, an enum member. Which a call is
  // is settled once every declaration is known (`settle`, after the
  // parse), by name, the way an operand resolves to an alias or a
  // payload property.
  const commandOperand = () => {
    const token = peek();
    if (token.t === 'ident' && SOURCE_MEMBER_RE.test(token.v)
        && !['true', 'false', 'null', 'enum'].includes(token.v)) {
      if (is('(', 1)) return call(commandOperand);
      if (is('tagged', 1) || is('with', 1)) oldReadSpelling(token);
      next();
      const ref = { '%pascal': token.v };
      mark(ref, 'pascal', token);
      return ref;
    }
    if (token.t === 'ident' && !startsLiteral()) return nameRef();
    return literalValue();
  };

  // `Name(a, each b, key: c)`: the values in order – `each` marking the
  // one a read fans out over – and `key: value` pairs, which only an
  // entity read takes (its scripted properties' arguments).
  const call = (valueOf) => {
    const callee = next();
    const out = { '%call': callee.v, ...callArguments(valueOf) };
    mark(out, 'callee', callee);
    // Its closing parenthesis: a read's extent, for introducing an
    // alias for it (`sourceIntroduceAlias`).
    mark(out, 'close', last());
    return out;
  };
  const callArguments = (valueOf) => {
    expect('(');
    enter();
    const out = { values: [] };
    while (!is(')')) {
      guardBlock(')');
      if (peek().t === 'ident' && is(':', 1)) {
        const key = next();
        next();
        out.named = out.named || {};
        mark(out.named, 'key:' + key.v, key);
        sourcePut(out.named, key.v, valueOf());
      } else {
        // `each` is a word only before the value it fans out over: a
        // property called each is still a name.
        const fan = is('each') && !is(')', 1) && !is(',', 1) ? next() : null;
        const value = valueOf();
        if (fan) {
          const each = { each: value };
          mark(each, 'each', fan);
          out.values.push(each);
        } else out.values.push(value);
      }
      if (!accept(',')) break;
    }
    expect(')', '")" or ","');
    return leave(out);
  };

  // `X tagged …` and `X with (…)` were the draft of 8.0; a read gives
  // its values in parentheses now, in the order the projection declares.
  const oldReadSpelling = (target) => fail(
    `A read gives its values in parentheses, in the order ${target.v} declares them: ${target.v}(…).`, peek(1));

  // A derived projection's operand: another projection's value – read
  // with the values it declares, each one of this projection's own
  // parameters by name or a literal – one of its own parameters by name
  // (10.0), or an enum member or a literal. Settled like a command's
  // (`settle`).
  const derivedOperand = () => {
    const token = peek();
    if (token.t === 'ident' && SOURCE_MEMBER_RE.test(token.v) && is('(', 1)) return call(derivedValue);
    if (token.t === 'ident' && SOURCE_MEMBER_RE.test(token.v)) {
      next();
      const ref = { '%pascal': token.v };
      mark(ref, 'pascal', token);
      return ref;
    }
    return derivedValue();
  };
  const derivedValue = () => {
    const token = peek();
    if (token.t === 'ident' && SOURCE_MEMBER_RE.test(token.v) && is('(', 1)) return call(literalValue);
    if (token.t === 'ident' && !startsLiteral()) {
      next();
      const own = { parameterName: token.v };
      mark(own, 'parameter', token);
      return own;
    }
    return literalValue();
  };

  // What a derived projection derives: `min(a, b)` / `max(a, b)`, an
  // operand, one of + - *, and another – or else a comparison, read the
  // way a rule is.
  const derivedExpression = () => {
    for (const word of SOURCE_OPERATOR_CALLS) {
      if (!is(word) || !is('(', 1)) continue;
      next(); next();
      const leftHandSide = derivedOperand();
      expect(',', `"," and the other side of ${word}(…)`);
      const rightHandSide = derivedOperand();
      expect(')');
      return { leftHandSide, operator: word, rightHandSide };
    }
    if (!is('not') && !(is('count') && is('(', 1))) {
      const from = at;
      const leftHandSide = derivedOperand();
      const op = peek();
      if (op.t === 'punct' && SOURCE_OPERATORS[op.v]) {
        next();
        return { leftHandSide, operator: SOURCE_OPERATORS[op.v], rightHandSide: derivedOperand() };
      }
      at = from;
    }
    return condition(derivedOperand);
  };

  const handlerOperand = () => {
    if (is('event')) {
      next(); expect('.'); expect('data', '"data" – an event value is read as event.data.<property>'); expect('.');
      const property = ident('an event property');
      const operand = { eventProperty: property.v };
      mark(operand, 'eventProperty', property);
      return operand;
    }
    if (accept('currentValue')) return { currentValue: true };
    if (is('successor') && is('(', 1)) {
      next(); next();
      enter();
      const inner = handlerOperand();
      expect(')');
      return leave({ successor: inner });
    }
    return literalValue();
  };
  const startsHandlerOperand = () => startsLiteral() || is('event') || is('currentValue') || is('successor');

  // `name: operand` pairs – or a bare `name`, short for `name: name`.
  const argumentList = (close, operand) => {
    const out = {};
    while (!is(close)) {
      guardBlock(close);
      const key = ident('an argument name');
      mark(out, 'key:' + key.v, key);
      if (accept(':')) sourcePut(out, key.v, operand());
      else {
        // The shorthand is the operand the bare name would have been.
        at -= 1;
        mark(out, 'short:' + key.v, key);
        sourcePut(out, key.v, operand());
      }
      if (!accept(',')) break;
    }
    expect(close, `"${close}" or ","`);
    return out;
  };

  // ---------- rules ----------

  const condition = (operand) => {
    let negate = false;
    while (accept('not')) negate = !negate;
    if (is('count') && is('(', 1)) {
      next(); next();
      const leftHandSide = operand();
      expect(')');
      const op = peek();
      let predicate = SOURCE_COUNT_PREDICATES[op.v];
      if (op.t === 'punct' && op.v === '!=') { predicate = 'countEquals'; negate = !negate; }
      if (op.t !== 'punct' || !predicate) fail(`Expected ==, !=, < or > after count(…), found ${describeToken(op)}.`);
      next();
      return finish({ leftHandSide, predicate, rightHandSide: operand() }, negate);
    }
    const leftHandSide = operand();
    if (accept('is')) {
      let predicate;
      if (accept('not')) { expect('empty', '"empty" – the one thing "is not" is followed by'); predicate = 'isNotEmpty'; }
      else if (accept('empty')) predicate = 'isEmpty';
      else if (accept('true')) predicate = 'isTrue';
      else if (accept('false')) predicate = 'isFalse';
      else fail(`Expected empty, not empty, true or false after "is", found ${describeToken(peek())}.`);
      return finish({ leftHandSide, predicate }, negate);
    }
    const op = peek();
    if (op.t === 'punct' && (SOURCE_SYMBOL_PREDICATES[op.v] || op.v === '!=')) {
      next();
      if (op.v === '!=') negate = !negate;
      return finish({ leftHandSide, predicate: SOURCE_SYMBOL_PREDICATES[op.v] || 'equals', rightHandSide: operand() }, negate);
    }
    if (accept('not')) negate = !negate;
    if (accept('in')) {
      if (is('[')) return finish({ leftHandSide, predicate: 'equalsAny', rightHandSide: literalValue() }, negate);
      // `x in xs` against data is `xs contains x`, sides swapped – the
      // way membership reads when the one value is what the rule is
      // about. It stores, and so prints, as `contains`.
      return finish({ leftHandSide: operand(), predicate: 'contains', rightHandSide: leftHandSide }, negate);
    }
    const word = peek();
    if (word.t === 'ident' && SOURCE_WORD_PREDICATES.includes(word.v)) {
      next();
      return finish({ leftHandSide, predicate: word.v, rightHandSide: operand() }, negate);
    }
    return fail(`Expected a comparison (==, !=, <, <=, >, >=, in, contains, containsAny, startsWith, `
      + `endsWith, is …), found ${describeToken(word)}.`);
  };
  const finish = (rule, negate) => (negate ? { ...rule, negate: true } : rule);

  // ---------- declarations ----------

  const propertyList = (close) => {
    const out = [];
    while (!is(close)) {
      guardBlock(close);
      const nameToken = ident('a property name');
      const isOptional = !!accept('?');
      expect(':');
      const typeToken = ident('a type');
      const isList = !!(accept('[') && expect(']'));
      const property = { name: nameToken.v, propertyType: typeToken.v, isOptional, isList };
      mark(property, 'name', nameToken);
      mark(property, 'propertyType', typeToken);
      out.push(property);
      if (!accept(',') && !is(close) && peek().t !== 'ident') break;
    }
    expect(close, `"${close}"`);
    return out;
  };

  // A projection's header, `(tag courseId: CourseId, days: integer)`:
  // the tags it is read by, marked `tag`, then – only for a script – the
  // values its code takes besides. Tags first, since a read gives them in
  // this order.
  const projectionParameterList = () => {
    expect('(');
    const tags = [];
    const args = [];
    while (!is(')')) {
      guardBlock(')');
      const tagToken = is('tag') && peek(1).t === 'ident' && is(':', 2) ? next() : null;
      const nameToken = ident(tags.length || args.length ? 'a parameter name' : '"tag" and the name of a tag');
      expect(':');
      const typeToken = ident('a type');
      if (tagToken) {
        if (args.length) fail('Tags come first – a read gives the tags, then the arguments.', tagToken);
        const tag = { name: nameToken.v, tagType: typeToken.v };
        mark(tag, 'name', nameToken);
        mark(tag, 'tagType', typeToken);
        tags.push(tag);
      } else {
        const argument = { name: nameToken.v, propertyType: typeToken.v };
        mark(argument, 'name', nameToken);
        mark(argument, 'propertyType', typeToken);
        args.push({ argument, token: nameToken });
      }
      if (!accept(',')) break;
    }
    expect(')', '")" or ","');
    return { tags, args };
  };

  const define = (kind, nameToken, body, startToken) => {
    const coll = collections[kind];
    const name = nameToken.v;
    if (Object.prototype.hasOwnProperty.call(coll, name)) {
      diagnostics.push({
        severity: 'error',
        message: `${sourceArticle(SOURCE_KEYWORD[kind]) === 'an' ? 'An' : 'A'} ${SOURCE_KEYWORD[kind]} named "${name}" `
          + 'is already defined above – one of the two has to go.',
        line: nameToken.line, col: nameToken.col, endLine: nameToken.endLine, endCol: nameToken.endCol,
      });
      return;
    }
    sourcePut(coll, name, body);
    mark(body, 'declName', nameToken);
    const end = last();
    result.spans.push({
      kind, name,
      line: startToken.line, col: startToken.col, endLine: end.endLine, endCol: end.endCol,
      nameLine: nameToken.line, nameCol: nameToken.col, nameEndCol: nameToken.endCol,
    });
  };

  // `kind NAME json { … }` – the stored body, whole. What the printer
  // falls back to for anything it cannot say, and a way to write what
  // the grammar does not cover yet.
  const jsonBody = () => {
    const keyword = next();
    const body = jsonValue();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) fail('A json body must be an object.', last());
    mark(body, 'json', keyword);
    return body;
  };

  const annotate = (kind, body, annotations) => {
    for (const { name, value, token } of annotations) {
      const allowed = Object.prototype.hasOwnProperty.call(SOURCE_ANNOTATIONS, name) ? SOURCE_ANNOTATIONS[name] : null;
      if (!allowed) fail(`There is no @${name} – the annotations are @icon, @feature and @tagSchema.`, token);
      if (!allowed.includes(kind)) fail(`A ${SOURCE_KEYWORD[kind]} carries no @${name}.`, token);
      if (body[name] !== undefined) fail(`@${name} is given twice.`, token);
      body[name] = value;
    }
    return body;
  };

  const customType = (start, annotations, isTag) => {
    const keyword = next().v;
    const nameToken = declName('a type name');
    let body;
    if (is('json')) body = jsonBody();
    else if (keyword === 'enum') {
      expect('{');
      const members = [];
      while (!is('}')) {
        guardBlock('}');
        const member = peek().t === 'string' ? next() : ident('an enum member');
        mark(members, 'i:' + members.length, member);
        members.push(member.v);
        if (!accept(',') && peek().t !== 'ident' && peek().t !== 'string') break;
      }
      expect('}', '"}" or ","');
      body = { schema: { type: 'string', enum: members } };
    } else if (keyword === 'record') {
      expect('{');
      const properties = [];
      while (!is('}')) {
        guardBlock('}');
        const nameToken = ident('a field name');
        expect(':');
        const typeToken = ident('a type');
        const field = { name: nameToken.v, propertyType: typeToken.v };
        mark(field, 'name', nameToken);
        mark(field, 'propertyType', typeToken);
        properties.push(field);
        if (is('[') || is('?')) fail('A record field is always one required value – a list or an optional field cannot be zipped.');
        if (!accept(',') && peek().t !== 'ident') break;
      }
      expect('}', '"}" or ","');
      body = { properties };
    } else {
      expect('=');
      if (is('{')) body = { schema: jsonValue() };
      else {
        const base = ident('a base type');
        if (!SOURCE_BASE_TYPES.includes(base.v)) {
          fail(`A value type is one of ${SOURCE_BASE_TYPES.join(', ')} – or a JSON Schema object – `
            + `not "${base.v}". (A record of fields is written "record ${nameToken.v} { … }".)`, base);
        }
        const schema = { type: base.v };
        if (is('{')) {
          const rest = jsonValue();
          for (const key of Object.keys(rest)) sourcePut(schema, key, rest[key]);
        }
        body = { schema };
      }
    }
    if (isTag) body.isTag = true;
    define('custom-type-definition', nameToken, annotate('custom-type-definition', body, annotations), start);
  };

  const eventDecl = (start, annotations) => {
    next();
    const nameToken = declName('an event name');
    if (is('json')) return define('event-definition', nameToken, annotate('event-definition', jsonBody(), annotations), start);
    expect('{');
    const body = { properties: [], tags: [] };
    // Each property says where it is a tag: `tag courseId: CourseId` for
    // the property itself, `items: Item[] tag each productId` for a field
    // of the records it holds (`tag productId` on one record, `tag each
    // (productId, tenantId)` for several fields). The paths are stored in
    // the order written; a field is marked, so a rename of it follows.
    const prefix = () => is('tag') && peek(1).t === 'ident' && (is(':', 2) || is('?', 2));
    const suffix = () => is('tag') && !is(':', 1) && !is('?', 1) && !prefix();
    while (!is('}')) {
      guardBlock('}');
      const tagToken = prefix() ? next() : null;
      const propertyToken = ident('a property name');
      const isOptional = !!accept('?');
      expect(':');
      const typeToken = ident('a type');
      const isList = !!(accept('[') && expect(']'));
      const property = { name: propertyToken.v, propertyType: typeToken.v, isOptional, isList };
      mark(property, 'name', propertyToken);
      mark(property, 'propertyType', typeToken);
      body.properties.push(property);
      if (tagToken) body.tags.push(propertyToken.v);
      if (suffix()) {
        const marker = next();
        const each = accept('each');
        if (isList && !each) fail(`${propertyToken.v} holds a list, so it is tagged by each element: tag each <field>.`, marker);
        if (!isList && each) fail(`${propertyToken.v} holds one record – "each" is for a list: tag <field>.`, each);
        const fields = [];
        if (accept('(')) {
          do fields.push(ident('a record field')); while (accept(','));
          expect(')', '")" or ","');
        } else fields.push(ident('a record field'));
        for (const field of fields) {
          mark(body, `tag:${body.tags.length}:field`, field);
          body.tags.push(`${propertyToken.v}.${field.v}`);
        }
      }
      if (!accept(',') && !is('}') && peek().t !== 'ident') break;
    }
    expect('}', '"}"');
    if (is('tags')) fail('An event marks its tags in place: tag courseId: CourseId.', peek());
    if (!body.tags.length) delete body.tags;
    return define('event-definition', nameToken, annotate('event-definition', body, annotations), start);
  };

  const entityDecl = (start, annotations) => {
    next();
    const nameToken = declName('an entity name');
    if (is('json')) return define('entity-definition', nameToken, annotate('entity-definition', jsonBody(), annotations), start);
    const body = {};
    // `(tag courseId: CourseId)` – the one tag an instance is read by,
    // named. The defaults, `<Name>Id` named `<name>Id`, are the entity
    // tracking its own name and are stored as absent, which is how the
    // model keeps them.
    const lowered = nameToken.v.charAt(0).toLowerCase() + nameToken.v.slice(1);
    if (!is('(')) {
      fail(`Say what ${nameToken.v} is tagged by: entity ${nameToken.v} (tag ${lowered}Id: ${nameToken.v}Id).`, peek());
    }
    next();
    expect('tag', '"tag" – an entity is read by one tag, its identifier');
    const idName = ident('the name of its tag');
    expect(':');
    const typeToken = ident('the identifier type');
    expect(')', '")" – an entity has one tag');
    if (typeToken.v !== nameToken.v + 'Id') body.identifierType = typeToken.v;
    if (idName.v !== typeToken.v.charAt(0).toLowerCase() + typeToken.v.slice(1)) body.identifierName = idName.v;
    mark(body, 'identifierType', typeToken);
    mark(body, 'identifierName', idName);
    expect('{');
    body.properties = [];
    while (!is('}')) {
      guardBlock('}');
      if (is('lifecycle') && peek(1).t === 'ident' && !is('=', 1)) {
        next();
        if (body.lifecycle !== undefined) fail('An entity has one lifecycle.', last());
        const lifecycle = ident('the lifecycle property');
        body.lifecycle = lifecycle.v;
        mark(body, 'lifecycle', lifecycle);
      } else {
        const nameToken = ident('a property name, or "lifecycle"');
        expect('=', '"=" and the projection this property is');
        const projectionToken = ident('a projection name');
        const property = { name: nameToken.v, projection: projectionToken.v };
        mark(property, 'name', nameToken);
        mark(property, 'projection', projectionToken);
        body.properties.push(property);
      }
      accept(',');
    }
    expect('}');
    return define('entity-definition', nameToken, annotate('entity-definition', body, annotations), start);
  };

  // `untagged` before `projection` says the projection folds the whole
  // log; anything else names its tags in its header. Saying neither is
  // an error with both fixes – the partition is too easy to forget for
  // the text to assume one.
  //
  // `derived` or `scripted` right before `projection` says what kind it
  // is, so the header already knows what the block may hold: a script
  // takes arguments after its tags, a derived projection holds one
  // expression and no initial value.
  const projectionDecl = (start, annotations, untagged, kind) => {
    const keyword = next();
    const nameToken = declName('a projection name');
    const derivedKind = !!kind && kind.v === 'derived';
    const scriptedKind = !!kind && kind.v === 'scripted';
    if (is('json')) {
      if (untagged) fail('A json body says its own tags – drop "untagged".', untagged);
      if (kind) fail(`A json body says what it is – drop "${kind.v}".`, kind);
      return define('projection-definition', nameToken, annotate('projection-definition', jsonBody(), annotations), start);
    }
    annotate('projection-definition', {}, annotations);
    const body = {};
    // What a read gives besides the tags is an argument (10.0): a script
    // reads it, a derived projection compares or computes with it. A
    // declared one's handlers cannot, which is the advisories' to say.
    const header = is('(') ? projectionParameterList() : { tags: [], args: [] };
    if (untagged && header.tags.length) fail(`${nameToken.v} is declared untagged and tagged by ${header.tags.map((t) => t.name).join(', ')} – one or the other.`, untagged);
    if (!untagged && !header.tags.length) {
      const lowered = nameToken.v.charAt(0).toLowerCase() + nameToken.v.slice(1);
      diagnostics.push({
        severity: 'error',
        message: `Say what ${nameToken.v} is tagged by – projection ${nameToken.v} (tag ${lowered}Id: …) – or that it is untagged.`,
        line: nameToken.line, col: nameToken.col, endLine: nameToken.endLine, endCol: nameToken.endCol,
        fix: {
          line: (kind || keyword).line, col: (kind || keyword).col, endLine: (kind || keyword).line, endCol: (kind || keyword).col,
          text: 'untagged ', title: 'Declare it untagged', label: 'untagged',
        },
      });
    }
    body.tags = header.tags;
    if (header.args.length) body.arguments = header.args.map((a) => a.argument);
    expect(':', '":" and the type it holds');
    const valueType = ident('the type it holds');
    body.valueType = valueType.v;
    mark(body, 'valueType', valueType);
    body.isList = !!(accept('[') && expect(']'));
    if (is('=') && derivedKind) fail(`A derived projection has no initial value – before any event it is what its operands start at.`);
    if (accept('=')) body.initialValue = literalValue();
    if (is('derived')) {
      fail(`"derived" goes in front, and what it derives in the block: derived projection ${nameToken.v} (…): `
        + `${body.valueType} { … }.`);
    }
    if (derivedKind) {
      expect('{', `"{" and what it derives – derived projection ${nameToken.v} (…): ${body.valueType} { A(…) - B(…) }`);
      body.derived = derivedExpression();
    }
    if (derivedKind || accept('{')) {
      const handlers = [];
      let script = scriptedKind ? {} : null;
      const scriptField = (key, value) => {
        script = script || {};
        if (script[key] !== undefined) fail(`${key} is given twice.`, last());
        script[key] = value;
      };
      const owner = { kind: 'projection-definition', name: nameToken.v };
      let group = null;
      const bare = [];
      while (!is('}')) {
        guardBlock('}');
        if (group && !is('scenarios')) fail('The scenarios group comes last – nothing follows it in the block.');
        if (derivedKind && !is('scenarios') && !is('scenario')) {
          fail(`A derived projection's block holds what it derives, then its scenarios – found ${describeToken(peek())}.`);
        }
        if (!scriptedKind && (is('initialState') || is('exposes'))) {
          fail(`Only a scripted projection has ${peek().v} – scripted projection ${nameToken.v} (…).`);
        }
        if (accept('on')) {
          const eventToken = ident('an event name');
          const event = eventToken.v;
          expect('=>');
          if (peek().t === 'code') {
            const handler = { event, code: next().v };
            mark(handler, 'event', eventToken);
            mark(handler, 'code', last());
            handlers.push(handler);
          } else {
            const op = ident('an operation (set, increment, decrement, append, remove) or a ```code``` block');
            if (!OPERATIONS.includes(op.v)) {
              fail(`"${op.v}" is not an operation – set, increment, decrement, append or remove.`, op);
            }
            const handler = { event, operation: op.v };
            mark(handler, 'event', eventToken);
            if (startsHandlerOperand()) handler.value = handlerOperand();
            handlers.push(handler);
          }
        } else if (is('script')) {
          fail(`"script" goes in front now, as "scripted": scripted projection ${nameToken.v} (…).`);
        } else if (accept('initialState')) {
          mark(body, 'initialState', peek());
          scriptField('initialState', jsonValue());
        } else if (accept('exposes')) {
          const exposed = ident('the exposed field');
          mark(body, 'exposes', exposed);
          scriptField('exposes', exposed.v);
        } else if (is('scenarios')) {
          group = scenariosGroup(owner, group);
        } else if (is('scenario')) {
          bare.push(scenarioDecl(peek(), owner));
        } else {
          fail(`Expected "on"${scriptedKind ? ', initialState, exposes' : ''} or scenarios, found ${describeToken(peek())}.`);
        }
      }
      const endAt = at;
      expect('}');
      ungrouped(bare, endAt);
      if (!derivedKind) body.handlers = handlers;
      if (script) body.script = script;
    } else if (scriptedKind) {
      body.script = {};
    }
    return define('projection-definition', nameToken, body, start);
  };

  const commandDecl = (start, annotations) => {
    next();
    const nameToken = declName('a command name');
    if (is('json')) return define('command-definition', nameToken, annotate('command-definition', jsonBody(), annotations), start);
    const body = annotate('command-definition', {}, annotations);
    expect('(', '"(" and the payload');
    body.properties = propertyList(')');
    // Where the header ends, for what the editor says about the command
    // as a whole (`sourceCommandQueries`) – not a name.
    mark(body, 'open', expect('{'));
    body.boundary = [];
    body.conditions = [];
    body.publishes = [];
    const owner = { kind: 'command-definition', name: nameToken.v };
    let group = null;
    const bare = [];
    while (!is('}')) {
      guardBlock('}');
      if (group && !is('scenarios')) fail('The scenarios group comes last – nothing follows it in the block.');
      const readToken = accept('alias');
      if (readToken) {
        const aliasToken = ident('the name of the alias');
        const alias = aliasToken.v;
        const isOptional = !!accept('?');
        expect('=');
        const target = ident('an entity or a projection');
        // Which of the two it is, is settled once every declaration is
        // known (after the parse): the spelling is the same.
        const binding = { '%target': target.v };
        mark(binding, 'target', target);
        if (is('tagged') || is('with')) oldReadSpelling(target);
        if (is('(')) Object.assign(binding, { '%call': callArguments(commandOperand) });
        if (accept('excluding')) binding.excluding = commandOperand();
        binding.alias = alias;
        mark(binding, 'alias', aliasToken);
        // The statement's extent, for what the editor says about the
        // read as a whole (`sourceReadQueries`) – not names, so nothing
        // resolves or renames them.
        mark(binding, 'statement', readToken);
        mark(binding, 'statementEnd', last());
        if (isOptional) binding.isOptional = true;
        body.boundary.push(binding);
      } else if (accept('require')) {
        // The message is required, as in Weltenwanderer: it is what the
        // command is refused with, and what a scenario names the refusal by.
        const rule = condition(commandOperand);
        expect('else', '"else reject" and the message the command is refused with');
        expect('reject', '"reject" and the message the command is refused with');
        mark(rule, 'rejection', peek());
        rule.rejection = string('the message the command is refused with, in quotes');
        body.conditions.push(rule);
      } else if (accept('emit')) {
        const eventToken = ident('an event name');
        const emission = { name: eventToken.v };
        mark(emission, 'name', eventToken);
        if (accept('{')) emission.parameters = argumentList('}', commandOperand);
        if (accept('when')) {
          emission.when = [condition(commandOperand)];
          while (accept('and')) emission.when.push(condition(commandOperand));
        }
        body.publishes.push(emission);
      } else if (is('scenarios')) {
        group = scenariosGroup(owner, group);
      } else if (is('scenario')) {
        bare.push(scenarioDecl(peek(), owner));
      } else {
        fail(`Expected alias, require, emit or scenarios, found ${describeToken(peek())}.`);
      }
    }
    const endAt = at;
    expect('}');
    ungrouped(bare, endAt);
    resolveCommandNames(body);
    return define('command-definition', nameToken, body, start);
  };

  const resolveCommandNames = (body) => {
    const aliases = new Set(body.boundary.map((b) => b.alias));
    const parameters = new Set(body.properties.map((p) => p.name));
    const resolve = (value) => {
      if (Array.isArray(value)) return value.map(resolve);
      if (value === null || typeof value !== 'object') return value;
      if (value['%ref']) {
        const [head, property] = value['%ref'];
        const asRead = aliases.has(head) || (!parameters.has(head) && property !== undefined);
        const out = asRead
          ? (property === undefined ? { alias: head } : { alias: head, property })
          : (property === undefined ? { parameterName: head } : { parameterName: head, property });
        return copyMarks(value, out);
      }
      const out = {};
      for (const key of Object.keys(value)) sourcePut(out, key, resolve(value[key]));
      return copyMarks(value, out);
    };
    for (const key of ['boundary', 'conditions', 'publishes']) body[key] = resolve(body[key]);
  };

  // ---------- scenarios ----------

  // A payload value: JSON, except that a bare capitalised word is an
  // enum member and reads as the string it is stored as.
  // A bare member is a string by then, so its token is marked on the
  // container that holds it (`value:<key>`, `i:<n>`) – or, at the top,
  // left in `memberToken` for the caller to place.
  let memberToken = null;
  const scenarioValue = () => {
    const token = peek();
    memberToken = null;
    if (token.t === 'ident' && SOURCE_MEMBER_RE.test(token.v)) { memberToken = token; return next().v; }
    if (accept('{')) {
      enter();
      const out = {};
      while (!is('}')) {
        const keyToken = peek().t === 'string' || peek().t === 'ident'
          ? next() : fail(`Expected a property name, found ${describeToken(peek())}.`);
        expect(':');
        mark(out, 'key:' + keyToken.v, keyToken);
        sourcePut(out, keyToken.v, scenarioValue());
        mark(out, 'value:' + keyToken.v, memberToken);
        if (!accept(',')) break;
      }
      expect('}', '"}" or ","');
      memberToken = null;
      return leave(out);
    }
    if (accept('[')) {
      enter();
      const out = [];
      while (!is(']')) {
        out.push(scenarioValue());
        mark(out, 'i:' + (out.length - 1), memberToken);
        if (!accept(',')) break;
      }
      memberToken = null;
      expect(']', '"]" or ","');
      return leave(out);
    }
    return jsonValue();
  };
  const payload = (what) => (is('{') ? scenarioValue() : fail(`Expected "{" and ${what}, found ${describeToken(peek())}.`));

  const thenItem = () => {
    if (accept('nothing')) return { nothing: true };
    if (accept('rejected')) {
      // Named by the rule's message, never by the condition.
      if (is('by')) fail('A refusal is named by the message it was refused with: then rejected "…".');
      // The message is the whole assertion: what the rule read is how
      // the decision was made, not what it was.
      const rejected = string('the message the command was refused with, in quotes');
      if (is('saw') || is('at')) fail('A refusal is named by its message alone – what the rule read is not asserted.');
      return { rejected };
    }
    const name = ident('an event, a projection, nothing or rejected');
    if (is('{')) return { event: name.v, data: scenarioValue(), subjectToken: name };
    // A projection, read the way a command reads it: its values in the
    // order it declares them – tag literals here, each with its type,
    // then its arguments – settled against the declaration
    // after the parse.
    const item = { projection: name.v, subjectToken: name };
    if (is('tagged') || is('with')) oldReadSpelling(name);
    if (!is('(')) fail(`A projection is read with its values in parentheses: ${name.v}(…) – empty for an untagged one.`, peek());
    next();
    item.values = [];
    item.valueTokens = [];
    while (!is(')')) {
      const token = peek();
      if (token.t === 'ident' && SOURCE_MEMBER_RE.test(token.v) && is('(', 1)) {
        next(); next();
        const literal = { tagType: token.v, tagValue: literalValue() };
        mark(literal, 'tagType', token);
        expect(')', '")" – a tag literal holds one value');
        item.values.push(literal);
        item.valueTokens.push(null);
      } else {
        item.values.push(scenarioValue());
        item.valueTokens.push(memberToken);
      }
      if (!accept(',')) break;
    }
    expect(')', '")" or ","');
    if (accept('==')) {
      item.value = scenarioValue();
      item.valueToken = memberToken;
    }
    return item;
  };

  // `scenario ["name"] { given … when … then … }` – see the header. The
  // record keeps what an apply needs beyond the body: where it sits,
  // where its then lines are, and which parts were left to evaluation.
  const scenarioDecl = (start, block) => {
    const from = at;
    next();
    const nameToken = peek().t === 'string' ? next() : null;
    const record = { block, head: start, thenRange: null, from, to: null };
    let subjectToken = nameToken || start;
    if (is('json')) {
      const body = jsonBody();
      if (nameToken) body.name = nameToken.v;
      record.kind = body.projection !== undefined && body.command === undefined
        ? 'projection-scenario-definition' : 'scenario-definition';
      record.subject = record.kind === 'scenario-definition' ? body.command : body.projection;
      record.body = body;
    } else {
      expect('{');
      record.bodyCol = peek().col;
      const given = [];
      let when = null;
      const thens = [];
      // Each keyword is said once; what follows it continues with `and`.
      // Said again, it is read anyway and reported, with a fix when it
      // follows its own kind – `and` is what it means.
      const said = new Set();
      let previous = null;
      const once = (token) => {
        if (said.has(token.v)) {
          diagnostics.push({
            severity: 'error', message: `A scenario says ${token.v} once – what follows continues with "and".`,
            line: token.line, col: token.col, endLine: token.endLine, endCol: token.endCol,
            fix: previous === token.v ? {
              line: token.line, col: token.col, endLine: token.endLine, endCol: token.endCol,
              text: 'and', title: 'Join with and', label: 'and',
            } : undefined,
          });
        }
        said.add(token.v);
      };
      while (!is('}')) {
        guardBlock('}');
        const continued = is('and') ? previous : null;
        if (is('and') && !previous) fail(`Expected given, when or then, found ${describeToken(peek())}.`);
        if (is('given') || continued === 'given') {
          if (!continued) once(peek());
          next();
          const event = ident('the event it was given');
          const step = { event: event.v, data: payload('the event\'s payload') };
          mark(step, 'event', event);
          given.push(step);
          previous = 'given';
        } else if (is('when') || continued === 'when') {
          const token = next();
          if (when) fail('A scenario runs one command – one when.', token);
          const command = ident('the command it runs');
          when = { command: command.v, arguments: payload('the command\'s arguments'), token: command };
          previous = 'when';
        } else if (is('then') || continued === 'then') {
          if (!continued) once(peek());
          const token = next();
          const item = thenItem();
          thens.push({ ...item, token, end: last() });
          previous = 'then';
        } else {
          fail(`Expected given, when or then, found ${describeToken(peek())}.`);
        }
      }
      // Where a `then` the text leaves out would go: after the last line.
      if (previous) {
        const end = last();
        record.bodyEnd = { line: end.endLine, col: end.endCol };
      }
      expect('}');
      if (thens.length) {
        const first = thens[0].token;
        const end = thens[thens.length - 1].end;
        record.thenRange = { line: first.line, col: first.col, endLine: end.endLine, endCol: end.endCol };
      }
      const body = {};
      if (nameToken) body.name = nameToken.v;
      const projections = thens.filter((t) => t.projection !== undefined);
      if (when) {
        if (projections.length) fail('A scenario that runs a command ends in events, nothing or a rejection – not in a projection\'s value.', projections[0].token);
        record.kind = 'scenario-definition';
        record.subject = when.command;
        subjectToken = when.token;
        Object.assign(body, { command: when.command, given, when: { arguments: when.arguments } });
        const rejections = thens.filter((t) => t.rejected);
        if (rejections.length && thens.length > 1) fail('A rejection is the whole outcome – it stands alone.', rejections[0].token);
        if (thens.some((t) => t.nothing) && thens.length > 1) fail('"then nothing" is the whole outcome – it stands alone.', thens[1].token);
        if (rejections.length) {
          body.then = { outcome: 'rejected', events: [], rejection: rejections[0].rejected };
        } else if (thens.length) {
          body.then = {
            outcome: 'published',
            events: thens.filter((t) => t.event !== undefined).map((t) => ({ type: t.event, data: t.data })),
          };
        }
      } else {
        if (thens.length > 1) fail('A projection scenario asserts one value – one then.', thens[1].token);
        if (thens.length && !projections.length) fail('A scenario ending in events, nothing or a rejection needs a when – the command it runs.', thens[0].token);
        record.kind = 'projection-scenario-definition';
        if (projections.length) {
          const item = projections[0];
          record.subject = item.projection;
          subjectToken = item.subjectToken;
          body.projection = item.projection;
          // Named against the projection once every declaration is known.
          record.call = { values: item.values, tokens: item.valueTokens, callee: item.subjectToken };
          body.given = given;
          if ('value' in item) body.then = item.value;
        } else if (block && block.kind === 'projection-definition') {
          record.subject = block.name;
          Object.assign(body, { projection: block.name, given });
        } else {
          fail('Say what this scenario runs (when …) or what it asserts (then …).', start);
        }
      }
      record.body = body;
      if (when) mark(body.when, 'command', when.token);
      if (body.then && body.then.events) {
        thens.filter((t) => t.event !== undefined).forEach((t, i) => mark(body.then.events[i], 'type', t.subjectToken));
      }
      if (projections.length) {
        mark(body, 'projection', projections[0].subjectToken);
        if ('value' in projections[0]) mark(body, 'then', projections[0].valueToken);
      }
    }
    if (block) {
      const wanted = block.kind === 'command-definition' ? 'scenario-definition' : 'projection-scenario-definition';
      if (record.kind !== wanted || record.subject !== block.name) {
        fail(`This scenario sits in ${block.name} but is about ${record.subject} – move it there, or make it about ${block.name}.`, subjectToken);
      }
    }
    const end = last();
    record.span = { line: start.line, col: start.col, endLine: end.endLine, endCol: end.endCol };
    record.to = at;
    result.scenarios.push(record);
    return record;
  };

  // `scenarios { scenario … scenario … }` – a block's scenarios, held
  // together so the editor can fold them as one. A block has at most
  // one group, and it is the block's last statement.
  const scenariosGroup = (block, previous = null) => {
    const head = next();
    // Read rather than refused, so the block's other statements and the
    // scenarios in it are not lost to the error.
    if (previous) {
      diagnostics.push({
        severity: 'error', message: 'A block has one scenarios group – move these scenarios into the first.',
        line: head.line, col: head.col, endLine: head.endLine, endCol: head.endCol,
      });
    }
    expect('{', '"{" and the scenarios');
    const records = [];
    while (!is('}')) {
      guardBlock('}');
      if (!is('scenario')) fail(`Expected scenario, found ${describeToken(peek())}.`);
      records.push(scenarioDecl(peek(), block));
    }
    const end = expect('}');
    const group = { block, head, records, span: { line: head.line, col: head.col, endLine: end.endLine, endCol: end.endCol } };
    result.groups.push(group);
    return group;
  };

  // A scenario written outside a group is read anyway, so that what it
  // says is not lost to the error, and the error carries the fix: the
  // run it belongs to, wrapped. Offered only for a run that stands
  // where a group may – one scenario after another, and at a block's
  // end – which is how every text printed before groups reads.
  const source = String(text);
  const ungrouped = (records, endAt) => {
    const runs = [];
    for (const record of records) {
      const run = runs[runs.length - 1];
      if (run && run[run.length - 1].to === record.from) run.push(record);
      else runs.push([record]);
    }
    for (const run of runs) {
      const first = run[0].head;
      const end = run[run.length - 1].span;
      const indent = source.split('\n')[first.line - 1].slice(0, first.col - 1);
      const fits = !/\S/.test(indent) && (endAt === undefined || run[run.length - 1].to === endAt);
      const body = source.slice(sourceOffset(source, first.line, 1), sourceOffset(source, end.endLine, end.endCol));
      diagnostics.push({
        severity: 'error', message: 'A scenario sits in a "scenarios { … }" group.',
        line: first.line, col: first.col, endLine: first.endLine, endCol: first.endCol,
        fix: fits ? {
          line: first.line, col: 1, endLine: end.endLine, endCol: end.endCol,
          text: `${indent}scenarios {\n${body.split('\n').map((l) => (l ? '  ' + l : l)).join('\n')}\n${indent}}`,
          title: 'Wrap in scenarios { }', label: 'Wrap',
        } : undefined,
      });
    }
  };

  const declaration = () => {
    const start = peek();
    const annotations = [];
    while (accept('@')) {
      const token = ident('an annotation name');
      expect('(');
      const value = string('a string');
      expect(')');
      annotations.push({ name: token.v, value, token });
    }
    if (accept('model')) {
      if (annotations.length) fail('A model carries no annotations.', annotations[0].token);
      if (result.name !== null) fail('The model is named once.', last());
      result.name = string('the model\'s name, in quotes');
      return;
    }
    if (is('scenarios')) {
      if (annotations.length) fail('Scenarios carry no annotations.', annotations[0].token);
      return scenariosGroup(null);
    }
    if (is('scenario')) {
      if (annotations.length) fail('A scenario carries no annotations.', annotations[0].token);
      return topLevelBare.push(scenarioDecl(start, null));
    }
    const isTag = !!accept('tag');
    if (isTag && !is('type') && !is('enum') && !is('record')) {
      fail(`Expected type, enum or record after "tag", found ${describeToken(peek())}.`);
    }
    if (is('type') || is('enum') || is('record')) return customType(start, annotations, isTag);
    const untagged = accept('untagged');
    const kind = (is('derived') || is('scripted')) && (is('projection', 1) || is('untagged', 1)) ? next() : null;
    if (kind && is('untagged')) fail(`"untagged" comes first: untagged ${kind.v} projection …`);
    const lead = kind || untagged;
    if (lead && !is('projection')) fail(`Expected projection after "${lead.v}", found ${describeToken(peek())}.`);
    if (is('projection')) return projectionDecl(start, annotations, untagged, kind);
    if (is('event')) return eventDecl(start, annotations);
    if (is('entity')) return entityDecl(start, annotations);
    if (is('command')) return commandDecl(start, annotations);
    return fail(`Expected a declaration – type, enum, record, event, entity, projection or command – `
      + `found ${describeToken(peek())}.`);
  };

  const topLevelBare = [];
  while (peek().t !== 'eof') {
    const from = at;
    depth = 0;
    try {
      declaration();
    } catch (caught) {
      // The depth limit is the guard; a RangeError is the net under it,
      // for a recursion it does not count – the promise is that errors
      // never stop the read, and a stack overflow is one.
      const error = caught instanceof RangeError ? new SourceError(
        'This could not be read: it is nested too deeply.', tokens[from]) : caught;
      if (!(error instanceof SourceError)) throw error;
      const token = error.token;
      diagnostics.push({
        severity: 'error', message: error.message,
        line: token.line, col: token.col, endLine: token.endLine, endCol: Math.max(token.endCol, token.col + 1),
      });
      if (at === from) next();
      while (peek().t !== 'eof' && !startsDeclaration() && !(peek().first && (is('scenario') || is('scenarios')))) next();
    }
  }
  ungrouped(topLevelBare);

  // A read names its target the same way whether it is an entity or a
  // projection, a call is a read or a tag literal by whether its name is
  // a projection, and a bare capitalised name an enum member – all
  // settled here, once every declaration in the text (and, for a
  // fragment, every one handed in) is known. Resolving by name, the way
  // an operand resolves to an alias or a payload property: nothing about
  // the stored shape is guessed. A read's values are given in the order
  // its projection declares them – tags, then its arguments – and
  // stored by name.
  const declares = (kind, option, name) =>
    Object.prototype.hasOwnProperty.call(collections[kind], name)
    || (Array.isArray(options[option]) && options[option].includes(name));
  const parametersOf = (name) => {
    if (Object.prototype.hasOwnProperty.call(collections['projection-definition'], name)) {
      const body = collections['projection-definition'][name] || {};
      return {
        tags: projectionTagParams(body).map((tag) => tag.name),
        arguments: projectionSlots(body).map((argument) => argument && argument.name),
      };
    }
    const given = options.projectionParameters && options.projectionParameters[name];
    return given || null;
  };
  const report = (token, message, fix) => {
    if (!token) return;
    diagnostics.push({ severity: 'error', message, line: token.line, col: token.col, endLine: token.endLine, endCol: token.endCol, ...(fix ? { fix } : {}) });
  };
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  // A projection read from values in its declared order: `{projection,
  // tags, arguments}`, each map present only when it holds something.
  const readOf = (name, values, token) => {
    const read = { projection: name };
    const params = parametersOf(name) || { tags: [], arguments: [] };
    const slots = [...params.tags.map((key) => ['tags', key]), ...params.arguments.map((key) => ['arguments', key])];
    if (values.length !== slots.length) {
      report(token, `${name} takes ${count(slots.length, 'value')}`
        + `${slots.length ? ` (${slots.map(([, key]) => key).join(', ')})` : ''} – this gives ${values.length}.`);
    }
    values.forEach((value, index) => {
      if (!slots[index]) return;
      const [where, key] = slots[index];
      if (where === 'arguments' && value && typeof value === 'object' && value.each !== undefined) {
        report(token, `"each" fans a read out over one of its tags – ${key} is an argument.`);
      }
      read[where] = read[where] || {};
      sourcePut(read[where], key, value);
    });
    mark(read, 'projection', token);
    return read;
  };
  const isLiteral = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);
  const settle = (value) => {
    if (Array.isArray(value)) return value.map(settle);
    if (!value || typeof value !== 'object') return value;
    if (value['%call'] !== undefined) {
      const name = value['%call'];
      const token = (marksOf(value) || {}).callee;
      const values = value.values.map(settle);
      if (value.named) for (const key of Object.keys(value.named)) value.named[key] = settle(value.named[key]);
      if (declares('projection-definition', 'projectionNames', name)) {
        if (value.named) report(token, `A read gives its values in order, as ${name} declares them – no names.`);
        const read = readOf(name, values, value.named ? null : token);
        mark(read, 'close', (marksOf(value) || {}).close);
        return read;
      }
      // `CourseId("c1")`: a tag literal, its type and one value.
      if (values.length === 1 && isLiteral(values[0]) && !value.named) {
        const literal = { tagType: name, tagValue: values[0] };
        mark(literal, 'tagType', token);
        return literal;
      }
      report(token, `${name} is no projection – a read names one, and a tag literal is a type and one value: CourseId("c1").`);
      return { projection: name };
    }
    if (value['%pascal'] !== undefined) {
      const name = value['%pascal'];
      const token = (marksOf(value) || {}).pascal;
      if (declares('projection-definition', 'projectionNames', name)) {
        // A read takes its parentheses, empty or not: the bare name is
        // the enum member's spelling.
        report(token, `${name} is a projection – read it as ${name}(…).`, token && {
          line: token.endLine, col: token.endCol, endLine: token.endLine, endCol: token.endCol,
          text: '()', title: 'Read it with ()', label: '()',
        });
        const read = { projection: name };
        mark(read, 'projection', token);
        return read;
      }
      const member = { enumMember: name };
      mark(member, 'enumMember', token);
      return member;
    }
    for (const key of Object.keys(value)) value[key] = settle(value[key]);
    return value;
  };
  for (const body of Object.values(collections['command-definition'])) {
    if (!body || !Array.isArray(body.boundary)) continue;
    body.boundary = body.boundary.map((binding) => {
      if (!binding || binding['%target'] === undefined) return binding;
      const target = binding['%target'];
      const token = (marksOf(binding) || {}).target;
      const called = binding['%call'];
      const values = called ? called.values.map(settle) : [];
      const named = called && called.named;
      if (named) for (const key of Object.keys(named)) named[key] = settle(named[key]);
      const out = { alias: binding.alias };
      if (!called) {
        report(token, `${target} is read with its values in parentheses – ${target}(…), empty for an untagged projection.`);
      }
      if (declares('entity-definition', 'entityNames', target)) {
        out.entity = target;
        if (called && values.length !== 1) {
          report(token, `${target} is an entity, read by its identifier – one value: ${target}(…).`);
        }
        out.id = values[0];
        if (named) out.arguments = named;
        if (binding.excluding !== undefined) out.excluding = settle(binding.excluding);
      } else {
        const read = readOf(target, values, called && !named ? token : null);
        out.projection = target;
        if (read.tags) out.tags = read.tags;
        if (read.arguments) out.arguments = read.arguments;
        if (named) report(token, `A read gives its values in order, as ${target} declares them – no names.`);
        if (binding.excluding !== undefined) {
          report(token, `${target} is a projection – "excluding" narrows an entity's fan-out.`);
        }
      }
      if (binding.isOptional) out.isOptional = true;
      copyMarks(binding, out);
      mark(out, out.entity !== undefined ? 'entity' : 'projection', token);
      return out;
    });
  }
  for (const body of Object.values(collections['command-definition'])) {
    if (!body || typeof body !== 'object') continue;
    for (const key of ['conditions', 'publishes']) {
      if (Array.isArray(body[key])) body[key] = settle(body[key]);
    }
  }
  for (const body of Object.values(collections['projection-definition'])) {
    if (!body || !body.derived || typeof body.derived !== 'object') continue;
    body.derived.leftHandSide = settle(body.derived.leftHandSide);
    body.derived.rightHandSide = settle(body.derived.rightHandSide);
  }
  // A projection scenario's `then X(…)`: its values named against X.
  for (const record of result.scenarios) {
    const { call: written, body } = record;
    if (!written) continue;
    if (!declares('projection-definition', 'projectionNames', body.projection)) continue;
    const params = parametersOf(body.projection) || { tags: [], arguments: [] };
    const slots = [...params.tags.map((key) => ['tags', key]), ...params.arguments.map((key) => ['arguments', key])];
    if (written.values.length !== slots.length) {
      report(written.callee, `${body.projection} takes ${count(slots.length, 'value')}`
        + `${slots.length ? ` (${slots.map(([, key]) => key).join(', ')})` : ''} – this gives ${written.values.length}.`);
    }
    written.values.forEach((value, index) => {
      if (!slots[index]) return;
      const [where, key] = slots[index];
      body[where] = body[where] || {};
      sourcePut(body[where], key, value);
      mark(body[where], 'value:' + key, written.tokens[index]);
    });
  }
  for (const record of result.scenarios) settle(record.body);

  // Every entity's identifier type, declared or not – see above.
  const types = collections['custom-type-definition'];
  for (const [name, body] of Object.entries(collections['entity-definition'])) {
    const idType = (body && typeof body.identifierType === 'string' && body.identifierType) || name + 'Id';
    if (Object.prototype.hasOwnProperty.call(types, idType)) continue;
    sourcePut(types, idType, { schema: { type: 'string' }, isTag: true });
    result.implicit.push(idType);
  }
  diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);
  return result;
}

// ============================================================
// Printing.
// ============================================================

// Thrown by the printer for something the grammar cannot say; caught
// per definition, which then prints as JSON with the message above it.
class SourceUnprintable extends Error {}

const unprintable = (message) => { throw new SourceUnprintable(message); };

function sourceRef(name, what) {
  if (typeof name !== 'string' || !SOURCE_IDENT_RE.test(name)) {
    unprintable(`its ${what} ${JSON.stringify(name)} is not a name the code form can write`);
  }
  return name;
}

function sourceDeclName(name) {
  return SOURCE_IDENT_RE.test(name) ? name : JSON.stringify(name);
}

// JSON, on one line when it is short – keys bare where they can be,
// the way the parser reads them.
function sourceJson(value, indent = '') {
  const flat = sourceJsonFlat(value);
  if (flat.length <= 72 || value === null || typeof value !== 'object') return flat;
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((v) => inner + sourceJson(v, inner)).join(',\n')}\n${indent}]`;
  }
  const keys = Object.keys(value);
  if (!keys.length) return '{}';
  return `{\n${keys.map((k) => `${inner}${sourceJsonKey(k)}: ${sourceJson(value[k], inner)}`).join(',\n')}\n${indent}}`;
}

function sourceJsonKey(key) {
  return SOURCE_IDENT_RE.test(key) ? key : JSON.stringify(key);
}

function sourceJsonFlat(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) unprintable('it holds a number JSON cannot write');
    return String(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(sourceJsonFlat).join(', ')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    return `{ ${keys.map((k) => `${sourceJsonKey(k)}: ${sourceJsonFlat(value[k])}`).join(', ')} }`;
  }
  return unprintable(`it holds a ${typeof value}`);
}

function sourceLiteral(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) unprintable('it holds a number JSON cannot write');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(sourceLiteral).join(', ')}]`;
  if (typeof value === 'object' && Object.keys(value).length === 1 && value.enumMember !== undefined) {
    const member = value.enumMember;
    if (typeof member === 'string' && SOURCE_MEMBER_RE.test(member)) return member;
    if (['string', 'number', 'boolean'].includes(typeof member)) return `enum(${sourceLiteral(member)})`;
  }
  return unprintable(`it holds a value the code form has no spelling for: ${JSON.stringify(value)}`);
}

function sourceProperty(property) {
  return `${sourceRef(property.name, 'property')}${property.isOptional ? '?' : ''}: `
    + `${sourceRef(property.propertyType, 'type')}${property.isList ? '[]' : ''}`;
}

function sourceAnnotations(body, names) {
  return names
    .filter((name) => body[name] !== undefined)
    .map((name) => {
      if (typeof body[name] !== 'string') unprintable(`its ${name} is not a string`);
      return `@${name}(${JSON.stringify(body[name])})\n`;
    })
    .join('');
}

// Fields one per line once they stop fitting on one.
function sourceBlock(head, items, { inline = 3, width = 90, separator = ', ' } = {}) {
  if (!items.length) return `${head} {}`;
  const flat = `${head} { ${items.join(separator)} }`;
  if (items.length <= inline && flat.length <= width && !items.some((i) => i.includes('\n'))) return flat;
  return `${head} {\n${items.map((i) => '  ' + i.replace(/\n/g, '\n  ')).join('\n')}\n}`;
}

// A derived projection's expression: a computation – `a - b`,
// `min(a, b)` – or a comparison, spelled as a rule is.
function sourceDerived(derived, operand) {
  if (!derived || typeof derived !== 'object') unprintable('what it derives is not an object');
  if (derived.operator === undefined) return sourceCondition(derived, operand);
  if (derived.predicate !== undefined) unprintable('it states both a predicate and an operator');
  if (derived.negate !== undefined) unprintable('it negates a computation');
  if (derived.leftHandSide === undefined || derived.rightHandSide === undefined) unprintable('a side of its computation is missing');
  const symbol = Object.keys(SOURCE_OPERATORS).find((k) => SOURCE_OPERATORS[k] === derived.operator);
  const left = operand(derived.leftHandSide);
  const right = operand(derived.rightHandSide);
  if (symbol) return `${left} ${symbol} ${right}`;
  if (SOURCE_OPERATOR_CALLS.includes(derived.operator)) return `${derived.operator}(${left}, ${right})`;
  return unprintable(`its operator ${JSON.stringify(derived.operator)} is not one the code form knows`);
}

function sourceCondition(condition, operand) {
  if (!condition || typeof condition !== 'object') unprintable('a rule is not an object');
  if (condition.leftHandSide === undefined) unprintable('a rule has no left-hand side');
  const left = operand(condition.leftHandSide);
  const negate = condition.negate === true;
  const not = (core) => (negate ? `not ${core}` : core);
  const { predicate } = condition;
  if (SOURCE_UNARY_WORDS[predicate]) {
    if (condition.rightHandSide !== undefined) unprintable(`a "${predicate}" rule carries a right-hand side`);
    return not(`${left} ${SOURCE_UNARY_WORDS[predicate]}`);
  }
  if (condition.rightHandSide === undefined) unprintable(`a "${predicate}" rule has no right-hand side`);
  const right = () => operand(condition.rightHandSide);
  switch (predicate) {
    case 'equals': return `${left} ${negate ? '!=' : '=='} ${right()}`;
    case 'lessThan': return not(`${left} < ${right()}`);
    case 'lessThanOrEquals': return not(`${left} <= ${right()}`);
    case 'greaterThan': return not(`${left} > ${right()}`);
    case 'greaterThanOrEquals': return not(`${left} >= ${right()}`);
    case 'countEquals': return `count(${left}) ${negate ? '!=' : '=='} ${right()}`;
    case 'countLessThan': return not(`count(${left}) < ${right()}`);
    case 'countGreaterThan': return not(`count(${left}) > ${right()}`);
    case 'equalsAny':
      if (!Array.isArray(condition.rightHandSide)) unprintable('an equalsAny rule is not against a list');
      return `${left} ${negate ? 'not in' : 'in'} ${sourceLiteral(condition.rightHandSide)}`;
    default:
      if (SOURCE_WORD_PREDICATES.includes(predicate)) return `${left} ${negate ? 'not ' : ''}${predicate} ${right()}`;
      return unprintable(`a rule's predicate ${JSON.stringify(predicate)} is not one the code form knows`);
  }
}

// The names a printer needs beyond the definition it prints: which
// names are entities and projections, and what each projection declares
// – a read is written positionally, so its values are put in that order.
function sourceNamesOf(model) {
  const projections = model['projection-definitions'] || {};
  const projectionParameters = {};
  for (const [name, body] of Object.entries(projections)) {
    projectionParameters[name] = {
      tags: projectionTagParams(body).map((tag) => tag.name),
      arguments: projectionSlots(body).map((argument) => argument && argument.name),
    };
  }
  return {
    entityNames: Object.keys(model['entity-definitions'] || {}),
    projectionNames: Object.keys(projections),
    projectionParameters,
  };
}

// A tag literal, `CourseId("c1")`.
function sourceTagLiteral(tag) {
  if (Object.keys(tag).some((k) => k !== 'tagType' && k !== 'tagValue')) unprintable('a tag literal carries extra fields');
  if (!SOURCE_MEMBER_RE.test(sourceRef(tag.tagType, 'tag type'))) unprintable('a tag type does not start with a capital');
  if (tag.tagValue !== null && typeof tag.tagValue === 'object') unprintable('a tag literal holds a record');
  return `${tag.tagType}(${sourceLiteral(tag.tagValue)})`;
}

// `X(a, each b, 14)` – a read, its values in the order `X` declares
// them: the tags, then its arguments. A read whose names are not
// exactly the declared ones has no positional spelling.
function sourceRead(read, names, operand) {
  const name = sourceRef(read.projection, 'projection');
  if (!SOURCE_MEMBER_RE.test(name)) unprintable(`the projection ${JSON.stringify(name)} does not start with a capital`);
  const params = names && names.projectionParameters && names.projectionParameters[name];
  if (!params) unprintable(`it reads "${name}", which declares nothing the code form can order its values by`);
  const values = [];
  for (const [key, declared] of [['tags', params.tags], ['arguments', params.arguments]]) {
    const held = read[key] === undefined ? {} : read[key];
    if (held === null || typeof held !== 'object' || Array.isArray(held)) unprintable(`its ${key} are not an object`);
    const given = Object.keys(held);
    if (given.length !== declared.length || declared.some((n) => !given.includes(n))) {
      unprintable(`it reads ${name} with ${key} ${given.join(', ') || 'none'}, where ${name} declares ${declared.join(', ') || 'none'}`);
    }
    for (const n of declared) values.push(held[n]);
  }
  return `${name}(${values.map((value) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && value.each !== undefined) {
      if (Object.keys(value).length !== 1) unprintable('an each carries extra fields');
      return `each ${operand(value.each)}`;
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && value.tagType !== undefined) return sourceTagLiteral(value);
    return operand(value);
  }).join(', ')})`;
}

function sourceHandlerOperand(operand) {
  if (operand && typeof operand === 'object' && !Array.isArray(operand)) {
    const keys = Object.keys(operand);
    if (keys.length === 1 && operand.eventProperty !== undefined) {
      return `event.data.${sourceRef(operand.eventProperty, 'event property')}`;
    }
    if (keys.length === 1 && operand.currentValue === true) return 'currentValue';
    if (keys.length === 1 && operand.successor !== undefined) return `successor(${sourceHandlerOperand(operand.successor)})`;
  }
  return sourceLiteral(operand);
}

// A derived operand: another projection's read – its values each one
// of this projection's own parameters by name, or a literal – one of
// its own parameters by name, or a literal.
function sourceDerivedOperand(names) {
  const value = (v) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && v.parameterName !== undefined) {
      if (Object.keys(v).length !== 1) unprintable('a derived operand\'s parameter reaches into a field');
      return sourceRef(v.parameterName, 'parameter');
    }
    return sourceLiteral(v);
  };
  return (operand) => {
    if (operand && typeof operand === 'object' && !Array.isArray(operand) && operand.projection !== undefined) {
      if (Object.keys(operand).some((k) => !['projection', 'tags', 'arguments'].includes(k))) unprintable('a derived operand carries extra fields');
      return sourceRead(operand, names, value);
    }
    return value(operand);
  };
}

function printCustomType(name, body) {
  const tagSchema = body.tagSchema !== undefined && body.tagSchema !== '{type}:{value}'
    ? sourceAnnotations(body, ['tagSchema']) : '';
  const tag = body.isTag === true ? 'tag ' : '';
  const declared = sourceDeclName(name);
  if (body.properties !== undefined) {
    if (body.schema !== undefined) unprintable('it has both a schema and fields');
    if (!Array.isArray(body.properties)) unprintable('its fields are not a list');
    const fields = body.properties.map((f) => `${sourceRef(f.name, 'field')}: ${sourceRef(f.propertyType, 'type')}`);
    return tagSchema + sourceBlock(`${tag}record ${declared}`, fields);
  }
  const schema = body.schema;
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) unprintable('its schema is not an object');
  const keys = Object.keys(schema);
  const plainEnum = keys.length === 2 && schema.type === 'string' && Array.isArray(schema.enum) && schema.enum.length
    && schema.enum.every((m) => typeof m === 'string' && SOURCE_IDENT_RE.test(m) && !['true', 'false', 'null'].includes(m));
  if (plainEnum) return tagSchema + `${tag}enum ${declared} { ${schema.enum.join(', ')} }`;
  if (typeof schema.type === 'string' && SOURCE_BASE_TYPES.includes(schema.type)) {
    const rest = {};
    for (const key of keys) if (key !== 'type') rest[key] = schema[key];
    return tagSchema + `${tag}type ${declared} = ${schema.type}`
      + (Object.keys(rest).length ? ' ' + sourceJson(rest) : '');
  }
  return tagSchema + `${tag}type ${declared} = ${sourceJson(schema)}`;
}

// An event, each property marked where it is a tag – `tag courseId:
// CourseId`, `items: Item[] tag each productId`. A path naming no
// property has no place to be marked, and falls back to JSON.
function printEvent(name, body) {
  const tags = body.tags || [];
  if (!Array.isArray(tags)) unprintable('its tags are not a list');
  const properties = body.properties || [];
  for (const path of tags) {
    if (typeof path !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(path)) {
      unprintable(`the tag ${JSON.stringify(path)} is not a property path`);
    }
    if (!properties.some((p) => p && p.name === path.split('.')[0])) unprintable(`the tag ${path} names no property of it`);
  }
  const fields = properties.map((property) => {
    const own = tags.filter((path) => path.startsWith(property.name + '.')).map((path) => path.slice(property.name.length + 1));
    const whole = tags.includes(property.name) ? 'tag ' : '';
    const marked = !own.length ? ''
      : ` tag ${property.isList ? 'each ' : ''}${own.length === 1 ? own[0] : `(${own.join(', ')})`}`;
    return whole + sourceProperty(property) + marked;
  });
  return sourceAnnotations(body, ['icon']) + sourceBlock(`event ${sourceDeclName(name)}`, fields);
}

function printEntity(name, body) {
  const idType = sourceRef(body.identifierType !== undefined ? body.identifierType : name + 'Id', 'identifier type');
  const idName = body.identifierName !== undefined ? sourceRef(body.identifierName, 'tag')
    : idType.charAt(0).toLowerCase() + idType.slice(1);
  const head = `entity ${sourceDeclName(name)} (tag ${idName}: ${idType})`;
  const items = [];
  if (body.lifecycle !== undefined && body.lifecycle !== null) items.push(`lifecycle ${sourceRef(body.lifecycle, 'lifecycle')}`);
  for (const p of body.properties || []) {
    items.push(`${sourceRef(p.name, 'property')} = ${sourceRef(p.projection, 'projection')}`);
  }
  return sourceAnnotations(body, ['icon']) + sourceBlock(head, items, { inline: 0 });
}

// `projection Name (tag courseId: CourseId): T = v` – or `untagged
// projection Name: T = v`, `derived projection Name (…): T { a - b }`,
// `scripted projection Name (tag courseId: CourseId, days: integer): T
// { … }`. The tags come first, then its arguments, which
// is the order a read gives them in.
function printProjection(name, body, names) {
  const tags = body.tags === undefined ? [] : body.tags;
  if (!Array.isArray(tags)) unprintable('its tags are not a list');
  const script = body.script;
  if (script !== undefined && (script === null || typeof script !== 'object' || Array.isArray(script))) unprintable('its script is not an object');
  if (script && script.arguments !== undefined) unprintable('its script states arguments, which are the projection\'s');
  const args = body.arguments === undefined ? [] : body.arguments;
  if (!Array.isArray(args) || (body.arguments !== undefined && !args.length)) unprintable('its arguments are not a non-empty list');
  const parameters = [
    ...tags.map((tag) => {
      if (!tag || typeof tag !== 'object' || Object.keys(tag).some((k) => k !== 'name' && k !== 'tagType')) unprintable('a tag is not { name, tagType }');
      return `tag ${sourceRef(tag.name, 'tag')}: ${sourceRef(tag.tagType, 'tag type')}`;
    }),
    ...args.map((p) => {
      if (!p || typeof p !== 'object' || Object.keys(p).some((k) => k !== 'name' && k !== 'propertyType')) unprintable('an argument is not { name, propertyType }');
      return `${sourceRef(p.name, 'parameter')}: ${sourceRef(p.propertyType, 'type')}`;
    }),
  ];
  // The kind is said once, in front; a body that is two kinds at once
  // has no spelling.
  if (body.derived !== undefined && script !== undefined) unprintable('it is both derived and scripted');
  const kind = body.derived !== undefined ? 'derived ' : script !== undefined ? 'scripted ' : '';
  let head = `${tags.length ? '' : 'untagged '}${kind}projection ${sourceDeclName(name)}`
    + (parameters.length ? ` (${parameters.join(', ')})` : '')
    + `: ${sourceRef(body.valueType, 'value type')}${body.isList ? '[]' : ''}`;
  if (body.derived !== undefined) {
    if (body.initialValue !== undefined) unprintable('it is derived and states an initial value');
    if (body.handlers !== undefined) unprintable('it is derived and states handlers');
    return `${head} {\n  ${sourceDerived(body.derived, sourceDerivedOperand(names))}\n}`;
  }
  if (body.initialValue !== undefined) head += ` = ${sourceLiteral(body.initialValue)}`;
  const lines = [head];
  if (body.handlers === undefined && script === undefined) return lines.join('\n');
  const items = [];
  if (script !== undefined) {
    if (script.tagFilter !== undefined) unprintable('its script states a tag filter – a projection declares its tags');
    if (script.initialState !== undefined) items.push(`initialState ${sourceJson(script.initialState, '  ')}`);
    if (script.exposes !== undefined) items.push(`exposes ${sourceRef(script.exposes, 'exposed field')}`);
  }
  for (const handler of body.handlers || []) {
    const event = sourceRef(handler.event, 'event');
    if (handler.code !== undefined) {
      if (handler.operation !== undefined || handler.value !== undefined) unprintable('a handler has both code and an operation');
      if (typeof handler.code !== 'string' || handler.code.includes('```')) unprintable('a handler\'s code cannot be fenced');
      items.push(`on ${event} => \`\`\`${handler.code}\`\`\``);
    } else {
      if (!OPERATIONS.includes(handler.operation)) unprintable(`a handler's operation ${JSON.stringify(handler.operation)} is not one the code form knows`);
      items.push(`on ${event} => ${handler.operation}`
        + (handler.value !== undefined ? ' ' + sourceHandlerOperand(handler.value) : ''));
    }
  }
  const tail = lines.length - 1;
  lines[tail] += items.length ? ` {\n${items.map((i) => '  ' + i).join('\n')}\n}` : ' {}';
  return lines.join('\n');
}

// How a command writes an operand – the inverse of `resolveCommandNames`,
// refusing whatever it would resolve differently.
function sourceCommandOperand(body, names) {
  const aliases = new Set((body.boundary || []).map((b) => b && b.alias));
  const parameters = new Set((body.properties || []).map((p) => p && p.name));
  return (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (value.parameterName !== undefined) {
        const head = sourceRef(value.parameterName, 'parameter');
        if (aliases.has(head)) unprintable(`"${head}" names both a payload property and an alias`);
        if (value.property === undefined) return head;
        if (!parameters.has(head)) unprintable(`it reads "${head}.${value.property}" from a payload property it does not declare`);
        return `${head}.${sourceRef(value.property, 'property')}`;
      }
      if (value.alias !== undefined) {
        const head = sourceRef(value.alias, 'alias');
        const declared = aliases.has(head);
        if (!declared && parameters.has(head)) unprintable(`"${head}" names both a payload property and an alias`);
        if (value.property === undefined) {
          if (!declared) unprintable(`it reads "${head}", which no alias here declares`);
          return head;
        }
        return `${head}.${sourceRef(value.property, 'property')}`;
      }
      if (value.projection !== undefined) {
        if (Object.keys(value).some((k) => !['projection', 'tags', 'arguments'].includes(k))) unprintable('an inline read carries extra fields');
        return sourceRead(value, names, sourceCommandOperand(body, names));
      }
      // A typed literal stands where a tag does; anywhere else it is no
      // value the code form can say.
      if (value.tagType !== undefined) unprintable('a tag literal stands outside a read');
    }
    return sourceLiteral(value);
  };
}

function printCommand(name, body, names) {
  const properties = body.properties || [];
  const boundary = body.boundary || [];
  const operand = sourceCommandOperand(body, names);

  const signature = properties.map(sourceProperty);
  const flat = `command ${sourceDeclName(name)}(${signature.join(', ')})`;
  const head = flat.length <= 96 ? flat
    : `command ${sourceDeclName(name)}(\n${signature.map((s) => '  ' + s + ',').join('\n')}\n)`;

  const reads = boundary.map((binding) => {
    if (!binding || typeof binding !== 'object') unprintable('an alias is not an object');
    const alias = sourceRef(binding.alias, 'alias') + (binding.isOptional === true ? '?' : '');
    if (binding.entity !== undefined && binding.projection === undefined) {
      if (binding.id === undefined) unprintable(`the alias "${binding.alias}" has no identifier`);
      if (Object.keys(binding).some((k) => !['alias', 'entity', 'id', 'excluding', 'isOptional', 'arguments'].includes(k))) {
        unprintable(`the alias "${binding.alias}" carries fields the code form does not know`);
      }
      const id = binding.id;
      const idText = id && typeof id === 'object' && !Array.isArray(id) && id.each !== undefined
        ? (Object.keys(id).length === 1 ? `each ${operand(id.each)}` : unprintable('an each carries extra fields'))
        : id && typeof id === 'object' && !Array.isArray(id) && id.tagType !== undefined ? sourceTagLiteral(id) : operand(id);
      const args = binding.arguments !== undefined && Object.keys(binding.arguments).length
        ? `, ${Object.entries(binding.arguments).map(([key, value]) => `${sourceRef(key, 'argument')}: ${operand(value)}`).join(', ')}` : '';
      let text = `alias ${alias} = ${sourceRef(binding.entity, 'entity')}(${idText}${args})`;
      if (binding.excluding !== undefined) text += ` excluding ${operand(binding.excluding)}`;
      return text;
    }
    if (binding.projection !== undefined && binding.entity === undefined) {
      if (Object.keys(binding).some((k) => !['alias', 'projection', 'tags', 'arguments', 'isOptional'].includes(k))) {
        unprintable(`the alias "${binding.alias}" carries fields a projection read does not have`);
      }
      return `alias ${alias} = ${sourceRead(binding, names, operand)}`;
    }
    return unprintable(`the alias "${binding.alias}" is neither an entity nor a projection`);
  });
  const rules = (body.conditions || []).map((c) => {
    if (!c || typeof c.rejection !== 'string') unprintable('a rule has no rejection message');
    return `require ${sourceCondition(c, operand)}\n  else reject ${JSON.stringify(c.rejection)}`;
  });
  const emits = (body.publishes || []).map((emission) => {
    const event = sourceRef(emission.name, 'event');
    let text = `emit ${event}`;
    if (emission.parameters !== undefined) {
      const fields = Object.entries(emission.parameters).map(([key, value]) => {
        const valueText = operand(value);
        return valueText === sourceRef(key, 'event property') ? key : `${key}: ${valueText}`;
      });
      const inline = `${text} { ${fields.join(', ')} }`;
      text = !fields.length ? `${text} {}`
        : inline.length <= 88 ? inline
          : `${text} {\n${fields.map((f) => '  ' + f + ',').join('\n')}\n}`;
    }
    const guards = emission.when || [];
    if (guards.length) text += `\n  when ${guards.map((c) => sourceCondition(c, operand)).join('\n   and ')}`;
    return text;
  });
  const groups = [reads, rules, emits].filter((group) => group.length);
  const annotations = sourceAnnotations(body, ['feature', 'icon']);
  if (!groups.length) return `${annotations}${head} {}`;
  const inner = groups.map((group) => group.map((line) => '  ' + line.replace(/\n/g, '\n  ')).join('\n')).join('\n\n');
  return `${annotations}${head} {\n${inner}\n}`;
}

const SOURCE_PRINTERS = {
  'custom-type-definition': printCustomType,
  'event-definition': printEvent,
  'entity-definition': printEntity,
  'projection-definition': printProjection,
  'command-definition': printCommand,
};

// The line saying why a definition is written as JSON. A reason can
// quote stored strings (a predicate, a tag key, an alias), and a line
// break in one would end the comment and print the rest as code – code
// an untouched text would then apply. So the reason is one line, always.
function sourceFallbackComment(reason) {
  return `// Written as JSON: ${String(reason).replace(/[\r\n\u2028\u2029]+/g, ' ')}.`;
}

function printJsonDefinition(kind, name, body) {
  return `${SOURCE_KEYWORD[kind]} ${sourceDeclName(name)} json ${JSON.stringify(body, null, 2)}`;
}

// One definition, in the grammar when it survives the trip back and as
// JSON under a comment saying why when it does not. Anything the
// printer trips over counts as "does not": the write path stores bodies
// of shapes no printer expects (a `null` in a list, a map that is not
// one), and a defective model must still show as code.
function printDefinitionSource(kind, name, body, names = {}) {
  let reason;
  try {
    const text = SOURCE_PRINTERS[kind](name, body, names);
    const back = parseModelSource(text, names);
    const parsed = back.collections[kind];
    const keys = Object.keys(parsed);
    if (back.diagnostics.length || keys.length !== 1 || keys[0] !== name || !sameDefinition(parsed[name], body)) {
      reason = 'it holds something the code form does not say exactly';
    } else {
      return text;
    }
  } catch (error) {
    reason = error instanceof SourceUnprintable ? error.message : 'it is not shaped the way the code form expects';
  }
  return `${sourceFallbackComment(reason)}\n${printJsonDefinition(kind, name, body)}`;
}

// ---------- scenarios ----------

// A payload value, written the way its type reads: an enum member bare,
// anything else as JSON. The parser reads a bare capitalised word back
// as the same string, so the type only decides the look, never what
// comes back.
function sourceScenarioValue(model, value, type) {
  if (Array.isArray(value)) {
    const element = type ? { typeName: type.typeName, isList: false } : null;
    return `[${value.map((v) => sourceScenarioValue(model, v, element)).join(', ')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const fields = type && !type.isList ? compositeFieldsOf(model, type.typeName) : null;
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    return `{ ${keys.map((key) => {
      const field = fields && fields.find((f) => f && f.name === key);
      const fieldType = field ? { typeName: field.propertyType, isList: false } : null;
      return `${sourceJsonKey(key)}: ${sourceScenarioValue(model, value[key], fieldType)}`;
    }).join(', ')} }`;
  }
  if (typeof value === 'string' && type && SOURCE_MEMBER_RE.test(value) && !['true', 'false', 'null'].includes(value)) {
    const members = enumMembersFor(model, type.typeName);
    if (members && members.includes(value)) return value;
  }
  return sourceJsonFlat(value);
}

// `{ key: value, … }` against the properties that type it.
function sourceScenarioPayload(model, properties, data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) unprintable('a payload is not an object');
  const typeOf = (key) => {
    const property = (properties || []).find((p) => p && p.name === key);
    return property ? { typeName: property.propertyType, isList: !!property.isList } : null;
  };
  const keys = Object.keys(data);
  if (!keys.length) return '{}';
  return `{ ${keys.map((key) => `${sourceJsonKey(key)}: ${sourceScenarioValue(model, data[key], typeOf(key))}`).join(', ')} }`;
}

function sourceEventPayload(model, eventName, data) {
  const event = model['event-definitions'][eventName];
  return sourceScenarioPayload(model, event && event.properties, data);
}

// A command scenario's outcome as `then` lines. A refusal names its rule
// in the rule's own syntax when the command still has a rule reading
// that way, and as the stored text in quotes when it does not – the
// scenario that drifted because its rule changed has to print too.
function sourceCommandThen(model, commandName, then) {
  if (!then || typeof then !== 'object' || Array.isArray(then)) unprintable('its outcome is not an object');
  if (then.outcome === 'published') {
    const events = then.events || [];
    if (!events.length) return ['then nothing'];
    return events.map((e, i) => {
      if (!e || typeof e !== 'object' || Object.keys(e).some((k) => k !== 'type' && k !== 'data')) unprintable('an event of its outcome is not { type, data }');
      return `${i ? 'and' : 'then'} ${sourceRef(e.type, 'event')} ${sourceEventPayload(model, e.type, e.data)}`;
    });
  }
  if (then.outcome !== 'rejected') unprintable(`its outcome ${JSON.stringify(then.outcome)} is not one the code form knows`);
  if (typeof then.rejection !== 'string') unprintable('its refusal names no message');
  return [`then rejected ${JSON.stringify(then.rejection)}`];
}

// A projection scenario's `then`: the projection, read the way a
// command reads it – its tags as literals that state their type, then
// its arguments, in the order it declares them – and the
// value it folds to.
function sourceProjectionThen(model, body) {
  const projection = model['projection-definitions'][body.projection];
  const slots = projectionSlots(projection);
  const typeOf = (key) => {
    const slot = slots.find((p) => p && p.name === key);
    return slot ? { typeName: slot.propertyType, isList: false } : null;
  };
  const argumentKeys = new Set(Object.keys((body.arguments && typeof body.arguments === 'object') ? body.arguments : {}));
  const call = sourceRead(body, sourceNamesOf(model), (value) => {
    // An argument is a payload value; a tag that is not a literal has no
    // spelling here – a scenario states its values.
    const key = [...argumentKeys].find((k) => body.arguments[k] === value);
    if (key === undefined) unprintable('a scenario is tagged by something other than a literal');
    return sourceScenarioValue(model, value, typeOf(key));
  });
  if (!('then' in body)) return `then ${call}`;
  const valueType = projection ? { typeName: projection.valueType, isList: !!projection.isList } : null;
  return `then ${call} == ${sourceScenarioValue(model, body.then, valueType)}`;
}

function printScenario(model, kind, body) {
  const known = kind === 'scenario-definition'
    ? ['name', 'given', 'command', 'when', 'then']
    : ['name', 'given', 'projection', 'tags', 'arguments', 'then'];
  if (Object.keys(body).some((key) => !known.includes(key))) unprintable('it carries fields the code form does not know');
  if (body.name !== undefined && typeof body.name !== 'string') unprintable('its name is not a string');
  const lines = (body.given || []).map((step, i) => {
    if (!step || typeof step !== 'object' || Object.keys(step).some((k) => k !== 'event' && k !== 'data')) {
      unprintable('a Given step is not { event, data }');
    }
    return `${i ? 'and' : 'given'} ${sourceRef(step.event, 'event')} ${sourceEventPayload(model, step.event, step.data)}`;
  });
  let label = '';
  if (kind === 'scenario-definition') {
    if (!body.when || typeof body.when !== 'object' || Object.keys(body.when).some((k) => k !== 'arguments')) {
      unprintable('its When is not { arguments }');
    }
    const command = model['command-definitions'][body.command];
    lines.push(`when ${sourceRef(body.command, 'command')} `
      + sourceScenarioPayload(model, command && command.properties, body.when.arguments));
    if (body.then !== undefined) lines.push(...sourceCommandThen(model, body.command, body.then));
    if (body.name === undefined && body.then !== undefined) label = `  // ${scenarioName(body)}`;
  } else {
    lines.push(sourceProjectionThen(model, body));
  }
  const head = body.name === undefined ? 'scenario' : `scenario ${JSON.stringify(body.name)}`;
  return `${head} {${label}\n${lines.map((line) => '  ' + line).join('\n')}\n}`;
}

// One scenario, in the grammar when it survives the trip back and as
// JSON under a comment when it does not – `printDefinitionSource`'s
// contract, for a definition keyed by an id the text never shows.
function printScenarioSource(model, kind, body) {
  let reason;
  try {
    const text = printScenario(model, kind, body);
    const back = parseModelSource(sourceScenarioGroup([text]), sourceNamesOf(model));
    const [record] = back.scenarios;
    if (!back.diagnostics.length && back.scenarios.length === 1 && record.kind === kind && sameDefinition(record.body, body)) {
      return text;
    }
    reason = 'it holds something the code form does not say exactly';
  } catch (error) {
    reason = error instanceof SourceUnprintable ? error.message : 'it is not shaped the way the code form expects';
  }
  return `${sourceFallbackComment(reason)}\nscenario json ${JSON.stringify(body, null, 2)}`;
}

const sourceIndent = (text) => text.split('\n').map((line) => (line ? '  ' + line : line)).join('\n');

// Printed scenarios as the one group they are written in.
function sourceScenarioGroup(scenarios) {
  return `scenarios {\n${scenarios.map(sourceIndent).join('\n\n')}\n}`;
}

// A block's text with its scenarios' group added at its end, opening
// the block if the definition printed without one (a derived projection).
function sourceNest(text, scenarios) {
  if (!scenarios.length) return text;
  const inner = sourceIndent(sourceScenarioGroup(scenarios));
  if (text.endsWith(' {}')) return `${text.slice(0, -1)}\n${inner}\n}`;
  if (text.endsWith('\n}')) return `${text.slice(0, -1)}\n${inner}\n}`;
  return `${text} {\n${inner}\n}`;
}

// The whole model. Definitions of one kind sit in their stored order –
// the text's order *is* the order an apply stores – and consecutive
// one-liners stay together, so twenty value types read as a table.
// Scenarios sit in a group at the end of their command's or
// projection's block; one whose subject is gone, or whose subject is
// printed as JSON, sits in a group at the end of the text instead.
function modelToSource(model) {
  const SUBJECT = {
    'scenario-definition': ['command-definition', 'command'],
    'projection-scenario-definition': ['projection-definition', 'projection'],
  };
  const nested = { 'command-definition': new Map(), 'projection-definition': new Map() };
  const loose = [];
  for (const kind of ID_KEYED_KINDS) {
    const [subjectKind, field] = SUBJECT[kind];
    for (const body of Object.values(model[DEF_COLLECTIONS[kind]] || {})) {
      const subject = body && body[field];
      const owner = typeof subject === 'string'
        && Object.prototype.hasOwnProperty.call(model[DEF_COLLECTIONS[subjectKind]], subject);
      if (!owner) { loose.push([kind, body]); continue; }
      const list = nested[subjectKind].get(subject) || [];
      list.push([kind, body]);
      nested[subjectKind].set(subject, list);
    }
  }
  const out = [`model ${JSON.stringify(model.name)}`];
  const names = sourceNamesOf(model);
  for (const kind of SOURCE_KINDS) {
    const entries = Object.entries(model[DEF_COLLECTIONS[kind]] || {});
    if (!entries.length) continue;
    out.push('', `// ${SOURCE_SECTION[kind]}`);
    let previousWasLine = false;
    entries.forEach(([name, body], index) => {
      let text = printDefinitionSource(kind, name, body, names);
      const own = (nested[kind] && nested[kind].get(name)) || [];
      if (text.startsWith('// Written as JSON')) loose.push(...own);
      else text = sourceNest(text, own.map(([k, b]) => printScenarioSource(model, k, b)));
      const oneLine = !text.includes('\n');
      if (index > 0 && !(oneLine && previousWasLine)) out.push('');
      out.push(text);
      previousWasLine = oneLine;
    });
  }
  if (loose.length) {
    out.push('', '// Scenarios', '',
      sourceScenarioGroup(loose.map(([kind, body]) => printScenarioSource(model, kind, body))));
  }
  return out.join('\n') + '\n';
}

// ---------- comparing ----------
//
// What Compare's Code tab shows: one definition as each side prints
// it, line against line. A longest common subsequence – definitions are
// a few dozen lines, so the plain table is fast enough and no library
// is worth its weight – with removals before additions inside a change,
// and a removed line paired with the added one at the same place in it
// compared again word by word, so a renamed argument reads as one.

function diffSequence(a, b) {
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { out.push(['same', i++, j++]); continue; }
    if (i < a.length && (j >= b.length || lcs[i + 1][j] >= lcs[i][j + 1])) out.push(['del', i++, null]);
    else out.push(['add', null, j++]);
  }
  return out;
}

// A line as parts, `{ text, changed }`, against the line it replaced.
function diffWords(line, other) {
  const tokens = (text) => text.match(/\w+|\s+|[^\w\s]/g) || [];
  const mine = tokens(line);
  const theirs = tokens(other);
  const parts = [];
  for (const [k, i, j] of diffSequence(theirs, mine)) {
    if (k === 'del') continue;
    const text = mine[j];
    const changed = k === 'add';
    const last = parts[parts.length - 1];
    if (last && last.changed === changed) last.text += text;
    else parts.push({ text, changed });
  }
  return parts;
}

function diffLines(older, newer) {
  const lines = (text) => (text ? text.replace(/\n$/, '').split('\n') : []);
  const a = lines(older);
  const b = lines(newer);
  const rows = diffSequence(a, b).map(([k, i, j]) => ({
    k, o: i === null ? null : i + 1, n: j === null ? null : j + 1, text: k === 'add' ? b[j] : a[i],
  }));
  for (let start = 0; start < rows.length;) {
    if (rows[start].k === 'same') { start++; continue; }
    let end = start;
    while (end < rows.length && rows[end].k !== 'same') end++;
    const dels = rows.slice(start, end).filter((r) => r.k === 'del');
    const adds = rows.slice(start, end).filter((r) => r.k === 'add');
    for (let p = 0; p < Math.min(dels.length, adds.length); p++) {
      dels[p].parts = diffWords(dels[p].text, adds[p].text);
      adds[p].parts = diffWords(adds[p].text, dels[p].text);
    }
    start = end;
  }
  return rows;
}

// One definition – or scenario, by id – as each model prints it; a
// side without it prints nothing, so the whole is added or removed.
function definitionSourceDiff(older, newer, kind, name) {
  const text = (model) => {
    const body = model && model[DEF_COLLECTIONS[kind]] && model[DEF_COLLECTIONS[kind]][name];
    if (body === undefined) return '';
    return isIdKeyed(kind) ? printScenarioSource(model, kind, body) : printDefinitionSource(kind, name, body, sourceNamesOf(model));
  };
  return diffLines(text(older), text(newer));
}

// Printed once per log revision, the way every other derived view is.
let sourceCache = null;
function modelSource(model) {
  if (sourceCache && sourceCache.revision === logRevisionNow() && sourceCache.model === model) return sourceCache.text;
  const text = modelToSource(model);
  sourceCache = { revision: logRevisionNow(), model, text };
  return text;
}

// ============================================================
// Reading a text against the model it would replace.
// ============================================================

// The model the text describes, as if it had been applied: its own
// definitions, with the model's scenarios alongside since the text
// leaves those alone. Never stored – what the editor asks questions of
// (advisories, a command's boundary) before anything is written.
function sourceDraftModel(model, parsed) {
  const draft = { id: model.id, name: parsed.name || model.name };
  for (const kind of DEF_KINDS) {
    draft[DEF_COLLECTIONS[kind]] = SOURCE_KINDS.includes(kind)
      ? parsed.collections[kind] : model[DEF_COLLECTIONS[kind]];
  }
  return draft;
}

// What the advisories would say about the text if it were applied.
function sourceAdvisories(model, parsed) {
  const draft = sourceDraftModel(model, parsed);
  const found = [];
  for (const kind of SOURCE_KINDS) {
    for (const [name, body] of Object.entries(parsed.collections[kind])) {
      for (const message of definitionAdvisories(draft, kind, name, body)) found.push({ kind, name, message });
    }
  }
  return found;
}

// What each `alias` adds to its command's append condition, as the text
// stands. `alias course = Course[courseId]` names an instance, not what
// is queried of it: only the properties a rule, guard or emission
// actually uses put their projections' events in the query
// (`deriveDcb`), so a command testing `course.status` never conflicts
// with a `CourseCapacityChanged`. The line says the opposite at a
// glance, which is why the editor says beside it how many event types
// it reads (`hint`, in the command line's words: "reads 2 types") and
// the rest – the types themselves, tag, per-property events, the
// properties left out, why the read is made – on hover. One whose
// properties nothing uses is queried by tag alone, every event under
// it, and the hint says so rather than reading as empty.
function sourceReadQueries(model, parsed) {
  const draft = sourceDraftModel(model, parsed);
  const found = [];
  for (const [command, body] of Object.entries(parsed.collections['command-definition'])) {
    let dcb;
    let references;
    try {
      dcb = deriveDcb(draft, body);
      references = bindingReferences(draft, body);
    } catch { continue; }
    for (const binding of body.boundary || []) {
      const slots = (binding && parsed.marks.get(binding)) || {};
      // A derived read is several queries; the hint says them as one.
      const parts = dcb.items.filter((i) => i.alias === binding.alias);
      if (!slots.statement || !slots.statementEnd || !parts.length) continue;
      const item = {
        ...parts[0],
        tags: uniq(parts.flatMap((part) => part.tags)),
        types: uniq(parts.flatMap((part) => part.types)).sort(),
        fannedOut: parts.some((part) => part.fannedOut),
      };
      const entity = binding.entity !== undefined ? draft['entity-definitions'][binding.entity] : null;
      const properties = ((entity && entity.properties) || []).filter((p) => p && p.name);
      const read = properties.filter((p) => item.readProperties.includes(p.name));
      const reasons = [...(references.get(binding.alias) || [])];
      const types = item.types.length
        ? `${item.types.length} type${item.types.length === 1 ? '' : 's'}` : 'any type';
      found.push({
        command,
        alias: binding.alias,
        start: slots.statement,
        end: slots.statementEnd,
        tags: item.tags,
        types: item.types,
        fannedOut: !!item.fannedOut,
        properties: read.map((p) => ({ name: p.name, types: projectionHandledTypes(draft, p.projection).sort() })),
        unread: properties.filter((p) => !read.includes(p)).map((p) => p.name),
        reasons,
        hint: `‹reads ${types}${item.fannedOut ? ', one per element' : ''}${reasons.length ? '' : ' – unused'}›`,
      });
    }
  }
  return found;
}

// What each command reads in all, for its header line: the summary
// every view gives (`boundarySummary` – "reads 5 types, 2 tags, in 2
// queries") and the queries behind it, for the hover. `start`/`end`
// span the header, from the line the name is on to its `{`.
function sourceCommandQueries(model, parsed) {
  const draft = sourceDraftModel(model, parsed);
  const found = [];
  for (const [command, body] of Object.entries(parsed.collections['command-definition'])) {
    const open = (parsed.marks.get(body) || {}).open;
    const span = sourceSpanOf(parsed, 'command-definition', command);
    if (!open || !span) continue;
    let summary;
    try { summary = boundarySummary(draft, body); } catch { continue; }
    found.push({
      command, start: { line: span.nameLine, col: 1 }, end: open,
      ...summary, hint: `‹${summary.words}›`,
    });
  }
  return found;
}

// The definition a 1-based line falls in, if any.
function sourceSpanAt(parsed, line) {
  return parsed.spans.find((span) => line >= span.line && line <= span.endLine) || null;
}

function sourceSpanOf(parsed, kind, name) {
  return parsed.spans.find((span) => span.kind === kind && span.name === name) || null;
}

// ---------- scenarios, against the text ----------

// What an apply stores for one written scenario, and what the editor
// says about it while it is still a draft: optional properties left
// out are written as null (as the page's save does), and an omitted
// Then is what the text's definitions make of the scenario.
function completeScenario(draft, record) {
  const body = deepClone(record.body);
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const fill = (properties, data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    for (const property of properties || []) {
      if (property && property.isOptional && !has(data, property.name)) data[property.name] = null;
    }
  };
  const eventProperties = (name) => {
    const event = draft['event-definitions'][name];
    return event && event.properties;
  };
  for (const step of body.given || []) if (step) fill(eventProperties(step.event), step.data);
  const command = record.kind === 'scenario-definition' && draft['command-definitions'][body.command];
  if (command && body.when) fill(command.properties, body.when.arguments);
  if (body.then && body.then.outcome === 'published') {
    for (const event of body.then.events || []) if (event) fill(eventProperties(event.type), event.data);
  }

  let actual = null;
  let reason = null;
  try {
    actual = record.kind === 'scenario-definition' ? deriveThen(draft, body) : deriveProjectionScenarioThen(draft, body);
  } catch (error) {
    reason = error && error.message ? error.message : String(error);
  }
  if (!('then' in body)) {
    if (reason) return { body, reason, error: `This scenario cannot run, so there is no outcome to record: ${reason}` };
    body.then = actual;
    return { body, status: 'recorded', actual };
  }
  if (reason) return { body, status: 'broken', reason };
  return { body, status: evSameOutcome(actual, body.then) ? 'current' : 'drifted', actual };
}

const SCENARIO_SUBJECT = { 'scenario-definition': 'command', 'projection-scenario-definition': 'projection' };

// The scenario collections the text describes, keyed by the ids they
// already have. A scenario carries no id in the text, so which stored
// one a block *is* is matched: an unchanged block by its content, an
// edited one by its place among its subject's scenarios, one whose
// subject was renamed by its place among the leftovers – and whatever
// is still unmatched is new.
//
// The collection order keeps the stored interleaving of subjects and
// takes each subject's own order from the text, so an untouched text
// reorders nothing.
function sourceScenarioCollections(model, parsed) {
  const draft = sourceDraftModel(model, parsed);
  const errors = [];
  const recorded = [];
  const collections = {};
  for (const kind of ID_KEYED_KINDS) {
    const field = SCENARIO_SUBJECT[kind];
    const stored = model[DEF_COLLECTIONS[kind]] || {};
    const written = parsed.scenarios.filter((r) => r.kind === kind).map((record) => {
      const done = completeScenario(draft, record);
      if (done.error) errors.push({ record, message: done.error });
      if (done.status === 'recorded') recorded.push(record);
      return { record, body: done.body };
    });
    const free = new Set(Object.keys(stored));
    const ids = new Array(written.length).fill(null);
    const claim = (index, id) => { ids[index] = id; free.delete(id); };
    written.forEach((w, i) => {
      const hit = [...free].find((id) => sameDefinition(stored[id], w.body));
      if (hit) claim(i, hit);
    });
    const textSubjects = new Set(written.map((w) => w.body[field]));
    const pair = (eligible) => {
      written.forEach((w, i) => {
        if (ids[i]) return;
        const hit = [...free].find((id) => eligible(stored[id], w));
        if (hit) claim(i, hit);
      });
    };
    pair((body, w) => body && body[field] === w.body[field]);
    pair((body) => body && !textSubjects.has(body[field]));
    written.forEach((w, i) => { if (!ids[i]) ids[i] = generateId(); });

    const queues = new Map();
    written.forEach((w, i) => {
      const queue = queues.get(w.body[field]) || [];
      queue.push(i);
      queues.set(w.body[field], queue);
    });
    const order = [];
    const placed = new Set();
    for (const id of Object.keys(stored)) {
      const index = ids.indexOf(id);
      if (index < 0) continue;
      const queue = queues.get(written[index].body[field]);
      const nextIndex = queue && queue.shift();
      if (nextIndex === undefined) continue;
      order.push(nextIndex);
      placed.add(nextIndex);
    }
    written.forEach((w, i) => { if (!placed.has(i)) order.push(i); });
    const out = {};
    for (const i of order) sourcePut(out, ids[i], written[i].body);
    collections[kind] = out;
  }
  return { collections, errors, recorded };
}

// A scenario's outcome as its `then` lines, or null where it cannot be
// written – then there is no fix to offer.
function sourceThenLines(draft, record, actual) {
  try {
    return record.kind === 'scenario-definition'
      ? sourceCommandThen(draft, record.body.command, actual)
      : [sourceProjectionThen(draft, { ...record.body, then: actual })];
  } catch { return null; }
}

// The outcomes the scenario a line sits in could be written with, when
// it has no Then yet – what completion offers where its Then is being
// written. The line being typed is left out of the parse, since half a
// then does not read; the rest of the text has to, as far as that
// scenario. A command's scenario has one outcome. A projection's is a
// value read with tag values, so the read the line already names is
// the one asked, and where it names none, each read the given events
// can tag – their properties of each tag's type – is tried. A script
// that takes arguments is not guessed at. Each outcome is its lines,
// and for a projection its read and its value apart (`call`, `value`).
function sourceOutcomesAt(model, text, line) {
  const lines = String(text).split('\n');
  const typed = lines[line - 1];
  const indent = typed.match(/^\s*/)[0];
  const at = (lineText) => {
    lines[line - 1] = lineText;
    const parsed = parseModelSource(lines.join('\n'));
    const record = parsed.scenarios.find((r) => r.span && r.span.line < line && line <= r.span.endLine);
    return { parsed, record };
  };
  const outcome = (parsed, record) => {
    if (!record || 'then' in record.body) return null;
    const draft = sourceDraftModel(model, parsed);
    const done = completeScenario(draft, record);
    if (done.status !== 'recorded') return null;
    const then = sourceThenLines(draft, record, done.actual);
    if (!then) return null;
    if (record.kind === 'scenario-definition') return { lines: then };
    let head;
    try { head = sourceProjectionThen(draft, record.body) + ' == '; } catch { return { lines: then }; }
    return then[0].startsWith(head) ? { lines: then, call: head.slice('then '.length, -' == '.length), value: then[0].slice(head.length) } : { lines: then };
  };
  const { parsed, record } = at('');
  if (!record || 'then' in record.body) return [];
  if (record.kind === 'scenario-definition') {
    const one = outcome(parsed, record);
    return one ? [one] : [];
  }
  const named = typed.match(/^\s*then\s+([A-Za-z_]\w*\s*\(.*\))\s*(==\s*)?$/);
  const draft = sourceDraftModel(model, parsed);
  let calls;
  if (named) {
    calls = [named[1]];
  } else {
    const name = record.subject;
    const projection = draft['projection-definitions'][name];
    if (!projection || projectionSlots(projection).length) return [];
    const valuesOf = (tagType) => {
      const found = [];
      for (const step of record.body.given || []) {
        const event = step && draft['event-definitions'][step.event];
        for (const property of (event && event.properties) || []) {
          const value = step.data && step.data[property.name];
          if (property && property.propertyType === tagType && !property.isList
            && (typeof value === 'string' || typeof value === 'number') && !found.includes(value)) found.push(value);
        }
      }
      return found;
    };
    let combos = [[]];
    for (const tag of projection.tags || []) {
      combos = combos.flatMap((combo) => valuesOf(tag.tagType).map((value) => [...combo, `${tag.tagType}(${JSON.stringify(value)})`]));
    }
    calls = combos.slice(0, 8).map((combo) => `${name}(${combo.join(', ')})`);
  }
  return calls.map((call) => {
    const { parsed: withCall, record: asked } = at(`${indent}then ${call}`);
    return outcome(withCall, asked);
  }).filter(Boolean);
}

// What the editor says about each scenario of a draft: an error where
// one cannot be recorded, a warning where it is broken or drifted, and
// for a drift the `then` lines that would accept what the model now
// does – the quick fix.
// A scenario the text writes without a Then is an error too: the text
// says everything the model stores, so the outcome is written in, by
// its fix – or by one that writes every missing outcome at once –
// never recorded unseen by an apply. `recordOutcomes` is the agent's
// path, where an omitted Then is recorded and only one that cannot
// run is refused (`applyModelSource`).
function sourceScenarioReport(model, parsed, { recordOutcomes = false } = {}) {
  const draft = sourceDraftModel(model, parsed);
  const errors = [];
  const warnings = [];
  const missing = [];
  const thenLines = (record, done) => sourceThenLines(draft, record, done.actual);
  for (const record of parsed.scenarios) {
    const done = completeScenario(draft, record);
    const at = { line: record.head.line, col: record.head.col, endLine: record.head.endLine, endCol: record.head.endCol };
    if (done.error) {
      errors.push({ severity: 'error', message: recordOutcomes ? done.error : `No outcome – cannot run: ${done.reason}`, ...at });
      continue;
    }
    if (done.status === 'recorded') {
      if (recordOutcomes) continue;
      const lines = thenLines(record, done);
      const error = {
        severity: 'error',
        message: 'No outcome yet – the model now does:\n' + (lines ? lines.join('\n') : JSON.stringify(done.actual)),
        ...at,
      };
      if (lines && record.thenRange) {
        // A projection read with no value: the line is written whole.
        error.fix = { ...record.thenRange, text: lines.join('\n' + ' '.repeat(record.thenRange.col - 1)) };
      } else if (lines && record.bodyEnd) {
        const indent = '\n' + ' '.repeat(record.bodyCol - 1);
        error.fix = { ...record.bodyEnd, endLine: record.bodyEnd.line, endCol: record.bodyEnd.col, text: indent + lines.join(indent) };
      }
      if (error.fix) Object.assign(error.fix, { title: 'Write actual outcome', label: 'Write' });
      if (error.fix) missing.push(error);
      errors.push(error);
      continue;
    }
    if (done.status === 'broken') {
      warnings.push({ message: `Broken – ${done.reason}`, ...at });
      continue;
    }
    if (done.status !== 'drifted') continue;
    const lines = thenLines(record, done);
    const warning = { message: 'Drifted – the model now does:\n' + (lines ? lines.join('\n') : JSON.stringify(done.actual)), ...at };
    if (lines && record.thenRange) {
      warning.fix = {
        ...record.thenRange,
        text: lines.join('\n' + ' '.repeat(record.thenRange.col - 1)),
        title: 'Accept actual outcome', label: 'Accept',
      };
    }
    warnings.push(warning);
  }
  if (missing.length > 1) {
    const edits = missing.map(({ fix }) => ({ line: fix.line, col: fix.col, endLine: fix.endLine, endCol: fix.endCol, text: fix.text }));
    for (const error of missing) error.fixAll = { edits, title: 'Write all actual outcomes', label: 'All' };
  }
  return { errors, warnings };
}

// Parses, refuses on any error, and writes the difference – one
// append, one undo step, nothing at all when nothing changed. An
// identifier type the text left implicit keeps whatever the model
// already says about it, and its place, so leaving `tag type CourseId
// = string` out of a hand-written file does not reset a pattern
// someone gave it on the Types page. And one is only ever *created*
// for an entity the text adds, the way creating one on its page does:
// an existing entity whose identifier type is missing keeps it missing,
// which is a dangling reference the advisories report, not something an
// apply should quietly repair.
// `options.refuseRemovals` refuses a text that leaves a definition or
// scenario out, rather than removing it (see replaceDefinitions).
// A scenario written without a Then is refused, as the editor refuses
// it – unless `options.recordOutcomes`, the agent's path: no one is
// asked to predict an outcome there, so it is recorded, and the summary
// says which (`recorded`).
function applyModelSource(modelId, text, options = {}) {
  const parsed = parseModelSource(text);
  const errors = parsed.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length) {
    const first = errors[0];
    throw new DomainError(`${errors.length} error${errors.length === 1 ? '' : 's'} in the code – nothing was `
      + `applied. Line ${first.line}: ${first.message}`);
  }
  const model = getCtxOrThrow(modelId);
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const current = model['custom-type-definitions'];
  const types = parsed.collections['custom-type-definition'];
  const entities = parsed.collections['entity-definition'];
  const ownersAreNew = (typeName) => Object.entries(entities)
    .filter(([name, body]) => ((body && body.identifierType) || name + 'Id') === typeName)
    .every(([name]) => !has(model['entity-definitions'], name));
  const dropped = parsed.implicit.filter((name) => !has(current, name) && !ownersAreNew(name));
  const implicit = new Set(parsed.implicit.filter((name) => has(current, name)));
  if (implicit.size || dropped.length) {
    const order = Object.keys(types).filter((name) => !implicit.has(name) && !dropped.includes(name));
    const currentOrder = Object.keys(current);
    for (const name of implicit) {
      let insertAt = 0;
      for (let k = currentOrder.indexOf(name) - 1; k >= 0; k -= 1) {
        const position = order.indexOf(currentOrder[k]);
        if (position >= 0) { insertAt = position + 1; break; }
      }
      order.splice(insertAt, 0, name);
    }
    const merged = {};
    for (const name of order) sourcePut(merged, name, implicit.has(name) ? current[name] : types[name]);
    parsed.collections['custom-type-definition'] = merged;
  }
  const scenarios = sourceScenarioCollections(model, parsed);
  if (scenarios.errors.length) {
    const [first] = scenarios.errors;
    throw new DomainError(`${scenarios.errors.length} scenario${scenarios.errors.length === 1 ? '' : 's'} cannot be `
      + `recorded – nothing was applied. Line ${first.record.head.line}: ${first.message}`);
  }
  if (scenarios.recorded.length && !options.recordOutcomes) {
    const [first] = scenarios.recorded;
    throw new DomainError(`${scenarios.recorded.length} scenario${scenarios.recorded.length === 1 ? ' has' : 's have'} `
      + `no then – nothing was applied. Line ${first.head.line}: write the outcome in.`);
  }
  const summary = replaceDefinitions(modelId, {
    name: parsed.name,
    collections: { ...parsed.collections, ...scenarios.collections },
    refuseRemovals: !!options.refuseRemovals,
  });
  summary.recorded = scenarios.recorded.map((record) => ({
    line: record.head.line, subject: record.subject, name: record.body.name === undefined ? null : record.body.name,
  }));
  return summary;
}

// What an apply did, in a line.
function sourceApplySummary(summary) {
  const parts = [];
  const count = (list, verb) => {
    const definitions = list.filter((item) => !isIdKeyed(item.kind));
    const scenarios = list.length - definitions.length;
    if (definitions.length === 1) parts.push(`${verb} ${SOURCE_KEYWORD[definitions[0].kind]} ${definitions[0].name}`);
    else if (definitions.length) parts.push(`${verb} ${definitions.length}`);
    if (scenarios) parts.push(`${verb} ${scenarios} scenario${scenarios === 1 ? '' : 's'}`);
  };
  count(summary.added, 'added');
  count(summary.updated, 'updated');
  count(summary.removed, 'removed');
  if (summary.reordered.length) parts.push('reordered');
  if (summary.renamed) parts.push(`renamed the model to "${summary.renamed}"`);
  const recorded = summary.recorded || [];
  if (recorded.length) {
    parts.push(`recorded the outcome of ${recorded.length === 1 ? 'the scenario' : `${recorded.length} scenarios`} written without a then (`
      + recorded.map((r) => `line ${r.line}, ${r.subject}${r.name === null ? '' : ` "${r.name}"`}`).join('; ') + ')');
  }
  return parts.length ? parts.join(', ') : 'nothing changed';
}

// ============================================================
// The language service: what the editor knows about a text beyond
// whether it parses – which definition each name in it stands for
// (go to definition, references, a rename that cannot hit a
// look-alike) and what may be written at the cursor (completion).
// Pure like the rest of this file; index.html only adapts it to
// Monaco's providers.
// ============================================================

// A symbol is a string: its kind, then the names that place it –
// `member CourseStatus Existent`, `alias DefineCourse course`. Two
// names are the same symbol exactly when these are equal, which is what
// keeps `Existent` apart from `NonExistent`, and the projection called
// CourseStatus apart from the enum of the same name.
const SOURCE_SYMBOL_WORDS = {
  type: 'type', event: 'event', entity: 'entity', projection: 'projection', command: 'command',
  member: 'enum member', field: 'record field', eventProperty: 'event property',
  entityProperty: 'entity property', commandProperty: 'command property', alias: 'alias',
  projectionParameter: 'projection parameter', projectionTag: 'projection tag', entityTag: 'entity tag',
};

const SOURCE_KIND_SYMBOL = {
  'custom-type-definition': 'type',
  'event-definition': 'event',
  'entity-definition': 'entity',
  'projection-definition': 'projection',
  'command-definition': 'command',
};

const sourceSymbol = (kind, ...names) => [kind, ...names].join(' ');

function sourceSymbolParts(symbol) {
  const [kind, ...names] = symbol.split(' ');
  return { kind, names, name: names[names.length - 1], owner: names.length > 1 ? names[0] : null };
}

// The definitions a text declares, in the shape the model helpers read
// (`resolveOperandType`, `operationsFor`, …) – optionally over a stored
// model, whose definitions fill in for any the text does not hold, as a
// declaration that fails to parse while it is being typed.
function sourceTextModel(parsed, fallback) {
  const model = {};
  for (const kind of DEF_KINDS) {
    const own = SOURCE_KINDS.includes(kind) ? parsed.collections[kind] : {};
    model[DEF_COLLECTIONS[kind]] = fallback ? { ...(fallback[DEF_COLLECTIONS[kind]] || {}), ...own } : own;
  }
  return model;
}

// Every name in a parsed text, resolved: `occurrences` (`{ symbol,
// token, decl, shorthand }`), `ambiguous` (an enum member some other
// enum also has, written where nothing says which type is meant) and
// `opaque` (a script, a json body, a tag filter – text a name may hide
// in without the grammar seeing it, which a rename has to refuse over
// rather than silently miss).
//
// It walks the bodies, not the tokens: the parser marked which token
// each part came from (`parsed.marks`), and the bodies say what that
// part *is* – whose property `course.status` reads is the read's
// entity's, and which enum `Existent` belongs to is the type on the
// other side of its rule. `{ courseId }` is one token and two symbols,
// the emitted event's property and the command's own, told apart by
// `shorthand: 'key' | 'value'`.
function sourceSymbols(parsed) {
  if (parsed.symbols) return parsed.symbols;
  const { collections, marks } = parsed;
  const model = sourceTextModel(parsed);
  const has = (object, key) => !!object && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key);
  const slotsOf = (object) => (object && typeof object === 'object' && marks && marks.get(object)) || {};
  const occurrences = [];
  const ambiguous = [];
  const opaque = [];
  const shorthands = new Set();
  const add = (symbol, token, extra = {}) => {
    if (!token) return;
    const shorthand = extra.shorthand || (shorthands.has(token) ? 'value' : undefined);
    occurrences.push({ symbol, token, decl: !!extra.decl, ...(shorthand ? { shorthand } : {}) });
  };
  const types = collections['custom-type-definition'];
  const events = collections['event-definition'];
  const entities = collections['entity-definition'];
  const projections = collections['projection-definition'];
  const commands = collections['command-definition'];
  const own = (collection, name) => (typeof name === 'string' && has(collection, name) ? collection[name] : null);
  const list = (value) => (Array.isArray(value) ? value.filter((x) => x && typeof x === 'object') : []);
  const membersOf = (typeName) => {
    const body = own(types, typeName);
    const members = body && body.schema && body.schema.enum;
    return Array.isArray(members) ? members : [];
  };
  const recordFields = (typeName) => {
    const body = own(types, typeName);
    return body && Array.isArray(body.properties) ? list(body.properties) : null;
  };
  const typeRef = (token) => {
    if (token && !SOURCE_BASE_TYPES.includes(token.v)) add(sourceSymbol('type', token.v), token);
  };
  const member = (token, name, typeName) => {
    if (!token || typeof name !== 'string') return;
    const owners = Object.keys(types).filter((t) => membersOf(t).includes(name));
    const owner = owners.includes(typeName) ? typeName : owners.length === 1 ? owners[0] : null;
    if (owner) add(sourceSymbol('member', owner, name), token);
    else if (owners.length) ambiguous.push({ token, name, candidates: owners.map((o) => sourceSymbol('member', o, name)) });
  };
  const literal = (value, typeName) => {
    if (Array.isArray(value)) return value.forEach((v) => literal(v, typeName));
    if (has(value, 'enumMember')) member(slotsOf(value).enumMember, value.enumMember, typeName);
  };
  const declare = (kind, name, body) => {
    const slots = slotsOf(body);
    add(sourceSymbol(kind, name), slots.declName, { decl: true });
    if (slots.json) { opaque.push({ token: slots.json, text: JSON.stringify(body), json: true }); return false; }
    return true;
  };
  const parameters = (projection) => list(projection && projection.arguments);
  // A read's tags, by name: a literal names its tag type, anything else
  // is an operand in the read's scope.
  const tagOperands = (tags, operandOf) => {
    const values = tags && typeof tags === 'object' && !Array.isArray(tags) ? Object.values(tags) : [];
    values.forEach(function one(tag) {
      if (has(tag, 'each')) one(tag.each);
      else if (has(tag, 'tagType')) typeRef(slotsOf(tag).tagType);
      else if (operandOf) operandOf(tag);
    });
  };
  const parameterType = (projectionName, key) => {
    const found = parameters(own(projections, projectionName)).find((p) => p.name === key);
    return found ? found.propertyType : null;
  };
  // `name: value` pairs, keyed by the symbol each key names.
  const keyed = (args, symbolOf, value) => {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return;
    const slots = slotsOf(args);
    for (const key of Object.keys(args)) {
      const short = slots['short:' + key];
      if (short) shorthands.add(short);
      const symbols = [].concat(symbolOf(key) || []);
      for (const symbol of symbols) add(symbol, slots['key:' + key], short ? { shorthand: 'key' } : {});
      value(args[key], key);
    }
  };

  // ---------- types, events, entities ----------
  for (const [name, body] of Object.entries(types)) {
    if (!declare('type', name, body)) continue;
    const members = body && body.schema && body.schema.enum;
    if (Array.isArray(members)) {
      const slots = slotsOf(members);
      members.forEach((m, i) => add(sourceSymbol('member', name, m), slots['i:' + i], { decl: true }));
    }
    for (const field of list(body && body.properties)) {
      add(sourceSymbol('field', name, field.name), slotsOf(field).name, { decl: true });
      typeRef(slotsOf(field).propertyType);
    }
  }
  for (const [name, body] of Object.entries(events)) {
    if (!declare('event', name, body)) continue;
    for (const property of list(body.properties)) {
      add(sourceSymbol('eventProperty', name, property.name), slotsOf(property).name, { decl: true });
      typeRef(slotsOf(property).propertyType);
    }
    (Array.isArray(body.tags) ? body.tags : []).forEach((path, index) => {
      if (typeof path !== 'string') return;
      const [propertyName, fieldName] = path.split('.');
      add(sourceSymbol('eventProperty', name, propertyName), slotsOf(body)[`tag:${index}:property`]);
      const property = list(body.properties).find((p) => p && p.name === propertyName);
      if (fieldName !== undefined && property) {
        add(sourceSymbol('field', property.propertyType, fieldName), slotsOf(body)[`tag:${index}:field`]);
      }
    });
  }
  for (const [name, body] of Object.entries(entities)) {
    if (!declare('entity', name, body)) continue;
    const slots = slotsOf(body);
    add(sourceSymbol('entityTag', name, slots.identifierName ? slots.identifierName.v : ''), slots.identifierName, { decl: true });
    typeRef(slots.identifierType);
    if (slots.lifecycle) add(sourceSymbol('entityProperty', name, body.lifecycle), slots.lifecycle);
    for (const property of list(body.properties)) {
      add(sourceSymbol('entityProperty', name, property.name), slotsOf(property).name, { decl: true });
      add(sourceSymbol('projection', property.projection), slotsOf(property).projection);
    }
  }

  // ---------- projections ----------
  const handlerValue = (value, typeName, event) => {
    if (has(value, 'eventProperty')) add(sourceSymbol('eventProperty', event, value.eventProperty), slotsOf(value).eventProperty);
    else if (has(value, 'successor')) handlerValue(value.successor, typeName, event);
    else literal(value, typeName);
  };
  for (const [name, body] of Object.entries(projections)) {
    if (!declare('projection', name, body)) continue;
    const slots = slotsOf(body);
    for (const tag of list(body.tags)) {
      add(sourceSymbol('projectionTag', name, tag.name), slotsOf(tag).name, { decl: true });
      typeRef(slotsOf(tag).tagType);
    }
    for (const parameter of list(body.arguments)) {
      add(sourceSymbol('projectionParameter', name, parameter.name), slotsOf(parameter).name, { decl: true });
      typeRef(slotsOf(parameter).propertyType);
    }
    typeRef(slots.valueType);
    literal(body.initialValue, body.valueType);
    if (slots.initialState && body.script) opaque.push({ token: slots.initialState, text: JSON.stringify(body.script.initialState) });
    for (const handler of list(body.handlers)) {
      add(sourceSymbol('event', handler.event), slotsOf(handler).event);
      if (typeof handler.code === 'string') opaque.push({ token: slotsOf(handler).code, text: handler.code });
      if (handler.value !== undefined) handlerValue(handler.value, body.valueType, handler.event);
    }
    if (body.derived && typeof body.derived === 'object') {
      const typeOf = (operand) => {
        if (has(operand, 'projection')) { const p = own(projections, operand.projection); return p ? p.valueType : null; }
        if (has(operand, 'parameterName')) {
          const found = [...list(body.tags).map((t) => [t.name, t.tagType]), ...list(body.arguments).map((a) => [a.name, a.propertyType])]
            .find(([n]) => n === operand.parameterName);
          return found ? found[1] : null;
        }
        return null;
      };
      // A name is one of this projection's own parameters – a tag or an
      // argument, as it declares it – whether compared, computed with or
      // passed on.
      const ownRef = (ref) => add(sourceSymbol(
        list(body.tags).some((t) => t.name === ref.parameterName) ? 'projectionTag' : 'projectionParameter',
        name, ref.parameterName,
      ), slotsOf(ref).parameter);
      const operand = (value, expected) => {
        if (Array.isArray(value)) return value.forEach((v) => operand(v, expected));
        const marked = slotsOf(value);
        if (has(value, 'parameterName')) ownRef(value);
        else if (has(value, 'projection')) {
          add(sourceSymbol('projection', value.projection), marked.projection);
          tagOperands(value.tags, (tag) => { if (has(tag, 'parameterName')) ownRef(tag); });
          keyed(value.arguments, (key) => sourceSymbol('projectionParameter', value.projection, key),
            (arg, key) => operand(arg, parameterType(value.projection, key)));
        } else literal(value, expected);
      };
      const { leftHandSide, rightHandSide } = body.derived;
      operand(leftHandSide, typeOf(rightHandSide));
      if (rightHandSide !== undefined) operand(rightHandSide, typeOf(leftHandSide));
    }
  }

  // ---------- commands ----------
  // A name in a scenario's rule is still `%ref` – resolved here against
  // the command it is about, by the rule `resolveCommandNames` uses.
  const commandOperand = (commandName, body, value, expected) => {
    if (Array.isArray(value)) return value.forEach((v) => commandOperand(commandName, body, v, expected));
    const marked = slotsOf(value);
    let alias;
    let parameter;
    let property;
    if (has(value, '%ref')) {
      const [head, prop] = value['%ref'];
      const asRead = list(body.boundary).some((b) => b.alias === head)
        || (!list(body.properties).some((p) => p.name === head) && prop !== undefined);
      if (asRead) alias = head; else parameter = head;
      property = prop;
    } else if (has(value, 'alias')) {
      ({ alias, property } = value);
    } else if (has(value, 'parameterName')) {
      parameter = value.parameterName;
      ({ property } = value);
    } else if (has(value, 'projection')) {
      // An inline read: its projection, and its tags and arguments in
      // the same scope as everything around it.
      add(sourceSymbol('projection', value.projection), marked.projection);
      tagOperands(value.tags, (tag) => commandOperand(commandName, body, tag, null));
      keyed(value.arguments, (key) => sourceSymbol('projectionParameter', value.projection, key),
        (arg, key) => commandOperand(commandName, body, arg, parameterType(value.projection, key)));
      return;
    } else return literal(value, expected);
    if (alias !== undefined) {
      add(sourceSymbol('alias', commandName, alias), marked.head);
      const binding = list(body.boundary).find((b) => b.alias === alias);
      if (binding && binding.entity && property !== undefined) {
        add(sourceSymbol('entityProperty', binding.entity, property), marked.property);
      }
      return;
    }
    add(sourceSymbol('commandProperty', commandName, parameter), marked.head);
    const declared = list(body.properties).find((p) => p.name === parameter);
    if (declared && property !== undefined && recordFields(declared.propertyType)) {
      add(sourceSymbol('field', declared.propertyType, property), marked.property);
    }
  };
  const operandType = (body, operand) => {
    let resolved = null;
    try {
      const plain = has(operand, '%ref') ? null : operand;
      resolved = plain && resolveOperandType(plain, {
        boundary: list(body.boundary), commandProperties: list(body.properties), model,
      });
    } catch { /* a defective body types nothing */ }
    return resolved ? resolved.propertyType : null;
  };
  const condition = (commandName, body, rule) => {
    if (!rule || typeof rule !== 'object') return;
    const left = operandType(body, rule.leftHandSide);
    const right = Array.isArray(rule.rightHandSide) ? null : operandType(body, rule.rightHandSide);
    commandOperand(commandName, body, rule.leftHandSide, right);
    if (rule.rightHandSide !== undefined) commandOperand(commandName, body, rule.rightHandSide, left);
    return left;
  };
  const eventPropertyType = (event, key) => {
    const found = list(own(events, event) && own(events, event).properties).find((p) => p.name === key);
    return found ? found.propertyType : null;
  };
  for (const [name, body] of Object.entries(commands)) {
    if (!declare('command', name, body)) continue;
    for (const property of list(body.properties)) {
      add(sourceSymbol('commandProperty', name, property.name), slotsOf(property).name, { decl: true });
      typeRef(slotsOf(property).propertyType);
    }
    for (const binding of list(body.boundary)) {
      const slots = slotsOf(binding);
      add(sourceSymbol('alias', name, binding.alias), slots.alias, { decl: true });
      if (binding.projection !== undefined) {
        add(sourceSymbol('projection', binding.projection), slots.projection);
        tagOperands(binding.tags, (tag) => commandOperand(name, body, tag, null));
        keyed(binding.arguments, (key) => sourceSymbol('projectionParameter', binding.projection, key),
          (arg, key) => commandOperand(name, body, arg, parameterType(binding.projection, key)));
        continue;
      }
      add(sourceSymbol('entity', binding.entity), slots.entity);
      const entity = own(entities, binding.entity);
      const idType = (entity && entity.identifierType) || binding.entity + 'Id';
      tagOperands({ id: binding.id }, (id) => commandOperand(name, body, id, idType));
      if (binding.excluding !== undefined) commandOperand(name, body, binding.excluding, idType);
      // `key: value` after the identifier hands values to the entity's
      // scripted properties: a key is the parameter of every property
      // projection declaring it.
      const propertyProjections = list(entity && entity.properties).map((p) => p.projection);
      keyed(binding.arguments,
        (key) => propertyProjections.filter((p) => parameterType(p, key) !== null)
          .map((p) => sourceSymbol('projectionParameter', p, key)),
        (arg) => commandOperand(name, body, arg, null));
    }
    for (const rule of list(body.conditions)) condition(name, body, rule);
    for (const emission of list(body.publishes)) {
      add(sourceSymbol('event', emission.name), slotsOf(emission).name);
      keyed(emission.parameters, (key) => sourceSymbol('eventProperty', emission.name, key),
        (arg, key) => commandOperand(name, body, arg, eventPropertyType(emission.name, key)));
      for (const rule of list(emission.when)) condition(name, body, rule);
    }
  }

  // ---------- scenarios ----------
  // A payload's keys are its subject's properties; a bare member in it
  // was marked on its container, typed by the property it fills.
  const payload = (data, properties, symbolOf) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const slots = slotsOf(data);
    for (const key of Object.keys(data)) {
      add(symbolOf(key), slots['key:' + key]);
      const declared = list(properties).find((p) => p.name === key);
      const typeName = declared ? declared.propertyType : null;
      member(slots['value:' + key], data[key], typeName);
      const value = data[key];
      if (Array.isArray(value)) {
        const items = slotsOf(value);
        value.forEach((v, i) => member(items['i:' + i], v, typeName));
      } else if (value && typeof value === 'object' && recordFields(typeName)) {
        payload(value, recordFields(typeName), (k) => sourceSymbol('field', typeName, k));
      }
    }
  };
  const eventPayload = (eventName, data) => payload(data, own(events, eventName) && own(events, eventName).properties,
    (key) => sourceSymbol('eventProperty', eventName, key));
  for (const record of parsed.scenarios) {
    const { body } = record;
    const slots = slotsOf(body);
    if (slots.json) { opaque.push({ token: slots.json, text: JSON.stringify(body), json: true }); continue; }
    for (const step of list(body.given)) {
      add(sourceSymbol('event', step.event), slotsOf(step).event);
      eventPayload(step.event, step.data);
    }
    if (record.kind === 'scenario-definition') {
      const commandName = body.command;
      const command = own(commands, commandName) || {};
      add(sourceSymbol('command', commandName), slotsOf(body.when).command);
      if (body.when) {
        payload(body.when.arguments, command.properties, (key) => sourceSymbol('commandProperty', commandName, key));
      }
      for (const event of list(body.then && body.then.events)) {
        add(sourceSymbol('event', event.type), slotsOf(event).type);
        eventPayload(event.type, event.data);
      }
    } else {
      const projection = own(projections, body.projection);
      add(sourceSymbol('projection', body.projection), slots.projection);
      tagOperands(body.tags, null);
      payload(body.arguments, parameters(projection), (key) => sourceSymbol('projectionParameter', body.projection, key));
      member(slots.then, body.then, projection && projection.valueType);
      if (Array.isArray(body.then)) {
        const items = slotsOf(body.then);
        body.then.forEach((v, i) => member(items['i:' + i], v, projection && projection.valueType));
      }
    }
  }
  const symbols = { occurrences, ambiguous, opaque };
  Object.defineProperty(parsed, 'symbols', { value: symbols, enumerable: false });
  return symbols;
}

const sourceTokenHas = (token, line, col) => token.line === line && col >= token.col && col <= token.endCol;

// The symbol under a 1-based position, with every place it occurs.
// On a shorthand (`{ courseId }`) it is the value – the command's own
// name, the way a rename in a shorthand property means the variable –
// and `symbols` lists both, for go to definition.
function sourceSymbolAt(parsed, line, col) {
  const { occurrences, ambiguous } = sourceSymbols(parsed);
  let hits = occurrences.filter((o) => sourceTokenHas(o.token, line, col));
  // Between two names (`a.|b`), the one the cursor is in front of.
  const inside = hits.filter((o) => col < o.token.endCol);
  if (inside.length) hits = inside;
  if (!hits.length) {
    const unclear = ambiguous.find((a) => sourceTokenHas(a.token, line, col));
    return unclear ? { ambiguous: unclear } : null;
  }
  const symbols = [...new Set(hits.map((o) => o.symbol))];
  const chosen = (hits.find((o) => o.shorthand === 'value') || hits[0]).symbol;
  return {
    symbol: chosen,
    symbols,
    token: hits[0].token,
    occurrences: occurrences.filter((o) => o.symbol === chosen),
  };
}

// Where a symbol is declared – or nothing, for a name the text only
// uses (an identifier type left implicit, a dangling reference).
function sourceDeclarationOf(parsed, symbol) {
  return sourceSymbols(parsed).occurrences.find((o) => o.symbol === symbol && o.decl) || null;
}

// ---------- rename ----------

// The names a kind of symbol may take. A lowercase one has to stay
// lowercase and a member capitalised, or the parser would read it as
// the other thing – a literal where a name was, or the reverse.
const SOURCE_RENAME_RULES = {
  member: [SOURCE_MEMBER_RE, 'an enum member starts with a capital letter'],
  type: [SOURCE_IDENT_RE, 'a name is letters, digits and _'],
  event: [SOURCE_IDENT_RE, 'a name is letters, digits and _'],
  entity: [SOURCE_IDENT_RE, 'a name is letters, digits and _'],
  projection: [SOURCE_MEMBER_RE, 'a projection starts with a capital letter'],
  command: [SOURCE_IDENT_RE, 'a name is letters, digits and _'],
};
const SOURCE_LOWER_NAME_RE = /^[a-z_][A-Za-z0-9_]*$/;
// What a script can name: an event's or a record's field
// (`event.data.x`, `state.x`), a member as the string it is, and the
// values it is read by (`tags.x`, `args.x`). A json body can name anything.
const SOURCE_SCRIPT_VISIBLE = ['eventProperty', 'field', 'member', 'projectionParameter', 'projectionTag', 'type'];
const sourceArticle = (word) => (/^[aeiou]/.test(word) ? 'an' : 'a');
const SOURCE_RESERVED_NAMES = ['true', 'false', 'null', 'enum', 'not', 'count', 'event', 'currentValue', 'successor'];

// Edits that rename the symbol at a position, everywhere it occurs and
// nowhere else: `{ edits: [{ line, col, endLine, endCol, text }] }`, or
// `{ error }` saying why not. Safe means three refusals: a name a
// script, a json body or a tag filter may also hold (the grammar cannot
// see in there); an enum member written somewhere its enum cannot be
// told; and a result that would not read back as the same model with
// one name changed – checked by renaming, re-reading, and counting.
//
// An entity whose identifier type is still `<Name>Id` takes the type
// along, as renaming it on its page does; a type an entity tracks that
// way is pinned on the entity (`entity Course[CourseKey]`) instead of
// silently cut loose from it.
function sourceRename(text, line, col, newName) {
  const parsed = parseModelSource(text);
  const target = sourceRenameTarget(parsed, line, col);
  return target.error ? target : sourceRenameSymbol(text, parsed, target.symbol, newName);
}

// What a rename at a position would rename – `{ symbol, token }` – or
// `{ error }` before a new name is even asked for.
function sourceRenameTarget(parsed, line, col) {
  const at = sourceSymbolAt(parsed, line, col);
  if (!at) return { error: 'There is nothing here to rename.' };
  if (at.ambiguous) {
    const { name, candidates } = at.ambiguous;
    return { error: `${name} is a member of ${candidates.map((c) => sourceSymbolParts(c).owner).join(' and ')}, and nothing here says which – rename it at its declaration.` };
  }
  if (at.token.t !== 'ident') return { error: `${at.token.v} is written in quotes; rename it by hand.` };
  return { symbol: at.symbol, token: at.token };
}

function sourceRenameSymbol(text, parsed, symbol, newName) {
  const { occurrences, ambiguous, opaque } = sourceSymbols(parsed);
  const { kind, names, name } = sourceSymbolParts(symbol);
  const word = SOURCE_SYMBOL_WORDS[kind];
  newName = String(newName).trim();
  if (newName === name) return { edits: [] };
  const [rule, why] = SOURCE_RENAME_RULES[kind] || [SOURCE_LOWER_NAME_RE, `${sourceArticle(word)} ${word} starts with a lowercase letter`];
  if (!rule.test(newName)) return { error: `"${newName}" cannot name ${sourceArticle(word)} ${word}: ${why}.` };
  if (SOURCE_RESERVED_NAMES.includes(newName) || SOURCE_BASE_TYPES.includes(newName)) {
    return { error: `"${newName}" is a word of the language.` };
  }
  const renamed = (s, to) => sourceSymbol(sourceSymbolParts(s).kind, ...sourceSymbolParts(s).names.slice(0, -1), to);
  const group = [[symbol, newName]];
  // An entity tracking `<Name>Id` takes its type along. Renaming the
  // type alone renames the `tagged` in the entity's header like any
  // other use, and the entity reads back pinned to the new name.
  const entities = parsed.collections['entity-definition'];
  const tracks = (entity) => entity && typeof entity === 'object' && !entity.identifierType;
  const lowered = (word) => word.charAt(0).toLowerCase() + word.slice(1);
  if (kind === 'entity' && tracks(entities[name])) {
    group.push([sourceSymbol('type', name + 'Id'), newName + 'Id']);
    // Its tag's name tracks the type's, as long as nothing pinned it.
    if (entities[name].identifierName === undefined) {
      const to = lowered(newName) + 'Id';
      group.push([sourceSymbol('entityTag', name, lowered(name) + 'Id'), to, sourceSymbol('entityTag', newName, to)]);
    }
  }

  const edits = [];
  for (const [from, to, as] of group) {
    const target = as || renamed(from, to);
    // A read and a command property are one namespace in the text,
    // which resolves a name to whichever the command declares.
    const clashes = kind === 'alias' || kind === 'commandProperty'
      ? [sourceSymbol('alias', names[0], to), sourceSymbol('commandProperty', names[0], to)]
      : [target];
    const clash = occurrences.find((o) => clashes.includes(o.symbol));
    if (clash) {
      const parts = sourceSymbolParts(clash.symbol);
      const what = SOURCE_SYMBOL_WORDS[parts.kind];
      return { error: `There already is ${sourceArticle(what)} ${what} named ${to}${parts.owner ? ` in ${parts.owner}` : ''}.` };
    }
    const fromName = sourceSymbolParts(from).name;
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${fromName}($|[^A-Za-z0-9_])`);
    const visible = SOURCE_SCRIPT_VISIBLE.includes(sourceSymbolParts(from).kind);
    const hidden = opaque.find((o) => (o.json || visible) && pattern.test(o.text));
    if (hidden) {
      return { error: `${fromName} also appears in the script or JSON at line ${hidden.token.line}, which a rename cannot follow into – change it there by hand.` };
    }
    const unclear = ambiguous.find((a) => a.candidates.includes(from));
    if (unclear) {
      return { error: `${fromName} at line ${unclear.token.line} could be a member of ${unclear.candidates.map((c) => sourceSymbolParts(c).owner).join(' or ')} – nothing there says which.` };
    }
    for (const o of occurrences.filter((x) => x.symbol === from)) {
      if (o.token.t !== 'ident') return { error: `${fromName} is written in quotes at line ${o.token.line}; rename it there by hand.` };
      const replacement = o.shorthand === 'key' ? `${to}: ${fromName}` : o.shorthand === 'value' ? `${fromName}: ${to}` : to;
      edits.push({ line: o.token.line, col: o.token.col, endLine: o.token.endLine, endCol: o.token.endCol, text: replacement });
    }
  }

  // The proof: the renamed text reads with no new errors, and each
  // renamed symbol occurs exactly where it did – no more (it merged
  // into a look-alike), no fewer (some use now reads as something else).
  const after = sourceApplyEdits(text, edits);
  const reread = parseModelSource(after);
  if (reread.diagnostics.length > parsed.diagnostics.length) {
    return { error: `Renaming to ${newName} would not read back: ${reread.diagnostics[0].message}` };
  }
  const count = (list, s) => list.filter((o) => o.symbol === s).length;
  const before = occurrences;
  const now = sourceSymbols(reread).occurrences;
  for (const [from, to, as] of group) {
    const expected = count(before, from);
    if (count(now, as || renamed(from, to)) !== expected || count(now, from) !== 0) {
      return { error: `Renaming to ${newName} would change what the text means – some other name would read differently.` };
    }
  }
  return { edits };
}

// Applies `{ line, col, endLine, endCol, text }` edits (1-based,
// non-overlapping) to a text.
function sourceApplyEdits(text, edits) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  const offset = (line, col) => (starts[line - 1] === undefined ? text.length : starts[line - 1] + col - 1);
  let out = text;
  const ordered = edits.map((e) => ({ ...e, from: offset(e.line, e.col), to: offset(e.endLine, e.endCol) }))
    .sort((a, b) => b.from - a.from);
  for (const e of ordered) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}

// ---------- introduce alias ----------

// Edits that name a read written in place – `CourseStatus(courseId)` in
// a rule, a guard, an emission or another read – with an alias:
// `{ name, title, edits }`, or `{ error }`. The innermost read under
// the cursor is the one named; it is declared after the command's last
// alias, or first in its block, and every equal read in the command is
// replaced by the name, since written twice it is one query anyway.
// The name is the projection's, lowercased, numbered past what the
// command already names; `at` is where it lands, and the editor opens
// a rename there, so it is named as it is introduced.
//
// Nothing about the boundary may change – a read in place and an alias
// derive the same query – and that is checked, not assumed: the result
// is read back, the alias put back in place of each use, and the
// command has to come out as it was.
function sourceIntroduceAlias(text, line, col) {
  const parsed = parseModelSource(text);
  const marksOf = (o) => (o && typeof o === 'object' && parsed.marks.get(o)) || {};
  // A read in place is marked from its projection's name to its closing
  // parenthesis; an alias's own read is marked by its statement instead.
  const readsIn = (value, out = []) => {
    if (!value || typeof value !== 'object') return out;
    const m = marksOf(value);
    if (!Array.isArray(value) && value.projection !== undefined && m.projection && m.close) out.push(value);
    for (const v of Array.isArray(value) ? value : Object.values(value)) readsIn(v, out);
    return out;
  };
  const covers = (read) => {
    const { projection: from, close: to } = marksOf(read);
    return (line > from.line || (line === from.line && col >= from.col))
      && (line < to.endLine || (line === to.endLine && col <= to.endCol));
  };
  let command = null;
  let target = null;
  let reads = [];
  for (const [name, body] of Object.entries(parsed.collections['command-definition'])) {
    if (!body || !Array.isArray(body.boundary)) continue;
    const all = readsIn([body.boundary, body.conditions, body.publishes]);
    // Pre-order, so the last read covering the cursor is the innermost.
    const hit = all.filter(covers).pop();
    if (hit) { command = name; target = hit; reads = all; break; }
  }
  if (!target) return { error: 'There is no read in place here – put the cursor on one in a rule, a guard or an emission.' };

  const body = parsed.collections['command-definition'][command];
  const key = JSON.stringify(target);
  const taken = new Set([
    ...body.boundary.map((b) => b && b.alias), ...body.properties.map((p) => p.name), ...SOURCE_RESERVED_NAMES,
  ]);
  const base = target.projection.charAt(0).toLowerCase() + target.projection.slice(1);
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = base + n;

  const span = (read) => {
    const { projection: from, close: to } = marksOf(read);
    return { line: from.line, col: from.col, endLine: to.endLine, endCol: to.endCol };
  };
  const at = span(target);
  const readText = text.slice(sourceOffset(text, at.line, at.col), sourceOffset(text, at.endLine, at.endCol));
  const lines = text.split('\n');
  const indentOf = (l) => (lines[l - 1] || '').match(/^\s*/)[0];
  const declared = body.boundary.filter((b) => marksOf(b).statementEnd);
  let after;
  let indent;
  if (declared.length) {
    const statement = marksOf(declared[declared.length - 1]);
    after = statement.statementEnd;
    indent = indentOf(statement.statement.line);
  } else {
    after = marksOf(body).open;
    const outer = indentOf(after.line);
    const next = lines.slice(after.line).find((l) => l.trim() !== '');
    const inner = next === undefined ? '' : next.match(/^\s*/)[0];
    indent = inner.length > outer.length ? inner : outer + '  ';
  }
  const edits = [
    { line: after.endLine, col: after.endCol, endLine: after.endLine, endCol: after.endCol, text: `\n${indent}alias ${name} = ${readText}` },
    ...reads.filter((r) => JSON.stringify(r) === key).map((r) => ({ ...span(r), text: name })),
  ];

  // The proof: the alias, put back in place of each use, gives back
  // the command as it was.
  const reread = parseModelSource(sourceApplyEdits(text, edits));
  if (reread.diagnostics.length > parsed.diagnostics.length) {
    return { error: `An alias here would not read back: ${reread.diagnostics[0].message}` };
  }
  const now = reread.collections['command-definition'][command];
  const inline = (value) => {
    if (Array.isArray(value)) return value.map(inline);
    if (!value || typeof value !== 'object') return value;
    if (Object.keys(value).length === 1 && value.alias === name) return JSON.parse(key);
    const out = {};
    for (const k of Object.keys(value)) out[k] = inline(value[k]);
    return out;
  };
  const restored = now && inline({ ...now, boundary: now.boundary.filter((b) => b.alias !== name) });
  if (!restored || !sameDefinition(restored, body)) {
    return { error: `An alias ${name} here would change what ${command} means.` };
  }
  // Where the name lands in the result, so the editor can open a
  // rename on it at once: the default is rarely the name wanted.
  const token = reread.marks.get(now.boundary.find((b) => b.alias === name)).alias;
  return { name, title: `Introduce alias ${name}`, edits, at: { line: token.line, col: token.col } };
}

// ---------- completion ----------

const SOURCE_CONDITION_STARTS = ['require', 'when', 'and'];
const SOURCE_COMPARISONS = ['==', '!=', '<', '<=', '>', '>=', ...SOURCE_WORD_PREDICATES];
// How each predicate is written after an operand, in the order a rule
// editor offers them.
const SOURCE_PREDICATE_SPELLINGS = {
  equals: ['==', '!='], lessThan: ['<'], lessThanOrEquals: ['<='], greaterThan: ['>'],
  greaterThanOrEquals: ['>='], equalsAny: ['in [$1]', 'not in [$1]'], contains: ['contains', 'not contains'],
  containsAny: ['containsAny', 'not containsAny'], startsWith: ['startsWith'], endsWith: ['endsWith'],
  isEmpty: ['is empty'], isNotEmpty: ['is not empty'], isTrue: ['is true'], isFalse: ['is false'],
};

// A group opens with its first scenario, since a group holds nothing else.
const SOURCE_SCENARIO_SNIPPET = 'scenario "${1}" {\n\t$0\n}';
const SOURCE_GROUP_SNIPPET = 'scenarios {\n\tscenario "${1}" {\n\t\t$0\n\t}\n}';

const SOURCE_DECLARATION_SNIPPETS = [
  ['command', 'command ${1:Name}(${2}) {\n\t$0\n}'],
  ['event', 'event ${1:Name} { $0 }'],
  ['entity', 'entity ${1:Name} (tag ${2:nameId}: ${3:NameId}) {\n\t$0\n}'],
  ['projection', 'projection ${1:Name} (tag ${2:id}: ${3:Type}): ${4:integer} = ${5:0} {\n\t$0\n}'],
  ['untagged projection', 'untagged projection ${1:Name}: ${2:integer} = ${3:0} {\n\t$0\n}'],
  ['derived projection', 'derived projection ${1:Name} (tag ${2:id}: ${3:Type}): ${4:integer} {\n\t$0\n}'],
  ['scripted projection', 'scripted projection ${1:Name} (tag ${2:id}: ${3:Type}): ${4:integer} {\n\tinitialState ${5:0}\n\t$0\n}'],
  ['enum', 'enum ${1:Name} { $0 }'],
  ['tag type', 'tag type ${1:Name} = string'],
  ['type', 'type ${1:Name} = ${2:string}'],
  ['record', 'record ${1:Name} {\n\t$0\n}'],
  ['scenarios', SOURCE_GROUP_SNIPPET],
];

function sourceOffset(text, line, col) {
  let offset = 0;
  for (let l = 1; l < line; l += 1) {
    const next = text.indexOf('\n', offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }
  return Math.min(text.length, offset + col - 1);
}

// What may be written at a 1-based position: `{ items, slot }`. Each
// item is `{ label, kind, detail, insert, snippet, sort, retrigger }` –
// `kind` one of the symbol kinds or `keyword`, `insert` a Monaco
// snippet when `snippet` is set. `slot` says the cursor sits where
// something specific is expected (after `require`, `on`, `emit E {`,
// `course.`), which is when a space alone should open the list.
//
// The context is read off the tokens before the cursor, not the parse:
// the text is mid-edit and rarely parses there. A stack of the brackets
// still open says what the cursor is inside – a command's body, an
// emit's arguments, a scenario's payload – and the tokens since the
// statement began say where in it. What the names mean comes from the
// whole text's parse, with `model`'s definitions filling in for any
// that fail to parse while being typed.
// `experimental: false` leaves out what the experimental flag keeps off
// the pages – entities, lifecycles, scripted projections and guards.
// A text using them still reads.
function sourceCompletions(text, line, col, { model = null, experimental = true } = {}) {
  const none = { items: [], slot: false };
  const prefix = text.slice(0, sourceOffset(text, line, col));
  const lexed = lexSource(prefix);
  if (lexed.diagnostics.some((d) => /never closed/.test(d.message))) return none;
  const lineText = prefix.slice(prefix.lastIndexOf('\n') + 1).replace(/"([^"\\]|\\.)*"/g, '""');
  if (lineText.includes('//')) return none;
  const tokens = lexed.tokens.slice(0, -1);
  if (tokens.length && tokens[tokens.length - 1].t === 'number' && /[0-9.]$/.test(prefix)) return none;
  if (/[A-Za-z0-9_]$/.test(prefix) && tokens.length && tokens[tokens.length - 1].t === 'ident') tokens.pop();
  const atLineStart = !tokens.length || tokens[tokens.length - 1].endLine < line;

  // ---------- where the cursor is ----------
  const DECL_WORDS = ['model', 'type', 'tag', 'enum', 'record', 'event', 'entity', 'untagged', 'derived', 'scripted', 'projection', 'command', 'scenarios', 'scenario', '@'];
  // The words before a declaration's keyword, which say what it is.
  const LEAD_WORDS = ['tag', 'untagged', 'derived', 'scripted'];
  const unled = (s) => { let i = 0; while (LEAD_WORDS.includes(v(s[i]))) i += 1; return s.slice(i); };
  const v = (t) => (t ? t.v : undefined);
  const frames = [{ kind: 'top', level: 0, open: -1, stmt: 0 }];
  const level = [];
  let decl = { keyword: null, name: null, start: 0 };
  const statement = (frame, end) => {
    const out = [];
    for (let i = frame.stmt; i < end; i += 1) if (level[i] === frame.level) out.push(tokens[i]);
    return out;
  };
  // A scenario's statement, by the keyword it is under: an `and` line
  // continues the given, when or then above it.
  const scenarioLead = (frame, s) => {
    if (v(s[0]) !== 'and') return v(s[0]);
    for (let i = frame.stmt - 1; i > frame.open; i -= 1) {
      if (level[i] === frame.level && tokens[i].first && ['given', 'when', 'then'].includes(tokens[i].v)) return tokens[i].v;
    }
    return undefined;
  };
  const classify = (frame, s, opener) => {
    const prev = v(s[s.length - 1]);
    const base = {
      decl: frame.decl || decl, command: frame.command, event: frame.event, projection: frame.projection,
      entity: frame.entity, block: frame.block, scenarioCommand: frame.scenarioCommand,
    };
    const own = (kind, extra) => ({ ...base, kind, ...extra });
    const k = frame.kind;
    if (k === 'top') {
      const kw = decl.keyword;
      if (opener === '{') {
        if (prev === 'json' || kw === 'type' || kw === 'model') return own('json');
        const kinds = {
          enum: 'enum', record: 'fields', event: 'fields', entity: 'entity', projection: 'projection', command: 'command',
          scenarios: 'scenarios', scenario: 'scenario',
        };
        return own(kinds[kw] || 'json', {
          entity: kw === 'entity' ? decl.name : undefined,
          command: kw === 'command' ? decl.name : undefined,
          projection: kw === 'projection' ? decl.name : undefined,
          event: kw === 'event' ? decl.name : undefined,
          block: kw === 'scenario' || kw === 'scenarios' ? null : undefined,
        });
      }
      if (opener === '(') {
        const head = unled(s);
        if (head.length === 2 && (kw === 'command' || kw === 'projection' || kw === 'entity')) return own('params', { header: kw });
        return own('json');
      }
      if (kw === 'projection' && prev === '=') return own('list', { valueOf: 'projection' });
      return own('json');
    }
    if (k === 'command') {
      if (opener === '{' && v(s[0]) === 'emit' && s.length === 2) return own('emitArgs', { event: v(s[1]) });
      if (opener === '{' && v(s[0]) === 'scenarios') return own('scenarios', { block: { kind: 'command', name: frame.command } });
      if (opener === '{' && v(s[0]) === 'scenario') return own('scenario', { block: { kind: 'command', name: frame.command } });
      if (opener === '(' && prev === 'count') return own('count');
      if (opener === '(' && /^[A-Z]/.test(prev || '')) return own('callArgs', { callee: prev });
      if (opener === '[' && prev === 'in') return own('list', { left: conditionLeft(s.slice(0, -1)) });
      return own('json');
    }
    if (k === 'projection') {
      if (opener === '{' && v(s[0]) === 'scenarios') return own('scenarios', { block: { kind: 'projection', name: frame.projection } });
      if (opener === '{' && v(s[0]) === 'scenario') return own('scenario', { block: { kind: 'projection', name: frame.projection } });
      if (opener === '(' && prev === 'successor') return own('successor', { event: v(s[1]) });
      // A derived projection's expression: `min(…)`, `count(…)`, a read.
      if (opener === '(' && base.decl.derived) {
        if (SOURCE_OPERATOR_CALLS.includes(prev)) return own('derivedOperands');
        if (prev === 'count') return own('count');
        if (/^[A-Z]/.test(prev || '')) return own('derivedArgs', { callee: prev });
      }
      return own('json');
    }
    if (k === 'scenarios') {
      if (opener === '{' && v(s[0]) === 'scenario' && prev !== 'json') return own('scenario', { block: frame.block });
      return own('json');
    }
    if (k === 'scenario') {
      const block = frame.block;
      const lead = scenarioLead(frame, s);
      if (opener === '{' && lead === 'given' && s.length === 2) return own('payload', { event: v(s[1]), block });
      if (opener === '{' && lead === 'when' && s.length === 2) return own('payload', { command: v(s[1]), block });
      if (opener === '{' && lead === 'then' && s.length === 2) return own('payload', { event: v(s[1]), block });
      if (opener === '(' && lead === 'then' && s.length === 2) return own('thenArgs', { callee: v(s[1]), block });
      if (opener === '(' && prev === 'count') return own('count');
      if (opener === '[' && prev === 'in') return own('list', { left: conditionLeft(s.slice(0, -1)) });
      return own('json');
    }
    if (['emitArgs', 'callArgs', 'count', 'derivedArgs', 'derivedOperands', 'successor'].includes(k)) {
      if (opener === '(' && prev === 'count') return own('count');
      if (opener === '(' && prev === 'successor') return own('successor', { event: frame.event });
      const derivedFrame = k === 'derivedArgs' || k === 'derivedOperands';
      if (opener === '(' && /^[A-Z]/.test(prev || '') && derivedFrame) return own('derivedArgs', { callee: prev });
      if (opener === '(' && /^[A-Z]/.test(prev || '') && !derivedFrame) return own('callArgs', { callee: prev });
      if (opener === '[' && prev === 'in') return own('list', { left: conditionLeft(s.slice(0, -1)) });
    }
    return own('json');
  };
  // The operand a condition's tokens start with – `course.status`,
  // `count(course.subscribedStudentIds)` – as the names it is made of.
  function conditionLeft(s) {
    let start = -1;
    s.forEach((t, i) => { if (SOURCE_CONDITION_STARTS.includes(t.v)) start = i; });
    let rest = s.slice(start + 1);
    while (v(rest[0]) === 'not') rest = rest.slice(1);
    if (v(rest[0]) === 'count') return { count: true };
    if (rest[0] && rest[0].t === 'ident') return { head: rest[0].v, property: v(rest[1]) === '.' ? v(rest[2]) : undefined };
    return null;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    let frame = frames[frames.length - 1];
    if (token.t === 'punct' && ['}', ')', ']'].includes(token.v)) {
      if (frames.length > 1) frames.pop();
      frame = frames[frames.length - 1];
      level[i] = frame.level;
      continue;
    }
    level[i] = frame.level;
    if (frame.kind === 'top') {
      if (token.first && DECL_WORDS.includes(token.v)) {
        let j = i;
        while (LEAD_WORDS.includes(v(tokens[j])) && tokens[j + 1]) j += 1;
        const words = tokens.slice(i, j).map((t) => t.v);
        decl = {
          keyword: v(tokens[j]), name: v(tokens[j + 1]), start: i,
          derived: words.includes('derived'), scripted: words.includes('scripted'),
        };
        frame.stmt = i;
      }
    } else if (token.first && token.v !== 'else') frame.stmt = i;
    if (token.t === 'punct' && ['{', '(', '['].includes(token.v)) {
      const next = classify(frame, statement(frame, i), token.v);
      if (next.kind === 'scenario') next.scenarioCommand = next.block && next.block.kind === 'command' ? next.block.name : null;
      frames.push({ ...next, level: frames.length, open: i, stmt: i + 1 });
    }
  }
  const frame = frames[frames.length - 1];
  const s = atLineStart ? [] : statement(frame, tokens.length);
  const prev = v(s[s.length - 1]);

  // And what follows the cursor: the rest of the innermost bracket, at
  // its own level, and the rest of the declaration – the handlers,
  // keys and reads written below, which a block being edited does not
  // parse to tell.
  const suffix = lexSource(text.slice(prefix.length)).tokens.slice(0, -1);
  if (/[A-Za-z0-9_]$/.test(prefix) && /^[A-Za-z0-9_]/.test(text.slice(prefix.length)) && suffix.length) suffix.shift();
  const restOfFrame = [];
  const restOfDeclaration = [];
  let depth = 0;
  for (const token of suffix) {
    if (token.t === 'punct' && ['{', '(', '['].includes(token.v)) depth += 1;
    else if (token.t === 'punct' && ['}', ')', ']'].includes(token.v)) depth -= 1;
    if (frames.length > 1 && depth <= -(frames.length - 1)) break;
    if (frames.length === 1 && depth === 0 && token.first && token.line > 1 && DECL_WORDS.includes(token.v)) break;
    restOfDeclaration.push(token);
    if (depth === 0 && restOfFrame.length === restOfDeclaration.length - 1) restOfFrame.push(token);
  }
  const framed = [...statement({ ...frame, stmt: frame.open + 1 }, tokens.length), ...restOfFrame];
  const declared = [...tokens.slice(frame.decl ? frame.decl.start : decl.start), ...restOfDeclaration];
  // An argument list's own part: the tokens since its last comma.
  const lastComma = s.map((t) => t.v).lastIndexOf(',');
  const segment = lastComma >= 0 ? s.slice(lastComma + 1) : s;

  // ---------- what the names mean ----------
  const parsed = parseModelSource(text);
  const known = sourceTextModel(parsed, model);
  const coll = (kind) => known[DEF_COLLECTIONS[kind]];
  const has = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);
  const def = (kind, name) => (typeof name === 'string' && has(coll(kind), name) ? coll(kind)[name] : null);
  const list = (value) => (Array.isArray(value) ? value.filter((x) => x && typeof x === 'object') : []);
  const typeText = (p) => `${p.propertyType}${p.isList ? '[]' : ''}${p.isOptional ? '?' : ''}`;
  const items = [];
  const push = (label, kind, detail, extra = {}) => {
    if (items.some((i) => i.label === label)) return;
    items.push({ label, kind, detail: detail || '', insert: label, sort: 1, ...extra });
  };
  const done = (slot = true) => ({ items: items.map((i) => ({ ...i, sort: String(i.sort) })), slot });

  const membersOf = (typeName) => {
    const body = def('custom-type-definition', typeName);
    const members = body && body.schema && body.schema.enum;
    return Array.isArray(members) ? members.filter((m) => typeof m === 'string') : [];
  };
  const recordFields = (typeName) => {
    const body = def('custom-type-definition', typeName);
    return body && Array.isArray(body.properties) ? list(body.properties) : null;
  };
  const valueItems = (typeName, sort = 0) => {
    for (const m of membersOf(typeName)) push(m, 'member', typeName, { sort });
    if (typeName === 'boolean') { push('true', 'keyword', 'boolean', { sort }); push('false', 'keyword', 'boolean', { sort }); }
  };
  const typeItems = ({ tagsFirst } = {}) => {
    for (const t of SIMPLE_TYPES) push(t, 'keyword', 'type', { sort: 2 });
    for (const [name, body] of Object.entries(coll('custom-type-definition'))) {
      const what = body && body.schema && Array.isArray(body.schema.enum) ? 'enum'
        : body && Array.isArray(body.properties) ? 'record' : body && body.isTag ? 'tag type' : 'type';
      push(name, 'type', what, { sort: tagsFirst && !(body && body.isTag) ? 1 : 0 });
    }
  };
  const definitionItems = (kind, { exclude = [], sort = 1, call = false, detail } = {}) => {
    for (const [name, body] of Object.entries(coll(kind))) {
      if (exclude.includes(name)) continue;
      const extra = { sort: typeof sort === 'function' ? sort(name, body) : sort };
      if (call) Object.assign(extra, { insert: call(name, body), snippet: true });
      push(name, SOURCE_KIND_SYMBOL[kind], detail ? detail(name, body) : SOURCE_KEYWORD[kind], extra);
    }
  };
  const keywords = (words, sort = 0) => words.forEach(([label, insert, snippet]) => push(label, 'keyword', '', {
    sort, insert: insert || label, snippet: !!snippet,
  }));
  // The messages a command already refuses with – offered where a rule
  // states one, so two rules can share it, and where a scenario names one.
  // Read off the tokens where the cursor is inside the command, since
  // a block being typed rarely parses.
  const rejectionItems = (name) => {
    const offer = (message) => push(JSON.stringify(message), 'text', 'rejection', { sort: 0 });
    const decl_ = frame.decl || decl;
    if (decl_ && decl_.keyword === 'command' && decl_.name === name) {
      declared.forEach((t, i) => { if (t.t === 'string' && v(declared[i - 1]) === 'reject') offer(t.v); });
    }
    for (const rule of list((def('command-definition', name) || {}).conditions)) {
      if (rule && typeof rule.rejection === 'string') offer(rule.rejection);
    }
  };

  // A command's names – its payload and its reads – from the text
  // before the cursor, with whatever its parsed body adds (a read
  // written further down is in scope too).
  const commandScope = (name) => {
    const properties = [];
    const boundary = [];
    const body = has(parsed.collections['command-definition'], name) ? parsed.collections['command-definition'][name] : def('command-definition', name);
    const emits = [];
    if (frame.decl && frame.decl.keyword === 'command' && frame.decl.name === name) {
      const d = declared;
      let i = 2;
      if (v(d[i]) === '(') {
        for (i += 1; i < d.length && v(d[i]) !== ')'; i += 1) {
          if (d[i].t === 'ident' && (v(d[i + 1]) === ':' || (v(d[i + 1]) === '?' && v(d[i + 2]) === ':'))) {
            const typeAt = i + (v(d[i + 1]) === '?' ? 3 : 2);
            properties.push({ name: d[i].v, propertyType: v(d[typeAt]), isList: v(d[typeAt + 1]) === '[' });
          }
        }
      }
      for (; i < d.length; i += 1) {
        if (v(d[i]) === 'emit' && d[i + 1] && d[i + 1].t === 'ident') emits.push(d[i + 1].v);
        // The read being written is not in scope of itself.
        if (v(d[i]) !== 'alias' || (tokens.includes(d[i]) && d[i].line === line) || !d[i + 1] || d[i + 1].t !== 'ident') continue;
        const eq = v(d[i + 2]) === '?' ? i + 3 : i + 2;
        if (v(d[eq]) !== '=' || !d[eq + 1]) continue;
        const target = d[eq + 1].v;
        boundary.push(def('entity-definition', target) ? { alias: d[i + 1].v, entity: target } : { alias: d[i + 1].v, projection: target });
      }
    }
    for (const p of list(body && body.properties)) if (!properties.some((q) => q.name === p.name)) properties.push(p);
    for (const b of list(body && body.boundary)) {
      // The read being written is not in scope of itself.
      const written = (parsed.marks.get(b) || {}).alias;
      if (written && written.line === line) continue;
      if (!boundary.some((q) => q.alias === b.alias)) boundary.push(b);
    }
    for (const e of list(body && body.publishes)) if (!emits.includes(e.name)) emits.push(e.name);
    return { name, properties, boundary, emits };
  };
  const operandType = (scope, head, property) => {
    const isRead = scope.boundary.some((b) => b.alias === head) || (property !== undefined && !scope.properties.some((p) => p.name === head));
    const operand = isRead ? { alias: head, ...(property !== undefined ? { property } : {}) }
      : { parameterName: head, ...(property !== undefined ? { property } : {}) };
    try {
      return resolveOperandType(operand, { boundary: scope.boundary, commandProperties: scope.properties, model: known });
    } catch { return null; }
  };
  const operandItems = (scope, { sort = 0, prefer } = {}) => {
    for (const b of scope.boundary) {
      push(b.alias, 'alias', b.entity ? `alias ${b.entity}(…)` : `alias ${b.projection}(…)`, { sort: prefer && !prefer(b) ? sort + 1 : sort });
    }
    for (const p of scope.properties) push(p.name, 'commandProperty', typeText(p), { sort: prefer && !prefer(p) ? sort + 1 : sort });
  };
  const entityPropertyItems = (entityName) => {
    const entity = def('entity-definition', entityName);
    for (const p of list(entity && entity.properties)) {
      const projection = def('projection-definition', p.projection);
      const type = projection ? `${projection.valueType}${projection.isList ? '[]' : ''}` : '';
      push(p.name, 'entityProperty', `${type}${type ? ' · ' : ''}${p.projection}`, { sort: 0 });
    }
  };
  const dotted = (scope) => {
    const head = s[s.length - 2];
    if (!head || head.t !== 'ident') return done();
    const binding = scope.boundary.find((b) => b.alias === head.v);
    if (binding && binding.entity) entityPropertyItems(binding.entity);
    const parameter = scope.properties.find((p) => p.name === head.v);
    for (const f of (parameter && recordFields(parameter.propertyType)) || []) push(f.name, 'field', f.propertyType, { sort: 0 });
    return done();
  };
  // The rest of a condition, from wherever it began in `cond`.
  const conditionItems = (scope, cond) => {
    const last = v(cond[cond.length - 1]);
    if (!cond.length || last === 'not') {
      operandItems(scope);
      // A rule may read a projection in place, so every projection is
      // a way for one to start – after what the command already has.
      definitionItems('projection-definition', { sort: 1, call: projectionCall, detail: (n, b) => `${b.valueType}${b.isList ? '[]' : ''}` });
      push('count', 'keyword', 'count(…)', { insert: 'count($1)', snippet: true, sort: 1 });
      if (!cond.length) push('not', 'keyword', '', { sort: 2 });
      return done();
    }
    const left = conditionLeft([{ v: 'require' }, ...cond]);
    const leftType = left && !left.count ? operandType(scope, left.head, left.property) : left && left.count ? { propertyType: 'integer' } : null;
    if (SOURCE_COMPARISONS.includes(last)) {
      if (leftType && !leftType.isList) valueItems(leftType.propertyType);
      operandItems(scope, { sort: 1 });
      return done();
    }
    if (last === 'is') {
      const kinds = predicatesForType(leftType, known);
      if (kinds.includes('isEmpty')) push('empty', 'keyword');
      if (kinds.includes('isNotEmpty')) push('not empty', 'keyword');
      if (kinds.includes('isTrue')) push('true', 'keyword');
      if (kinds.includes('isFalse')) push('false', 'keyword');
      return done();
    }
    if (last === 'in') {
      // A literal list, or a list held in data (`x in xs`, stored as
      // `xs contains x`).
      push('[…]', 'keyword', 'listed values', { insert: '[$1]', snippet: true, sort: 0 });
      operandItems(scope, { sort: 1 });
      return done();
    }
    if (last === '[') return done();
    // A whole operand: what may be said of it.
    const complete = cond[cond.length - 1].t === 'ident' || last === ')';
    if (!complete) return done();
    const kinds = left && left.count ? ['countEquals', 'countLessThan', 'countGreaterThan'] : predicatesForType(leftType, known);
    const words = new Set();
    for (const predicate of kinds) {
      const spelling = left && left.count
        ? { countEquals: ['==', '!='], countLessThan: ['<'], countGreaterThan: ['>'] }[predicate]
        : SOURCE_PREDICATE_SPELLINGS[predicate];
      for (const word of spelling || []) words.add(word);
    }
    for (const word of words) push(word.replace(' [$1]', ''), 'keyword', 'predicate', { insert: word, snippet: word.includes('$1') });
    return done(false);
  };
  // `key: value` lists: the keys not yet written, then a value.
  const argumentItems = (properties, { shorthand = () => false, value } = {}) => {
    if (segment.length === 2 && v(segment[1]) === ':') return value ? value(segment[0].v) : done();
    if (segment.length) return done(false);
    const written = new Set(framed.filter((t, i) => t.t === 'ident' && (i === 0 || v(framed[i - 1]) === ',')).map((t) => t.v));
    for (const p of properties) {
      if (written.has(p.name)) continue;
      const short = shorthand(p.name);
      push(p.name, 'property', typeText(p), { insert: short ? p.name : `${p.name}: `, sort: short ? 0 : 1 });
    }
    return done();
  };
  // What a read of a projection gives, in order: its tags, then its
  // arguments – `{ name, propertyType, tag }` each.
  const projectionParameters = (name) => {
    const ownDecl = frame.decl || decl;
    if (ownDecl.keyword === 'projection' && ownDecl.name === name) {
      const header = projectionHeader(ownDecl.start);
      if (header) return header.parameters;
    }
    const body = def('projection-definition', name);
    return [
      ...projectionTagParams(body).map((tag) => ({ name: tag.name, propertyType: tag.tagType, tag: true })),
      ...list(body && body.arguments),
    ];
  };
  // A derived projection's own parameters, as names its expression may
  // use – those of `preferred` type first.
  const ownParameterItems = (ownName, preferred) => {
    for (const p of ownName ? projectionParameters(ownName) : []) {
      push(p.name, p.tag ? 'projectionTag' : 'projectionParameter', p.propertyType,
        { sort: !preferred || p.propertyType === preferred ? 0 : 1 });
    }
  };
  // A projection is read with its values in parentheses – empty for an
  // untagged one, so the cursor lands inside only when there is
  // something to fill in.
  const projectionCall = (name) => (projectionParameters(name).length ? `${name}($1)` : `${name}()`);

  // A projection's own header, read off the tokens: its body is
  // mid-edit while a handler is typed, and so rarely in the parse.
  const projectionHeader = (start) => {
    const parameters = [];
    let i = start;
    while (['untagged', 'derived', 'scripted'].includes(v(tokens[i]))) i += 1;
    i += 2;
    if (v(tokens[i]) === '(') {
      for (i += 1; i < tokens.length && v(tokens[i]) !== ')'; i += 1) {
        if (tokens[i].t === 'ident' && v(tokens[i + 1]) === ':') {
          parameters.push({ name: tokens[i].v, propertyType: v(tokens[i + 2]), tag: v(tokens[i - 1]) === 'tag' });
        }
      }
      i += 1;
    }
    if (v(tokens[i]) !== ':') return null;
    return { valueType: v(tokens[i + 1]), isList: v(tokens[i + 2]) === '[', parameters };
  };

  // ---------- by place ----------
  const k = frame.kind;
  // The command a rule is about: the block's, or a top-level
  // scenario's `when`.
  let commandName = frame.scenarioCommand || frame.command || null;
  if (!commandName && (k === 'scenario' || frame.block === null)) {
    const at = tokens.findIndex((t, i) => i > frame.open && t.v === 'when' && t.first);
    if (at >= 0 && tokens[at + 1]) commandName = tokens[at + 1].v;
  }

  if (prev === '.') {
    const head = v(s[s.length - 2]);
    if (head === 'event' && (k === 'projection' || k === 'successor')) {
      push('data', 'keyword', 'the event\'s payload', { insert: 'data.', retrigger: true, sort: 0 });
      return done();
    }
    if (head === 'data' && v(s[s.length - 3]) === '.' && v(s[s.length - 4]) === 'event') {
      let eventName = frame.event;
      if (k === 'projection') eventName = v(s[1]);
      const event = def('event-definition', eventName);
      for (const p of list(event && event.properties)) push(p.name, 'eventProperty', typeText(p), { sort: 0 });
      return done();
    }
    if (commandName) return dotted(commandScope(commandName));
    if (frame.decl && frame.decl.keyword === 'projection') {
      const parameter = projectionParameters(frame.decl.name).find((p) => p.name === v(s[s.length - 2]));
      for (const f of (parameter && recordFields(parameter.propertyType)) || []) push(f.name, 'field', f.propertyType, { sort: 0 });
      return done();
    }
    return done();
  }

  if (k === 'top') {
    const kw = decl.keyword;
    if (!s.length) {
      for (const [label, insert] of SOURCE_DECLARATION_SNIPPETS) {
        if (experimental || (label !== 'entity' && label !== 'scripted projection')) push(label, 'keyword', 'declaration', { insert, snippet: true, sort: 0 });
      }
      return done(false);
    }
    // What a lead word is followed by: `untagged derived projection`.
    if (s.length === 1 && (prev === 'untagged' || prev === 'derived' || prev === 'scripted')) {
      keywords([['projection', 'projection '], ...(prev === 'untagged' ? [['derived', 'derived '],
        ...(experimental ? [['scripted', 'scripted ']] : [])] : [])]);
      return done(false);
    }
    if (prev === '@') {
      for (const [name, kinds] of Object.entries(SOURCE_ANNOTATIONS)) {
        push(name, 'keyword', kinds.map((x) => SOURCE_KEYWORD[x]).join(', '), { insert: `${name}("$1")`, snippet: true, sort: 0 });
      }
      return done();
    }
    if (v(s[0]) === 'tag' && s.length === 1) { keywords([['type'], ['enum'], ['record']]); return done(); }
    if (kw === 'type' && prev === '=') { SOURCE_BASE_TYPES.forEach((t) => push(t, 'keyword', 'base type', { sort: 0 })); return done(); }
    if (kw === 'projection') {
      const ownName = decl.name;
      const body = def('projection-definition', ownName);
      const colon = s.findIndex((t) => t.v === ':');
      const valueType = colon >= 0 ? v(s[colon + 1]) : body && body.valueType;
      if (prev === ':') { typeItems(); return done(); }
      if (prev === '=') {
        valueItems(valueType);
        keywords([['null'], ['[]']], 1);
        return done();
      }
      return done(false);
    }
    return done(false);
  }
  if (k === 'params' || k === 'fields') {
    const tagged = v(segment[0]) === 'tag';
    if (prev === ':') { typeItems({ tagsFirst: tagged }); return done(); }
    // A projection's or an entity's tag, and an event's tagged property,
    // start with `tag`; a property line in an event may too.
    const lineStart = k === 'fields' ? atLineStart || prev === ',' || prev === '{' : !segment.length;
    if (lineStart && (frame.header === 'projection' || frame.header === 'entity' || (k === 'fields' && (frame.decl || decl).keyword === 'event'))) {
      keywords([['tag', 'tag ']]);
      return done(false);
    }
    return done(false);
  }
  if (k === 'entity') {
    if (!s.length) { if (experimental) keywords([['lifecycle', 'lifecycle ']]); return done(false); }
    if (prev === 'lifecycle') {
      const names = framed.filter((t, i) => t.t === 'ident' && v(framed[i + 1]) === '=').map((t) => t.v);
      const parsedEntity = def('entity-definition', frame.entity);
      for (const p of list(parsedEntity && parsedEntity.properties)) if (!names.includes(p.name)) names.push(p.name);
      names.forEach((n) => push(n, 'entityProperty', '', { sort: 0 }));
      return done();
    }
    if (prev === '=') {
      const idType = (def('entity-definition', frame.entity) || {}).identifierType || `${frame.entity}Id`;
      definitionItems('projection-definition', {
        sort: (n, b) => (projectionParameters(n).some((p) => p.propertyType === idType) ? 0 : 1),
        detail: (n, b) => `${b.valueType}${b.isList ? '[]' : ''}`,
      });
      return done();
    }
    return done(false);
  }
  if (k === 'projection' || k === 'successor') {
    const ownName = frame.projection || (frame.decl && frame.decl.name);
    const body = (frame.decl && projectionHeader(frame.decl.start)) || def('projection-definition', ownName) || {};
    const handlerOperands = () => {
      push('event.data', 'keyword', 'a value the event carried', { insert: 'event.data.', retrigger: true, sort: 0 });
      if (k !== 'successor' && body.valueType && hasSuccessor(known, body.valueType)) push('successor', 'keyword', 'successor(…)', { insert: 'successor($1)', snippet: true, sort: 1 });
      valueItems(body.valueType, 0);
      return done();
    };
    if (k === 'successor') return handlerOperands();
    // A derived projection's block: the expression – reads of other
    // projections, its own parameters, min / max, a comparison – then
    // its scenarios.
    if (frame.decl && frame.decl.derived) {
      const reads = () => {
        definitionItems('projection-definition', { exclude: [ownName], sort: 0, call: projectionCall, detail: (n, b) => `${b.valueType}` });
        ownParameterItems(ownName);
        return done();
      };
      if (!s.length) {
        SOURCE_OPERATOR_CALLS.forEach((word) => push(word, 'keyword', `${word}(a, b)`, { insert: `${word}($1)`, snippet: true, sort: 1 }));
        keywords([['scenarios', SOURCE_GROUP_SNIPPET, true]], 2);
        return reads();
      }
      if (prev === 'not' || SOURCE_COMPARISONS.includes(prev) || SOURCE_OPERATORS[prev]) return reads();
      return done(false);
    }
    if (!s.length) {
      keywords([['on', 'on '], ['scenarios', SOURCE_GROUP_SNIPPET, true]]);
      if (frame.decl && frame.decl.scripted) keywords([['initialState'], ['exposes']], 2);
      return done(false);
    }
    if (v(s[0]) === 'on') {
      if (s.length === 1) {
        const handled = framed.filter((t, i) => v(framed[i - 1]) === 'on').map((t) => t.v);
        definitionItems('event-definition', { exclude: handled, sort: 0 });
        return done();
      }
      if (s.length === 3 && prev === '=>') {
        for (const op of operationsFor(known, body)) push(op, 'keyword', 'operation', { sort: 0, insert: `${op} ` });
        return done();
      }
      if (s.length === 4 && OPERATIONS.includes(prev)) return handlerOperands();
    }
    return done(false);
  }
  // Where a condition being written began: after its last `require`,
  // `when`, `and` or `by`.
  const conditionTail = (tokensOf) => {
    let at = -1;
    tokensOf.forEach((t, i) => { if (SOURCE_CONDITION_STARTS.includes(t.v)) at = i; });
    return tokensOf.slice(at + 1);
  };
  if (['command', 'emitArgs', 'callArgs'].includes(k) && !commandName) return done(false);
  if (k === 'command') {
    const scope = commandScope(commandName);
    if (!s.length) {
      keywords([['alias', 'alias ${1:name} = ', true], ['require', 'require '], ['emit', 'emit '],
        ['scenarios', SOURCE_GROUP_SNIPPET, true]]);
      return done(false);
    }
    const first = v(s[0]);
    if (first === 'alias') {
      if (prev === '=' && s.length <= 4) {
        if (experimental) definitionItems('entity-definition', { sort: 0, call: (n) => `${n}($1)` });
        definitionItems('projection-definition', { sort: 1, call: projectionCall, detail: (n, b) => `${b.valueType}${b.isList ? '[]' : ''}` });
        return done();
      }
      // What an entity read may exclude: a value in the command's scope.
      if (prev === 'excluding') { operandItems(scope); return done(); }
      return done(false);
    }
    if (first === 'emit') {
      if (s.length === 1) {
        definitionItems('event-definition', { sort: 0, detail: (n, b) => list(b.properties).map((p) => p.name).join(', ') });
        return done();
      }
      if (s.some((t) => t.v === 'when')) return conditionItems(scope, conditionTail(s));
      if ((prev === '}' || s.length === 2) && experimental) { keywords([['when', 'when ']]); return done(false); }
      return done(false);
    }
    if (first === 'require') {
      const at = s.findIndex((t) => t.v === 'else');
      if (at < 0) return conditionItems(scope, conditionTail(s));
      if (s.length === at + 1) { keywords([['reject', 'reject "${1}"', true]]); return done(); }
      if (v(s[at + 1]) === 'reject' && s.length === at + 2) { rejectionItems(commandName); return done(); }
    }
    return done(false);
  }
  if (k === 'list') {
    if (frame.valueOf === 'projection') {
      const header = projectionHeader(frame.decl.start);
      if (header) valueItems(header.valueType);
      return done();
    }
    const scope = commandName ? commandScope(commandName) : null;
    if (scope && frame.left) {
      const leftType = operandType(scope, frame.left.head, frame.left.property);
      if (leftType) valueItems(leftType.propertyType);
    }
    return done();
  }
  if (k === 'emitArgs') {
    const scope = commandScope(commandName);
    const event = def('event-definition', frame.event);
    const properties = list(event && event.properties);
    const names = new Set([...scope.properties.map((p) => p.name), ...scope.boundary.map((b) => b.alias)]);
    return argumentItems(properties, {
      shorthand: (n) => names.has(n),
      value: (key) => {
        const p = properties.find((x) => x.name === key);
        if (p) valueItems(p.propertyType);
        operandItems(scope, { sort: 1, prefer: (x) => (x.propertyType ? x.propertyType === (p && p.propertyType) : true) });
        return done();
      },
    });
  }
  // A call's values, in order: what the projection declares at this
  // position – a tag, offered the values in scope of its type first, and
  // `each` for a list – or an entity's identifier.
  if (k === 'callArgs') {
    const scope = commandScope(commandName);
    const position = framed.filter((t) => t.v === ',').length - restOfFrame.filter((t) => t.v === ',').length;
    const entity = def('entity-definition', frame.callee);
    const slot = entity
      ? (position === 0 ? { propertyType: entity.identifierType || `${frame.callee}Id`, tag: true } : null)
      : projectionParameters(frame.callee)[position];
    if (segment.length > (v(segment[0]) === 'each' ? 1 : 0)) return done(false);
    if (slot && slot.tag && !segment.length) push('each', 'keyword', 'once per element of a list', { insert: 'each ', sort: 2 });
    if (slot && !slot.tag) valueItems(slot.propertyType);
    operandItems(scope, { prefer: (x) => (slot && x.propertyType ? x.propertyType === slot.propertyType : true) });
    return done();
  }
  if (k === 'count') {
    if (commandName) { operandItems(commandScope(commandName)); return done(); }
    if (frame.decl && frame.decl.keyword === 'projection') {
      for (const p of projectionParameters(frame.decl.name)) push(p.name, 'projectionParameter', p.propertyType, { sort: 0 });
      definitionItems('projection-definition', { exclude: [frame.decl.name], call: projectionCall });
    }
    return done();
  }
  // Inside `min(…)` / `max(…)`: the two sides, each a read or one of
  // this projection's own parameters.
  if (k === 'derivedOperands') {
    if (segment.length) return done(false);
    definitionItems('projection-definition', { exclude: [frame.decl && frame.decl.name], sort: 0, call: projectionCall, detail: (n, b) => `${b.valueType}` });
    ownParameterItems(frame.decl && frame.decl.name);
    return done();
  }
  // A derived operand's values: one of this projection's own
  // parameters, those of the type the callee declares at that position
  // first – or, for an argument, a literal of it.
  if (k === 'derivedArgs') {
    const ownName = frame.decl && frame.decl.name;
    const position = framed.filter((t) => t.v === ',').length - restOfFrame.filter((t) => t.v === ',').length;
    const slot = projectionParameters(frame.callee)[position];
    if (segment.length) return done(false);
    if (slot && !slot.tag) valueItems(slot.propertyType);
    ownParameterItems(ownName, slot && slot.propertyType);
    return done();
  }
  if (k === 'scenarios') {
    if (!s.length) keywords([['scenario', SOURCE_SCENARIO_SNIPPET, true]]);
    return done(false);
  }
  if (k === 'scenario') {
    const block = frame.block;
    // Where the Then is being written, what the model makes of the
    // scenario – each whole outcome, its `and` lines included, as one
    // item, from where the cursor is: the line's start, after `then`,
    // or after a projection's read and its `==` (`sourceOutcomesAt`).
    const outcome = (from) => {
      for (const found of model ? sourceOutcomesAt(model, text, line) : []) {
        let written = found.lines;
        if (from === 'then') written = [written[0].replace(/^then /, ''), ...written.slice(1)];
        if (from === 'read' || from === '==') {
          if (found.value === undefined) continue;
          written = [from === 'read' ? `== ${found.value}` : found.value];
        }
        push(written[0] + (written.length > 1 ? ' …' : ''), 'text', 'what the model does', { insert: written.join('\n'), sort: 0 });
      }
    };
    if (!s.length) {
      // What is already said is continued, not said again.
      const said = new Set(tokens.filter((t, i) => i > frame.open && level[i] === frame.level && t.first).map((t) => t.v));
      if (!said.has('then')) outcome('line');
      keywords([['given', 'given '], ['when', 'when '], ['then', 'then ']].filter(([word]) => !said.has(word)));
      const above = scenarioLead(frame, statement(frame, tokens.length));
      if (above === 'given' || above === 'then') keywords([['and', 'and ']]);
      return done(false);
    }
    const first = scenarioLead(frame, s);
    if (first === 'given' && s.length === 1) { definitionItems('event-definition', { sort: 0, call: (n) => `${n} { $1 }` }); return done(); }
    if (first === 'when' && s.length === 1) {
      if (block && block.kind === 'command') push(block.name, 'command', 'this command', { insert: `${block.name} { $1 }`, snippet: true, sort: 0 });
      definitionItems('command-definition', { sort: 1, call: (n) => `${n} { $1 }` });
      return done();
    }
    if (first === 'then' && s.length === 1) {
      if (v(s[0]) === 'then') outcome('then');
      if (block && block.kind === 'projection') {
        push(block.name, 'projection', 'its value', { insert: `${projectionCall(block.name)} == $0`, snippet: true, sort: 0 });
        return done();
      }
      const emits = commandName ? commandScope(commandName).emits : [];
      definitionItems('event-definition', { sort: (n) => (emits.includes(n) ? 0 : 2), call: (n) => `${n} { $1 }` });
      keywords([['nothing'], ['rejected', 'rejected "${1}"', true]], 1);
      return done();
    }
    if (first === 'then' && v(s[1]) === 'rejected') {
      if (s.length === 2 && commandName) { rejectionItems(commandName); return done(); }
    }
    if (v(s[0]) === 'then' && (prev === ')' || prev === '==') && v(s[2]) === '(') {
      outcome(prev === ')' ? 'read' : '==');
      return done();
    }
    return done(false);
  }
  // A projection scenario's values: a tag literal of the declared type,
  // or a value of an argument's type.
  if (k === 'thenArgs') {
    const position = framed.filter((t) => t.v === ',').length - restOfFrame.filter((t) => t.v === ',').length;
    const slot = projectionParameters(frame.callee)[position];
    if (segment.length || !slot) return done(false);
    if (slot.tag) push(`${slot.propertyType}("…")`, 'type', 'tag literal', { insert: `${slot.propertyType}("$1")`, snippet: true, sort: 0 });
    else valueItems(slot.propertyType);
    return done();
  }
  if (k === 'payload') {
    let properties;
    if (frame.event) properties = list((def('event-definition', frame.event) || {}).properties);
    else if (frame.command) properties = list((def('command-definition', frame.command) || {}).properties);
    else properties = [];
    return argumentItems(properties, {
      value: (key) => {
        const p = properties.find((x) => x.name === key);
        if (p) valueItems(p.propertyType);
        if (p && p.isOptional) push('null', 'keyword', '', { sort: 1 });
        return done();
      },
    });
  }
  return done(false);
}

// ============================================================
// Folding – off the tokens alone, since a text being edited rarely
// parses and what folds should not come and go with it.
// ============================================================

// Every bracket pair that spans lines, as `{ start, end, scenarios }`
// in 1-based lines. A block folds to the line before its closing
// bracket, which stays in view the way an editor shows one; a
// `scenarios` group folds whole, closing brace included, so a block's
// examples put away cost one line rather than two.
function sourceFoldingRanges(text) {
  const { tokens } = lexSource(String(text));
  const ranges = [];
  const open = [];
  tokens.forEach((token, i) => {
    if (token.t !== 'punct') return;
    if (['{', '[', '('].includes(token.v)) {
      const previous = tokens[i - 1];
      const group = token.v === '{' && !!previous && previous.t === 'ident' && previous.v === 'scenarios'
        && previous.first && previous.line === token.line;
      open.push({ start: token.line, group });
    } else if (['}', ']', ')'].includes(token.v) && open.length) {
      const pair = open.pop();
      const end = pair.group ? token.endLine : token.line - 1;
      if (end > pair.start) ranges.push({ start: pair.start, end, scenarios: pair.group });
    }
  });
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

// Where a text uses what the experimental flag keeps off the pages, as
// `{ line, col, endLine, endCol, message }` – read off the tokens, so a
// text that does not parse is marked too. The editor shows them at
// info level while the flag is off: the text reads and applies whole
// either way, as a model using them loads whole.
function sourceExperimentalMarks(text) {
  const tokens = lexSource(text).tokens;
  const out = [];
  const said = (token, what) => out.push({
    line: token.line, col: token.col, endLine: token.endLine, endCol: token.endCol,
    message: `${what} is experimental – turn experimental features on in Settings to author it on the pages.`,
  });
  // Which blocks are scenarios: `when` there is a scenario's, not a guard.
  const frames = [];
  let scenarioNext = false;
  tokens.forEach((token, i) => {
    const v = token.v;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    if (token.t === 'punct' && v === '{') { frames.push(scenarioNext); scenarioNext = false; return; }
    if (token.t === 'punct' && v === '}') { frames.pop(); return; }
    if (token.t === 'punct' && v === '?' && tokens[i - 2] && tokens[i - 2].v === 'alias') { said(token, 'An optional read'); return; }
    if (token.t !== 'ident') return;
    if (v === 'scenario') { scenarioNext = true; return; }
    if (v === 'entity' && next && next.t === 'ident') said(token, 'An entity');
    else if (v === 'lifecycle' && next && next.t === 'ident' && !(prev && prev.v === '=')) said(token, 'A lifecycle');
    else if (v === 'scripted' && next && (next.v === 'projection' || next.v === 'untagged')) said(token, 'A scripted projection');
    else if (v === 'excluding') said(token, '"excluding"');
    else if (v === 'currentValue') said(token, 'currentValue');
    else if (v === 'when' && !frames.includes(true)) said(token, 'A guarded emission');
  });
  return out;
}

// ============================================================
// The language, for an agent: what the WebMCP tool
// `get_model_language` answers with – enough to write a whole model
// as text without ever having seen one. A guide, the forms a rule can
// take, a tour that declares a complete model using every construct
// the tools offer, and a shipped model as the printer prints it.
//
// None of it is free prose that could rot: dsl.test.js parses the
// tour (no diagnostics, no advisories, nothing experimental, scenarios
// recorded), holds the example to `modelToSource` of the shipped model
// it names, and requires every keyword of the grammar outside the
// experimental ones to appear in the tour or the forms – so a new
// construct cannot ship without the agent being told about it. The
// experimental constructs are left out on purpose: WebMCP does not
// offer them (see webmcp.js).
// ============================================================

const SOURCE_REFERENCE_GUIDE = `# The DCB model language

The text get_model_source returns, apply_model_source applies and start_model takes as its source.

- A text is the whole model: a model "Name" line, then types, events, projections and commands. A definition left out of an applied text is removed – apply_model_source refuses that unless told allowRemovals: true – so to change a model, edit what get_model_source returned and send all of it back.
- A text with any error is refused whole, with each error's line and column; fix them and send it again. What does not stop it (an event nothing emits, a read of a projection nobody declared) comes back as advisories with the result; fix those as well.
- DCB in brief: events are tagged by identifier values; a projection folds the events that carry its tags into one value; a command reads projections, checks its rules and emits events. Its consistency boundary is exactly what it reads – derived, never declared (derive_boundary shows it).
- Definitions, enum members and records are PascalCase; properties, parameters, tags and aliases are camelCase.
- // and /* */ are comments. They are not stored.
- @tagSchema("{type}={value}") on the line before a tag type changes how its values render as tags; "{type}:{value}" is the default.
- @icon("📦") on the line before an event or a command gives it the mark the pages show it with – one emoji or short glyph.
- @feature("Course management") on the line before a command puts it in that feature group; the pages list commands by feature. A command without one is ungrouped.`;

const SOURCE_REFERENCE_FORMS = `Rules (after require), each negated by a leading not:
  a == b    a != b    a < b    a <= b    a > b    a >= b
  a in [Draft, Published]       a not in [Draft, Published]
  xs contains x    x in xs      (a list value holding x)
  xs containsAny ys    s startsWith "c"    s endsWith "c"
  count(xs) == 3                (also !=, < and >)
  a is empty    a is not empty    a is true    a is false

Operands: a parameter (courseId) or its record field (items.price), an alias or its field,
a read P(…), a literal ("text", 3, true, null, [..]), an enum member (Archived),
a tag literal naming its type (CourseId("c1")).

Scenarios sit in one scenarios { … } group at the end of the block of the command or
projection they exercise, and name it:
  scenario "<what it shows>" { given E { … }  and E2 { … }  when C { … }  then E { … }  and E3 { … } }
  then rejected "<rule message>"    then nothing    then P(CourseId("c1")) == <value>
Say given, when and then once each, one command per scenario; further events continue with and.
Leave then out and applying records what the model does, and the result says which scenarios it recorded.

A definition printed as command X json { … } is stored JSON the language cannot spell.
Leave it as it is, or rewrite it in the language.`;

const SOURCE_REFERENCE_TOUR = `model "Library"

// ---- Types ----
// "type" names a value type: a JSON Schema base type (string, number,
// integer, boolean, object, array, null), optionally constrained by a
// JSON Schema object.
type Isbn = string { pattern: "^[0-9-]+$" }
// "tag type" is a value type events can be tagged by: an identifier.
tag type BookId = string
tag type MemberId = string
tag type LoanId = string { pattern: "^l[0-9]+$" }
enum BookStatus { Unknown, Available, Lent, Withdrawn }
// A record is a composite value; every field is one required value.
record Copy { bookId: BookId, isbn: Isbn }

// ---- Events ----
// "tag" marks each value the event is tagged by; "name?:" is optional
// (null when absent), "X[]" a list, and "tag each f" tags the event once
// per element of a list of records, by that field.
event BookAdded { tag bookId: BookId, isbn: Isbn, title: string, subtitle?: string }
event CopiesDonated { donor: string, copies: Copy[] tag each bookId }
event BookLent { tag bookId: BookId, tag memberId: MemberId, tag loanId: LoanId }
event BookReturned { tag bookId: BookId, tag memberId: MemberId }
event BookWithdrawn { tag bookId: BookId }
event MemberJoined { tag memberId: MemberId, name: string }

// ---- Projections ----
// A projection folds the events it handles into one value, kept per
// the tags in its header, "(tag name: TagType)", several ANDed; then
// the type it holds ("X[]" for a list) and its initial value.
// Each arm is "on Event => <operation>": set a value, increment /
// decrement an integer, append / remove a list element. A value is
// a literal, an enum member, event.data.<property> or
// successor(event.data.<property>) (the next identifier: c1 -> c2).
projection BookStatus (tag bookId: BookId): BookStatus = Unknown {
  on BookAdded => set Available
  on CopiesDonated => set Available
  on BookLent => set Lent
  on BookReturned => set Available
  on BookWithdrawn => set Withdrawn
}

projection BookTitle (tag bookId: BookId): string = null {
  on BookAdded => set event.data.title
}

projection MemberExists (tag memberId: MemberId): boolean = false {
  on MemberJoined => set true
}

projection MemberLoanCount (tag memberId: MemberId): integer = 0 {
  on BookLent => increment 1
  on BookReturned => decrement 1
}

projection BookBorrowers (tag bookId: BookId): MemberId[] = [] {
  on BookLent => append event.data.memberId
}

projection MemberHasBook (tag memberId: MemberId, tag bookId: BookId): boolean = false {
  on BookLent => set true
  on BookReturned => set false

  // A projection's scenarios assert its value after the given events.
  // A tag value given as a literal names its type: MemberId("m1").
  scenarios {
    scenario "a lent book is with the member" {
      given BookLent { bookId: "b1", memberId: "m1", loanId: "l1" }
      then MemberHasBook(MemberId("m1"), BookId("b1")) == true
    }
  }
}

// "untagged" folds the whole log: a global numbering is the case.
untagged projection LoanNumbering: LoanId = "l1" {
  on BookLent => set successor(event.data.loanId)
}

// A derived projection handles no events: its block holds one
// expression over other projections, read with this one's own
// parameters, and it starts from what they start at. It computes a
// number – a + b, a - b, a * b, min(a, b), max(a, b) – or compares two
// values, written as a rule is, and holds the boolean. Its query is
// theirs.
derived projection MemberLoansLeft (tag memberId: MemberId): integer {
  5 - MemberLoanCount(memberId)
}

// A parameter without "tag" is an argument: a read gives it after the
// tags, and it narrows nothing. A derived projection compares or
// computes with it by name, or passes it on to a read.
derived projection MemberCanBorrow (tag memberId: MemberId, books: integer): boolean {
  MemberLoansLeft(memberId) >= books
}

derived projection MemberLoansLeftCapped (tag memberId: MemberId): integer {
  min(MemberLoansLeft(memberId), 3)
}

// ---- Commands ----
// Parameters are typed like event properties. A projection is read
// with its tag values (then arguments) in parentheses, in header order,
// "LoanNumbering()" when untagged; "each" reads once per list element.
// Every "require" names the message the command is rejected with.
// "emit" lists each event property: "name" alone takes the parameter
// of that name, "name: <operand>" anything else.
// The consistency boundary is derived from the reads; never declare it.
command AddBook(bookId: BookId, isbn: Isbn, title: string, subtitle?: string) {
  require BookStatus(bookId) == Unknown
    else reject "Book already exists"
  require title is not empty
    else reject "A book needs a title"

  emit BookAdded { bookId, isbn, title, subtitle }

  // A command's scenarios: given events, when the command runs with
  // these arguments, then the events it records, or rejected "<message>"
  // with a rule's message, or nothing.
  scenarios {
    scenario "a new book is added" {
      when AddBook { bookId: "b1", isbn: "978-0", title: "Dune", subtitle: null }
      then BookAdded { bookId: "b1", isbn: "978-0", title: "Dune", subtitle: null }
    }

    scenario "a book is added once" {
      given BookAdded { bookId: "b1", isbn: "978-0", title: "Dune", subtitle: null }
      when AddBook { bookId: "b1", isbn: "978-0", title: "Dune", subtitle: null }
      then rejected "Book already exists"
    }
  }
}

command DonateCopies(donor: string, copies: Copy[]) {
  require copies is not empty
    else reject "Nothing was donated"
  require count(copies) < 50
    else reject "Too many copies at once"
  require BookStatus(each copies.bookId) == Unknown
    else reject "A copy is already in the catalogue"

  emit CopiesDonated { donor, copies }
}

command JoinLibrary(memberId: MemberId, name: string) {
  require MemberExists(memberId) is false
    else reject "Already a member"
  require not name startsWith " "
    else reject "A name starts with a letter"

  emit MemberJoined { memberId, name }
}

// "alias" names a read for the rules and emissions below it.
command LendBook(bookId: BookId, memberId: MemberId) {
  alias loanNumber = LoanNumbering()
  require BookStatus(bookId) == Available
    else reject "Book is not available"
  require MemberExists(memberId) is true
    else reject "Not a member"
  require MemberCanBorrow(memberId, 1) is true
    else reject "Too many loans"
  require BookBorrowers(bookId) not contains memberId
    else reject "Borrowed this book before"

  emit BookLent { bookId, memberId, loanId: loanNumber }
}

command ReturnBook(bookId: BookId, memberId: MemberId) {
  require MemberHasBook(memberId, bookId) is true
    else reject "Book is not with this member"

  emit BookReturned { bookId, memberId }
}

command WithdrawBook(bookId: BookId) {
  require BookStatus(bookId) in [Available, Lent]
    else reject "Book is not in the catalogue"

  emit BookWithdrawn { bookId }
}
`;

const SOURCE_REFERENCE_EXAMPLE = `model "Course Example (simple)"

// Types
enum CourseStatus { NonExistent, Existent, Archived }
tag type StudentId = string
tag type CourseId = string

// Events
event CourseDefined { tag courseId: CourseId, capacity: integer }
event CourseCapacityChanged { tag courseId: CourseId, newCapacity: integer }
event CourseArchived { tag courseId: CourseId }
event StudentRegistered { tag studentId: StudentId }
event StudentSubscribedToCourse { tag courseId: CourseId, tag studentId: StudentId }
event StudentUnsubscribedFromCourse { tag courseId: CourseId, tag studentId: StudentId }

// Projections
projection StudentExists (tag studentId: StudentId): boolean = false {
  on StudentRegistered => set true
}

projection StudentSubscriptionCount (tag studentId: StudentId): integer = 0 {
  on StudentSubscribedToCourse => increment 1
  on StudentUnsubscribedFromCourse => decrement 1
}

projection CourseStatus (tag courseId: CourseId): CourseStatus = NonExistent {
  on CourseDefined => set Existent
  on CourseArchived => set Archived
}

projection CourseCapacity (tag courseId: CourseId): integer = 0 {
  on CourseDefined => set event.data.capacity
  on CourseCapacityChanged => set event.data.newCapacity
}

projection CourseSubscriptionCount (tag courseId: CourseId): integer = 0 {
  on StudentSubscribedToCourse => increment 1
  on StudentUnsubscribedFromCourse => decrement 1
}

projection CourseSubscribedStudentIds (tag courseId: CourseId): StudentId[] = [] {
  on StudentSubscribedToCourse => append event.data.studentId
  on StudentUnsubscribedFromCourse => remove event.data.studentId
}

// Commands
command DefineCourse(courseId: CourseId, capacity: integer) {
  require CourseStatus(courseId) == NonExistent
    else reject "Course already exists"

  emit CourseDefined { courseId, capacity }
}

command ChangeCourseCapacity(courseId: CourseId, newCapacity: integer) {
  require CourseStatus(courseId) == Existent
    else reject "Course is not active"
  require CourseSubscriptionCount(courseId) <= newCapacity
    else reject "Course has more subscriptions than that"

  emit CourseCapacityChanged { courseId, newCapacity }
}

command ArchiveCourse(courseId: CourseId) {
  require CourseStatus(courseId) == Existent
    else reject "Course is not active"

  emit CourseArchived { courseId }
}

command RegisterStudent(studentId: StudentId) {
  require StudentExists(studentId) is false
    else reject "Student is already registered"

  emit StudentRegistered { studentId }
}

command SubscribeStudentToCourse(courseId: CourseId, studentId: StudentId) {
  require CourseStatus(courseId) == Existent
    else reject "Course is not active"
  require StudentExists(studentId) is true
    else reject "Student is not registered"
  require CourseSubscriptionCount(courseId) < CourseCapacity(courseId)
    else reject "Course is full"
  require CourseSubscribedStudentIds(courseId) not contains studentId
    else reject "Student is already subscribed"
  require StudentSubscriptionCount(studentId) < 10
    else reject "Student is subscribed to too many courses"

  emit StudentSubscribedToCourse { courseId, studentId }
}

command UnsubscribeStudentFromCourse(courseId: CourseId, studentId: StudentId) {
  require CourseStatus(courseId) == Existent
    else reject "Course is not active"
  require CourseSubscribedStudentIds(courseId) contains studentId
    else reject "Student is not subscribed"

  emit StudentUnsubscribedFromCourse { courseId, studentId }
}
`;

// The shipped model the example is printed from – held to the printer
// by dsl.test.js.
const SOURCE_REFERENCE_EXAMPLE_SLUG = 'course-simple';

const SOURCE_REFERENCE_UNOFFERED = 'Not offered to agents: entities, lifecycles, scripted projections, '
  + 'guarded emissions (emit … when …), optional reads (alias x? = …), excluding '
  + 'and currentValue. A text or '
  + 'definition that adds one is refused. A model that already uses them shows them in get_model_source; keep those parts as they are.';

function sourceLanguageReference() {
  return [
    SOURCE_REFERENCE_GUIDE,
    '## Forms\n\n' + SOURCE_REFERENCE_FORMS,
    '## Tour – a complete model using every construct\n\n~~~\n' + SOURCE_REFERENCE_TOUR + '~~~',
    '## Example – a shipped model, as get_model_source prints it\n\n~~~\n' + SOURCE_REFERENCE_EXAMPLE + '~~~',
    SOURCE_REFERENCE_UNOFFERED,
  ].join('\n\n') + '\n';
}

// ============================================================
// The grammar as Monaco reads it (a Monarch definition). Data, so the
// keyword list sits next to the parser that gives the words meaning.
// ============================================================

const SOURCE_KEYWORDS = [
  'model', 'type', 'tag', 'enum', 'record', 'event', 'entity', 'lifecycle', 'untagged', 'derived', 'scripted',
  'projection', 'min', 'max', 'initialState', 'exposes', 'on', 'set', 'increment', 'decrement', 'append',
  'remove', 'command', 'alias', 'each', 'excluding', 'require', 'emit', 'when', 'and', 'not', 'is',
  'empty', 'in', 'contains', 'containsAny', 'startsWith', 'endsWith', 'count', 'successor',
  'currentValue', 'json', 'true', 'false', 'null', 'scenarios', 'scenario', 'given', 'then', 'nothing', 'rejected',
  'else', 'reject',
];

// The words a block's statements start with, coloured apart so the
// shape of a command – what it reads, requires, emits – shows at a
// glance.
const SOURCE_STATEMENTS = ['alias', 'require', 'emit', 'when', 'on', 'scenarios', 'scenario', 'given', 'then'];

const SOURCE_MONARCH = {
  keywords: SOURCE_KEYWORDS,
  statements: SOURCE_STATEMENTS,
  baseTypes: [...SOURCE_BASE_TYPES],
  tokenizer: {
    root: [
      [/```/, { token: 'string.code', next: '@code', nextEmbedded: 'javascript' }],
      [/@[A-Za-z_]\w*/, 'annotation'],
      [/event(?=\.data\.)/, 'keyword'],
      [/[A-Z]\w*/, 'type.identifier'],
      [/[a-z_]\w*/, { cases: { '@statements': 'keyword.flow', '@keywords': 'keyword', '@baseTypes': 'type', '@default': 'identifier' } }],
      { include: '@whitespace' },
      [/[{}()[\]]/, '@brackets'],
      [/=>|==|!=|<=|>=|[<>=?:.,]/, 'delimiter'],
      [/\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
      [/[-+*]/, 'operator'],
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string'],
    ],
    code: [
      [/```/, { token: 'string.code', next: '@pop', nextEmbedded: '@pop' }],
      [/[^`]+/, ''],
      [/`/, ''],
    ],
    string: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],
    whitespace: [
      [/[ \t\r\n]+/, ''],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],
    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
  },
};

