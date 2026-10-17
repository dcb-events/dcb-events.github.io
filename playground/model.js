// ============================================================
// DCB Playground – model layer.
//
// The semantics behind `index.html`. Nothing here touches the DOM: it
// is the event log, the projection over it, type resolution, reference
// tracking, validation, DCB derivation, the editing commands and the
// predefined models.
//
// **Validation is split in two.** The write path refuses only what
// could not be stored as a definition at all – a missing key, a name
// collision, a body whose containers are not the lists they claim
// (`assertStorableBody`). Everything semantic – dangling references,
// write coverage, enum membership, name idiom – is an *advisory*:
// computed from the stored state by `modelAdvisories`, surfaced by the
// interface and the agent tools, never thrown at a writer. A defective
// model loads, renders and evaluates; whatever its defects break
// surfaces where it breaks, as the ordinary error outcome.
//
// Loaded as a classic script (not a module) so the playground opens
// straight from the filesystem without a server.
//
// One thing here is not in the declarative language proper and is
// worth finding before reading anything else.
//
// **Scripted projections**: a property or a projection may replace its
// declarative handlers with code, one body per event type. This is the
// escape hatch for state whose accumulation cannot be declared –
// windows, running comparisons, anything needing a value the previous
// events implied rather than carried. It costs real validation: the
// code is stored and displayed but nothing here parses or runs it, so
// a scripted handler is checked for the events it claims and nothing
// more. What it deliberately does *not* cost is the derived DCB: the
// query still comes from the handler keys and the tags from the
// binding, so a scripted projection reads exactly as legibly in a
// boundary as a declared one.
//
// Command bodies carry an optional `feature`, naming the group a
// command belongs to. Nothing in the model reads it – it rides along
// untouched through validation, references and renames – and it is the
// one field a DCB Model carries that the modelled system does not
// read. See `CommandDefinition.feature` in dcb-model.schema.json.
// ============================================================

// ============================================================
// Constants.
// ============================================================
// Bumped whenever a stored definition changes shape. The log is the
// whole state, so an old log replayed against new validation would
// produce models this build refuses to save – a fresh key is honest
// about that where a silent migration would not be. v8 dropped
// property retention and a binding's `asOf`. v9 dropped the reserved
// `status` property and its entity-derived enum: a lifecycle is now an
// ordinary enum custom type plus an ordinary property, like any other.
// v10 merged identifier types into custom types: `isTag` now lives on
// a custom type directly, an entity's derived identifier is an
// ordinary custom type created alongside it, and there is no longer a
// separate identifier-type-definition kind. v12 dropped the `timestamp`
// type and the event envelope (`recordedAt`) entirely: no definition
// referenced them structurally, but the envelope's asymmetry machinery
// and the required instant on every Given step are gone. v13 renamed
// the artifact from "DCB Context" to "DCB Model": the three lifecycle
// event types and the `dcb-context-id` they carried are spelled with
// `model` now, and nothing reads the old spelling. This is the one bump
// so far that changes no shape at all – only names – which is exactly
// why it needs a fresh key rather than a quiet coexistence.
// v14 unified projections: an entity property is now a *binding* –
// `{name, projection}` – pointing at an ordinary `projection-definition`,
// every projection declares its partition as explicit `parameters`,
// `isOptional` is gone, and an initial value may be any typed literal
// including a non-empty list. v15 generalised property scenarios into
// projection scenarios: one asserts over a list of `reads` rather than
// over one entity instance's properties, which is the same
// generalisation v14 made to the thing being asserted about. v16
// narrowed a projection scenario back to a single subject: the list of
// aliased `reads` became one `projection` plus its `arguments`, and the
// Then asserts that one fold's value rather than a keyed set. v17 let
// a boundary binding declare `isOptional`: an unset identifier binds
// nothing instead of erroring. Additive in shape, but a v16 reader
// errors on the case the flag declares expected, so the key moves.
// v18 added guarded emissions (`when` on a publishes entry) and
// derived projections (`derived` in place of handlers): a v17 reader
// would publish an emission its author made conditional and has no
// fold for a handlerless projection – both misreads, so the key moves.
// v19 made an entity's lifecycle an explicit designation: the entity
// carries `lifecycle`, naming one of its own property bindings, and the
// two-state case is an ordinary `boolean` projection rather than a
// `NonExistent`/`Existent` enum. The `status` convention is gone – no
// reader keys off the name any more – so a v18 log replayed here would
// produce entities whose lifecycle nothing designates.
// v20 gave every rule a rejection message (`rejection` on a command's
// conditions) and made a refusal known by it: a scenario's Then holds
// the message as `rejection`, in place of a `failedRule` naming the
// condition's text and index and the values it read. A v19 log has
// neither, and there is no message to invent for it.
// v21 made an event's tags explicit (`tags` on the event, 8.0): a v20
// log's events list none, so replayed here every one of them would be
// untagged.
// v22 moved the tags back onto the projection, named (`tags: [{name,
// tagType}]`, empty for an untagged one), and made a read supply a value
// per name (`tags: {courseId: …}`) where it had listed operands; a
// derived operand passes its owner's tags on by name, and an entity's
// fan-out is marked (`id: {each: …}`). A v21 read has no names to match.
// v23 moved a script's `arguments` onto the projection (10.0), where a
// derived projection declares them too; a v22 script's arguments would
// read as none.
const EVENT_LOG_KEY = 'dcb-playground:events:v23';

const DEF_KINDS = [
  'entity-definition',
  'event-definition',
  'projection-definition',
  'command-definition',
  'custom-type-definition',
  'scenario-definition',
  'projection-scenario-definition',
];
const DEF_COLLECTIONS = {
  'entity-definition': 'entity-definitions',
  'event-definition': 'event-definitions',
  'projection-definition': 'projection-definitions',
  'command-definition': 'command-definitions',
  'custom-type-definition': 'custom-type-definitions',
  'scenario-definition': 'scenario-definitions',
  'projection-scenario-definition': 'projection-scenario-definitions',
};
const KIND_COLOR_CLASS = {
  'entity-definition': 'entity',
  'event-definition': 'event',
  'projection-definition': 'projection',
  'command-definition': 'command',
  'custom-type-definition': 'custom-type',
  'scenario-definition': 'scenario',
  'projection-scenario-definition': 'scenario',
};

const KIND_SECTION_TITLE = {
  'entity-definition': 'Entities',
  'event-definition': 'Events',
  'projection-definition': 'Projections',
  'command-definition': 'Commands',
  'custom-type-definition': 'Custom Types',
  'scenario-definition': 'Scenarios',
  'projection-scenario-definition': 'Projection scenarios',
};

// A scenario is identified by a generated id rather than by its name,
// which is the same shape a DCB Model itself has and for the same
// reason: its name is derived from what the command did and is the
// modeler's to overwrite, so two scenarios of one command may well want
// to be called the same thing. Every other definition kind is keyed by
// a name that *is* its identity, and renaming one is what moves every
// reference to it. A projection scenario is the same shape for the same
// reason, one level down: it belongs to an entity rather than a
// command, but its name is still derived from what it found, not
// chosen up front.
const ID_KEYED_KINDS = ['scenario-definition', 'projection-scenario-definition'];

function isIdKeyed(kind) { return ID_KEYED_KINDS.includes(kind); }

const SIMPLE_TYPES = ['boolean', 'integer', 'string'];

// A lifecycle is an ordinary property, folded like any other – what
// makes it the lifecycle is that the entity *designates* it, by name,
// in `lifecycle`. Nothing keys off the property's own name any more:
// `exists` is only what the Entity view's "+ lifecycle → exists" types,
// and an entity whose lifecycle is called `state` or `phase` reads
// exactly the same.
//
// No entity gets one unasked. A new entity is bare – its identifier
// and nothing else – and the existence wording ("course exists") is
// licensed by a designation, so until an author adds a lifecycle that
// wording appears nowhere. The two-state case is a plain `boolean`,
// not an enum: no custom type and no vocabulary to learn, the thing
// either exists or it does not. An enum is the other way in, and
// promoting a boolean to one has to ask for names, so both are
// gestures rather than inferences – see
// `docs/research/2026-09-30-entity-lifecycle-as-boolean-existence.md`.
const LIFECYCLE_PROPERTY = 'exists';

const PASCAL_RE = /^[A-Z][A-Za-z0-9]+$/;
const CAMEL_RE = /^[a-z][A-Za-z0-9]+$/;

const UNARY_PREDICATES = ['isEmpty', 'isNotEmpty', 'isTrue', 'isFalse'];
const BINARY_PREDICATES = [
  'equals',
  'equalsAny',
  'countEquals',
  'countLessThan',
  'countGreaterThan',
  'contains',
  'containsAny',
  'lessThan',
  'lessThanOrEquals',
  'greaterThan',
  'greaterThanOrEquals',
  'startsWith',
  'endsWith',
];
const PREDICATE_SYMBOL = {
  equals: '==',
  lessThan: '<',
  lessThanOrEquals: '<=',
  greaterThan: '>',
  greaterThanOrEquals: '>=',
};

// What a derived projection may state: the binary vocabulary minus
// `equalsAny`, whose literal-list spelling belongs to command rules.
// Whatever the predicate, the derived value is one boolean.
const DERIVED_PREDICATES = BINARY_PREDICATES.filter((p) => p !== 'equalsAny');

// What a derived projection may compute instead (9.0): one operator
// over two numbers, yielding a number. No `divide` – an integer stays
// an integer, and there is no division by zero to define. A longer
// expression is a chain of derived projections, each one value the
// sandbox can watch.
const DERIVED_OPERATORS = ['add', 'subtract', 'multiply', 'min', 'max'];
const DERIVED_OPERATOR_SYMBOL = { add: '+', subtract: '-', multiply: '*' };

const OPERATIONS = ['set', 'increment', 'decrement', 'append', 'remove'];

// ============================================================
// Event store (localStorage-backed append-only log).
// ============================================================

// A log that is not storage's: while `inScratchLog` runs, every read
// and write of the log goes to this array instead, nobody is told of
// an append, nothing compacts, and the revision stays where it was –
// `projectState` folds the scratch log uncached instead – so every
// cache of the real log survives it. It exists so a model can be built
// by the very command functions an import uses – entity identifier
// types, retries, the structural gate and all – without that model
// ever reaching the log, the undo history or another tab.
let scratchLog = null;

function inScratchLog(build) {
  const saved = scratchLog;
  scratchLog = [];
  try {
    return build(scratchLog);
  } finally {
    scratchLog = saved;
  }
}

function loadEvents() {
  if (scratchLog) return scratchLog;
  const raw = localStorage.getItem(EVENT_LOG_KEY);
  if (raw === null) return [];
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch { /* handled below: unparseable is corrupt */ }
  if (Array.isArray(parsed)) return parsed;
  // The log is the whole state, so an unreadable one – bad JSON or the
  // wrong shape – is never left where the next append would overwrite
  // the only copy. It is moved aside, where a hand or a future build
  // can still reach it, and the app starts over honestly empty.
  localStorage.setItem(EVENT_LOG_KEY + ':corrupt', raw);
  localStorage.removeItem(EVENT_LOG_KEY);
  bumpLogRevision();
  if (typeof toast === 'function') {
    toast(
      'The stored event log could not be read. The raw value was kept under '
      + `"${EVENT_LOG_KEY}:corrupt" and the playground started over.`, true
    );
  }
  return [];
}

// Bumped by every writer of the log – `appendEvents` here, undo and
// redo in the page, the corrupt-log move-aside below – so a cache can
// ask "has anything changed?" without parsing the log to find out.
// A writer that skips its bump is the one way the caches below go
// stale; nothing re-reads storage to double-check. Another tab's write
// is a writer too: the page bumps on its `storage` event.
let logRevision = 0;
function bumpLogRevision() { logRevision += 1; }
function logRevisionNow() { return logRevision; }

// Told after every append, with where it began and what landed. This
// is the one seam every write funnels through – command functions
// behind buttons and agent tools alike – which is what lets the
// interface take undo marks here rather than wrapping each of the
// hundred call sites. Undo and redo restore the log by writing the
// storage key directly, so they never renotify.
const appendListeners = [];
function onAppend(listener) { appendListeners.push(listener); }

function appendEvents(newEvents) {
  if (scratchLog) {
    scratchLog.push(...stampEvents(newEvents, scratchLog.length));
    return;
  }
  let log = loadEvents();
  const append = () => {
    const startSeq = log.length;
    const stamped = stampEvents(newEvents, startSeq);
    const size = writeEventLog([...log, ...stamped]);
    return { startSeq, stamped, size };
  };
  let written;
  try {
    written = append();
  } catch (error) {
    if (!(error instanceof StorageFullError)) throw error;
    // Full: make room and try again – first by folding what no undo
    // step reaches, then, if that is not enough, everything. Only a
    // change that does not fit even then is refused.
    for (const keepFrom of [compactionFloor(log), log.length]) {
      const compacted = compactedLog(log, keepFrom);
      if (!compacted) continue;
      try {
        log = compacted.events;
        written = append();
      } catch (retry) {
        if (!(retry instanceof StorageFullError)) throw retry;
        continue;
      }
      notifyCompacted(compacted);
      break;
    }
    if (!written) throw error;
  }
  for (const listener of appendListeners) listener(written.startSeq, written.stamped);
  if (written.size > logCompactAt) compactLog();
}

function stampEvents(events, from) {
  const timestamp = new Date().toISOString();
  return events.map((e, i) => ({ sequence: from + i, timestamp, type: e.type, data: e.data }));
}

// The one way the whole log is written – an append, undo and redo, a
// compaction – so the revision is bumped by every writer, and a full
// storage is reported the same way to each. The quota is the browser's
// for the whole site (on dcb.events, shared with the website), and the
// log is rewritten whole on every edit: past it, every edit would fail
// with nothing said but the browser's error name.
// Returns the length written, in characters.
function writeEventLog(events) {
  if (scratchLog) {
    scratchLog.splice(0, scratchLog.length, ...events);
    return 0;
  }
  const text = JSON.stringify(events);
  try {
    localStorage.setItem(EVENT_LOG_KEY, text);
  } catch (error) {
    if (error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      throw new StorageFullError();
    }
    throw error;
  }
  bumpLogRevision();
  return text.length;
}

// ---------- compaction ----------
//
// The log keeps every edit ever made, and is rewritten whole on every
// append, so left alone it grows into the quota – a few megabytes for
// the whole site, on dcb.events shared with the website. Past a size it
// is compacted, unasked: the events up to a point are replaced by the
// shortest history that builds the same state – per model, its
// creation and one add per definition, in order; deleted models leave
// nothing – and the events after it are kept as they were, renumbered.
// Nobody is asked because nothing they can see changes: the point is
// the page's oldest undo step (`setCompactionFloor`), so every step it
// can still undo survives, moved by the same distance (`onCompact`).
// Only when storage is full and folding that much is not enough does
// compaction take everything, undo history included – and says so.

// A megabyte of log: far past any model's own size, and a fifth of the
// smallest quota a browser gives a site.
let logCompactAt = 1000 * 1000;
function setLogCompactionThreshold(chars) { logCompactAt = chars; }

// The first position compaction must keep as it is. Without a page
// keeping undo marks, nothing needs keeping.
let compactionFloor = (events) => events.length;
function setCompactionFloor(floor) { compactionFloor = floor; }

// Told after a compaction: `{ shift, events, dropped }` – an event kept
// at position `p` is now at `p + shift` of `events`; `dropped` when the
// fold had to take everything, so no earlier position means anything.
const compactListeners = [];
function onCompact(listener) { compactListeners.push(listener); }

function projectEvents(events) {
  const models = {};
  for (const event of events) apply(models, event);
  return models;
}

// `events` with everything before `keepFrom` folded, and the distance
// the rest moved – or null when folding would not shorten anything (it
// already is the shortest history of that state).
function compactedLog(events, keepFrom) {
  const head = [];
  for (const model of Object.values(projectEvents(events.slice(0, keepFrom)))) {
    head.push({ type: 'dcb-model-created', data: { 'dcb-model-id': model.id, name: model.name } });
    for (const kind of DEF_KINDS) {
      for (const [name, body] of Object.entries(model[DEF_COLLECTIONS[kind]])) {
        head.push({ type: `${kind}-added`, data: { 'dcb-model-id': model.id, name, body } });
      }
    }
  }
  if (head.length >= keepFrom) return null;
  const tail = events.slice(keepFrom).map((event, i) => ({ ...event, sequence: head.length + i }));
  return {
    events: [...stampEvents(head, 0), ...tail],
    shift: head.length - keepFrom,
    dropped: keepFrom >= events.length,
  };
}

function notifyCompacted(compacted) {
  for (const listener of compactListeners) listener(compacted);
}

// Compacts the stored log up to the floor, when that shortens it. A
// compaction that does not fit is no failure – the log as it was is
// still there, and the next append tries again.
function compactLog() {
  const compacted = compactedLog(loadEvents(), compactionFloor(loadEvents()));
  if (!compacted) return;
  try {
    writeEventLog(compacted.events);
  } catch (error) {
    if (error instanceof StorageFullError) return;
    throw error;
  }
  notifyCompacted(compacted);
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================
// Projection: derive current state from the event log.
// Mirrors `dcb-model-overview` in the ESDM model.
// ============================================================

// A collection is keyed by names an author writes, and `constructor`
// or `toString` is one an author may write: on a plain object every
// lookup of a name the model does not define would find what Object
// inherits under it instead. The projection's collections have no
// prototype, so a missing name reads as missing everywhere.
function emptyCollection() {
  return Object.create(null);
}

function emptyModel(id, name) {
  const model = { id, name };
  for (const kind of DEF_KINDS) model[DEF_COLLECTIONS[kind]] = emptyCollection();
  return model;
}

// Folded once per log revision, not once per call – `activeModel` and
// the render path ask many times per paint. Callers get one shared
// object and must not mutate it: every editor already works on a
// `deepClone` and every change goes through a command function.
let projectionCache = null;

function projectState() {
  if (scratchLog) return projectEvents(scratchLog);
  if (projectionCache && projectionCache.revision === logRevision) return projectionCache.models;
  const models = {};
  for (const event of loadEvents()) apply(models, event);
  // Read *after* the fold: a corrupt log discovered by `loadEvents`
  // bumps the revision while we are standing here.
  projectionCache = { revision: logRevision, models };
  return models;
}

// A `null` entry in a body's list says nothing, and the structural
// gate lets it through. Every reader would otherwise have to step
// over it – the ones that did not crashed the fold and the render – so
// it is dropped once, here, for every writer and every log already
// stored. The event itself keeps what was written.
function withoutNullEntries(body) {
  if (body === null || typeof body !== 'object') return body;
  let out = body;
  for (const field of STORABLE_LIST_FIELDS) {
    if (!Array.isArray(body[field]) || !body[field].includes(null)) continue;
    if (out === body) out = { ...body };
    out[field] = body[field].filter((entry) => entry !== null);
  }
  return out;
}

function apply(models, event) {
  const { type, data } = event;
  const modelId = data['dcb-model-id'];

  if (type === 'dcb-model-created') {
    models[modelId] = emptyModel(modelId, data.name);
    return;
  }
  // Appended by `replaceDefinitions` when the code view's `model "…"`
  // header changed, and by `renameDcbModel` from the bar's name field.
  if (type === 'dcb-model-renamed') {
    if (models[modelId]) models[modelId].name = data.name;
    return;
  }
  if (type === 'dcb-model-deleted') {
    delete models[modelId];
    return;
  }

  const model = models[modelId];
  if (!model) return;

  for (const kind of DEF_KINDS) {
    const coll = model[DEF_COLLECTIONS[kind]];
    if (type === `${kind}-added`) { coll[data.name] = withoutNullEntries(data.body); return; }
    if (type === `${kind}-updated`) {
      if (coll[data.name] !== undefined) coll[data.name] = withoutNullEntries(data.body);
      return;
    }
    if (type === `${kind}-renamed`) {
      const prev = coll[data['previous-name']];
      if (prev !== undefined) {
        delete coll[data['previous-name']];
        coll[data.name] = prev;
      }
      return;
    }
    if (type === `${kind}-removed`) { delete coll[data.name]; return; }
    if (type === `${kind}-reordered`) {
      const next = emptyCollection();
      for (const key of data.order) if (coll[key] !== undefined) next[key] = coll[key];
      model[DEF_COLLECTIONS[kind]] = next;
      return;
    }
  }
}

// ============================================================
// Derived types.
//
// An entity brings an identifier type into existence – `<Entity>Id`
// unless `identifierType` overrides the name – as an ordinary
// `custom-type-definition`, created alongside the entity and stored
// like any other. A lifecycle is not a derived type: it is one of the
// entity's own properties, named by `lifecycle`, and in the two-state
// case its projection is typed `boolean` and declares no type at all.
// ============================================================

// `entityName`'s derived identifier type name – `identifierType` when
// the entity gives one, otherwise `<name>Id`, tracking the entity's own
// name for as long as nothing overrides it. Reads straight off `model`,
// so renaming the entity moves this automatically: the name is
// recomputed fresh every time, never stored on the entity itself.
function idTypeOf(model, entityName) {
  const entity = model['entity-definitions'][entityName];
  return (entity && entity.identifierType) || (entityName + 'Id');
}

// The one tag `entityName` is read by, `{name, tagType}` – its
// identifier type, under the name the entity gives it (`identifierName`)
// or the type's own, lowercased: `courseId: CourseId`. A projection
// bound as one of its properties is tagged by exactly this.
function entityTagParam(model, entityName) {
  const entity = model['entity-definitions'][entityName];
  const tagType = idTypeOf(model, entityName);
  const name = (entity && entity.identifierName) || tagType.charAt(0).toLowerCase() + tagType.slice(1);
  return { name, tagType };
}

// The entity that owns a value type as its derived identifier, or null.
// Ownership is discovered by asking every entity what it currently
// derives, not stored on the value type itself – which is what lets a
// rename of the entity (while its identifier type is still tracking)
// move the ownership along with the recomputed name, for free.
function entityOfIdType(model, typeName) {
  for (const entityName of Object.keys(model['entity-definitions'])) {
    if (idTypeOf(model, entityName) === typeName) return entityName;
  }
  return null;
}

// Classifies a type name against a model: simple, a declared value
// type (entity-owned or standalone – same shape either way), or
// unresolved.
function classifyType(model, typeName) {
  if (!typeName) return { kind: 'unresolved' };
  if (SIMPLE_TYPES.includes(typeName)) return { kind: 'simple' };
  const valueType = model['custom-type-definitions'][typeName];
  if (valueType !== undefined) {
    return {
      kind: 'value',
      composite: Array.isArray(valueType.properties),
      isTag: !!valueType.isTag,
      ownerEntity: entityOfIdType(model, typeName),
    };
  }
  return { kind: 'unresolved' };
}

// The scalar, tag-marked value type a name resolves to, in the shape a
// tag is rendered from – entity-owned or standalone alike – or null
// for anything else (unresolved, not a value type, composite, or not
// marked `isTag`).
function identifierTypeOf(model, typeName) {
  const cls = classifyType(model, typeName);
  if (cls.kind !== 'value' || cls.composite || !cls.isTag) return null;
  const body = model['custom-type-definitions'][typeName];
  return { name: typeName, composite: false, ownerEntity: cls.ownerEntity, tagSchema: (body && body.tagSchema) || '{type}:{value}' };
}

// Renders one identifier's value into its tag, through that
// identifier's own `tagSchema` – `{type}` and `{value}`, in whichever
// order the template states them. Replaced through functions: a string
// replacement reads `$'` or `$&` in the value as a pattern, and course
// `a$'` would have been tagged – and read – as course `a`.
function renderTag(identifierType, valueText) {
  return identifierType.tagSchema
    .replace('{type}', () => identifierType.name)
    .replace('{value}', () => valueText);
}

// The fields of a composite value type, or null for anything else.
// Universal – a composite's fields may be any value type, tag-marked
// or not; `idLeavesOfType` is what picks out the tag-marked ones.
function compositeFieldsOf(model, typeName) {
  const cls = classifyType(model, typeName);
  if (cls.kind !== 'value' || !cls.composite) return null;
  return model['custom-type-definitions'][typeName].properties || [];
}

// Whether a type carries at least one tag – a tag-marked scalar, or a
// composite with at least one tag-marked field. Used wherever something
// must be able to narrow a query: a projection parameter, a tag filter,
// an entity's own derived identifier.
function isTagBearing(model, typeName) {
  return idLeavesOfType(model, typeName).length > 0;
}

// Tag derivation, looking *through* a composite to its fields.
//
// Every tag reachable from a type, as `{ field, identifierType }` –
// `field` is null when the type is itself a tag-marked scalar (used
// whole), and names the composite's field otherwise. A property typed
// with a composite therefore contributes one tag per tag-marked field
// it has (a field that is not itself tag-marked contributes nothing),
// and a *list* of composites one such tag per element.
//
// A composite's fields may not themselves be composite, so this is
// always one hop and cannot recurse further.
function idLeavesOfType(model, typeName) {
  const cls = classifyType(model, typeName);
  if (cls.kind !== 'value') return [];
  if (!cls.composite) {
    return cls.isTag ? [{ field: null, identifierType: typeName }] : [];
  }
  const fields = compositeFieldsOf(model, typeName) || [];
  const out = [];
  for (const field of fields) {
    const fieldCls = classifyType(model, field.propertyType);
    if (fieldCls.kind === 'value' && !fieldCls.composite && fieldCls.isTag) {
      out.push({ field: field.name, identifierType: field.propertyType });
    }
  }
  return out;
}

// The tags an event carries are the ones it lists (8.0). Each entry of
// `tags` is a path: a property typed with a tag type, or
// `property.field` into a record whose field is one – a list of either
// contributing one tag per element. Nothing is implied any more: a
// tag-typed property left off the list is an ordinary value, and an
// event with no list carries no tag at all. The advisories say both
// (`eventTagAdvisories`), because the author asked to be told rather
// than guessed for.
//
// Resolves one path to the leaf `idLeavesOfType` would have produced
// for it – `{ path, property, field, isList, identifierType }` – or to
// `{ problem }` saying why it is not a tag.
function resolveEventTagPath(model, event, path) {
  if (typeof path !== 'string' || !path) return { problem: 'a tag entry must name a property' };
  const [propertyName, fieldName, ...rest] = path.split('.');
  if (rest.length) return { problem: `"${path}" reaches deeper than a record field` };
  const property = ((event && event.properties) || []).find((p) => p && p.name === propertyName);
  if (!property) return { problem: `"${path}" names no property of the event` };
  const leaves = idLeavesOfType(model, property.propertyType);
  const leaf = leaves.find((l) => l.field === (fieldName === undefined ? null : fieldName));
  if (!leaf) {
    if (fieldName === undefined && leaves.length) {
      return { problem: `"${path}" is a record – name its tag field (${leaves.map((l) => `${propertyName}.${l.field}`).join(', ')})` };
    }
    return { problem: `"${path}" is not of a tag type` };
  }
  return { path, property: propertyName, field: leaf.field, isList: !!property.isList, identifierType: leaf.identifierType };
}

function eventTagLeaves(model, event) {
  const seen = new Set();
  const out = [];
  for (const path of (event && event.tags) || []) {
    const leaf = resolveEventTagPath(model, event, path);
    if (leaf.problem || seen.has(leaf.path)) continue;
    seen.add(leaf.path);
    out.push(leaf);
  }
  return out;
}

// What the advisories say about an event's tags: an entry that is not
// a tag, one listed twice, no tags at all, and a tag-typed value left
// off the list – the last two because nothing is implied any more, so
// a forgotten tag is an event no query by that tag will ever reach.
function eventTagAdvisories(model, event) {
  const messages = [];
  const tags = (event && event.tags) || [];
  const seen = new Set();
  for (const path of tags) {
    if (seen.has(path)) { messages.push(`Tag "${path}" is listed twice.`); continue; }
    seen.add(path);
    const resolved = resolveEventTagPath(model, event, path);
    if (resolved.problem) messages.push(`Tag ${resolved.problem}.`);
  }
  if (!tags.length) messages.push('Carries no tags, so a query by tag never reaches it.');
  for (const path of tagPathsOf(model, (event && event.properties) || [])) {
    if (seen.has(path)) continue;
    messages.push(`"${path}" is of a tag type but not one of this event's tags – a query by it does not reach this event.`);
  }
  return messages;
}

// Every path in `properties` that could be listed as a tag, in property
// order. What an authoring gesture offers, and what a new event made
// from a command's payload starts with listed – the stored list is the
// fact, this is only a default someone can see and change.
function tagPathsOf(model, properties) {
  return (properties || []).flatMap((p) => (p && p.propertyType
    ? idLeavesOfType(model, p.propertyType).map((leaf) => (leaf.field === null ? p.name : `${p.name}.${leaf.field}`))
    : []));
}

// An event body after a page edit, with its tags kept in step: a
// tag-typed value the edit introduced – a new property, or one retyped
// into a tag type – is listed, and a path the edit left meaning nothing
// (its property removed, or retyped out of a tag type) is dropped. The
// pages' authoring default, visible and undoable like the edit itself;
// a body arriving whole (a file, the code view, an agent) is stored as
// it says and never passes through here.
function withEditedTags(model, previous, next) {
  const before = new Set(tagPathsOf(model, (previous && previous.properties) || []));
  const kept = ((next && next.tags) || []).filter((path) => !resolveEventTagPath(model, next, path).problem);
  const added = tagPathsOf(model, next.properties || [])
    .filter((path) => !before.has(path) && !kept.includes(path));
  return { ...next, tags: [...kept, ...added] };
}

function allTypeNames(model) {
  return [
    ...SIMPLE_TYPES,
    ...Object.keys(model['custom-type-definitions']).sort(),
  ];
}

// An enum is not a distinct form of value type: it is a scalar value
// type whose `schema` carries the JSON Schema `enum` keyword. Presence
// of a non-empty `enum` array is what the tooling treats as "this
// resolves to an enum" – the one keyword that unambiguously means
// "these are the only legal values".
function enumMembersFor(model, typeName) {
  const cls = classifyType(model, typeName);
  if (cls.kind !== 'value' || cls.composite) return null;
  const valueType = model['custom-type-definitions'][typeName];
  const members = valueType && valueType.schema && valueType.schema.enum;
  return Array.isArray(members) && members.length ? members : null;
}

// Whether an enum's members are all plain strings – the shape the
// chip-based member editor (add/rename/remove, with rewrite-on-rename
// across every reference) is built for. A numeric, boolean or mixed
// enum still evaluates correctly through the ordinary operand
// machinery; it just does not get that authoring convenience, and is
// edited as raw JSON Schema instead.
function isStringEnumType(model, typeName) {
  const members = enumMembersFor(model, typeName);
  return !!members && members.every((m) => typeof m === 'string');
}

// A model with one definition overlaid – used so that a body being
// validated can reference the very definition it belongs to (an
// entity's own properties may reference its own derived `<Entity>Id`).
function withPending(model, kind, name, body) {
  const next = { ...model };
  const collName = DEF_COLLECTIONS[kind];
  next[collName] = { ...model[collName], [name]: body };
  return next;
}

function defaultAlias(entityName) {
  return entityName.charAt(0).toLowerCase() + entityName.slice(1);
}

function uniqueAlias(base, taken) {
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = base + i;
    if (!taken.includes(candidate)) return candidate;
  }
}

// ============================================================
// Reference computation and rewriting.
//
// References are derived from the body shape (per the DCB Model
// schema) – never stored alongside it. An entity's own derived
// identifier is an ordinary custom-type-definition, referenced by the
// entity through `identifierType` exactly like any property type
// references one – which is what lets renaming or removing it go
// through the same generic machinery as any other value type, with no
// entity-specific case needed.
// ============================================================

function emptyRefs() {
  const out = {};
  for (const k of DEF_KINDS) out[k] = [];
  return out;
}

function uniq(arr) { return [...new Set(arr)]; }

function pushTypeRef(model, refs, typeName) {
  const cls = classifyType(model, typeName);
  if (cls.kind === 'value') refs['custom-type-definition'].push(typeName);
}

// Every place a body names another definition, enumerated exactly
// once for both directions: `computeReferences` reads through these
// slots and `rewriteReferences` writes through them, so a reference
// site added to one is a reference site added to the other – the
// drift that used to be possible (compute sees it, rename leaves it
// dangling, or the reverse) has nowhere left to live.
//
// `slot(targetKind, {flavor, get, set})` is called per site:
//   - flavor 'type': a property-type name. Counted as a reference
//     only when it classifies as a value type; rewritten on equality
//     (the rename target being a custom type guarantees the class).
//   - flavor 'name': a definition named outright.
// A slot whose reference is derived rather than stored guards its own
// `set` – see the entity identifier below.
function forEachReferenceSlot(kind, name, body, slot) {
  const at = (holder, key, targetKind, flavor) => {
    if (!holder) return;
    slot(targetKind, {
      flavor,
      get: () => holder[key],
      set: (v) => { holder[key] = v; },
    });
  };
  const typeSlots = (properties) => {
    for (const p of properties || []) {
      if (!p) continue;
      at(p, 'propertyType', 'custom-type-definition', 'type');
    }
  };
  // A tag literal carries its tag type by bare name (`CourseId("c1")`),
  // and so does a projection's declared tag – the places a type is
  // referenced outside a property type.
  const tagLiteralSlots = (tags) => {
    const values = tags && typeof tags === 'object' ? Object.values(tags) : [];
    for (const tag of values) {
      if (tag && typeof tag === 'object' && tag.tagType !== undefined) {
        at(tag, 'tagType', 'custom-type-definition', 'type');
      }
    }
  };
  const givenSlots = (given) => {
    for (const step of given || []) at(step, 'event', 'event-definition', 'name');
  };

  switch (kind) {
    case 'custom-type-definition':
      // A scalar type's schema is opaque and references nothing. A
      // composite's fields are typed against the shared universe, so
      // they reference exactly like any other property list does.
      typeSlots(body.properties);
      break;
    case 'event-definition':
      typeSlots(body.properties);
      break;
    case 'entity-definition':
      // A property is a binding `{name, projection}`: everything the
      // fold needs lives on the projection it names, so the binding
      // references exactly one thing.
      for (const p of body.properties || []) at(p, 'projection', 'projection-definition', 'name');
      // An entity references its own derived identifier by name –
      // whatever it currently resolves to, tracking or overridden –
      // which is what lets renaming or removing that value type go
      // through the same generic machinery as any property type.
      // Writing moves only an *explicit* `identifierType`: while it is
      // absent (still tracking `<name>Id`), recomputing the default
      // off the entity's own name is what `idTypeOf` already does.
      slot('custom-type-definition', {
        flavor: 'name',
        get: () => body.identifierType || (name ? name + 'Id' : undefined),
        set: (v) => { if (body.identifierType !== undefined) body.identifierType = v; },
      });
      break;
    case 'projection-definition':
      at(body, 'valueType', 'custom-type-definition', 'type');
      tagLiteralSlots(body.tags);
      typeSlots(body.arguments);
      for (const handler of body.handlers || []) at(handler, 'event', 'event-definition', 'name');
      // A derived predicate names the projections it reads. `derived`
      // is read raw rather than through `derivedOf`, so a body carrying
      // both a script and a predicate still tracks the names it holds.
      for (const operand of derivedOperands(body.derived)) {
        if (operand && typeof operand === 'object' && operand.projection !== undefined) {
          at(operand, 'projection', 'projection-definition', 'name');
          tagLiteralSlots(operand.tags);
        }
      }
      break;
    case 'command-definition':
      typeSlots(body.properties);
      // Only `entity` and `projection` are references. An alias is
      // local to its command and was the modeler's to choose.
      for (const binding of body.boundary || []) {
        at(binding, 'entity', 'entity-definition', 'name');
        at(binding, 'projection', 'projection-definition', 'name');
        tagLiteralSlots(binding && binding.tags);
      }
      // An inline read names its projection, and its literals their tag
      // types, wherever an operand sits.
      forEachCommandOperand(body, (operand) => {
        if (operandSource(operand) !== 'projection-read') return;
        at(operand, 'projection', 'projection-definition', 'name');
        tagLiteralSlots(operand.tags);
      });
      for (const emission of body.publishes || []) at(emission, 'name', 'event-definition', 'name');
      break;
    case 'scenario-definition':
      // A scenario names the command it exercises, every event its
      // Given is written from, and every event its expected outcome
      // holds. All three have to move when one of them is renamed –
      // and none of them may stop one from being deleted; a scenario
      // exists to report what a change broke, not to prevent it.
      at(body, 'command', 'command-definition', 'name');
      givenSlots(body.given);
      for (const event of (body.then || {}).events || []) at(event, 'type', 'event-definition', 'name');
      break;
    case 'projection-scenario-definition':
      // Names the projection it is about, every event its Given is
      // written from, and the tag type of each tag it reads by. Its Then
      // is a bare value and its `arguments` are values too.
      at(body, 'projection', 'projection-definition', 'name');
      givenSlots(body.given);
      tagLiteralSlots(body.tags);
      break;
  }
}

function computeReferences(model, kind, name, body) {
  const refs = emptyRefs();
  if (!body || typeof body !== 'object') return refs;
  forEachReferenceSlot(kind, name, body, (targetKind, site) => {
    const value = site.get();
    if (!value) return;
    if (site.flavor === 'type') pushTypeRef(model, refs, value);
    else refs[targetKind].push(value);
  });
  for (const k of DEF_KINDS) refs[k] = uniq(refs[k]);
  return refs;
}

// Rewrites every reference to `oldName` of `targetKind` into `newName`.
function rewriteReferences(kind, body, targetKind, oldName, newName) {
  const next = deepClone(body);
  forEachReferenceSlot(kind, undefined, next, (slotKind, site) => {
    if (slotKind !== targetKind) return;
    if (site.get() === oldName) site.set(newName);
  });
  return next;
}

function findReferencers(model, targetKind, targetName) {
  const out = [];
  for (const referrerKind of DEF_KINDS) {
    const coll = model[DEF_COLLECTIONS[referrerKind]];
    for (const [name, body] of Object.entries(coll)) {
      const refs = computeReferences(model, referrerKind, name, body);
      if (refs[targetKind].includes(targetName)) {
        out.push({ kind: referrerKind, name, body });
      }
    }
  }
  return out;
}

// ============================================================
// Operands.
//
// Command operands:  {parameterName} | {alias, property?} | {enumMember} | literal
//                    | {projection, tags?, arguments?} (a read in place)
// Handler operands:  {eventProperty} | {currentValue} | {successor} | {enumMember} | literal
// Derived operands:  {projection, tags?, arguments?} | {enumMember} | literal
// Tag operands:      a command operand | {tagType, tagValue} | {each: operand}
//
// `{alias}` with no `property` reads a bound projection's value: a
// projection holds exactly one value and has no name for it. On an
// entity alias the property is required, since an entity has many.
//
// A projection declares its tags by name (8.0, `tags: [{name,
// tagType}]`), and a read supplies one value per name – `tags:
// {courseId: …}`, written `CourseStatus(courseId)`. The declared type is
// the tag's key; the value has to be of it. A literal states its type
// anyway – `{tagType, tagValue}`, spelled `CourseId("c1")` – because the
// text shows it and a mismatch is then visible. It is allowed only
// where a tag is, and its two keys keep it apart from any record
// literal. `{each: operand}` is the fan-out, said where it happens: the
// read is made once per element of a list, and a rule over it holds for
// every one (`ProductExists(each items.productId)`).
// ============================================================

function operandSource(operand) {
  if (operand === null || operand === undefined) return 'static';
  if (typeof operand !== 'object') return 'static';
  if (operand.parameterName !== undefined) return 'parameter';
  if (operand.alias !== undefined) return 'alias-property';
  if (operand.enumMember !== undefined) return 'enum-member';
  if (operand.eventProperty !== undefined) return 'event-property';
  if (operand.currentValue !== undefined) return 'current-value';
  if (operand.successor !== undefined) return 'successor';
  if (operand.projection !== undefined) return 'projection-read';
  if (operand.tagType !== undefined) return 'tag-literal';
  if (operand.each !== undefined) return 'each';
  return 'static';
}

function operandText(operand) {
  switch (operandSource(operand)) {
    case 'parameter':
      return operand.property
        ? `${operand.parameterName || '?'}.${operand.property}`
        : (operand.parameterName || '?');
    case 'alias-property':
      return operand.property
        ? `${operand.alias || '?'}.${operand.property}`
        : (operand.alias || '?');
    case 'enum-member': return operand.enumMember || '?';
    case 'event-property': return `event.data.${operand.eventProperty || '?'}`;
    case 'current-value': return 'current';
    case 'successor': return `successor(${operandText(operand.successor)})`;
    // The values in the order they are held, which is the order the
    // projection declares them in wherever a writer built the read.
    case 'projection-read': {
      const values = [...readTagOperands(operand), ...Object.values(operand.arguments || {})];
      return `${operand.projection || '?'}(${values.map(operandText).join(', ')})`;
    }
    case 'tag-literal': return `${operand.tagType || '?'}(${JSON.stringify(operand.tagValue)})`;
    case 'each': return `each ${operandText(operand.each)}`;
    default:
      if (operand === null || operand === undefined) return 'null';
      if (Array.isArray(operand)) return `[${operand.map(operandText).join(', ')}]`;
      return typeof operand === 'string' ? `"${operand}"` : String(operand);
  }
}

// An operand is unresolved when the name its kind requires is absent –
// the gap `operandText` papers over with a '?' placeholder. Checked
// structurally, because a literal that merely *contains* a question
// mark is a value, not a gap.
function operandIncomplete(operand) {
  if (Array.isArray(operand)) return operand.some(operandIncomplete);
  switch (operandSource(operand)) {
    case 'parameter': return !operand.parameterName;
    case 'alias-property': return !operand.alias;
    case 'enum-member': return !operand.enumMember;
    case 'event-property': return !operand.eventProperty;
    case 'successor': return operandIncomplete(operand.successor);
    case 'projection-read': return !operand.projection;
    case 'tag-literal': return !operand.tagType;
    case 'each': return operandIncomplete(operand.each);
    default: return false;
  }
}

function sameOperand(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

// `operandSource` falls back to "static" for anything it does not
// recognise, so a misspelt or retired operand key would be stored as a
// literal and rendered as "[object Object]". A literal is a string, a
// number or a boolean – never an object – so an object that classifies
// as static is simply not an operand.
function assertRecognisedOperand(operand, where) {
  if (operandSource(operand) !== 'static') return;
  if (operand !== null && typeof operand === 'object') {
    throw new DomainError(
      `${where} is not a recognised operand: ${JSON.stringify(operand)}. ` +
      `A literal must be a string, a number or a boolean.`
    );
  }
}

function predicateText(predicate) { return PREDICATE_SYMBOL[predicate] || predicate; }

function conditionText(condition) {
  if (!condition) return '';
  const left = operandText(condition.leftHandSide);
  const core = condition.rightHandSide === undefined
    ? `${left} ${predicateText(condition.predicate)}`
    : `${left} ${predicateText(condition.predicate)} ${operandText(condition.rightHandSide)}`;
  return condition.negate ? `not(${core})` : core;
}

// A derived value as one line: its comparison, or its computation –
// `a - b`, `min(a, b)`.
function derivedText(derived) {
  if (!derived) return '';
  if (derived.operator === undefined) return conditionText(derived);
  const left = operandText(derived.leftHandSide);
  const right = operandText(derived.rightHandSide);
  const symbol = DERIVED_OPERATOR_SYMBOL[derived.operator];
  return symbol ? `${left} ${symbol} ${right}` : `${derived.operator}(${left}, ${right})`;
}

// What a scenario is called. The stored name wins; without one it is
// read off the outcome, which is why it changes when the outcome does –
// and why the interface freezes it the moment a scenario drifts, rather
// than letting the label move under the reader.
// `spell` turns a stored name into the words the reader is used to
// seeing; the model layer has no opinion about that, so it defaults to
// leaving them alone and the interface passes its own.
function scenarioName(body, spell = (n) => n) {
  if (body && typeof body.name === 'string' && body.name.trim()) return body.name.trim();
  const then = (body || {}).then;
  if (!then) return 'an unrun scenario';
  if (then.outcome === 'rejected') {
    return then.rejection ? `is refused: ${then.rejection}` : 'is refused';
  }
  const types = (then.events || []).map((e) => e && e.type).filter(Boolean);
  return types.length ? `records ${types.map(spell).join(' and ')}` : 'is accepted';
}

// The same derivation as scenarioName, one level down: a projection
// scenario has no outcome to name itself after, only the reads a
// modeler chose to check and what they folded to.
function projectionScenarioName(body) {
  if (body && typeof body.name === 'string' && body.name.trim()) return body.name.trim();
  if (!body || !('then' in body)) return 'an unrun projection scenario';
  return `ends up ${JSON.stringify(body.then)}`;
}

// The script a projection is advanced by, or null when its handlers
// are declared the ordinary way.
function scriptOf(target) {
  return target && target.script ? target.script : null;
}

// The predicate a projection is *derived* by, or null when it is
// folded (declared or scripted) the ordinary way. A body defective
// enough to carry both a script and a derived predicate reads as
// scripted – deterministic, and the advisory says both are there.
function derivedOf(target) {
  return target && target.derived && !target.script ? target.derived : null;
}

// Whether a derived value computes a number (`operator`, 9.0) rather
// than comparing (`predicate`, always a boolean). A body carrying both
// reads as a comparison, and the advisory says both are there.
function derivedComputes(derived) {
  return !!derived && derived.operator !== undefined && derived.predicate === undefined;
}

// What a type is underneath, as arithmetic sees it: 'integer',
// 'number', or null for anything that is no number. A scalar value
// type counts as its schema's base, as `operationsFor` counts it – an
// enum is a set of members, not a number, whatever they are spelled as.
function numericBaseOf(model, typeName) {
  if (typeName === 'integer' || typeName === 'number') return typeName;
  const body = model['custom-type-definitions'][typeName];
  if (!body || !body.schema || Array.isArray(body.properties) || body.schema.enum) return null;
  return body.schema.type === 'integer' || body.schema.type === 'number' ? body.schema.type : null;
}

// What one side of a computation is, as `{base, nullable}` – or null
// when it is no single number. A literal is what it is; a read is what
// its projection holds, and may be null while that projection starts
// at null (declared) or computes from something that may (derived). A
// script's value is opaque, and taken at its word. A parameter is what
// `owner` – the derived projection it belongs to – declares it as; a
// reader's null is the reader's to be warned about.
function derivedInputOf(model, operand, seen = [], owner = null) {
  if (typeof operand === 'number') return { base: Number.isInteger(operand) ? 'integer' : 'number', nullable: false };
  if (operand === null) return { base: null, nullable: true };
  if (operandSource(operand) === 'parameter') {
    const parameter = projectionParameters(owner).find((p) => p.name === operand.parameterName);
    const base = parameter && operand.property === undefined && numericBaseOf(model, parameter.type);
    return base ? { base, nullable: false } : null;
  }
  if (operandSource(operand) !== 'projection-read') return null;
  const target = model['projection-definitions'][operand.projection];
  if (!target || target.isList) return null;
  const base = numericBaseOf(model, target.valueType);
  if (!base) return null;
  const inner = derivedOf(target);
  if (inner) {
    if (!derivedComputes(inner) || seen.includes(operand.projection)) return { base, nullable: false };
    const sides = derivedOperands(inner).map((o) => derivedInputOf(model, o, [...seen, operand.projection], target));
    return { base, nullable: sides.some((side) => side && side.nullable) };
  }
  return { base, nullable: !scriptOf(target) && (target.initialValue === null || target.initialValue === undefined) };
}

// The type a computation yields from its two sides: an integer from two
// integers, a number otherwise – or null when a side is no number.
// `owner` is the derived projection, whose parameters a side may name.
function derivedResultBase(model, derived, owner = null) {
  const sides = derivedOperands(derived).map((o) => derivedInputOf(model, o, [], owner));
  if (sides.some((side) => !side || !side.base)) return null;
  return sides.every((side) => side.base === 'integer') ? 'integer' : 'number';
}

// Which experimental features a model uses, as `{feature, where}`
// pairs in a stable order – `feature` one of EXPERIMENTAL_FEATURES'
// keys, `where` the definition it was found on. The flag (shared.js)
// gates authoring them, never reading them: this is what lets a page
// say "this model uses …" instead of hiding what is stored. The line
// is drawn at what the examples on dcb.events need, see
// docs/research/2026-10-05-explicit-tags-and-aliases.md.
const EXPERIMENTAL_FEATURES = {
  entities: 'entities',
  lifecycles: 'lifecycles',
  scripted: 'scripted projections',
  guards: 'guarded emissions',
  optional: 'optional reads',
  excluding: 'excluding',
  currentValue: 'currentValue',
};

function experimentalFeatures(model) {
  const found = [];
  const seen = new Set();
  const note = (feature, where) => {
    const key = feature + '\u0000' + where;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ feature, where });
  };
  const usesCurrentValue = (value) => {
    if (!value || typeof value !== 'object') return false;
    if (value.currentValue === true) return true;
    return Object.values(value).some(usesCurrentValue);
  };
  for (const [name, body] of Object.entries(model['entity-definitions'] || {})) {
    note('entities', name);
    if (body && body.lifecycle) note('lifecycles', name);
  }
  for (const [name, body] of Object.entries(model['projection-definitions'] || {})) {
    if (scriptOf(body)) note('scripted', name);
    if (!scriptOf(body) && usesCurrentValue(body && body.handlers)) note('currentValue', name);
  }
  for (const [name, body] of Object.entries(model['command-definitions'] || {})) {
    if (!body) continue;
    for (const binding of body.boundary || []) {
      if (!binding) continue;
      if (binding.entity !== undefined) note('entities', name);
      if (binding.isOptional) note('optional', name);
      if (binding.excluding !== undefined && binding.excluding !== null) note('excluding', name);
    }
    if ((body.publishes || []).some((emission) => emission && (emission.when || []).length)) {
      note('guards', name);
    }
  }
  const order = Object.keys(EXPERIMENTAL_FEATURES);
  return found.sort((a, b) => order.indexOf(a.feature) - order.indexOf(b.feature));
}

// What `after` uses that `before` did not, by feature and definition –
// the experimental features an edit would introduce. A use the model
// already has is not introduced by keeping it, so an editor that does
// not offer them (WebMCP) can still edit a model that uses them.
function introducedExperimentalFeatures(before, after) {
  const keyOf = ({ feature, where }) => feature + '\u0000' + where;
  const had = new Set(experimentalFeatures(before).map(keyOf));
  return experimentalFeatures(after).filter((use) => !had.has(keyOf(use)));
}

// Both sides of a derived predicate, in evaluation order – the derived
// analogue of `conditionOperands`.
function derivedOperands(derived) {
  return derived ? [derived.leftHandSide, derived.rightHandSide] : [];
}

// What a reader of this projection supplies besides tags: its
// arguments, `{name, propertyType}` – the values after the tags in
// `X(courseId, 14)` (10.0; a script's own until then). A script reads
// them as `args`, a derived projection compares or computes with them
// or passes them on; a declared projection's handlers cannot see them,
// which the advisories say.
function projectionSlots(projection) {
  return (projection && Array.isArray(projection.arguments) ? projection.arguments : [])
    .filter((argument) => argument && typeof argument === 'object');
}

// Every parameter a read of this projection gives, tags then
// arguments, as `{name, type, isTag}` – the one list the editor and the
// text show, and what a derived operand's `{parameterName}` may name.
function projectionParameters(projection) {
  return [
    ...projectionTagParams(projection).map((tag) => ({ name: tag.name, type: tag.tagType, isTag: true })),
    ...projectionSlots(projection).map((slot) => ({ name: slot.name, type: slot.propertyType, isTag: false })),
  ];
}

// The tags a projection is read by, `[{name, tagType}]`, in declaration
// order – one value per entry in every read of it, each keyed by its
// declared type. Empty is an *untagged* projection, which folds the
// whole log: a numbering is the case. Several are ANDed, as a DCB query
// item's tags are. A body that states none reads as untagged; every
// writer here states the list, and the text says `untagged` outright.
function projectionTagParams(projection) {
  return (projection && Array.isArray(projection.tags) ? projection.tags : [])
    .filter((tag) => tag && typeof tag === 'object');
}

// The tag types one projection's query is narrowed by – the leaves of
// its declared tag types, a record's tag-marked fields included.
function projectionTagTypes(model, projectionName) {
  const projection = model['projection-definitions'][projectionName];
  return uniq(projectionTagParams(projection)
    .flatMap((tag) => idLeavesOfType(model, tag.tagType).map((leaf) => leaf.identifierType)));
}

// A read's values, `[[name, operand]]` in the order held – the tags,
// keyed by the names the projection declares.
function readTagEntries(read) {
  const tags = read && read.tags;
  return tags && typeof tags === 'object' && !Array.isArray(tags) ? Object.entries(tags) : [];
}

function readTagOperands(read) {
  return readTagEntries(read).map(([, operand]) => operand);
}

// The projections some entity property binds. Those are read through
// the entity (`course.capacity`), so a rule about one goes there.
function entityBoundProjections(model) {
  const bound = new Set();
  for (const entity of Object.values(model['entity-definitions'] || {})) {
    for (const property of (entity && entity.properties) || []) {
      if (property && property.projection) bound.add(property.projection);
    }
  }
  return bound;
}

// An entity property is a binding `{name, projection}` pointing at an
// ordinary projection definition. This resolves one to the projection
// it names – `{ binding, projection }`, either half null when the name
// does not resolve – so every reader walks the reference the same way.
function entityPropertyTarget(model, entityName, propertyName) {
  const entity = model['entity-definitions'][entityName];
  const binding = entity && (entity.properties || []).find((p) => p && p.name === propertyName);
  if (!binding) return { binding: null, projection: null };
  return {
    binding,
    projection: model['projection-definitions'][binding.projection] || null,
  };
}

// An entity's designated lifecycle, resolved – or `null`, which is an
// ordinary answer and not a defect: an entity need not have one.
//
// `lifecycle` names one of the entity's *own* property bindings. That
// makes it a local name, like a command's alias, which is why it is not
// a reference slot (nothing outside the entity can be renamed into or
// out of it) and why `renameMember` moves it rather than
// `rewriteReferences`.
//
// The one thing this resolver exists to flatten is that a lifecycle has
// two spellings. `states` is what the thing can be in – an enum's
// members, or `[false, true]` for the boolean two-state case – as
// strings either way, so everything downstream (the machine, the
// constraint reader, the diagram) treats the two identically and no
// caller has to ask which spelling it got. `isBoolean` is there for the
// one thing that genuinely differs: how a condition names a state.
//
// `null` also where the designation dangles, or names a projection that
// is scripted, derived, a list, or typed something with no states to be
// in. Each of those is reported as an advisory in its own right; this
// just declines to invent a machine for it.
function lifecycleOf(model, entityName) {
  const entity = model['entity-definitions'][entityName];
  const property = entity && entity.lifecycle;
  if (!property || typeof property !== 'string') return null;
  const { binding, projection } = entityPropertyTarget(model, entityName, property);
  if (!binding || !projection) return null;
  if (scriptOf(projection) || derivedOf(projection) || projection.isList) return null;
  const isBoolean = projection.valueType === 'boolean';
  const members = isBoolean ? [false, true] : enumMembersFor(model, projection.valueType);
  if (!members) return null;
  return {
    entity: entityName,
    property,
    binding,
    projection,
    projectionName: binding.projection,
    valueType: projection.valueType,
    isBoolean,
    states: members.map(String),
  };
}

// Why `lifecycleOf` declined, for the one page that has to say so.
// Kept beside it so the two can never drift into disagreeing about
// what counts as a lifecycle.
function lifecycleRefusal(model, entityName) {
  const entity = model['entity-definitions'][entityName];
  const property = entity && entity.lifecycle;
  if (!property || typeof property !== 'string') return 'none';
  const { binding, projection } = entityPropertyTarget(model, entityName, property);
  if (!binding || !projection) return 'dangling';
  if (scriptOf(projection)) return 'scripted';
  if (derivedOf(projection)) return 'derived';
  if (projection.isList) return 'list';
  if (projection.valueType !== 'boolean' && !enumMembersFor(model, projection.valueType)) {
    return 'stateless';
  }
  return null;
}

// What a bare literal of this type looks like at runtime – the shape an
// initial value element is checked against. A declared value type is
// read through its scalar schema's `type`; anything unstated is a
// string, which is what every identifier is underneath.
function literalKindOf(model, typeName) {
  if (typeName === 'integer') return 'number';
  if (typeName === 'boolean') return 'boolean';
  if (typeName === 'string') return 'string';
  const body = model['custom-type-definitions'][typeName];
  const declared = body && body.schema && body.schema.type;
  if (declared === 'integer' || declared === 'number') return 'number';
  if (declared === 'boolean') return 'boolean';
  return 'string';
}

// Every projection taking arguments that an entity alias is read
// through – resolved through the property bindings – which is what
// decides the arguments its binding has to supply.
function argumentPropertiesRead(model, body, binding) {
  const entity = model['entity-definitions'][binding.entity];
  if (!entity) return [];
  const found = [];
  forEachCommandOperand(body, (operand) => {
    if (operandSource(operand) !== 'alias-property' || operand.alias !== binding.alias) return;
    const { projection } = entityPropertyTarget(model, binding.entity, operand.property);
    if (projection && projectionSlots(projection).length && !found.includes(projection)) found.push(projection);
  });
  return found;
}

// The arguments a binding owes, gathered from everything it reads. Two
// projections asking for the same name ask for the same value – they
// are read at one instant, through one binding. The instance is never
// an argument: it is the tag the binding reads by.
function argumentsExpected(model, body, binding) {
  const out = [];
  for (const projection of argumentPropertiesRead(model, body, binding)) {
    for (const argument of projectionSlots(projection)) {
      if (!out.some((a) => a.name === argument.name)) out.push(argument);
    }
  }
  return out;
}

// The operations that make sense for a projection's type. A scalar
// value type counts as what its schema says it is underneath, so
// `Hours` over an integer counts like the integer it replaced – wrapping
// a primitive in a named type must not cost it its operations.
function operationsFor(model, target) {
  if (target.isList) return ['set', 'append', 'remove'];
  if (literalKindOf(model, target.valueType) === 'number') return ['set', 'increment', 'decrement'];
  return ['set'];
}

// Whether a value of this type has a *next* one – which is what decides
// whether "the one after …" is worth offering as a handler operand.
//
// A scalar value type, tag-marked or not, is a string underneath, so it
// counts up. An enum does not: its members are a set, and "the next
// member" means nothing. Neither does a boolean.
//
// Extracted so the editors offering the operand and the validator
// refusing it read the same rule off the same line. They did not, and
// the projection editor offered "the one after true" on a boolean fold –
// a choice that stored fine and then failed validation.
function hasSuccessor(model, valueType) {
  const cls = classifyType(model, valueType);
  const underlying = cls.kind === 'simple' ? valueType
    : (enumMembersFor(model, valueType) ? 'enum' : 'string');
  return underlying === 'integer' || underlying === 'string';
}

// Whether an editor *offers* "successor" for a value of this type –
// narrower than `hasSuccessor`, which is what the validator accepts.
// Every successor the shipped models carry numbers something: the next
// course id, the next course number. A plain `string` has one only by
// accident of ending in digits, and offering it put "the one after the
// title" beside every text field; an integer or a named scalar value
// type – an id, a number – is what a numbering is made of. A stored
// successor outside this rule still validates and still runs.
function offersSuccessor(model, valueType) {
  if (!hasSuccessor(model, valueType)) return false;
  if (valueType === 'integer') return true;
  const cls = classifyType(model, valueType);
  return cls.kind === 'value' && !cls.composite;
}

// Walks every operand inside a command body – and into every inline
// projection read (8.0), whose tags and arguments are operands in the
// same scope: `CourseStatus(course.id)` names `course` exactly as a
// rule does. A walker sees the read first, then what is inside it.
function forEachCommandOperand(body, outerVisit) {
  const visit = (operand, meta) => {
    outerVisit(operand, meta);
    if (operandSource(operand) === 'each') { visit(operand.each, meta); return; }
    if (operandSource(operand) !== 'projection-read') return;
    for (const [key, tag] of readTagEntries(operand)) {
      visit(tag, { ...meta, where: `${meta.where} (${operand.projection} tag ${key})`, tag: true });
    }
    for (const [key, argument] of Object.entries(operand.arguments || {})) {
      visit(argument, { ...meta, where: `${meta.where} (${operand.projection} argument ${key})`, tag: false });
    }
  };
  for (const binding of body.boundary || []) {
    if (!binding) continue;
    if (binding.projection) {
      for (const [key, operand] of readTagEntries(binding)) {
        visit(operand, { where: `binding "${binding.alias || '?'}" (tag ${key})`, tag: true });
      }
      for (const [key, operand] of Object.entries(binding.arguments || {})) {
        visit(operand, { where: `binding "${binding.alias || '?'}" (argument ${key})` });
      }
      continue;
    }
    visit(binding.id, { where: `boundary binding "${binding.alias || '?'}"` });
    if (binding.excluding !== undefined) {
      visit(binding.excluding, { where: `boundary binding "${binding.alias || '?'}" (excluding)` });
    }
    // An entity binding carries arguments for the same reason a
    // projection binding does: a scripted property it reads may ask for
    // values only the command has.
    for (const [key, operand] of Object.entries(binding.arguments || {})) {
      visit(operand, { where: `boundary binding "${binding.alias || '?'}" (argument ${key})` });
    }
  }
  const visitCondition = (condition, where) => {
    visit(condition.leftHandSide, { where });
    if (condition.rightHandSide !== undefined) {
      // `equalsAny` spells its right-hand side as a literal list. The
      // entries are the operands; the array is only their container.
      const rights = Array.isArray(condition.rightHandSide)
        ? condition.rightHandSide : [condition.rightHandSide];
      for (const operand of rights) visit(operand, { where });
    }
  };
  for (const condition of body.conditions || []) {
    if (!condition) continue;
    visitCondition(condition, `condition "${conditionText(condition)}"`);
  }
  for (const emission of body.publishes || []) {
    if (!emission) continue;
    // An emission guard is a condition in every respect a walker cares
    // about – the same operand set, read from the same scope.
    for (const condition of emission.when || []) {
      if (!condition) continue;
      visitCondition(condition, `guard "${conditionText(condition)}" on "${emission.name}"`);
    }
    for (const [key, operand] of Object.entries(emission.parameters || {})) {
      visit(operand, { where: `emission "${emission.name}.${key}"` });
    }
  }
}

// ============================================================
// DCB derivation.
//
// A command's boundary *is* its dynamic consistency boundary, and
// holds every read. An entity binding contributes one query item: its
// tag, restricted to the event types reachable through the properties
// the conditions actually read. A projection read contributes one
// item too: the tags it declares, with the values the read gives them –
// none at all for an untagged one – and the event types it handles.
//
// Items carry `tags` rather than one tag because a read may name
// several. Tags within an item are ANDed; the items themselves are
// ORed, which is the ordinary DCB query shape.
// ============================================================

// The type an operand resolves to, or null when it cannot be worked out
// (a literal, or a reference that does not resolve).
function resolveOperandType(operand, { boundary, commandProperties, model }) {
  const source = operandSource(operand);
  if (source === 'alias-property') {
    const binding = (boundary || []).find((b) => b.alias === operand.alias);
    if (!binding) return null;
    if (binding.projection) {
      // A projection holds one value, so the alias alone names it.
      const projection = model['projection-definitions'][binding.projection];
      if (!projection || operand.property) return null;
      return { propertyType: projection.valueType, isList: !!projection.isList };
    }
    const { projection } = entityPropertyTarget(model, binding.entity, operand.property);
    if (!projection) return null;
    // A property is a binding, so its type is the bound projection's.
    // A scripted projection is no different here: `valueType` and
    // `isList` describe the value a condition reads, whatever shape the
    // code carries internally to arrive at it.
    return { propertyType: projection.valueType, isList: !!projection.isList };
  }
  if (source === 'tag-literal') {
    return operand.tagType ? { propertyType: operand.tagType, isList: false } : null;
  }
  // One element of the list it fans out over.
  if (source === 'each') {
    const inner = resolveOperandType(operand.each, { boundary, commandProperties, model });
    return inner ? { propertyType: inner.propertyType, isList: false } : null;
  }
  // An inline read holds its projection's value, the same as an alias
  // bound to it does.
  if (source === 'projection-read') {
    const projection = model['projection-definitions'][operand.projection];
    return projection ? { propertyType: projection.valueType, isList: !!projection.isList } : null;
  }
  if (source === 'parameter') {
    const property = (commandProperties || []).find((p) => p.name === operand.parameterName);
    if (!property) return null;
    if (!operand.property) {
      return { propertyType: property.propertyType, isList: !!property.isList };
    }
    // A field of a composite parameter. Fields are never lists
    // themselves, so the arity is entirely the parameter's: reading a
    // field of `Item[]` yields one value per element.
    const fields = compositeFieldsOf(model, property.propertyType);
    if (!fields) return null;
    const field = fields.find((f) => f.name === operand.property);
    return field ? { propertyType: field.propertyType, isList: !!property.isList } : null;
  }
  return null;
}

// The predicates that make sense against a resolved operand type – a
// rule editor offers these rather than the full predicate list, so
// "starts with" never turns up against an integer. `null` (the type
// could not be worked out, e.g. an untyped literal) leaves every
// predicate on the table rather than guessing.
//
// Given the model, a scalar value type counts as what it is underneath,
// the way `operationsFor` counts it: `Hours` over an integer is ordered
// like the integer it wraps – naming a primitive must not cost it its
// predicates. An identifier (a tag type) and an enum are not: they are
// compared for identity, whatever they are spelled in.
function predicatesForType(resolved, model) {
  if (!resolved) return [...BINARY_PREDICATES, ...UNARY_PREDICATES];
  if (resolved.isList) {
    return ['equals', 'countEquals', 'countLessThan', 'countGreaterThan',
      'contains', 'containsAny', 'isEmpty', 'isNotEmpty'];
  }
  const underlying = underlyingScalarType(model, resolved.propertyType);
  if (underlying) return predicatesForType({ propertyType: underlying, isList: false });
  if (resolved.propertyType === 'boolean') return ['equals', 'equalsAny', 'isTrue', 'isFalse'];
  if (resolved.propertyType === 'integer') {
    return ['equals', 'equalsAny', 'lessThan', 'lessThanOrEquals', 'greaterThan', 'greaterThanOrEquals'];
  }
  if (resolved.propertyType === 'string') {
    return ['equals', 'equalsAny', 'lessThan', 'lessThanOrEquals', 'greaterThan', 'greaterThanOrEquals',
      'startsWith', 'endsWith'];
  }
  // Enum, id and composite types (custom or entity-derived): nothing
  // but identity means anything without a declared ordering –
  // `equalsAny` is that same identity, taken against each entry of a
  // literal list, so it is admitted wherever `equals` is (and, like
  // `equals`, only against a scalar left-hand side: "this list is one
  // of these lists" is authorable noise).
  return ['equals', 'equalsAny'];
}

// The simple type a plain scalar value type wraps (`integer`,
// `string`, `boolean`), or null for anything else – a simple type
// itself, a composite, an enum, an identifier, an unknown name.
function underlyingScalarType(model, typeName) {
  if (!model || !model['custom-type-definitions']) return null;
  const cls = classifyType(model, typeName);
  if (cls.kind !== 'value' || cls.composite || cls.isTag || enumMembersFor(model, typeName)) return null;
  const kind = literalKindOf(model, typeName);
  return kind === 'number' ? 'integer' : kind;
}

// The type a rule's right-hand side has to hold for a given predicate
// against a left-hand side of `leftType` – `null` once `leftType`
// itself is unknown, since nothing can be filtered against it then.
function rightHandExpectedType(predicate, leftType) {
  if (!leftType) return null;
  if (predicate === 'countEquals' || predicate === 'countLessThan' || predicate === 'countGreaterThan') {
    return { propertyType: 'integer', isList: false };
  }
  if (predicate === 'contains') return { propertyType: leftType.propertyType, isList: false };
  if (predicate === 'containsAny') return { propertyType: leftType.propertyType, isList: true };
  // `equalsAny` compares against a literal list of the left's own type.
  if (predicate === 'equalsAny') return { propertyType: leftType.propertyType, isList: true };
  return { propertyType: leftType.propertyType, isList: leftType.isList };
}

// The tag a projection read fans out over – its `{each: …}` – or null.
function readFanTag(read) {
  return readTagOperands(read).find((tag) => operandSource(tag) === 'each') || null;
}

// Whether an operand holds many values in the command's scope: a list,
// or a property read off a binding that fans out (one per instance).
function operandIsPlural(model, body, operand) {
  const resolved = resolveOperandType(operand, {
    boundary: body.boundary || [], commandProperties: body.properties || [], model,
  });
  if (resolved && resolved.isList) return true;
  if (operandSource(operand) !== 'alias-property') return false;
  const source = (body.boundary || []).find((b) => b && b.alias === operand.alias);
  return !!source && isFannedOut(model, body, source);
}

// The value an entity binding is read by, its `each` unwrapped – what
// coverage compares and what a chain's root is found through.
function entityIdOperand(binding) {
  const id = binding && binding.id;
  return operandSource(id) === 'each' ? id.each : id;
}

// A read fans out where it says so: a projection read at the tag that
// is `each …`, an entity read when its identifier is (`Course(each
// student.subscribedCourseIds)`). The list it fans over may itself be
// read off a plural alias – a list of lists, which flattens.
function isFannedOut(model, body, binding) {
  if (!binding) return false;
  if (binding.projection) return !!readFanTag(binding);
  return operandSource(binding.id) === 'each';
}

// The list an operand is quantified over, as an identity string, or
// null when the operand is singular.
//
// This is what makes zipping decidable: two operands are correlated
// exactly when they carry the same root, because that is what "they
// came from the same list" means.
function bindingFanRoot(model, body, binding, seen = []) {
  if (!binding || !isFannedOut(model, body, binding)) return null;
  if (seen.includes(binding.alias)) return null;
  // What it fans over: the `each` of a projection read's tag, or of an
  // entity's identifier.
  const over = binding.projection ? readFanTag(binding).each : entityIdOperand(binding);
  if (operandSource(over) === 'parameter') {
    return `parameter:${over.parameterName}`;
  }
  if (operandSource(over) === 'alias-property') {
    const source = (body.boundary || []).find((b) => b && b.alias === over.alias);
    // A binding fanned from a plural *projection* has no list
    // parameter behind it, so it is its own root.
    const inherited = source && source !== binding
      ? bindingFanRoot(model, body, source, [...seen, binding.alias])
      : null;
    return inherited || `binding:${binding.alias}`;
  }
  return `binding:${binding.alias}`;
}

function fanRootOf(model, body, operand) {
  const source = operandSource(operand);
  if (source === 'alias-property') {
    return bindingFanRoot(model, body,
      (body.boundary || []).find((b) => b && b.alias === operand.alias));
  }
  // A read in place that fans out has the root of what it fans over –
  // a payload list, or a list read off a binding.
  if (source === 'projection-read') {
    const fan = readFanTag(operand);
    if (!fan) return null;
    const over = resolveOperandType(fan.each, { boundary: body.boundary || [], commandProperties: body.properties || [], model });
    if (over && !over.isList && operandSource(fan.each) !== 'alias-property') return null;
    if (operandSource(fan.each) === 'parameter') return `parameter:${fan.each.parameterName}`;
    if (operandSource(fan.each) === 'alias-property') {
      return bindingFanRoot(model, body, (body.boundary || []).find((b) => b && b.alias === fan.each.alias))
        || `binding:${fan.each.alias}`;
    }
    return null;
  }
  if (source === 'parameter') {
    // A list parameter is a fan root only when something actually fans
    // out over it. A list nobody iterates – the new schedule handed to
    // a reschedule command, say – is an ordinary list value, and
    // reading it alongside a fanned alias is not a second quantifier.
    const root = `parameter:${operand.parameterName}`;
    const iterated = (body.boundary || []).some((b) => bindingFanRoot(model, body, b) === root)
      || inlineReads(body).some(({ read }) => fanRootOf(model, body, read) === root);
    return iterated ? root : null;
  }
  return null;
}

// Operands of one condition, in evaluation order.
function conditionOperands(condition) {
  if (!condition) return [];
  const out = [condition.leftHandSide];
  if (condition.rightHandSide !== undefined) out.push(condition.rightHandSide);
  return out;
}

// The distinct roots a condition quantifies over. More than one is
// rejected: the lengths are unrelated and nothing can assert otherwise.
function conditionFanRoots(model, body, condition) {
  return uniq(
    conditionOperands(condition)
      .map((operand) => fanRootOf(model, body, operand))
      .filter(Boolean)
  );
}

// Whether an operand is read at the iteration index rather than whole.
//
// It is zipped when some *alias* in the same condition fans from the
// very list the operand is rooted at – that alias is what supplies the
// index. An operand rooted at a list nothing else iterates stays a
// plain list, and is quantified over on its own.
function isZipped(model, body, condition, operand) {
  const root = fanRootOf(model, body, operand);
  if (!root || operandSource(operand) !== 'parameter') return false;
  return conditionOperands(condition).some((other) =>
    other !== operand
    && (operandSource(other) === 'alias-property' || operandSource(other) === 'projection-read')
    && fanRootOf(model, body, other) === root);
}

// An operand's type as the condition actually reads it: zipping drops
// the list, because the index has already been applied.
function conditionOperandType(model, body, condition, operand) {
  const resolved = resolveOperandType(operand, {
    boundary: body.boundary || [],
    commandProperties: body.properties || [],
    model,
  });
  if (!resolved) return null;
  if (resolved.isList && isZipped(model, body, condition, operand)) {
    return { ...resolved, isList: false };
  }
  return resolved;
}

// Every projection the command binds, in declaration order.
function projectionsRead(body) {
  return (body.boundary || [])
    .filter((b) => b && b.projection)
    .map((b) => b.projection);
}

// The operand that reaches one leaf of a composite identifier's value –
// the same one-hop projection write coverage already applies via
// `{parameterName, property}` / `{alias, property}`. `leaf` comes from
// `idLeavesOfType`; `field: null` means the type is already the leaf,
// so the operand is read whole.
function operandForLeaf(operand, leaf) {
  if (leaf.field === null || operand === undefined) return operand;
  const source = operandSource(operand);
  if (source === 'parameter') return { parameterName: operand.parameterName, property: leaf.field };
  if (source === 'alias-property') return { alias: operand.alias, property: leaf.field };
  return operand;
}

// The tag(s) an identifier-typed value renders as – one per leaf,
// scalar and composite alike, each through that leaf's own `tagSchema`.
// Shared by every DCB preview (a projection binding's arguments, an
// event's published properties): all of them read the same union of
// component tags that `eventDefinitions` describes.
function tagsForIdentifierValue(model, identifierTypeName, operand, { each } = {}) {
  const leaves = idLeavesOfType(model, identifierTypeName);
  // A tag literal shows its value, not its own spelling: the tag it
  // renders is `CourseId:c1`, never `CourseId:CourseId("c1")`.
  const literal = operandSource(operand) === 'tag-literal';
  const shownFor = (leaf) => {
    if (operand === undefined) return '?';
    if (literal) {
      const held = leaf && leaf.field !== null ? (operand.tagValue || {})[leaf.field] : operand.tagValue;
      return String(held);
    }
    return operandText(leaf ? operandForLeaf(operand, leaf) : operand);
  };
  if (!leaves.length) {
    // Unresolved mid-edit – nothing to render through, so fall back to
    // the type name literally rather than showing nothing at all.
    const shown = shownFor(null);
    return [`${identifierTypeName}:${each ? `each(${shown})` : shown}`];
  }
  return leaves.map((leaf) => {
    const shown = shownFor(leaf);
    return renderTag(identifierTypeOf(model, leaf.identifierType), each ? `each(${shown})` : shown);
  });
}

// The type a tag operand holds – `{propertyType, isList}` – in the
// scope of the command `body` it sits in, or null where that cannot be
// worked out (a dangling reference, an untyped literal). It has to be
// the type the projection declares for that tag, which is the key.
function tagOperandType(model, body, operand) {
  // `each` is resolved through `resolveOperandType` too: one element.
  return resolveOperandType(operand, {
    boundary: (body && body.boundary) || [],
    commandProperties: (body && body.properties) || [],
    model,
  });
}

// The tags one projection read contributes, for display – one per leaf
// of each declared tag type, with the value in the caller's terms
// (`CourseId:courseId`). A tag the read leaves out shows as `?`.
function readTagTexts(model, body, read) {
  const projection = model['projection-definitions'][read && read.projection];
  const held = (read && read.tags && typeof read.tags === 'object') ? read.tags : {};
  return uniq(projectionTagParams(projection).flatMap((tag) => {
    const operand = held[tag.name];
    if (operandSource(operand) === 'each') {
      return tagsForIdentifierValue(model, tag.tagType, operand.each, { each: true });
    }
    return tagsForIdentifierValue(model, tag.tagType, operand);
  }));
}

// The tag-type sets a projection is read by – one, its own declared
// tags (8.0): `[['CourseId']]`, or `[[]]` for an untagged one. Kept as
// a list of sets because that is what every caller asks about.
function projectionReadTagSets(model, projectionName) {
  if (!model['projection-definitions'][projectionName]) return [];
  return [[...projectionTagTypes(model, projectionName)].sort()];
}

// The events a read of `projectionName` by `tagTypes` – its own
// declared ones unless given – can never see: each handled event that
// does not list a tag of every one of those types (`eventTagLeaves`).
// Tag matching is by value – a query by CourseId finds only events
// tagged by one – so such a handler never fires. `[{event, missing}]`,
// empty when every handled event is reachable. A derived projection
// has no handlers of its own: each operand is read by its own tags and
// answers for itself.
function readTagsMissing(model, projectionName, tagTypes = projectionTagTypes(model, projectionName)) {
  const out = [];
  if (derivedOf(model['projection-definitions'][projectionName])) return out;
  for (const eventName of projectionHandledTypes(model, projectionName)) {
    const event = model['event-definitions'][eventName];
    if (!event) continue;
    const carried = new Set(eventTagLeaves(model, event).map((leaf) => leaf.identifierType));
    const missing = (tagTypes || []).filter((type) => !carried.has(type));
    if (missing.length) out.push({ event: eventName, missing });
  }
  return out;
}

// The tag(s) an entity binding contributes – one per leaf of the
// entity's own derived identifier, scalar or composite alike.
function entityBindingTags(model, entityName, idOperand, excludingOperand, fannedOut) {
  if (operandSource(idOperand) === 'each') idOperand = idOperand.each;
  const leaves = idLeavesOfType(model, idTypeOf(model, entityName));
  if (!leaves.length) {
    // An unknown entity mid-edit has no derived identifier to look up –
    // fall back to its bare name so a body still being typed renders
    // something rather than nothing.
    const shown = operandText(idOperand);
    return [fannedOut ? `${entityName}:each(${shown})` : `${entityName}:${shown}`];
  }
  return leaves.map((leaf) => {
    const shownValue = operandText(operandForLeaf(idOperand, leaf));
    const shownExcluding = excludingOperand !== undefined
      ? operandText(operandForLeaf(excludingOperand, leaf)) : null;
    const valueText = fannedOut
      ? `each(${shownValue}${shownExcluding !== null ? ` except ${shownExcluding}` : ''})`
      : shownValue;
    return renderTag(identifierTypeOf(model, leaf.identifierType), valueText);
  });
}

// The event types a projection's query covers: its handlers' events –
// or, for a derived one, the union of its operands', walked
// recursively. `seen` stops a cycle from recursing forever; the cycle
// itself is the advisory's (and evaluation's) to report.
function projectionHandledTypes(model, projectionName, seen = []) {
  const projection = model['projection-definitions'][projectionName];
  if (!projection || seen.includes(projectionName)) return [];
  const derived = derivedOf(projection);
  if (!derived) {
    return uniq((projection.handlers || []).map((h) => h && h.event).filter(Boolean));
  }
  const out = [];
  for (const operand of derivedOperands(derived)) {
    if (operandSource(operand) !== 'projection-read') continue;
    out.push(...projectionHandledTypes(model, operand.projection, [...seen, projectionName]));
  }
  return uniq(out);
}

// The reads a read of `read.projection` comes down to, as `[{read,
// via}]`: itself for a folded projection, and for a derived one each
// projection it folds in the end, read by the values this read gave –
// an operand's `{parameterName}` is one of the derived projection's own
// parameters, so it takes whatever this read gave it – as a tag or an
// argument; a literal stays itself. A derived projection's query is its operands' queries, each
// under its *own* tags: the weekly budget is kept per developer, the
// week's allocations per developer and week, and one query ANDing both
// would miss the registration. `seen` stops a cycle, which the advisory
// and evaluation report.
function foldedReads(model, read, seen = []) {
  const projection = model['projection-definitions'][read.projection];
  const derived = projection && derivedOf(projection);
  if (!derived) return [{ read, via: seen.length ? read.projection : null }];
  if (seen.includes(read.projection)) return [];
  const held = {
    ...((read.arguments && typeof read.arguments === 'object') ? read.arguments : {}),
    ...((read.tags && typeof read.tags === 'object') ? read.tags : {}),
  };
  const out = [];
  for (const operand of derivedOperands(derived)) {
    if (operandSource(operand) !== 'projection-read') continue;
    const passed = (values) => {
      const out_ = {};
      for (const [name, value] of Object.entries(values || {})) {
        out_[name] = operandSource(value) === 'parameter' ? held[value.parameterName] : value;
      }
      return out_;
    };
    const next = { projection: operand.projection, tags: passed(operand.tags), arguments: passed(operand.arguments) };
    out.push(...foldedReads(model, next, [...seen, read.projection]));
  }
  return out;
}

// One query item per read a command makes – or, for a derived
// projection, one per projection it folds (`via`), each written under
// that projection's own tags; the same query reached twice is one.
function readItems(model, body, read, base) {
  const items = [];
  const seen = new Set();
  for (const { read: folded, via } of foldedReads(model, read)) {
    const item = {
      projection: read.projection,
      ...base,
      ...(via ? { via } : {}),
      fannedOut: !!readFanTag(folded),
      tags: readTagTexts(model, body, folded),
      types: projectionHandledTypes(model, folded.projection).sort(),
      readProperties: [],
    };
    const key = JSON.stringify([item.tags, item.types, item.fannedOut]);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

function deriveDcb(model, body) {
  const items = [];

  for (const binding of body.boundary || []) {
    if (!binding) continue;

    if (binding.projection) {
      const projection = model['projection-definitions'][binding.projection];
      if (!projection) continue;
      // The projection declares its tags and the read gives their
      // values, so the query is written from both – one tag per scalar
      // tag value, one per component for a record – whatever kind of
      // projection it reads: declared, scripted or derived, none of them
      // can hide what it reads.
      items.push(...readItems(model, body, binding, { alias: binding.alias }));
      continue;
    }

    const readProperties = new Set();
    forEachCommandOperand(body, (operand) => {
      if (operandSource(operand) === 'alias-property' && operand.alias === binding.alias
          && operand.property) {
        readProperties.add(operand.property);
      }
    });
    // The boundary binding's own id operand is not a read of the entity.
    const entity = model['entity-definitions'][binding.entity];
    const types = new Set();
    // A derived property is read the way a derived projection is
    // (`foldedReads`): each projection it folds, under that one's own
    // tags. Those read by the instance's identifier alone share the
    // entity's item; any other – untagged, a tag literal, a second tag –
    // is a query of its own. ANDing it with the instance's tag would
    // leave out events the decision depends on.
    const apart = [];
    if (entity) {
      for (const property of entity.properties || []) {
        if (!property || !readProperties.has(property.name)) continue;
        const projection = model['projection-definitions'][property.projection];
        const [tag] = projectionTagParams(projection);
        if (!derivedOf(projection) || !tag) {
          for (const type of projectionHandledTypes(model, property.projection)) types.add(type);
          continue;
        }
        for (const { read } of foldedReads(model, { projection: property.projection, tags: { [tag.name]: binding.id }, arguments: binding.arguments || {} })) {
          const held = Object.values((read.tags && typeof read.tags === 'object') ? read.tags : {});
          if (held.length === 1 && held[0] === binding.id) {
            for (const type of projectionHandledTypes(model, read.projection)) types.add(type);
          } else {
            apart.push({ read, property: property.name });
          }
        }
      }
    }
    const fannedOut = isFannedOut(model, body, binding);
    const apartItems = [];
    const seenApart = new Set();
    for (const { read, property } of apart) {
      const item = {
        alias: binding.alias,
        via: read.projection,
        fannedOut: !!readFanTag(read),
        tags: readTagTexts(model, body, read),
        types: projectionHandledTypes(model, read.projection).sort(),
        readProperties: [property],
      };
      const key = JSON.stringify([item.tags, item.types, item.fannedOut]);
      if (seenApart.has(key)) continue;
      seenApart.add(key);
      apartItems.push(item);
    }
    // The instance's own item stays unless every property read went
    // elsewhere: with no types it would match every event tagged by
    // the instance, a read nothing here makes.
    if (types.size || !apartItems.length) {
      items.push({
        alias: binding.alias,
        tags: entityBindingTags(model, binding.entity, binding.id, binding.excluding, fannedOut),
        fannedOut,
        types: [...types].sort(),
        readProperties: [...readProperties].sort(),
      });
    }
    items.push(...apartItems);
  }

  // Every inline read (8.0) is a query item too, once however often it
  // is written: two rules about `CourseStatus(courseId)` read it once.
  // It has no alias, so its item is known by its spelling.
  for (const { key, read } of inlineReads(body)) {
    items.push(...readItems(model, body, read, { alias: null, inline: key }));
  }

  const writes = [];
  for (const emission of body.publishes || []) {
    if (!emission) continue;
    const event = model['event-definitions'][emission.name];
    if (!event) continue;
    for (const property of event.properties || []) {
      const operand = (emission.parameters || {})[property.name];
      const listed = property.isList || (operand !== undefined && operandSource(operand) === 'parameter'
        && (body.properties || []).some((p) => p.name === operand.parameterName && p.isList));
      for (const leaf of eventTagLeaves(model, event).filter((l) => l.property === property.name)) {
        const shown = operand === undefined ? '?' : operandText(operandForLeaf(operand, leaf));
        writes.push(renderTag(identifierTypeOf(model, leaf.identifierType), listed ? `each(${shown})` : shown));
      }
    }
  }

  return { items, writes: uniq(writes) };
}

// Every inline projection read in a command, once per distinct
// spelling – `{ key, read }`, `key` the read's canonical JSON – in the
// order first written. Two rules reading `CourseStatus(courseId)` read
// it once.
function inlineReads(body) {
  const out = [];
  const seen = new Set();
  forEachCommandOperand(body, (operand) => {
    if (operandSource(operand) !== 'projection-read') return;
    const key = JSON.stringify(canonicalOperand(operand));
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, read: operand });
  });
  return out;
}

// Naming a read in place, and taking the name back – the rule adder
// writes a projection read in place, and the page offers the alias
// afterwards. Both rewrite one command body in place and return it.
//
// Naming binds the read under `alias` and points every spelling of
// it in the command at the alias: they are one read already
// (`inlineReads`), so naming one names them all. The binding goes last,
// since its tags can only name what is bound before it.
function aliasInlineRead(body, key, alias) {
  const found = inlineReads(body).find((r) => r.key === key);
  if (!found) return body;
  const read = deepClone(found.read);
  (body.boundary = body.boundary || []).push({ alias, ...read });
  mapConditionOperands(body, (operand) => (operandSource(operand) === 'projection-read'
    && JSON.stringify(canonicalOperand(operand)) === key ? { alias } : operand));
  return body;
}

// Whether a projection alias can be read in place again: only while
// every use is the read's whole value, written where a read in place
// may stand – a rule, a guard, an emission field. A property of it
// (`alias.field`) or a use inside another read has no in-place
// spelling to go back to.
function aliasInlinable(body, alias) {
  const binding = (body.boundary || []).find((b) => b && b.alias === alias);
  if (!binding || !binding.projection) return false;
  const names = (operand) => operandSource(operand) === 'alias-property' && operand.alias === alias;
  let uses = 0;
  forEachCommandOperand(body, (operand) => { if (names(operand)) uses += 1; });
  let wholeValues = 0;
  mapConditionOperands(deepClone(body), (operand) => {
    if (names(operand) && operand.property === undefined) wholeValues += 1;
    return operand;
  });
  return uses === wholeValues;
}

function inlineAliasedRead(body, alias) {
  const binding = (body.boundary || []).find((b) => b && b.alias === alias);
  if (!binding || !binding.projection) return body;
  const read = { projection: binding.projection };
  if (readTagEntries(binding).length) read.tags = deepClone(binding.tags);
  if (binding.arguments && Object.keys(binding.arguments).length) read.arguments = deepClone(binding.arguments);
  body.boundary = body.boundary.filter((b) => b !== binding);
  mapConditionOperands(body, (operand) => (operandSource(operand) === 'alias-property'
    && operand.alias === alias && operand.property === undefined ? deepClone(read) : operand));
  return body;
}

// Replaces the top-level operands of every rule, guard and emission
// field with what `replace` returns for each – the places a read in
// place or an alias's whole value can stand.
function mapConditionOperands(body, replace) {
  const mapCondition = (condition) => {
    if (!condition) return;
    condition.leftHandSide = replace(condition.leftHandSide);
    if (Array.isArray(condition.rightHandSide)) condition.rightHandSide = condition.rightHandSide.map(replace);
    else if (condition.rightHandSide !== undefined) condition.rightHandSide = replace(condition.rightHandSide);
  };
  for (const condition of body.conditions || []) mapCondition(condition);
  for (const emission of body.publishes || []) {
    if (!emission) continue;
    for (const condition of emission.when || []) mapCondition(condition);
    for (const key of Object.keys(emission.parameters || {})) {
      emission.parameters[key] = replace(emission.parameters[key]);
    }
  }
}

// The operands one binding is read with – its identifier, exclusion,
// tags and arguments.
function bindingOperands(binding) {
  if (!binding) return [];
  return binding.projection
    ? [...readTagOperands(binding), ...Object.values(binding.arguments || {})]
    : [binding.id, binding.excluding, ...Object.values(binding.arguments || {})];
}

// The aliases an operand names, looking into inline reads.
function operandAliases(operand, out = []) {
  if (operandSource(operand) === 'alias-property') {
    if (!out.includes(operand.alias)) out.push(operand.alias);
  } else if (operandSource(operand) === 'each') {
    operandAliases(operand.each, out);
  } else if (operandSource(operand) === 'projection-read') {
    for (const inner of [...readTagOperands(operand), ...Object.values(operand.arguments || {})]) operandAliases(inner, out);
  }
  return out;
}

// The aliases a binding waits for – every binding its own operands
// name, inline reads included. A graph, not a tree: `id` and
// `excluding` may point somewhere different, and arguments may point at
// several bindings at once.
function bindingDependsOn(body, binding) {
  if (!binding) return [];
  const aliases = [];
  for (const operand of bindingOperands(binding)) operandAliases(operand, aliases);
  return aliases.filter((alias) => alias !== binding.alias);
}

// The query an operand waits for, as a depth: a bound alias waits for
// its binding's round, an inline read is one query after whatever its
// own tags wait for, and anything else waits for nothing.
function operandDepth(operand, roundOf) {
  switch (operandSource(operand)) {
    case 'alias-property': return roundOf.get(operand.alias) || 0;
    case 'each': return operandDepth(operand.each, roundOf);
    case 'projection-read': {
      const inner = [...readTagOperands(operand), ...Object.values(operand.arguments || {})];
      return 1 + Math.max(0, ...inner.map((o) => operandDepth(o, roundOf)));
    }
    default: return 0;
  }
}

// Groups the boundary into the queries it actually resolves in – one
// per level of the chain (the identifier says "rounds"; every view
// says "queries").
//
// A binding waits only for the bindings it names, so the number of
// queries to the store is the *depth* of that graph and not the length
// of the list: two bindings both reading from the payload come back
// in one query. Because a binding may only name one declared above it, the
// list is already topologically sorted and one left-to-right pass does
// it.
//
// Derived, never authored – which is also what keeps it honest about
// shape. A binding with two parents has no place in a written
// hierarchy without being duplicated.
function deriveRounds(body) {
  const boundary = (body.boundary || []).filter(Boolean);
  const roundOf = new Map();
  const rounds = [];

  for (const binding of boundary) {
    const waitsFor = bindingDependsOn(body, binding).filter((a) => roundOf.has(a));
    // An inline read among its operands is a query of its own, so the
    // binding waits for it as it would for an alias.
    const round = Math.max(0, ...bindingOperands(binding).map((o) => operandDepth(o, roundOf))) + 1;
    roundOf.set(binding.alias, round);
    while (rounds.length < round) rounds.push([]);
    rounds[round - 1].push({ binding, waitsFor });
  }
  return rounds;
}

// The consistency boundary, summed up and laid out the way every view
// says it: how wide (`words` – "reads 5 types, 2 tags, in 2 queries")
// and the queries in the order they run. A chained read cannot share a
// query with the read it waits for – its tags are answers from that
// one – so the boundary is read in as many queries as the chain is
// deep (`deriveRounds`), and the append condition is all of them,
// ORed. A read whose properties nothing uses queries any type under
// its tag, which no count of types could say. The code view's command
// line and the Consistency boundary step both speak from here, so they
// cannot disagree.
function boundarySummary(model, body) {
  const dcb = deriveDcb(model, body);
  const rounds = deriveRounds(body);
  const queries = rounds.map((round) =>
    round.flatMap((entry) => dcb.items.filter((item) => item.alias && item.alias === entry.binding.alias)));
  // An inline read sits in the query its depth says: one after the
  // aliases and reads its tags wait for.
  const roundOf = new Map(rounds.flatMap((round, r) => round.map((entry) => [entry.binding.alias, r + 1])));
  for (const { key, read } of inlineReads(body)) {
    const depth = operandDepth(read, roundOf);
    while (queries.length < depth) queries.push([]);
    queries[depth - 1].push(...dcb.items.filter((i) => i.inline === key));
  }
  for (let i = queries.length - 1; i >= 0; i--) if (!queries[i].length) queries.splice(i, 1);
  const items = dcb.items;
  const types = uniq(items.flatMap((item) => item.types)).sort();
  const anyType = items.some((item) => !item.types.length);
  const tags = uniq(items.flatMap((item) => item.tags));
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const words = !items.length ? 'reads nothing'
    : `reads ${anyType ? 'any type' : count(types.length, 'type')}, `
      + `${tags.length ? count(tags.length, 'tag') : 'no tag'}`
      + (queries.length > 1 ? `, in ${queries.length} queries` : '');
  return { items, queries, types, tags, anyType, writes: dcb.writes, coverage: coverageIssues(model, body), words };
}

// Every entity-id property of every published event must resolve to a
// binding in the boundary – a command may not write a tag it did not
// consult. A value read from a projection binding is exempt when that
// projection handles the event being published: its query then already
// covers every event that could have issued the value, and a freshly
// minted identifier has no history to consult.
//
// The exemption ignores the partition on purpose. A projection scoped
// so narrowly that two partitions can mint the same identifier is a
// modelling error of the same class as handling the wrong event, and
// catching it is not this check's job.
function mintsFromProjection(model, body, operand, eventName) {
  let projectionName = null;
  if (operandSource(operand) === 'projection-read') projectionName = operand.projection;
  else if (operandSource(operand) === 'alias-property' && !operand.property) {
    const binding = (body.boundary || []).find((b) => b && b.alias === operand.alias);
    projectionName = binding && binding.projection;
  }
  const projection = projectionName && model['projection-definitions'][projectionName];
  return !!projection && (projection.handlers || []).some((h) => h && h.event === eventName);
}

// Every entity tag an emission writes, with the operand that identifies
// the instance and where that operand came from. One walk, because two
// things are decided by it: what the coverage advisory says, and which
// reads a tag keeps alive. They must not be allowed to disagree about
// what a read is for.
//
// **Asserted against derived.** A tag whose value came straight off the
// command payload is asserted by the caller – the caller says *which*
// student, and this command's decision never depended on that student's
// state. A tag whose value was *derived*, read off some instance this
// command bound, is a different claim entirely: it says "this is the
// course that student is in", which is only true of the state that was
// read. The second wants covering; the first does not.
function emittedTagRequirements(model, body) {
  const out = [];
  for (const emission of body.publishes || []) {
    if (!emission) continue;
    const event = model['event-definitions'][emission.name];
    if (!event) continue;
    for (const property of event.properties || []) {
      const operand = (emission.parameters || {})[property.name];
      // An optional property with no mapping publishes the explicit
      // null and writes no tag – there is no instance to have
      // consulted, so there is nothing for the boundary to cover.
      if (operand === undefined && property.isOptional && !property.isList) continue;
      if (mintsFromProjection(model, body, operand, emission.name)) continue;
      const asserted = operand !== undefined && operandSource(operand) === 'parameter';
      // Walked to the tag *leaves* the event lists, not the property's
      // surface: a property typed `Item[]` writes one tag per element,
      // and each names its own instance.
      for (const leaf of eventTagLeaves(model, event).filter((l) => l.property === property.name)) {
        // A leaf whose identifier type is standalone – a component with
        // no entity of its own – names no entity instance, so there is
        // nothing here to consult or to keep alive.
        const ownerEntity = entityOfIdType(model, leaf.identifierType);
        if (!ownerEntity) continue;
        const required = leaf.field === null
          ? operand
          : (asserted ? { parameterName: operand.parameterName, property: leaf.field } : undefined);
        out.push({
          event: emission.name,
          property: leaf.field === null ? property.name : `${property.name}.${leaf.field}`,
          entity: ownerEntity,
          operand: required === undefined ? operand : required,
          required,
          asserted,
        });
      }
    }
  }
  return out;
}

// The tags this command writes about instances it never looked at.
//
// Advice, never a refusal, and deliberately narrow: writing an
// uncovered tag is not unsound. The append condition is the union of
// the bindings' queries, so a `Student:s1` tag on the event *this*
// command writes is what makes every *other* command that read
// `Student:s1` conflict with it – which holds whether or not this one
// read it. What an uncovered tag gives up is only this command's own
// protection against concurrent change to that instance, and where the
// decision never depended on the instance's state there was nothing to
// protect. So a tag the caller asserted passes in silence; a derived
// one – a claim about state this command read – is what gets flagged.
function coverageIssues(model, body) {
  return emittedTagRequirements(model, body).filter((requirement) => {
    if (requirement.asserted) return false;
    if (requirement.required === undefined) return true;
    return !(body.boundary || []).some((binding) => binding
      && binding.entity === requirement.entity
      && sameOperand(entityIdOperand(binding), requirement.required));
  });
}

// ---------- what consults a read ----------
//
// A boundary binding is no longer authored. It comes into existence as
// the side-effect of a gesture that needs it – a rule, a guard, an
// emission field, a tag the emission writes, or another binding's
// identifier – and it goes when the last of those goes. The list is
// still stored, and still authoritative: a rule names its alias and
// nothing else records the path that alias stands for, so the boundary
// cannot be recomputed from the rules. What is maintained instead is
// the invariant that every binding is consulted by something, which
// reference counting gives exactly.
//
// The first five reasons are the five places an alias can be named.
// Four are operands (`forEachCommandOperand` walks the same set); the
// fifth is write coverage, which can demand a binding no operand
// mentions – but only for a *derived* tag value, never for one the
// caller asserted (see `emittedTagRequirements`).
//
// The sixth names no alias at all: a binding to a projection that
// takes no tags is the read of every event that projection folds, so
// it serialises the command against all of them – the way a command
// with no conditions is made strictly serial, which the schema
// promises. Nothing else need consult it for it to matter, so it is
// never pruned as unreferenced.
const REFERENCE_REASONS = ['rule', 'guard', 'emission', 'coverage', 'chain', 'serialisation'];

function bindingReferences(model, body) {
  const found = new Map();
  for (const binding of body.boundary || []) {
    if (binding && binding.alias) found.set(binding.alias, new Set());
  }
  const note = (alias, reason) => {
    const reasons = found.get(alias);
    if (reasons) reasons.add(reason);
  };
  // An operand naming an alias consults it whatever else it does, so
  // the walk is over operand *shape*, not over the position it sits in.
  const noteOperand = (operand, reason) => {
    for (const alias of operandAliases(operand)) note(alias, reason);
  };
  const noteCondition = (condition, reason) => {
    if (!condition) return;
    noteOperand(condition.leftHandSide, reason);
    const rights = Array.isArray(condition.rightHandSide)
      ? condition.rightHandSide : [condition.rightHandSide];
    for (const operand of rights) noteOperand(operand, reason);
  };

  for (const condition of body.conditions || []) noteCondition(condition, 'rule');
  for (const emission of body.publishes || []) {
    if (!emission) continue;
    for (const condition of emission.when || []) noteCondition(condition, 'guard');
    for (const operand of Object.values(emission.parameters || {})) {
      noteOperand(operand, 'emission');
    }
  }
  // A binding reached *through* another is the chain: `theirs` is why
  // `students` is read, and `students` is consulted by nothing else.
  // `excluding` and `arguments` count for the same reason `id` does –
  // they are operands resolved in the same scope, which is what
  // `forEachCommandOperand` already treats them as.
  for (const binding of body.boundary || []) {
    if (!binding) continue;
    noteOperand(binding.id, 'chain');
    noteOperand(binding.excluding, 'chain');
    for (const operand of readTagOperands(binding)) noteOperand(operand, 'chain');
    for (const operand of Object.values(binding.arguments || {})) {
      noteOperand(operand, 'chain');
    }
  }
  for (const binding of body.boundary || []) {
    if (!binding || binding.projection === undefined) continue;
    const projection = (model['projection-definitions'] || {})[binding.projection];
    if (projection && !projectionTagParams(projection).length) note(binding.alias, 'serialisation');
  }
  // Coverage names no alias – it names the instance an emitted tag
  // writes, and is satisfied by whichever binding consults it. So the
  // binding a coverage issue *would* complain about is the one the
  // emission keeps alive.
  // Only a *derived* tag keeps a read alive, which is the same line
  // `coverageIssues` draws: a tag the caller asserted does not demand a
  // read, so a read held up by nothing else is unreferenced and goes.
  for (const requirement of emittedTagRequirements(model, body)) {
    if (requirement.asserted || requirement.required === undefined) continue;
    for (const binding of body.boundary || []) {
      if (binding && binding.entity === requirement.entity
        && sameOperand(entityIdOperand(binding), requirement.required)) {
        note(binding.alias, 'coverage');
      }
    }
  }
  return found;
}

// The aliases nothing consults, in declaration order. Transitive: a
// binding kept alive only by one that is itself unreferenced is
// unreferenced too, which is what makes deleting the last rule about
// `theirs` take `students` with it.
function unreferencedBindings(model, body) {
  const bindings = (body.boundary || []).filter((b) => b && b.alias);
  let live = bindings.map((b) => b.alias);
  for (;;) {
    const refs = bindingReferences(model, { ...body, boundary: bindings.filter((b) => live.includes(b.alias)) });
    const next = live.filter((alias) => (refs.get(alias) || new Set()).size > 0);
    if (next.length === live.length) break;
    live = next;
  }
  return bindings.map((b) => b.alias).filter((alias) => !live.includes(alias));
}

// Which reads the *decision* walks, as against the ones an emission
// causes. A read a rule or guard names is tested; so is every read it
// had to be reached through, because a hop exists only to get to the
// thing being tested.
//
// Everything else is read because an event records its value or writes
// its tag – `CourseNumbering`, whose value becomes the new course's id,
// and the student `StudentUnsubscribedFromCourse` tags. That is a fact
// about what the command *records*, not about what it *decides*, so it
// belongs beside the emission and not under "it is only allowed if".
// A command with no tested reads at all is plainly always allowed, and
// says so, with the reads it still makes shown where they come from.
//
// The split is presentation only: both halves are the same `boundary`,
// and the derived DCB is their union either way.
function decisionAliases(model, body) {
  const references = bindingReferences(model, body);
  const byAlias = new Map((body.boundary || [])
    .filter((b) => b && b.alias).map((b) => [b.alias, b]));
  const kept = new Set();
  const visit = (alias) => {
    if (!alias || kept.has(alias) || !byAlias.has(alias)) return;
    kept.add(alias);
    const binding = byAlias.get(alias);
    const walk = (operand) => { for (const alias of operandAliases(operand)) visit(alias); };
    for (const operand of bindingOperands(binding)) walk(operand);
  };
  for (const [alias, reasons] of references) {
    if (reasons.has('rule') || reasons.has('guard')) visit(alias);
  }
  return kept;
}

// Pruning is what "reads are determined by the rules" means on the
// write path: every gesture that removes the last thing consulting a
// read removes the read in the same append, so there is no moment at
// which the boundary holds something nothing looks at. A body arriving
// from elsewhere – a hand-written file, an agent writing a whole
// body – may hold one, and keeps it until this runs: it is reported as
// an advisory first and dropped at the next edit, never silently.
function pruneUnreferencedBindings(model, body) {
  const dropped = unreferencedBindings(model, body);
  if (!dropped.length) return dropped;
  body.boundary = (body.boundary || []).filter((b) => !(b && dropped.includes(b.alias)));
  return dropped;
}

// ============================================================
// Commands – DCB-style consult-and-check, then append.
// ============================================================

class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DomainError';
  }
}

// A refusal like any other, of its own kind so the append can tell a
// full storage from a broken one and make room before giving up.
class StorageFullError extends DomainError {
  constructor() {
    super('The browser\'s storage for this site is full, so that change was not saved – '
      + 'it does not fit even with the history compacted. Removing a model you no longer need makes room.');
    this.name = 'StorageFullError';
  }
}

// Only structure is refused here – empty or unbounded, a key cannot
// address a definition. Idiom (PascalCase) is an advisory computed by
// `modelAdvisories`, never a refusal: an unidiomatic name still keys,
// renders and evaluates, and the Problems panel says so.
function validateName(value, label = 'Name') {
  const trimmed = (value || '').trim();
  if (!trimmed) throw new DomainError(`${label} must not be empty.`);
  if (trimmed.length > 100) throw new DomainError(`${label} must be 100 characters or fewer.`);
  return trimmed;
}

// The key a definition is stored under. For every kind but one that is
// the name the modeler typed, and validating it is validating the
// name. A scenario is keyed by a generated id instead, so there is
// nothing here for a modeler to get wrong.
function validateDefinitionKey(kind, value, label) {
  if (!isIdKeyed(kind)) return validateName(value, label);
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new DomainError(`A ${humanize(kind)} needs an id.`);
  return trimmed;
}

function validateModelName(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) throw new DomainError('Model name must not be empty.');
  return trimmed;
}

// Model lifecycle ------------------------------------------------------

function createDcbModel(name) {
  const trimmed = validateModelName(name);
  const id = generateId();
  appendEvents([{ type: 'dcb-model-created', data: { 'dcb-model-id': id, name: trimmed } }]);
  return id;
}

function deleteDcbModel(id) {
  if (!projectState()[id]) throw new DomainError('Model does not exist.');
  appendEvents([{ type: 'dcb-model-deleted', data: { 'dcb-model-id': id } }]);
}

// The same event the code view's `model "…"` header appends (see
// `replaceDefinitions`), for the bar's name field. A name that is
// already the model's appends nothing.
function renameDcbModel(id, name) {
  const model = getCtxOrThrow(id);
  const trimmed = validateModelName(name);
  if (trimmed === model.name) return;
  appendEvents([{ type: 'dcb-model-renamed', data: { 'dcb-model-id': id, name: trimmed } }]);
}

// Definitions ------------------------------------------------------------

function getCtxOrThrow(modelId) {
  const model = projectState()[modelId];
  if (!model) throw new DomainError('Model does not exist (it may have been deleted).');
  return model;
}

// The semantic checker – dangling references, unresolved types, write
// coverage, enum membership, everything a definition can get *wrong*
// while still being a definition. It throws the way it always has, but
// nothing on the write path calls it any more: `modelAdvisories` below
// runs it against the stored state and reports what it finds, so a
// defective definition loads, renders and evaluates (to the ordinary
// *error* outcome where it must) instead of being refused at the door.
function validateReferences(model, kind, name, body) {
  const resolved = withPending(model, kind, name, body);
  const refs = computeReferences(resolved, kind, name, body);
  for (const targetKind of DEF_KINDS) {
    const coll = resolved[DEF_COLLECTIONS[targetKind]];
    for (const targetName of refs[targetKind]) {
      if (!(targetName in coll)) {
        throw new DomainError(
          `Reference does not resolve: ${humanize(targetKind)} "${targetName}" does not exist in this model.`
        );
      }
    }
  }

  const checkPropertyTypes = (properties, label) => {
    const seen = new Set();
    for (const p of properties || []) {
      if (!CAMEL_RE.test(p.name || '')) {
        throw new DomainError(`${label} property name "${p.name}" must be camelCase.`);
      }
      if (seen.has(p.name)) throw new DomainError(`${label} declares "${p.name}" twice.`);
      seen.add(p.name);
      if (classifyType(resolved, p.propertyType).kind === 'unresolved') {
        throw new DomainError(`Type "${p.propertyType}" (property "${p.name}") does not resolve in this model.`);
      }
      if (p.isOptional && p.isList) {
        throw new DomainError(
          `${label} property "${p.name}" is both optional and a list – two spellings of "none". ` +
          'The empty list already says nothing is there; this evaluates as a plain list.'
        );
      }
    }
  };

  if (kind === 'event-definition') checkPropertyTypes(body.properties, 'Event');
  if (kind === 'command-definition') checkPropertyTypes(body.properties, 'Command');

  if (kind === 'custom-type-definition') validateCustomTypeBody(resolved, name, body);
  if (kind === 'entity-definition') validateEntityBody(resolved, name, body);
  if (kind === 'projection-definition') validateProjectionBody(resolved, name, body);
  if (kind === 'command-definition') validateCommandBody(resolved, body);
  if (kind === 'scenario-definition') validateScenarioBody(resolved, body);
  if (kind === 'projection-scenario-definition') validateProjectionScenarioBody(resolved, body);
}

// ============================================================
// Advisories.
//
// The demoted validations. A definition that names what does not
// exist, writes a tag its boundary never consults, compares against a
// member its enum does not hold – all of it is representable state
// now, and this is where it gets said. One advisory per finding,
// recomputed from the stored model and cached per log revision like
// every other derived view; a writer never sees these as a refusal.
//
// Scenarios are deliberately absent: a scenario's trouble already
// surfaces through its own run/status channel (`scenarioTrouble`),
// and reporting the same breakage twice would say less, not more.
// ============================================================

const ADVISORY_KINDS = DEF_KINDS.filter((kind) => !isIdKeyed(kind));

// Everything advisory about one definition, first semantic failure
// only – `validateReferences` throws at the first thing it finds, and
// fixing that one re-runs the rest. Anything unexpected a defective
// body makes the checker itself throw is reported the same way: to a
// reader an advisory is an advisory, whichever guard tripped.
// A rule's rejection message is the outcome a refusal is known by: what
// the person reads, and what a scenario expecting the refusal names. So
// it is static, one line, and short enough to stand in a toast – the
// values a refusal saw are reported beside it, never spliced into it.
const REJECTION_MAX_LENGTH = 200;

// Why `text` cannot be a rejection message, or '' when it can.
function rejectionProblem(text) {
  if (typeof text !== 'string' || !text.trim()) return 'is empty';
  if (/[\r\n]/.test(text)) return 'spans several lines';
  if (text.length > REJECTION_MAX_LENGTH) return `is longer than ${REJECTION_MAX_LENGTH} characters`;
  return '';
}

// Required on every rule and absent from every guard – but only ever
// advised, never refused: a rule without one still evaluates, and a
// refusal by it is what a scenario cannot name (`deriveThen`).
function rejectionAdvisories(body) {
  const messages = [];
  for (const condition of body.conditions || []) {
    if (!condition) continue;
    if (condition.rejection === undefined) {
      messages.push(`The rule "${conditionText(condition)}" has no rejection message – `
        + 'say what the command is refused with when it does not hold.');
      continue;
    }
    const problem = rejectionProblem(condition.rejection);
    if (problem) messages.push(`The rejection message of "${conditionText(condition)}" ${problem}.`);
  }
  for (const emission of body.publishes || []) {
    for (const guard of (emission && emission.when) || []) {
      if (guard && guard.rejection !== undefined) {
        messages.push(`The guard "${conditionText(guard)}" on "${emission.name}" carries a rejection `
          + 'message, but a guard never rejects – it skips the emission.');
      }
    }
  }
  return messages;
}

// The messages a command can be refused with, in rule order, each once,
// with the rules that lead to it. Rules sharing a message are one
// outcome. A rule without a message is left out – it is an advisory.
function commandRejections(body) {
  const outcomes = [];
  ((body && body.conditions) || []).forEach((condition, index) => {
    if (!condition || rejectionProblem(condition.rejection)) return;
    let outcome = outcomes.find((o) => o.rejection === condition.rejection);
    if (!outcome) outcomes.push(outcome = { rejection: condition.rejection, rules: [] });
    outcome.rules.push({ index, condition });
  });
  return outcomes;
}

function definitionAdvisories(model, kind, name, body) {
  const messages = [];
  if (!isIdKeyed(kind) && !PASCAL_RE.test(name)) {
    messages.push(`${humanize(kind)} name "${name}" is not PascalCase (e.g. "CourseDefined").`);
  }
  try {
    validateReferences(model, kind, name, body);
  } catch (error) {
    messages.push(error && error.message ? error.message : String(error));
  }
  // A read nothing consults. The app cannot author one – a read exists
  // because a rule, guard, emission, emitted tag or another read wanted
  // it – so this only ever comes from outside: a hand-written file, or
  // an agent writing a whole body. It still bounds the append, so it is
  // never dropped behind anyone's back; it is reported here and pruned
  // by the next edit to this command, which is what the message says.
  if (kind === 'event-definition') messages.push(...eventTagAdvisories(model, body));
  if (kind === 'command-definition') {
    messages.push(...rejectionAdvisories(body));
    const stranded = unreferencedBindings(model, body);
    if (stranded.length) {
      messages.push(`Reads nothing consults: ${stranded.join(', ')}. `
        + `${stranded.length === 1 ? 'It still widens' : 'They still widen'} the consistency `
        + `boundary, so nothing is dropped now – the next edit to this command will remove `
        + `${stranded.length === 1 ? 'it' : 'them'}.`);
    }
  }
  return messages;
}

let advisoriesCache = null;

function modelAdvisories(model) {
  if (advisoriesCache && advisoriesCache.revision === logRevisionNow() && advisoriesCache.model === model) {
    return advisoriesCache.found;
  }
  const found = [];
  for (const kind of ADVISORY_KINDS) {
    for (const [name, body] of Object.entries(model[DEF_COLLECTIONS[kind]] || {})) {
      for (const message of definitionAdvisories(model, kind, name, body)) {
        found.push({ kind, name, message });
      }
    }
  }
  advisoriesCache = { revision: logRevisionNow(), model, found };
  return found;
}

// Why a tag operand cannot fill a projection's tag `tag` (`{name,
// tagType}`) – or null. It must be one value of the declared type,
// which is the tag's key: a literal states its type (`CourseId("c1")`),
// any other value has one in the command's scope. A list is read once
// per element only with `each`.
function tagOperandProblem(model, body, operand, tag) {
  const source = operandSource(operand);
  const declared = tag && tag.tagType;
  const mismatch = (held) => (declared && held && held !== declared
    ? `is tagged ${operandText(operand)}, ${typeArticle(held)} ${held} – but its "${tag.name}" tag is ${typeArticle(declared)} ${declared}.`
    : null);
  if (source === 'static' || source === 'enum-member') {
    return `is tagged ${operandText(operand)}, which says no tag type – write the literal with its type, `
      + `${declared || 'CourseId'}(${JSON.stringify(source === 'static' ? operand : operand.enumMember)}).`;
  }
  if (source === 'tag-literal') {
    if (operand.tagValue === null || operand.tagValue === undefined) return `is tagged ${operand.tagType} with no value – a tag has one.`;
    return mismatch(operand.tagType);
  }
  // `each` fans out over a list; over one value there is nothing to fan.
  if (source === 'each') {
    const over = tagOperandType(model, body, operand.each);
    if (over && !over.isList) {
      return `is tagged ${operandText(operand)}, but ${operandText(operand.each)} is one value – ` +
        `"each" fans out over a list; drop it.`;
    }
    if (operandSource(operand.each) === 'each') return 'is tagged each of each';
    const element = tagOperandType(model, body, operand);
    return element ? mismatch(element.propertyType) : null;
  }
  const resolved = tagOperandType(model, body, operand);
  if (resolved && resolved.isList) {
    return `is tagged ${operandText(operand)}, which is a list – a tag takes one value; ` +
      `"each ${operandText(operand)}" reads it once per element.`;
  }
  return resolved ? mismatch(resolved.propertyType) : null;
}

// "a" or "an", for a type name in a sentence.
function typeArticle(word) {
  return /^[aeiou]/i.test(String(word || '')) ? 'an' : 'a';
}

// Why a read cannot be read as written – or null: a projection that
// exists, one value for each tag it declares and none it does not, each
// of the declared type, one fan-out at most, and the arguments it
// takes and no others. Shared by an alias's read and a read in
// place, which are the same read. `chained(operand, what)` lets a
// binding add its own rule – a value from a binding below it.
function readProblem(model, body, read, where, chained = () => null) {
  const projection = model['projection-definitions'][read.projection];
  if (!projection) return `${where} reads "${read.projection}", which this model does not define.`;
  const label = `${where} reads ${read.projection}`;
  if (read.tags !== undefined && (read.tags === null || typeof read.tags !== 'object' || Array.isArray(read.tags))) {
    return `${label} with tags that are not named – each value belongs to one of its tags.`;
  }
  const declared = projectionTagParams(projection);
  const held = read.tags || {};
  for (const tag of declared) {
    if (!Object.prototype.hasOwnProperty.call(held, tag.name)) {
      return `${label} without a value for its "${tag.name}" tag (${tag.tagType}).`;
    }
  }
  for (const key of Object.keys(held)) {
    if (!declared.some((tag) => tag.name === key)) {
      return declared.length
        ? `${label} with "${key}", which is not one of its tags (${declared.map((tag) => tag.name).join(', ')}).`
        : `${label} with "${key}", but it is untagged – it is read by no tag.`;
    }
  }
  const fans = readTagOperands(read).filter((operand) => operandSource(operand) === 'each');
  if (fans.length > 1) return `${label}, which fans out over ${fans.length} lists – a read fans out over one.`;
  for (const tag of declared) {
    const operand = held[tag.name];
    if (operand === undefined || operand === null || operandIncomplete(operand)) {
      return `${label} with no value for its "${tag.name}" tag.`;
    }
    const outside = chained(operand, `its "${tag.name}" tag`);
    if (outside) return outside;
    const problem = tagOperandProblem(model, body, operand, tag);
    if (problem) return `${label}, which ${problem}`;
  }
  const slots = projectionSlots(projection);
  const supplied = Object.keys(read.arguments || {});
  const missing = slots.find((slot) => !supplied.includes(slot.name));
  if (missing) return `${label} without "${missing.name}", which it takes as an argument.`;
  const extra = supplied.find((key) => !slots.some((slot) => slot.name === key));
  if (extra) return `${label} with "${extra}", which it does not take as an argument.`;
  for (const key of supplied) {
    const outside = chained(read.arguments[key], `"${key}"`);
    if (outside) return outside;
  }
  return null;
}

// What a projection's own tags cannot do, as the advisory that says so
// – or null. Two ways a handler and the tags fail to meet, both decided
// by the tags an event lists:
//
// - a handled event lists no tag of some type the projection is tagged
//   by, so its query never returns it and that handler never fires
//   (`CopyExists (tag copyId: CopyId)` moved by a `BookCatalogued` that
//   lists only an isbn);
// - a handled event lists one of those types twice (an assignment
//   naming both the new holder and the one replaced), so it reaches
//   both instances and a declarative handler fires for both: the
//   instructor being replaced would "gain" the course their successor
//   was just assigned. A script can tell the two apart (`tags`), so
//   only a declared fold is held to it.
function projectionTagProblem(model, projectionName) {
  const projection = model['projection-definitions'][projectionName];
  const tagTypes = projectionTagTypes(model, projectionName);
  if (!projection || !tagTypes.length || derivedOf(projection)) return null;
  const label = `Projection "${projectionName}"`;
  const [unreached] = readTagsMissing(model, projectionName, tagTypes);
  if (unreached) {
    return `${label} is tagged by ${unreached.missing.join(' and ')}, but ` +
      `"${unreached.event}", which it handles, is tagged by no ${unreached.missing.join(' or ')} – ` +
      'so that handler never fires.';
  }
  if (scriptOf(projection)) return null;
  for (const eventName of projectionHandledTypes(model, projectionName)) {
    const leaves = eventTagLeaves(model, model['event-definitions'][eventName]);
    for (const type of tagTypes) {
      const carriers = leaves.filter((leaf) => leaf.identifierType === type);
      if (carriers.length > 1) {
        return `${label} is tagged by ${type}, and "${eventName}" is tagged by ` +
          `${type} in ${carriers.map((leaf) => `"${leaf.path}"`).join(' and ')}, so its handler ` +
          'fires for both and cannot tell them apart. Tag it by one, split the event so each ' +
          'records one fact, or script the projection.';
      }
    }
  }
  return null;
}

// Handler validation. `target` is a projection body: `valueType`,
// `isList`, `script` – an entity property is a binding to one, so
// there is exactly one shape to validate.
function validateHandlers(model, label, target, handlers) {
  if (scriptOf(target)) return validateScriptedHandlers(model, label, handlers);
  const allowedOperations = operationsFor(model, target);
  const members = enumMembersFor(model, target.valueType);
  const handledEvents = new Set();

  // `successor` wraps another operand, so recognising an operand means
  // walking into it. It is where numbering lives: a value set to the
  // successor of what an event carried *is* the next value to issue,
  // at every point in its life.
  const checkOperand = (operand, where) => {
    if (operandSource(operand) === 'successor') {
      // `hasSuccessor` is the rule; this is where breaking it is
      // refused. (A composite has no successor either, but a projection
      // never holds one – its valueType is refused before this runs.)
      if (!hasSuccessor(model, target.valueType)) {
        throw new DomainError(
          `${where} takes a successor, but ${label} is typed ${target.valueType}. ` +
          'A successor is defined on integers and on strings ending in digits.'
        );
      }
      return checkOperand(operand.successor, where);
    }
    assertRecognisedOperand(operand, where);
    return operand;
  };

  for (const handler of handlers || []) {
    if (!handler || !handler.event) {
      throw new DomainError(`A handler on ${label} has no event.`);
    }
    if (handledEvents.has(handler.event)) {
      throw new DomainError(`${label} handles "${handler.event}" twice.`);
    }
    handledEvents.add(handler.event);
    // The mirror of the scripted check below. Code on a declared
    // handler never runs (`evCompileHandler`); say so rather than let
    // it sit in the model looking as if it did.
    if (handler.code !== undefined) {
      throw new DomainError(
        `The handler for "${handler.event}" on ${label} declares an operation and also carries ` +
        'code. Only a scripted projection runs code.'
      );
    }
    if (!allowedOperations.includes(handler.operation)) {
      throw new DomainError(
        `Operation "${handler.operation}" is not available for ${label} ` +
        `(allowed: ${allowedOperations.join(', ')}).`
      );
    }
    const event = model['event-definitions'][handler.event];
    if (!event) {
      throw new DomainError(`${label} handles "${handler.event}", which this model does not define.`);
    }
    const where = `The handler for "${handler.event}" on ${label}`;
    // `undefined` is not a value an operand can have – JSON cannot even
    // carry it – but `operandSource` reads it as a static literal, so
    // without this a handler that says what it does without saying
    // what *from* slips through and renders as "undefined" everywhere
    // the effect is spoken. `null` stays legal: "no value yet" is a
    // value.
    if (handler.value === undefined) {
      throw new DomainError(`${where} says what it does but not what value it takes.`);
    }
    const leaf = checkOperand(handler.value, where);
    if (operandSource(leaf) === 'event-property') {
      const known = (event.properties || []).some((p) => p.name === leaf.eventProperty);
      if (!known) {
        throw new DomainError(
          `Handler on ${label} reads "${leaf.eventProperty}", which "${handler.event}" does not carry.`
        );
      }
    }
    if (members && operandSource(leaf) === 'enum-member'
        && !members.includes(leaf.enumMember)) {
      throw new DomainError(
        `Handler on ${label} sets "${leaf.enumMember}", which is not a member of ${target.valueType}.`
      );
    }
  }
}

// A scripted handler is a body of code, and nothing here parses it.
// What can still be checked is what it *claims*: the event exists and
// is claimed once. That is exactly the part the derived DCB reads, so
// the boundary stays trustworthy while the accumulation does not.
function validateScriptedHandlers(model, label, handlers) {
  const handledEvents = new Set();
  for (const handler of handlers || []) {
    if (!handler || !handler.event) {
      throw new DomainError(`A handler on ${label} has no event.`);
    }
    if (handledEvents.has(handler.event)) {
      throw new DomainError(`${label} handles "${handler.event}" twice.`);
    }
    handledEvents.add(handler.event);
    if (!model['event-definitions'][handler.event]) {
      throw new DomainError(`${label} handles "${handler.event}", which this model does not define.`);
    }
    if (typeof handler.code !== 'string' || !handler.code.trim()) {
      throw new DomainError(
        `The handler for "${handler.event}" on ${label} is scripted but carries no code.`
      );
    }
    if (handler.operation !== undefined || handler.value !== undefined) {
      throw new DomainError(
        `The handler for "${handler.event}" on ${label} is scripted and also declares an ` +
        'operation. A handler is one or the other: the code is the operation.'
      );
    }
  }
}

// What a script may state, wherever it appears. `initialState` is the
// state before any event; `exposes` names the field of it a condition
// reads, and is what keeps a composite accumulation from leaking into
// the boundary – `propertyType`/`isList` still describe that exposed
// value, so conditions type-check exactly as they always did.
//
// Its arguments are the projection's (`validateProjectionTags`).
function validateScript(model, label, target) {
  const script = scriptOf(target);
  if (script.initialState === undefined) {
    throw new DomainError(`${label} needs an initial state – it is the state before any event.`);
  }
  if (target.initialValue !== undefined) {
    throw new DomainError(
      `${label} declares both an initial value and a script. The script's "initialState" is the ` +
      'one that starts it; two of them would disagree.'
    );
  }
  if (script.exposes !== undefined) {
    if (!CAMEL_RE.test(script.exposes)) {
      throw new DomainError(`${label} exposes "${script.exposes}", which is not a camelCase field name.`);
    }
    const state = script.initialState;
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new DomainError(
        `${label} exposes the field "${script.exposes}", but its initial state is not a record – ` +
        'a script that exposes one field of its state must keep that state in fields.'
      );
    }
    if (!(script.exposes in state)) {
      throw new DomainError(
        `${label} exposes "${script.exposes}", which its initial state does not hold. ` +
        `It starts with: ${Object.keys(state).join(', ') || 'nothing'}.`
      );
    }
  }

  // Arguments are the projection's own since 10.0. A 9.x body is
  // lifted on import; one stored here is a misreading to point out.
  if (script.arguments !== undefined) {
    throw new DomainError(
      `${label} states arguments inside its script. They belong to the projection – ` +
      'beside its tags, where every kind of projection declares them.'
    );
  }

  // A script is read by the tags its projection declares, like any
  // projection (8.0) – they reach its code as `tags`. A filter of its
  // own would be a second, disagreeing answer to "which events".
  if (script.tagFilter !== undefined) {
    throw new DomainError(
      `${label} states a tag filter. A projection declares the tags it is read by, and a ` +
      'script sees their values as `tags` – drop the filter.'
    );
  }
}

// The initial value, checked against the declared type. `null` is
// legal for any type – it is the state before anything has happened,
// and distinct from the empty string. A list-typed projection starts
// at a list, empty or not, of typed elements; `null` never appears
// inside one, because a list of nothing-yets says nothing a shorter
// list does not.
function validateInitialValue(model, label, body) {
  const members = enumMembersFor(model, body.valueType);
  const expected = literalKindOf(model, body.valueType);

  const checkElement = (element, where) => {
    if (operandSource(element) === 'enum-member') {
      if (!members) {
        throw new DomainError(
          `${where} names an enum member, but "${body.valueType}" is not an enum.`
        );
      }
      if (!members.includes(element.enumMember)) {
        throw new DomainError(
          `${where} starts in "${element.enumMember}", which is not a member of ${body.valueType}.`
        );
      }
      return;
    }
    if (element === null || (element !== null && typeof element === 'object')) {
      throw new DomainError(
        `${where} is not a literal – a list element is a value of the list's type, never null ` +
        'and never a record.'
      );
    }
    if (members) {
      throw new DomainError(
        `${where} is a bare literal, but "${body.valueType}" is an enum – name the member as ` +
        '{"enumMember": "..."} so renaming it rewrites this too.'
      );
    }
    if (typeof element !== expected) {
      throw new DomainError(
        `${where} is ${JSON.stringify(element)}, which is not a ${body.valueType}.`
      );
    }
  };

  const value = body.initialValue;
  if (value === null) return;
  if (body.isList) {
    if (!Array.isArray(value)) {
      throw new DomainError(
        `${label} holds a list, so its initial value is one – empty, or holding typed elements.`
      );
    }
    value.forEach((element, index) => checkElement(element, `${label}'s initial element ${index + 1}`));
    return;
  }
  if (Array.isArray(value)) {
    throw new DomainError(`${label} holds a single value, but its initial value is a list.`);
  }
  checkElement(value, `${label}'s initial value`);
}

// One projection – the one shape behind an entity property and a
// standalone read alike: same handlers, same operations, same
// operands. It declares the tags it is read by (8.0), each named and
// of a tag type; none at all is an untagged projection, which folds
// the whole log – what a global numbering is.
function validateProjectionBody(model, projectionName, body) {
  validateProjectionTags(model, projectionName, body);
  const valueCls = classifyType(model, body.valueType);
  if (valueCls.kind === 'unresolved') {
    throw new DomainError(
      `Type "${body.valueType}" (projection "${projectionName}") does not resolve in this model.`
    );
  }
  const script = scriptOf(body);
  if (body.script && body.derived) {
    throw new DomainError(
      `Projection "${projectionName}" declares both a script and a derived predicate – one or ` +
      'the other produces its value, not both. It reads as scripted until one goes.'
    );
  }

  if (script) {
    validateScript(model, `projection "${projectionName}"`, body);
    validateHandlers(model, `projection "${projectionName}"`, body, body.handlers);
    return;
  }

  if (derivedOf(body)) {
    // A derived projection is nothing but its predicate or computation:
    // no initial value (before any event it derives from its operands'
    // initial values), no handlers (its operands' handlers are its
    // query), and one value – a comparison's boolean, or a number.
    if (body.derived.predicate !== undefined && body.derived.operator !== undefined) {
      throw new DomainError(
        `Projection "${projectionName}" states both a predicate and an operator – it compares or it ` +
        'computes, not both. It reads as a comparison until one goes.'
      );
    }
    if (!derivedComputes(body.derived) && (body.valueType !== 'boolean' || body.isList)) {
      throw new DomainError(
        `Projection "${projectionName}" is derived by a comparison, so it holds its outcome – ` +
        `one boolean, never ${body.isList ? 'a list' : `${typeArticle(body.valueType)} ${body.valueType}`}.`
      );
    }
    if (body.initialValue !== undefined) {
      throw new DomainError(
        `Projection "${projectionName}" is derived and declares an initial value. Before any ` +
        'event it already derives from its operands\' own initial values – a second start would disagree.'
      );
    }
    if ((body.handlers || []).length) {
      throw new DomainError(
        `Projection "${projectionName}" is derived and declares handlers. Nothing advances a ` +
        'derived projection – its operands\' handlers are its query.'
      );
    }
    validateDerived(model, projectionName, body);
    return;
  }

  // A record of fields is a value only code can advance: the declared
  // operations act on a single value and have nothing to act on in
  // one, so a composite is legal exactly where a script is what moves
  // the projection.
  if (valueCls.kind === 'value' && valueCls.composite) {
    throw new DomainError(
      `Projection "${projectionName}" holds "${body.valueType}", which is a composite. ` +
      'The operations that advance a declared projection act on a single value and have ' +
      'nothing to act on in a record of fields – script the projection to hold one.'
    );
  }

  if (body.initialValue === undefined) {
    throw new DomainError(
      `Projection "${projectionName}" needs an initial value – it is the value before any event ` +
      'has been applied, and for a numbering it is where the prefix is stated. ' +
      '"null" is a value: no value yet.'
    );
  }
  validateInitialValue(model, `Projection "${projectionName}"`, body);

  // Zero handlers is a legitimate draft: a projection nothing moves
  // yet reads as its initial value, and the interface says so.
  validateHandlers(model, `projection "${projectionName}"`, body, body.handlers);
}

// A projection's parameters. Its tags: each a camelCase name, once, of
// a tag type – the key a read's value is rendered under. Its arguments:
// a camelCase name each, of any type that resolves, and none a tag also
// has, since a read gives both in one list. An argument is not a tag
// and can never narrow a query: the store returns the same events
// either way – which is why a tag-typed value may still be one, and
// why a declared projection, whose handlers see only the event, has no
// use for any. Then whether the events it handles carry the tags
// (`projectionTagProblem`).
function validateProjectionTags(model, projectionName, body) {
  const label = `Projection "${projectionName}"`;
  const seen = new Set();
  for (const tag of projectionTagParams(body)) {
    if (!CAMEL_RE.test(tag.name || '')) {
      throw new DomainError(`${label} has a tag named "${tag.name}", which is not a camelCase name.`);
    }
    if (seen.has(tag.name)) throw new DomainError(`${label} declares the tag "${tag.name}" twice.`);
    seen.add(tag.name);
    if (classifyType(model, tag.tagType).kind === 'unresolved') {
      throw new DomainError(`${label}'s tag "${tag.name}" is typed "${tag.tagType}", which does not resolve in this model.`);
    }
    if (!isTagBearing(model, tag.tagType)) {
      throw new DomainError(
        `${label}'s tag "${tag.name}" is typed ${tag.tagType}, which is no tag type – nothing is ` +
        'tagged by it, so no event would reach this projection.'
      );
    }
  }
  const arguments_ = new Set();
  for (const argument of projectionSlots(body)) {
    if (!CAMEL_RE.test(argument.name || '')) {
      throw new DomainError(`${label} has an argument named "${argument.name}", which is not a camelCase name.`);
    }
    if (seen.has(argument.name)) {
      throw new DomainError(`${label} names both a tag and an argument "${argument.name}".`);
    }
    if (arguments_.has(argument.name)) {
      throw new DomainError(`${label} declares the argument "${argument.name}" twice.`);
    }
    arguments_.add(argument.name);
    if (classifyType(model, argument.propertyType).kind === 'unresolved') {
      throw new DomainError(
        `${label}'s argument "${argument.name}" is typed "${argument.propertyType}", ` +
        'which does not resolve in this model.'
      );
    }
  }
  if (arguments_.size && !scriptOf(body) && !derivedOf(body)) {
    throw new DomainError(
      `${label} takes ${[...arguments_].map((n) => `"${n}"`).join(', ')} as ` +
      `${arguments_.size === 1 ? 'an argument' : 'arguments'}, but its handlers see only the event – ` +
      'nothing uses them. Make each a tag, or drop it.'
    );
  }
  const problem = projectionTagProblem(model, projectionName);
  if (problem) throw new DomainError(problem);
}

// The derived predicate: both operands recognised, at least one of
// them a projection read, every read's arguments covering exactly the
// arguments its target takes, enum members belonging to the type they
// sit opposite – and no cycle, since a value derived through itself has
// nowhere to start. A side may be one of the derived projection's own
// parameters (10.0), and so may an operand's tag or argument
// (`{parameterName}`), of the type the slot declares; otherwise a tag
// is a typed literal and an argument a literal.
function validateDerived(model, projectionName, body) {
  const derived = body.derived;
  const label = `projection "${projectionName}"`;
  if (derivedComputes(derived)) {
    if (!DERIVED_OPERATORS.includes(derived.operator)) {
      throw new DomainError(
        `${label} computes through "${derived.operator}", which is not an operator a derived ` +
        `projection knows (${DERIVED_OPERATORS.join(', ')}).`
      );
    }
    if (derived.negate !== undefined) {
      throw new DomainError(`${label} negates a computation – "negate" belongs to a comparison.`);
    }
  } else if (!DERIVED_PREDICATES.includes(derived.predicate)) {
    throw new DomainError(
      `${label} derives through "${derived.predicate}", which is not a predicate a derived ` +
      'projection can state.'
    );
  }

  const reads = derivedOperands(derived).filter((o) => operandSource(o) === 'projection-read');
  if (!reads.length) {
    throw new DomainError(
      `${label} derives from no projection – at least one side of its predicate must read one.`
    );
  }

  const own = projectionParameters(body);
  const ownText = own.map((p) => p.name).join(', ') || 'it takes none';
  // A `{parameterName}` – a side, an operand's tag or its argument –
  // names one of this projection's own parameters, whether it is read
  // by it as a tag or takes it as an argument: either way the reader
  // gave its value. Returns the parameter, or throws.
  const ownParameter = (value, where) => {
    const parameter = own.find((p) => p.name === value.parameterName);
    if (!parameter || value.property !== undefined) {
      throw new DomainError(`${where} ${operandText(value)}, which is none of ${projectionName}'s own parameters (${ownText}).`);
    }
    return parameter;
  };

  for (const operand of derivedOperands(derived)) {
    assertRecognisedOperand(operand, `An operand of ${label}`);
    const source = operandSource(operand);
    if (source === 'parameter') {
      ownParameter(operand, `An operand of ${label} is`);
      continue;
    }
    if (source === 'alias-property' || source === 'event-property'
        || source === 'current-value' || source === 'successor') {
      throw new DomainError(
        `An operand of ${label} is "${operandText(operand)}" – a derived projection reads other ` +
        'projections, its own parameters, enum members and literals; nothing else is in scope.'
      );
    }
    if (source !== 'projection-read') continue;

    const target = model['projection-definitions'][operand.projection];
    if (!target) {
      throw new DomainError(
        `${label} derives from "${operand.projection}", which this model does not define.`
      );
    }
    const held = operand.tags && typeof operand.tags === 'object' && !Array.isArray(operand.tags) ? operand.tags : {};
    for (const tag of projectionTagParams(target)) {
      const value = held[tag.name];
      const where = `${label} reads ${operand.projection}`;
      if (value === undefined) {
        throw new DomainError(`${where} without a value for its "${tag.name}" tag (${tag.tagType}).`);
      }
      if (operandSource(value) === 'parameter') {
        const parameter = ownParameter(value, `${where} tagged`);
        if (parameter.type !== tag.tagType) {
          throw new DomainError(
            `${where} tagged ${value.parameterName}, ${typeArticle(parameter.type)} ${parameter.type} – ` +
            `but its "${tag.name}" tag is ${typeArticle(tag.tagType)} ${tag.tagType}.`
          );
        }
        continue;
      }
      if (operandSource(value) === 'tag-literal') {
        if (value.tagType !== tag.tagType) {
          throw new DomainError(
            `${where} tagged ${operandText(value)} – but its "${tag.name}" tag is ` +
            `${typeArticle(tag.tagType)} ${tag.tagType}.`
          );
        }
        continue;
      }
      throw new DomainError(
        `${where} tagged ${operandText(value)} – an operand's tag is one of ${projectionName}'s own ` +
        'parameters or a typed literal.'
      );
    }
    for (const key of Object.keys(held)) {
      if (!projectionTagParams(target).some((tag) => tag.name === key)) {
        throw new DomainError(`${label} reads ${operand.projection} with "${key}", which is not one of its tags.`);
      }
    }
    const slots = projectionSlots(target);
    const supplied = Object.keys(operand.arguments || {});
    for (const slot of slots) {
      if (!supplied.includes(slot.name)) {
        throw new DomainError(
          `${label} reads "${operand.projection}" without "${slot.name}", which it takes as an argument.`
        );
      }
    }
    for (const key of supplied) {
      const slot = slots.find((s) => s.name === key);
      if (!slot) {
        throw new DomainError(
          `${label} reads "${operand.projection}" with "${key}", which it does not take as an argument.`
        );
      }
      const argument = operand.arguments[key];
      const argumentSource = operandSource(argument);
      if (argumentSource === 'parameter') {
        const parameter = ownParameter(argument, `${label} supplies "${key}" as`);
        if (parameter.type !== slot.propertyType) {
          throw new DomainError(
            `${label} supplies "${key}" as ${argument.parameterName}, ${typeArticle(parameter.type)} ` +
            `${parameter.type} – but ${operand.projection} takes it as ${typeArticle(slot.propertyType)} ${slot.propertyType}.`
          );
        }
        continue;
      }
      if (argumentSource !== 'enum-member' && argumentSource !== 'static') {
        throw new DomainError(
          `${label} supplies "${key}" as "${operandText(argument)}" – an operand's ` +
          `argument is a literal or one of ${projectionName}'s own parameters.`
        );
      }
    }
  }

  // An enum member is checked against the projection or parameter it
  // sits opposite, the same way a condition's is checked against its
  // alias property.
  const typeOfSide = (operand) => {
    if (operandSource(operand) === 'projection-read') {
      const target = model['projection-definitions'][operand.projection];
      return target ? { type: target.valueType, isList: !!target.isList } : null;
    }
    if (operandSource(operand) === 'parameter') {
      const parameter = own.find((p) => p.name === operand.parameterName);
      return parameter ? { type: parameter.type, isList: false } : null;
    }
    return null;
  };
  const sides = [
    [derived.leftHandSide, derived.rightHandSide],
    [derived.rightHandSide, derived.leftHandSide],
  ];
  for (const [maybeEnum, other] of sides) {
    if (operandSource(maybeEnum) !== 'enum-member') continue;
    const opposite = typeOfSide(other);
    if (!opposite) continue;
    const members = enumMembersFor(model, opposite.type);
    if (members && !members.includes(maybeEnum.enumMember)) {
      throw new DomainError(
        `"${maybeEnum.enumMember}" is not a member of ${opposite.type} (${label}'s predicate).`
      );
    }
  }

  // A parameter compared with a single value is compared as that kind
  // of value: an hour count against a count, a title against a title.
  // A read against a read, or a literal, was always left to evaluation.
  const ordinary = ['equals', 'lessThan', 'lessThanOrEquals', 'greaterThan', 'greaterThanOrEquals'];
  if (!derivedComputes(derived) && ordinary.includes(derived.predicate)) {
    for (const [side, other] of sides) {
      if (operandSource(side) !== 'parameter') continue;
      const mine = typeOfSide(side);
      const theirs = typeOfSide(other);
      if (!mine || !theirs || theirs.isList) continue;
      if (literalKindOf(model, mine.type) !== literalKindOf(model, theirs.type)) {
        throw new DomainError(
          `${label} compares ${side.parameterName}, ${typeArticle(mine.type)} ${mine.type}, with ` +
          `${operandText(other)}, ${typeArticle(theirs.type)} ${theirs.type} – they are no values of one kind.`
        );
      }
    }
  }

  // A computation takes two single numbers and yields one: an integer
  // from two integers, a number otherwise – and null from a null side,
  // which an ordering against it then errors on, so a side that may be
  // null is said here first.
  if (derivedComputes(derived)) {
    for (const operand of derivedOperands(derived)) {
      if (!derivedInputOf(model, operand, [], body)) {
        throw new DomainError(
          `${label} computes from "${operandText(operand)}", which is not a single number – ` +
          `"${derived.operator}" takes an integer or a number on each side.`
        );
      }
    }
    const result = derivedResultBase(model, derived, body);
    const declared = numericBaseOf(model, body.valueType);
    if (!declared || body.isList || (result === 'number' && declared === 'integer')) {
      throw new DomainError(
        `${label} computes ${typeArticle(result)} ${result}, but holds ` +
        `${body.isList ? `a list of ${body.valueType}` : `${typeArticle(body.valueType)} ${body.valueType}`} – ` +
        `declare it ${result === 'integer' ? 'an integer' : 'a number'}.`
      );
    }
    const nullable = derivedOperands(derived)
      .find((operand) => (derivedInputOf(model, operand, [], body) || {}).nullable);
    if (nullable !== undefined) {
      throw new DomainError(
        `${label} computes from ${operandText(nullable)}, which can be null – a projection it ` +
        `reads starts at null – so ${projectionName} is null then too, and a rule ordering ` +
        'against it errors. Start that projection at a number.'
      );
    }
  }

  const visit = (name, trail) => {
    const target = model['projection-definitions'][name];
    const inner = target && derivedOf(target);
    if (!inner) return;
    for (const operand of derivedOperands(inner)) {
      if (operandSource(operand) !== 'projection-read') continue;
      if (operand.projection === projectionName) {
        throw new DomainError(
          `${label} derives from itself through ${trail.join(' → ')} – a cycle has no value to start from.`
        );
      }
      if (trail.includes(operand.projection)) continue;
      visit(operand.projection, [...trail, operand.projection]);
    }
  };
  for (const operand of reads) {
    if (operand.projection === projectionName) {
      throw new DomainError(`${label} derives from itself – a cycle has no value to start from.`);
    }
    visit(operand.projection, [operand.projection]);
  }
}

// A value type is scalar (an opaque JSON Schema) or composite (typed
// fields) – never both and never neither. `isTag` is meaningful only
// on the scalar form: a composite is never itself a tag, so it may not
// combine with fields. An entity-owned value type carries one further
// invariant, checked here rather than only at the point of change: it
// must stay tag-bearing, since an entity that could not be tagged
// could not be bound in a DCB query.
//
// A composite's fields are singular, required and never composite
// themselves. All three keep zipping honest: zipping correlates a
// fanned-out binding with the list it fanned from by index, and it only
// means anything while the two have the same length. A list field
// flattens, an optional tag-marked field contributes a variable number
// of tags, and either way the index drifts with nothing on the page to
// show it.
function validateCustomTypeBody(model, typeName, body) {
  const hasSchema = body.schema !== undefined;
  const hasFields = body.properties !== undefined;
  if (hasSchema && hasFields) {
    throw new DomainError(
      `Value type "${typeName}" declares both a schema and fields – it is either scalar or composite, not both.`
    );
  }
  if (!hasSchema && !hasFields) {
    throw new DomainError(`Value type "${typeName}" declares neither a schema nor fields.`);
  }

  if (hasFields) {
    if (body.isTag) {
      throw new DomainError(
        `Value type "${typeName}" is composite and marked "represented as a tag" – only a scalar ` +
        'value type can be. A composite\'s tag-ness is derived from its tag-marked fields instead.'
      );
    }
    const fields = body.properties || [];
    if (fields.length === 0) {
      throw new DomainError(`Composite type "${typeName}" declares no fields.`);
    }
    const seen = new Set();
    for (const field of fields) {
      if (!CAMEL_RE.test(field.name || '')) {
        throw new DomainError(`Field name "${field.name}" on "${typeName}" must be camelCase.`);
      }
      if (seen.has(field.name)) {
        throw new DomainError(`Composite type "${typeName}" declares field "${field.name}" twice.`);
      }
      seen.add(field.name);
      const cls = classifyType(model, field.propertyType);
      if (cls.kind === 'unresolved') {
        throw new DomainError(
          `Type "${field.propertyType}" (field "${typeName}.${field.name}") does not resolve in this model.`
        );
      }
      // Composites do not nest – an operand reaches one field, never a path.
      if (cls.kind === 'value' && cls.composite) {
        throw new DomainError(
          `Field "${typeName}.${field.name}" is typed with the composite "${field.propertyType}". ` +
          `Composites do not nest – an operand reaches one field, never a path.`
        );
      }
      if (field.isList) {
        throw new DomainError(
          `Field "${typeName}.${field.name}" is a list. A composite's fields are singular, ` +
          `because a list field flattens and would break the index a zipped condition reads by.`
        );
      }
      if (field.isOptional) {
        throw new DomainError(
          `Field "${typeName}.${field.name}" is optional. A composite's fields are required, ` +
          `because a missing tag field would contribute no tag and shift every later index.`
        );
      }
    }
  }

  const owner = entityOfIdType(model, typeName);
  if (owner && !isTagBearing(model, typeName)) {
    throw new DomainError(
      `"${typeName}" is entity "${owner}"'s derived identifier – it must stay tag-bearing (a scalar ` +
      'marked "represented as a tag", or a composite with at least one tag-marked field).'
    );
  }
}

// An entity's properties are bindings – `{name, projection}` – and an
// instance reads each one by its identifier, the way a command reads
// `CourseCapacity(courseId)`. So what binds is a projection tagged by
// exactly that identifier; whether its events carry the tag is the
// projection's own advisory.
function validateEntityBody(model, entityName, body) {
  if (body.identifierType !== undefined && !PASCAL_RE.test(body.identifierType)) {
    throw new DomainError(
      `Entity "${entityName}"'s identifierType "${body.identifierType}" must be PascalCase.`
    );
  }

  const idType = body.identifierType || (entityName + 'Id');
  const seen = new Set();
  for (const property of body.properties || []) {
    if (!property || !CAMEL_RE.test(property.name || '')) {
      throw new DomainError(`Property name "${(property || {}).name}" must be camelCase.`);
    }
    if (seen.has(property.name)) throw new DomainError(`Entity declares property "${property.name}" twice.`);
    seen.add(property.name);

    const projection = model['projection-definitions'][property.projection];
    if (!projection) {
      throw new DomainError(
        `Property "${property.name}" binds projection "${property.projection}", ` +
        'which this model does not define.'
      );
    }
    // An instance reads each property by its own identifier, so what
    // binds is a projection tagged by exactly that – one tag, of the
    // entity's identifier type. Anything else would leave a tag the
    // instance has no value for, or read it by the wrong key.
    const tags = projectionTagParams(projection);
    if (tags.length !== 1 || tags[0].tagType !== idType) {
      throw new DomainError(
        `Property "${property.name}" of ${entityName} binds "${property.projection}", which is ` +
        (tags.length
          ? `tagged by ${tags.map((tag) => `${tag.name}: ${tag.tagType}`).join(', ')}`
          : 'untagged') +
        ` – an instance reads its properties by its own identifier, so it binds a projection ` +
        `tagged by one ${idType}.`
      );
    }
  }
  if (body.identifierName !== undefined && !CAMEL_RE.test(body.identifierName)) {
    throw new DomainError(
      `Entity "${entityName}"'s identifierName "${body.identifierName}" must be camelCase.`
    );
  }

  // The designation. An entity need not have one, and a lifecycle is an
  // ordinary property in every other respect, so the only thing wrong
  // here is a designation pointing at nothing – which is advisory, like
  // every other dangling reference: the model loads and the properties
  // still fold.
  //
  // Designating a property that *is* declared but whose states cannot be
  // read – scripted, derived, a list, typed a bare string – is not a
  // defect and is deliberately not advised. It is a legitimate model
  // (`content-decisions-scripted` ships one) whose lifecycle simply
  // cannot be drawn, so it is the Lifecycles page's business to say so
  // and nobody else's. `lifecycleRefusal` is what it asks.
  if (body.lifecycle !== undefined && body.lifecycle !== null) {
    if (typeof body.lifecycle !== 'string' || !CAMEL_RE.test(body.lifecycle)) {
      throw new DomainError(
        `Entity "${entityName}" designates the lifecycle "${body.lifecycle}", which is not a ` +
        'camelCase property name.'
      );
    }
    if (!seen.has(body.lifecycle)) {
      throw new DomainError(
        `Entity "${entityName}" designates "${body.lifecycle}" as its lifecycle but declares no ` +
        `property by that name. Nothing else breaks – the entity's own rules still read whatever ` +
        'properties it has – but no lifecycle is drawn for it.'
      );
    }
  }
}

function validateCommandBody(model, body) {
  const boundary = body.boundary || [];
  const aliases = new Set();
  // Declaration order *is* the chain: a binding may take its identifier
  // from an instance bound above it, never from one bound below. One
  // left-to-right pass therefore both resolves the chain and makes a
  // cycle impossible to write.
  const declaredAbove = [];
  for (const binding of boundary) {
    if (!CAMEL_RE.test(binding.alias || '')) {
      throw new DomainError(`Boundary alias "${binding.alias}" must be camelCase.`);
    }
    if (aliases.has(binding.alias)) throw new DomainError(`Boundary alias "${binding.alias}" is bound twice.`);
    aliases.add(binding.alias);

    // A projection binding is a read like any other, which is why it
    // lives here: its arguments put it in the chain, and its query
    // belongs in the append condition.
    if (binding.projection !== undefined) {
      const projection = model['projection-definitions'][binding.projection];
      if (!projection) {
        throw new DomainError(
          `Boundary binding "${binding.alias}" names unknown projection "${binding.projection}".`
        );
      }
      // `id` and `excluding` both belong to an entity binding. A
      // projection read gives its tags by name, `each` among them.
      for (const field of ['id', 'excluding']) {
        if (binding[field] !== undefined) {
          throw new DomainError(
            `Boundary binding "${binding.alias}" reads a projection but carries "${field}", ` +
            'which only an entity binding has.'
          );
        }
      }
      // A read gives a value for each tag the projection declares – of
      // the declared type, which is the tag's key – and, for a script,
      // the arguments its code takes. What differs is what each does: a
      // tag selects events, an argument reaches the code.
      const chained = (operand, what) => {
        for (const alias of operandAliases(operand)) {
          if (alias === binding.alias) return `Boundary binding "${binding.alias}" takes ${what} from itself.`;
          if (!declaredAbove.includes(alias)) {
            return `Boundary binding "${binding.alias}" takes ${what} from "${operandText(operand)}", ` +
              `but "${alias}" is not bound above it – a binding may only read what is declared earlier.`;
          }
        }
        return null;
      };
      const problem = readProblem(model, body, binding, `Boundary binding "${binding.alias}"`, chained);
      if (problem) throw new DomainError(problem);
      if (binding.isOptional !== undefined) {
        throw new DomainError(
          `Boundary binding "${binding.alias}" reads a projection and is marked "may be absent" – ` +
          `a projection always folds to a value, so there is no absent case to declare.`
        );
      }
      declaredAbove.push(binding.alias);
      continue;
    }

    if (!model['entity-definitions'][binding.entity]) {
      throw new DomainError(`Boundary binding "${binding.alias}" names unknown entity "${binding.entity}".`);
    }
    if (binding.id === undefined || binding.id === null || operandIncomplete(binding.id)) {
      throw new DomainError(`Boundary binding "${binding.alias}" has no identifier operand.`);
    }
    const idOperand = entityIdOperand(binding);
    if (operandSource(idOperand) === 'alias-property') {
      if (idOperand.alias === binding.alias) {
        throw new DomainError(`Boundary binding "${binding.alias}" takes its identifier from itself.`);
      }
      if (!declaredAbove.includes(idOperand.alias)) {
        throw new DomainError(
          `Boundary binding "${binding.alias}" takes its identifier from "${operandText(idOperand)}", ` +
          `but "${idOperand.alias}" is not bound above it – a binding may only read instances declared earlier.`
        );
      }
    }
    // Many instances are read where it says so, `each`, and only there.
    const plural = operandIsPlural(model, body, idOperand);
    if (isFannedOut(model, body, binding) && !plural && operandSource(idOperand) !== 'tag-literal') {
      throw new DomainError(
        `Boundary binding "${binding.alias}" reads each of ${operandText(idOperand)}, which is one value – ` +
        `"each" fans out over a list; drop it.`
      );
    }
    if (!isFannedOut(model, body, binding) && plural) {
      throw new DomainError(
        `Boundary binding "${binding.alias}" reads ${binding.entity} by ${operandText(idOperand)}, which ` +
        `holds many – ${binding.entity}(each ${operandText(idOperand)}) reads one instance per element.`
      );
    }
    if (binding.excluding !== undefined && !isFannedOut(model, body, binding)) {
      throw new DomainError(
        `Boundary binding "${binding.alias}" excludes ${operandText(binding.excluding)}, ` +
        `but it binds a single instance – there is nothing to exclude it from.`
      );
    }
    // The same "a field that means nothing here is a mistake" rule
    // `excluding` follows: a fanned binding already binds nothing over
    // an empty list, so the flag has no case left to cover.
    if (binding.isOptional && isFannedOut(model, body, binding)) {
      throw new DomainError(
        `Boundary binding "${binding.alias}" is marked "may be absent", but it fans out over a ` +
        `list – an empty list already binds nothing, so the flag means nothing there.`
      );
    }
    declaredAbove.push(binding.alias);
  }

  // An emission guard is a condition in every respect the checks below
  // care about – same operands, same predicates, same quantification –
  // so each one reads this combined list rather than `conditions`
  // alone. The one structural demand is that `when` is a list at all.
  for (const emission of body.publishes || []) {
    if (emission && emission.when !== undefined && !Array.isArray(emission.when)) {
      throw new DomainError(`"${emission.name}"'s guard ("when") must be a list of conditions.`);
    }
  }
  const allConditions = [
    ...(body.conditions || []),
    ...(body.publishes || []).flatMap((e) => (e && e.when) || []),
  ];

  // A plural alias cannot supply a single value, so it may be read by a
  // condition – which quantifies over it – but never emitted. Nor may a
  // read in place that fans out.
  for (const emission of body.publishes || []) {
    if (!emission || !emission.parameters) continue;
    for (const [key, operand] of Object.entries(emission.parameters)) {
      if (operandSource(operand) === 'projection-read' && readFanTag(operand)) {
        throw new DomainError(
          `"${emission.name}.${key}" takes its value from "${operandText(operand)}", which reads many. ` +
          `A fanned-out read can be checked, not emitted.`
        );
      }
      if (operandSource(operand) !== 'alias-property') continue;
      const binding = boundary.find((b) => b.alias === operand.alias);
      if (binding && isFannedOut(model, body, binding)) {
        throw new DomainError(
          `"${emission.name}.${key}" takes its value from "${operandText(operand)}", but "${operand.alias}" ` +
          `binds many instances. A fanned-out instance can be checked, not emitted.`
        );
      }
    }
  }

  // A condition may quantify over at most one fanned-out root. Two
  // distinct roots would have to be read as a cross product, and their
  // lengths are unrelated – nothing here can assert otherwise, and the
  // zipped and crossed readings look identical on the page.
  for (const condition of allConditions) {
    if (!condition) continue;
    const roots = conditionFanRoots(model, body, condition);
    if (roots.length > 1) {
      throw new DomainError(
        `Condition "${conditionText(condition)}" quantifies over ${roots.length} different lists ` +
        `(${roots.map((r) => r.replace(/^(parameter|binding):/, '')).join(' and ')}). ` +
        `A condition may iterate one list: nothing states that two lists are the same length.`
      );
    }
  }

  for (const condition of allConditions) {
    if (!condition || condition.predicate !== 'containsAny') continue;
    const left = conditionOperandType(model, body, condition, condition.leftHandSide);
    const right = conditionOperandType(model, body, condition, condition.rightHandSide);
    for (const [side, label] of [[left, 'Left'], [right, 'Right']]) {
      if (side && !side.isList) {
        throw new DomainError(
          `${label} side of "${conditionText(condition)}" is not a list – ` +
          `"containsAny" asks whether two lists intersect.`
        );
      }
    }
    if (left && right && left.propertyType !== right.propertyType) {
      throw new DomainError(
        `"${conditionText(condition)}" compares ${left.propertyType} with ${right.propertyType}; ` +
        `"containsAny" needs both sides to hold the same type.`
      );
    }
  }

  // `contains` asks one thing of its two sides, and it is worth
  // stating: a list on the left, one value on the right.
  for (const condition of allConditions) {
    if (!condition || condition.predicate !== 'contains') continue;
    const left = conditionOperandType(model, body, condition, condition.leftHandSide);
    const right = conditionOperandType(model, body, condition, condition.rightHandSide);
    if (left && !left.isList) {
      throw new DomainError(
        `Left side of "${conditionText(condition)}" is not a list – ` +
        `"contains" asks whether a list holds one value.`
      );
    }
    if (right && right.isList) {
      throw new DomainError(
        `Right side of "${conditionText(condition)}" is a list – "contains" looks for one value. ` +
        `"containsAny" is the one that intersects two lists.`
      );
    }
    if (left && right && left.propertyType !== right.propertyType) {
      throw new DomainError(
        `"${conditionText(condition)}" looks for ${right.propertyType} ` +
        `in a list of ${left.propertyType}.`
      );
    }
  }

  // `equalsAny` compares one scalar against a literal list – the one
  // operand position that is an array, and the one predicate that
  // reads one. Its entries are literals or enum-member references,
  // never a reference to data (that is `contains`/`containsAny` over a
  // list-typed source) and never null (a membership list may not hold
  // "no value").
  for (const condition of allConditions) {
    if (!condition) continue;
    const isValueList = Array.isArray(condition.rightHandSide);
    if (condition.predicate !== 'equalsAny') {
      if (isValueList) {
        throw new DomainError(
          `"${conditionText(condition)}" compares against a literal list, ` +
          `which only "equalsAny" reads.`
        );
      }
      continue;
    }
    if (!isValueList) {
      throw new DomainError(
        `"${conditionText(condition)}" – "equalsAny" compares against a literal list ` +
        `of values ("equals" is the one-value comparison).`
      );
    }
    const left = conditionOperandType(model, body, condition, condition.leftHandSide);
    if (left && left.isList) {
      throw new DomainError(
        `Left side of "${conditionText(condition)}" is a list – "equalsAny" compares one ` +
        `value against the listed ones ("contains"/"containsAny" read a list).`
      );
    }
    if (!condition.rightHandSide.length) {
      throw new DomainError(
        `"${conditionText(condition)}" lists no values – membership over an empty list is ` +
        `constant: it ${condition.negate ? 'always' : 'never'} holds.`
      );
    }
    for (const entry of condition.rightHandSide) {
      if (entry === null) {
        throw new DomainError(
          `"${conditionText(condition)}" lists null – a membership list may not hold ` +
          `"no value". Spell "unset or one of these" as a separate condition.`
        );
      }
      const source = operandSource(entry);
      if (source !== 'enum-member' && source !== 'static') {
        throw new DomainError(
          `"${conditionText(condition)}" lists "${operandText(entry)}" – an "equalsAny" ` +
          `list holds literals or enum members; membership against data is ` +
          `"contains"/"containsAny" over a list-typed source.`
        );
      }
    }
  }

  const commandProperties = new Set((body.properties || []).map((p) => p.name));
  let failure = null;
  forEachCommandOperand(body, (operand, meta) => {
    if (failure) return;
    assertRecognisedOperand(operand, meta.where);
    const source = operandSource(operand);
    if (source === 'parameter' && !commandProperties.has(operand.parameterName)) {
      failure = `${meta.where} reads parameter "${operand.parameterName}", which the command does not declare.`;
      return;
    }
    if (source === 'parameter' && operand.property) {
      const parameter = (body.properties || []).find((p) => p.name === operand.parameterName);
      const fields = parameter && compositeFieldsOf(model, parameter.propertyType);
      if (!fields) {
        failure = `${meta.where} reads "${operandText(operand)}", but "${operand.parameterName}" is typed `
          + `${parameter ? `"${parameter.propertyType}"` : '?'}, which has no fields.`;
        return;
      }
      if (!fields.some((f) => f.name === operand.property)) {
        failure = `${meta.where} reads "${operandText(operand)}", but `
          + `"${parameter.propertyType}" has no field "${operand.property}".`;
        return;
      }
    }
    if (source === 'projection-read') {
      failure = readProblem(model, body, operand, meta.where);
      return;
    }
    if (source === 'alias-property') {
      const binding = boundary.find((b) => b.alias === operand.alias);
      if (!binding) {
        failure = `${meta.where} reads "${operandText(operand)}", but "${operand.alias}" is not bound in the boundary.`;
        return;
      }
      // A projection holds one value and has no name for it, so the
      // alias alone names it. An entity holds many, so it cannot.
      if (binding.projection) {
        if (operand.property) {
          failure = `${meta.where} reads "${operandText(operand)}", but "${operand.alias}" binds the `
            + `projection "${binding.projection}", which holds one value and no property "${operand.property}".`;
        }
        return;
      }
      if (!operand.property) {
        failure = `${meta.where} reads "${operand.alias}" with no property, but "${operand.alias}" binds `
          + `${binding.entity}, which holds many – name the one it means.`;
        return;
      }
      const entity = model['entity-definitions'][binding.entity];
      const known = entity && (entity.properties || []).some((p) => p.name === operand.property);
      if (!known) {
        failure = `${meta.where} reads "${operandText(operand)}", but ${binding.entity} has no property "${operand.property}".`;
      }
    }
  });
  if (failure) throw new DomainError(failure);

  // A property taking arguments is read with them, so the binding that
  // reads one has to supply them. The converse
  // is an error too, exactly as `excluding` on a singular binding is: a
  // field that cannot apply here was written under a misunderstanding,
  // and saying so is more use than quietly ignoring it.
  for (const binding of boundary) {
    if (binding.projection !== undefined) continue;
    const entity = model['entity-definitions'][binding.entity];
    if (!entity) continue;
    const expected = argumentsExpected(model, body, binding);
    const supplied = Object.keys(binding.arguments || {});
    for (const argument of expected) {
      if (!supplied.includes(argument.name)) {
        throw new DomainError(
          `Boundary binding "${binding.alias}" supplies no "${argument.name}", which a ` +
          `${binding.entity} property it reads takes as an argument.`
        );
      }
    }
    for (const key of supplied) {
      const argument = expected.find((a) => a.name === key);
      if (!argument) {
        throw new DomainError(
          `Boundary binding "${binding.alias}" supplies "${key}", but nothing it reads asks for ` +
          `it – no ${binding.entity} property it consults takes an argument by that name.`
        );
      }
      const operand = binding.arguments[key];
      const resolved = resolveOperandType(operand, {
        boundary, commandProperties: body.properties || [], model,
      });
      if (resolved && (resolved.propertyType !== argument.propertyType || resolved.isList)) {
        throw new DomainError(
          `Boundary binding "${binding.alias}" supplies "${key}" as ` +
          `${resolved.propertyType}${resolved.isList ? '[]' : ''}, but it is declared ` +
          `${argument.propertyType}.`
        );
      }
      if (operandSource(operand) !== 'alias-property') continue;
      if (operand.alias === binding.alias) {
        throw new DomainError(`Boundary binding "${binding.alias}" takes an argument from itself.`);
      }
    }
  }

  // Enum members are checked against the alias property they sit
  // opposite, which is where a status comparison always appears. In an
  // `equalsAny` list every entry sits opposite the left-hand side.
  for (const condition of allConditions) {
    if (!condition || condition.rightHandSide === undefined) continue;
    const sides = Array.isArray(condition.rightHandSide)
      ? condition.rightHandSide.map((entry) => [entry, condition.leftHandSide])
      : [[condition.leftHandSide, condition.rightHandSide], [condition.rightHandSide, condition.leftHandSide]];
    for (const [maybeEnum, other] of sides) {
      if (operandSource(maybeEnum) !== 'enum-member') continue;
      if (operandSource(other) === 'projection-read') {
        const read = model['projection-definitions'][other.projection];
        const members = read && enumMembersFor(model, read.valueType);
        if (members && !members.includes(maybeEnum.enumMember)) {
          throw new DomainError(
            `"${maybeEnum.enumMember}" is not a member of ${read.valueType} (condition "${conditionText(condition)}").`
          );
        }
        continue;
      }
      if (operandSource(other) !== 'alias-property') continue;
      const binding = boundary.find((b) => b.alias === other.alias);
      if (!binding) continue;
      // A projection binding has no entity and so no properties to
      // check the member against – its value type is not examined here.
      const entity = binding.entity && model['entity-definitions'][binding.entity];
      if (!entity) continue;
      // A property is a binding, so the type the member is checked
      // against is the bound projection's – the same resolution the
      // rename rewrite walks.
      const { projection } = entityPropertyTarget(model, binding.entity, other.property);
      if (!projection) continue;
      const members = enumMembersFor(model, projection.valueType);
      if (members && !members.includes(maybeEnum.enumMember)) {
        throw new DomainError(
          `"${maybeEnum.enumMember}" is not a member of ${projection.valueType} ` +
          `(condition "${conditionText(condition)}").`
        );
      }
    }
  }

  // Optional-parameter hazards. Neither is a structural fault – the
  // model loads and evaluates – but each is a surprise waiting on the
  // first unset value, and this (an advisory, like every semantic
  // finding) is where it gets said before that value arrives.
  const readsOptionalParameter = (operand) =>
    operandSource(operand) === 'parameter'
    && (body.properties || []).some(
      (p) => p.name === operand.parameterName && p.isOptional && !p.isList
    );
  for (const emission of body.publishes || []) {
    if (!emission) continue;
    const event = model['event-definitions'][emission.name];
    if (!event) continue;
    for (const property of event.properties || []) {
      if (property.isOptional) continue;
      const operand = (emission.parameters || {})[property.name];
      if (operand !== undefined && readsOptionalParameter(operand)) {
        throw new DomainError(
          `"${emission.name}.${property.name}" is required, but takes its value from optional ` +
          `parameter "${operand.parameterName}" – when that is unset, this publishes null into ` +
          `a property every reader may assume present. Mark the event property optional too, ` +
          `or make the parameter required.`
        );
      }
    }
  }
  // What an emission writes into a field has to be what the event
  // declares there. Nothing converts on the way: an emission copies the
  // value it reads, so a `CartLine[]` mapped into an `Item[]` field
  // publishes cart lines under the item type's name, and every reader of
  // the event folds a shape it was never told about. Operands whose type
  // cannot be worked out (literals, dangling references) are left alone.
  for (const emission of body.publishes || []) {
    if (!emission) continue;
    const event = model['event-definitions'][emission.name];
    if (!event) continue;
    for (const property of event.properties || []) {
      const operand = (emission.parameters || {})[property.name];
      if (operand === undefined) continue;
      const resolved = resolveOperandType(operand, {
        boundary, commandProperties: body.properties || [], model,
      });
      if (!resolved) continue;
      if (resolved.propertyType !== property.propertyType || resolved.isList !== !!property.isList) {
        throw new DomainError(
          `"${emission.name}.${property.name}" is declared ` +
          `${property.propertyType}${property.isList ? '[]' : ''}, but takes its value from ` +
          `"${operandText(operand)}", which is ${resolved.propertyType}${resolved.isList ? '[]' : ''}.`
        );
      }
    }
  }
  // Entity-binding arguments are deliberately exempt: they reach a
  // script as ordinary values, and null is one. An identifier, an
  // exclusion or a projection read's tag becomes a tag, and null has no
  // tag – evaluation errors when it is unset, and this says so first.
  for (const binding of boundary) {
    const feeds = [];
    // An identifier already declared "may be absent" is the covered
    // case – the flag is the fix this advisory would otherwise ask for.
    if (binding.id !== undefined && !binding.isOptional && readsOptionalParameter(binding.id)) {
      feeds.push(['its identifier', binding.id, true]);
    }
    if (binding.excluding !== undefined && readsOptionalParameter(binding.excluding)) {
      feeds.push(['its exclusion', binding.excluding, false]);
    }
    if (binding.projection !== undefined) {
      for (const [name, operand] of readTagEntries(binding)) {
        if (readsOptionalParameter(operand)) feeds.push([`its "${name}" tag`, operand, false]);
      }
    }
    if (feeds.length) {
      const [what, operand, flaggable] = feeds[0];
      throw new DomainError(
        `Boundary binding "${binding.alias}" takes ${what} from optional parameter ` +
        `"${operand.parameterName}" – evaluation errors when it is unset. ` +
        (flaggable
          ? `Make the parameter required, mark the binding "may be absent", or take the boundary off it.`
          : `Make the parameter required, or take the boundary off it.`)
      );
    }
  }

  // The same hazard through a binding marked "may be absent". Absent,
  // it binds nothing, and a rule over it holds vacuously – but a value
  // read off it is null, and a read tagged by that null has no tag to
  // read by: an evaluation error, not a vacuous truth (AGENTS.md, on
  // null). The flag reads as "this is handled", so it is said here.
  const mayBeAbsent = new Set(boundary.filter((b) => b && b.isOptional && b.alias).map((b) => b.alias));
  if (mayBeAbsent.size) {
    let found = null;
    forEachCommandOperand(body, (operand, meta) => {
      if (found || !meta.tag) return;
      const alias = operandAliases(operand).find((a) => mayBeAbsent.has(a));
      if (alias) found = { alias, where: meta.where };
    });
    if (found) {
      throw new DomainError(
        `The read at ${found.where} is tagged by "${found.alias}", a binding that may be absent – `
        + `when it binds nothing, that tag is null and evaluation errors. Make the binding required, `
        + `or tag the read by a value that is always set.`
      );
    }
  }

  // The derived cousin of the same hazard: an identifier read off
  // another binding's projected property can be unset too – a
  // projection that starts at null reads null until something sets it,
  // and an unflagged binding then errors on exactly the first
  // interesting case (nothing assigned yet). Statically knowable only
  // from the initial value; a scripted projection keeps its own
  // counsel and is left alone.
  for (const binding of boundary) {
    if (binding.projection !== undefined || binding.isOptional) continue;
    if (binding.id === undefined || operandSource(binding.id) !== 'alias-property') continue;
    if (isFannedOut(model, body, binding)) continue;
    const source = boundary.find((b) => b && b.alias === binding.id.alias);
    if (!source) continue;
    const projection = source.projection !== undefined
      ? model['projection-definitions'][source.projection]
      : (binding.id.property && source.entity && model['entity-definitions'][source.entity]
        ? entityPropertyTarget(model, source.entity, binding.id.property).projection
        : null);
    if (!projection || scriptOf(projection)) continue;
    if (projection.initialValue === null) {
      throw new DomainError(
        `Boundary binding "${binding.alias}" takes its identifier from ${operandText(binding.id)}, ` +
        `which starts at null – evaluation errors until something sets it. ` +
        `Mark the binding "may be absent" to bind nothing instead, and conditions over it will ` +
        `hold vacuously.`
      );
    }
  }

  if (!body.publishes || body.publishes.length === 0) {
    throw new DomainError('A command must publish at least one event.');
  }

  const issues = coverageIssues(model, body);
  if (issues.length > 0) {
    const first = issues[0];
    // Two different failures wear the same name. Either the emission
    // gives the tag field no value at all – in which case there is no
    // instance to talk about yet – or it gives one the boundary never
    // consulted. Saying "writes the tag Course:null" for the first is
    // an answer to a question nobody asked.
    throw new DomainError(
      first.operand === undefined
        ? `"${first.event}.${first.property}" is a ${first.entity} tag, and this command gives ` +
          `it no value. Say where it comes from.`
        : `"${first.event}.${first.property}" writes the tag ` +
          `${first.entity}:${operandText(first.operand)} from a value this command derived, ` +
          `without reading that ${first.entity} – so nothing checked that the value ` +
          `still holds. Reading it would put it in the boundary. (A tag taken straight from a ` +
          `command property is asserted by the caller and needs no read.)`
    );
  }
}

// ============================================================
// Scenarios.
//
// One command, exercised. `given` is a log written by hand rather than
// driven – events with their payloads and the instant each was
// recorded; `when` is the command and the arguments it is called with;
// `then` is what the current definitions make of that, frozen at the
// moment it was accepted.
//
// The freezing is the whole mechanism. `then` is *derived* – nothing
// here asks a modeler to predict it – but it is stored, so the next
// evaluation either agrees with it or does not, and a disagreement is
// the report that some edit changed this command's behaviour.
//
// `outcome` is a discriminator rather than a union, so publishing an
// alternative event on refusal later is a change to what a `rejected`
// outcome carries rather than a change to the shape every stored
// scenario was written in.
//
// What is deliberately *not* checked here is the value in a payload
// against the type it is declared with: a `CourseId` with a pattern is
// stored as whatever was typed. Structure is checked – every property
// present, no property invented, a list where a list is declared – and
// the rest is the evaluator's to discover.
// ============================================================

// Checks a stored payload against the properties it is written from.
// Both directions matter: a missing one cannot be evaluated, and an
// invented one is a reference nothing would ever rewrite. An optional
// property may simply not be there – that is what optional means, in a
// Given as much as in a When. Shared by both scenario kinds, so the
// two never disagree about what a payload owes.
function checkScenarioPayload(values, properties, label) {
  const held = values || {};
  const declared = new Set();
  for (const property of properties || []) {
    declared.add(property.name);
    if (!(property.name in held)) {
      if (property.isOptional) continue;
      throw new DomainError(`${label} carries no value for "${property.name}".`);
    }
    if (property.isList && !Array.isArray(held[property.name])) {
      throw new DomainError(`${label} declares "${property.name}" as a list, so its value must be one.`);
    }
  }
  for (const name of Object.keys(held)) {
    if (!declared.has(name)) {
      throw new DomainError(`${label} carries "${name}", which is not one of its properties.`);
    }
  }
}

function validateScenarioBody(model, body) {
  if (body.name !== undefined && typeof body.name !== 'string') {
    throw new DomainError('A scenario name is text, or absent when the derived one will do.');
  }
  if (!body.command) throw new DomainError('A scenario has to name the command it exercises.');
  const command = model['command-definitions'][body.command];

  if (!Array.isArray(body.given)) {
    throw new DomainError('A scenario\'s Given is a list of events, empty when nothing has happened yet.');
  }
  body.given.forEach((step, index) => {
    const where = `Given step ${index + 1}`;
    if (!step || !step.event) throw new DomainError(`${where} names no event.`);
    checkScenarioPayload(step.data, (model['event-definitions'][step.event] || {}).properties,
      `${where} ("${step.event}")`);
  });

  const when = body.when || {};
  checkScenarioPayload(when.arguments, (command || {}).properties, `The When ("${body.command}")`);

  const then = body.then;
  if (!then || (then.outcome !== 'published' && then.outcome !== 'rejected')) {
    throw new DomainError('A scenario\'s Then is either published or rejected.');
  }
  if (!Array.isArray(then.events)) {
    throw new DomainError('A scenario\'s Then holds the events it expects, empty when it expects none.');
  }
  then.events.forEach((event, index) => {
    if (!event || !event.type) throw new DomainError(`Expected event ${index + 1} names no type.`);
    checkScenarioPayload(event.data, (model['event-definitions'][event.type] || {}).properties,
      `Expected event ${index + 1} ("${event.type}")`);
  });
  if (then.outcome === 'rejected' && typeof then.rejection !== 'string') {
    throw new DomainError('A scenario that expects a refusal has to say which message it was refused with.');
  }
}

// One entity instance, exercised by replay rather than by a command:
// `given` is the same shape a scenario's is, but there is no `when` to
// call and no boundary to infer an instance from, so `forInstance`
// names it outright. `then` is *derived*, exactly like a scenario's,
// but partial – only the properties a modeler chose to check appear,
// each frozen at the moment it was accepted.
function validateProjectionScenarioBody(model, body) {
  if (body.name !== undefined && typeof body.name !== 'string') {
    throw new DomainError('A projection scenario name is text, or absent when the derived one will do.');
  }

  if (!Array.isArray(body.given)) {
    throw new DomainError('A projection scenario\'s Given is a list of events, empty when nothing has happened yet.');
  }
  body.given.forEach((step, index) => {
    const where = `Given step ${index + 1}`;
    if (!step || !step.event) throw new DomainError(`${where} names no event.`);
    checkScenarioPayload(step.data, (model['event-definitions'][step.event] || {}).properties,
      `${where} ("${step.event}")`);
  });

  const projection = model['projection-definitions'][body.projection];
  if (!projection) {
    throw new DomainError(
      `This scenario is about projection "${body.projection}", which this model does not define.`
    );
  }
  // It reads the projection the way a command does: one value for each
  // tag it declares – literals here, each stating its type,
  // `CourseId("c1")` – and with the arguments it takes, required
  // there and rejected anywhere else: an argument that means nothing is
  // a mistake, not a no-op.
  if (body.tags !== undefined && (body.tags === null || typeof body.tags !== 'object' || Array.isArray(body.tags))) {
    throw new DomainError('A projection scenario\'s tags are named – one value per tag the projection declares.');
  }
  const held = body.tags || {};
  const declared = projectionTagParams(projection);
  for (const tag of declared) {
    const value = held[tag.name];
    if (value === undefined) {
      throw new DomainError(`This scenario gives no value for ${body.projection}'s "${tag.name}" tag (${tag.tagType}).`);
    }
    if (operandSource(value) !== 'tag-literal' || operandIncomplete(value)) {
      throw new DomainError(
        `This scenario is tagged ${operandText(value)}, which is not a tag literal – write it with its ` +
        `type, ${tag.tagType}("…").`
      );
    }
    if (value.tagType !== tag.tagType) {
      throw new DomainError(
        `This scenario is tagged ${operandText(value)}, but ${body.projection}'s "${tag.name}" tag is ` +
        `${typeArticle(tag.tagType)} ${tag.tagType}.`
      );
    }
    if (value.tagValue === null || value.tagValue === undefined) {
      throw new DomainError(`This scenario is tagged ${value.tagType} with no value – a tag has one.`);
    }
  }
  for (const key of Object.keys(held)) {
    if (!declared.some((tag) => tag.name === key)) {
      throw new DomainError(`This scenario gives "${key}", which is not one of ${body.projection}'s tags.`);
    }
  }
  const expected = projectionSlots(projection);
  const supplied = Object.keys(body.arguments || {});
  for (const parameter of expected) {
    if (!supplied.includes(parameter.name)) {
      throw new DomainError(
        `This scenario supplies no "${parameter.name}", which "${body.projection}" takes as an argument.`
      );
    }
  }
  for (const key of supplied) {
    if (!expected.some((p) => p.name === key)) {
      throw new DomainError(
        `This scenario supplies "${key}", which "${body.projection}" does not take as an argument.`
      );
    }
  }
  // `then` is the projection's own value, so every shape one can hold
  // is legal here – `null` and `[]` included. There is nothing left to
  // check that the fold itself does not.
  if (!('then' in body)) {
    throw new DomainError('A projection scenario\'s Then is what the projection folded to.');
  }
}

// The structural gate – the one refusal left on the write path. A
// body that is not an object, or whose container fields are not the
// lists they claim to be, is not a defective definition but no
// definition at all: storing it would crash the projection and the
// renderer rather than merely mislead them. Everything semantic –
// what the containers *say* – is an advisory now, never a refusal.
const STORABLE_LIST_FIELDS = [
  'properties', 'handlers', 'boundary', 'conditions', 'publishes', 'parameters', 'given',
];

function assertStorableBody(kind, body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new DomainError(`A ${humanize(kind)} body must be an object.`);
  }
  for (const field of STORABLE_LIST_FIELDS) {
    if (body[field] === undefined) continue;
    if (!Array.isArray(body[field])) {
      throw new DomainError(`A ${humanize(kind)}'s "${field}" must be a list.`);
    }
    for (const element of body[field]) {
      if (element !== null && typeof element !== 'object') {
        throw new DomainError(
          `A ${humanize(kind)}'s "${field}" must hold objects – got ${JSON.stringify(element)}.`
        );
      }
    }
  }
  // An event's tags are paths, not objects – the one list of strings.
  if (kind === 'event-definition' && body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== 'string')) {
      throw new DomainError('An event\'s "tags" must be a list of property paths.');
    }
  }
  // A projection's are its declared tags, `{name, tagType}` each.
  if (kind === 'projection-definition' && body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((tag) => tag === null || typeof tag !== 'object')) {
      throw new DomainError('A projection\'s "tags" must be a list of {name, tagType}.');
    }
  }
}

function addDefinition(kind, modelId, name, body) {
  const model = getCtxOrThrow(modelId);
  const trimmed = validateDefinitionKey(kind, name, `${humanize(kind)} name`);
  assertStorableBody(kind, body);
  const coll = model[DEF_COLLECTIONS[kind]];
  if (trimmed in coll) {
    throw new DomainError(`A ${humanize(kind)} named "${trimmed}" already exists in this model.`);
  }
  if (kind === 'entity-definition') {
    // An entity's derived identifier is an ordinary value type, created
    // in the same append so the two never exist without each other –
    // scalar, a plain string, and marked as a tag, which is the
    // ordinary case. Naming it `<name>Id` unless `identifierType`
    // overrides it, and colliding with an existing value type is
    // refused exactly like any other name collision.
    const idTypeName = body.identifierType || (trimmed + 'Id');
    validateDefinitionKey('custom-type-definition', idTypeName, 'Value type name');
    if (model['custom-type-definitions'][idTypeName] !== undefined) {
      throw new DomainError(
        `Entity "${trimmed}" would derive the type "${idTypeName}", but a value type by that name already exists.`
      );
    }
    const idTypeBody = { schema: { type: 'string' }, isTag: true };
    appendEvents([
      { type: 'custom-type-definition-added', data: { 'dcb-model-id': modelId, name: idTypeName, body: idTypeBody } },
      { type: 'entity-definition-added', data: { 'dcb-model-id': modelId, name: trimmed, body } },
    ]);
    return;
  }
  appendEvents([{ type: `${kind}-added`, data: { 'dcb-model-id': modelId, name: trimmed, body } }]);
}

// An update may leave *other* definitions broken – a dropped property
// a command still reads, a reshaped partition under a bound property,
// an `identifierType` pointing at a type nothing created. All of it
// used to be refused here; all of it is representable now, and the
// resulting breakage surfaces as advisories on whichever definitions
// it lands on. The rename functions below remain the way to move a
// name *and* its references in one append.
function validateDefinitionUpdate(model, kind, name, body) {
  const coll = model[DEF_COLLECTIONS[kind]];
  if (!(name in coll)) {
    throw new DomainError(`No ${humanize(kind)} named "${name}" exists in this model.`);
  }
  assertStorableBody(kind, body);
}

function updateDefinition(kind, modelId, name, body) {
  updateDefinitions(modelId, [{ kind, name, body }]);
}

// Several updates as one append: a gesture that touches every command
// in a feature grows the log by one step and writes storage once.
// Each change is validated against the model as it stood before the
// gesture – sound because the callers touch a different definition
// each, so no change needs to see another one applied.
function updateDefinitions(modelId, changes) {
  const model = getCtxOrThrow(modelId);
  // Reads follow the rules, and this is the one place that is true.
  // Pruning here rather than in every caller means one gesture is one
  // append: deleting the last rule about a read deletes the read in the
  // same event, and a rule that brought a read with it stored both at
  // once. It is deliberately not in `addDefinition` – a body arriving
  // whole, from a file or an agent, keeps what it came with until
  // someone edits it, and `modelAdvisories` says so meanwhile.
  for (const change of changes) {
    if (change.kind === 'command-definition' && change.body) {
      pruneUnreferencedBindings(model, change.body);
    }
  }
  for (const { kind, name, body } of changes) validateDefinitionUpdate(model, kind, name, body);
  appendEvents(changes.map(({ kind, name, body }) => (
    { type: `${kind}-updated`, data: { 'dcb-model-id': modelId, name, body } }
  )));
}

// Everything scripted that handles this event, named the way a person
// would say it: "Product.validPrices", "ValidPrices".
//
// Renaming an event or one of its properties rewrites every declared
// operand that names it. It cannot rewrite code – the model does not
// parse the body, and a textual pass over an unparsed language would
// eventually rewrite a comment or a string literal and corrupt someone
// else's work. So the rename goes through and this says what to check.
function scriptedHandlersOf(model, eventName) {
  const out = [];
  const handles = (target) => (target.handlers || []).some((h) => h && h.event === eventName);
  for (const [name, projection] of Object.entries(model['projection-definitions'])) {
    if (!scriptOf(projection) || !handles(projection)) continue;
    // Named the way a person would say it: through the property that
    // binds it where one does, bare where none does.
    const labels = [];
    for (const [entityName, entity] of Object.entries(model['entity-definitions'])) {
      for (const property of entity.properties || []) {
        if (property && property.projection === name) labels.push(`${entityName}.${property.name}`);
      }
    }
    out.push(...(labels.length ? labels : [name]));
  }
  return out;
}

// Renaming an entity while its derived identifier is still tracking
// (`identifierType` absent) moves two names in one append: the entity
// itself, and – since the value type is a real stored definition now –
// its still-default-named `<name>Id` alongside it. Neither is pinned
// explicit afterward, so both keep tracking indefinitely. This is kept
// separate from the ordinary rename path below because it merges two
// referencer sets (whoever names the entity, whoever names its id
// type) into one append, and because an entity with an *explicit*
// `identifierType` needs none of this – that case falls through to the
// ordinary path, which renames only the entity.
function renameEntityDefinition(model, modelId, previousName, trimmed) {
  const entityBody = model['entity-definitions'][previousName];
  const oldIdType = previousName + 'Id';
  const newIdType = trimmed + 'Id';
  if (model['custom-type-definitions'][newIdType] !== undefined) {
    throw new DomainError(
      `Entity "${trimmed}" would derive the type "${newIdType}", but a value type by that name already exists.`
    );
  }

  const events = [
    { type: 'entity-definition-renamed', data: { 'dcb-model-id': modelId, 'previous-name': previousName, name: trimmed } },
    { type: 'custom-type-definition-renamed', data: { 'dcb-model-id': modelId, 'previous-name': oldIdType, name: newIdType } },
  ];
  const touched = new Map();
  const addRewrite = (ref) => {
    const key = `${ref.kind}:${ref.name}`;
    if (touched.has(key)) return;
    let body = rewriteReferences(ref.kind, ref.body, 'entity-definition', previousName, trimmed);
    body = rewriteReferences(ref.kind, body, 'custom-type-definition', oldIdType, newIdType);
    touched.set(key, { kind: ref.kind, name: ref.kind === 'entity-definition' && ref.name === previousName ? trimmed : ref.name, body });
  };
  for (const ref of findReferencers(model, 'entity-definition', previousName)) addRewrite(ref);
  for (const ref of findReferencers(model, 'custom-type-definition', oldIdType)) addRewrite(ref);
  for (const { kind: refKind, name, body } of touched.values()) {
    events.push({ type: `${refKind}-updated`, data: { 'dcb-model-id': modelId, name, body } });
  }
  appendEvents(events);
}

function renameDefinition(kind, modelId, previousName, newName) {
  const model = getCtxOrThrow(modelId);
  if (isIdKeyed(kind)) {
    throw new DomainError(
      `A ${humanize(kind)} is identified by a generated id and its name lives in its body, ` +
      'so renaming one is an ordinary update rather than a rename.'
    );
  }
  const trimmed = validateName(newName, `New ${humanize(kind)} name`);
  const coll = model[DEF_COLLECTIONS[kind]];
  if (!(previousName in coll)) {
    throw new DomainError(`No ${humanize(kind)} named "${previousName}" exists in this model.`);
  }
  if (trimmed === previousName) return;
  if (trimmed in coll) {
    throw new DomainError(`A ${humanize(kind)} named "${trimmed}" already exists in this model.`);
  }

  if (kind === 'entity-definition' && coll[previousName].identifierType === undefined) {
    renameEntityDefinition(model, modelId, previousName, trimmed);
    return;
  }

  const referencers = findReferencers(model, kind, previousName);
  const events = [{
    type: `${kind}-renamed`,
    data: { 'dcb-model-id': modelId, 'previous-name': previousName, name: trimmed },
  }];
  for (const ref of referencers) {
    // A value type can reference itself – a composite field typed with
    // one of its own siblings' names is not self-reference, but an
    // entity's own self-referencing property is. That rewrite lands on
    // the new name, since the rename event is applied first.
    const isSelf = ref.kind === kind && ref.name === previousName;
    let rewritten = rewriteReferences(ref.kind, ref.body, kind, previousName, trimmed);
    // Renaming a value type directly (not via the entity-rename path
    // above): an entity that was tracking it – no explicit
    // `identifierType` – has to pin the new name explicitly now, or it
    // would silently keep recomputing a default that no longer exists.
    if (kind === 'custom-type-definition' && ref.kind === 'entity-definition'
        && ref.body.identifierType === undefined) {
      rewritten = { ...rewritten, identifierType: trimmed };
    }
    events.push({
      type: `${ref.kind}-updated`,
      data: { 'dcb-model-id': modelId, name: isSelf ? trimmed : ref.name, body: rewritten },
    });
  }
  appendEvents(events);
}

// ------------------------------------------------------------
// Member renames.
//
// A definition's *members* – an entity's properties and statuses, an
// event's properties, a command's payload, a composite's fields, a
// projection's parameters – are referenced by name just as definitions
// are, so renaming one has to rewrite those references in the same
// append. Doing it as a plain update would leave every reader of the
// old name dangling – representable now, and reported as advisories,
// but a rename is a rename: the references are the point.
//
// Unlike a definition rename there is no `-renamed` event to emit. A
// member lives inside a body, so the whole thing is a set of
// `<kind>-updated` events – one for the owner, one per referrer.
// ------------------------------------------------------------

// Walks a handler value, stepping through `successor` to whatever it
// wraps, and rewrites in place.
function rewriteHandlerOperand(operand, visit) {
  if (!operand || typeof operand !== 'object') return;
  if (operand.successor !== undefined) return rewriteHandlerOperand(operand.successor, visit);
  visit(operand);
}

// Renames a key of an object while keeping declaration order, which is
// what makes an emission's parameters and a binding's arguments read
// the same after a rename as before it.
function renameKey(object, previousName, newName) {
  if (!object || !(previousName in object)) return object;
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    out[key === previousName ? newName : key] = value;
  }
  return out;
}

// A member kind's list usually sits at the top of its body
// (`properties`, `parameters`); an enum's sits at `schema.enum`, one
// level in. Read and write through a dotted path so `MEMBER_SHAPE` can
// name either uniformly. Named distinctly from the interface's own
// `atPath`/`setAtPath` (which walk an array of keys, not a dotted
// string) – model.js and index.html share one global scope as classic
// scripts, and a same-named `function` declared in either would
// silently win over the other's.
function getAtDottedPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setAtDottedPath(obj, path, value) {
  const keys = path.split('.');
  let target = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (target[keys[i]] == null || typeof target[keys[i]] !== 'object') target[keys[i]] = {};
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = value;
}

// The rewrites each member kind implies, as
// `(model, definitionName, previous, next) => [{kind, name, body}]`.
// An event's tag paths with `rename(property, field)` applied – it
// returns the new `[property, field]` or null to leave a path alone.
// Null when nothing moved, so a rewrite only lands where it changed.
function renameTagPaths(tags, rename) {
  if (!Array.isArray(tags)) return null;
  let moved = false;
  const out = tags.map((path) => {
    if (typeof path !== 'string') return path;
    const [property, field] = path.split('.');
    const renamed = rename(property, field === undefined ? null : field);
    if (!renamed) return path;
    moved = true;
    return renamed[1] === null ? renamed[0] : `${renamed[0]}.${renamed[1]}`;
  });
  return moved ? out : null;
}

const MEMBER_REWRITES = {
  // An entity property is read as `{alias, property}` by any command
  // that binds this entity under that alias – and, when it is the
  // designated lifecycle, by the entity's own `lifecycle`. That one is
  // a local name rather than a reference, so it moves here rather than
  // through `rewriteReferences`; `renameMember` folds this owner
  // rewrite together with the property-list rename.
  'entity-definition:property': (model, entityName, previous, next) => {
    const out = rewriteCommands(model, (command) => {
      const aliases = (command.boundary || [])
        .filter((b) => b && b.entity === entityName).map((b) => b.alias);
      let touched = false;
      forEachCommandOperand(command, (operand) => {
        if (operandSource(operand) === 'alias-property'
            && aliases.includes(operand.alias) && operand.property === previous) {
          operand.property = next;
          touched = true;
        }
      });
      return touched;
    });
    const entity = model['entity-definitions'][entityName];
    if (entity && entity.lifecycle === previous) {
      out.push({
        kind: 'entity-definition',
        name: entityName,
        body: { ...deepClone(entity), lifecycle: next },
      });
    }
    return out;
  },

  // An enum member is an `{enumMember}` operand. The type it belongs to
  // may be held by any number of projections, so this reaches every one
  // of them rather than one private owner.
  'custom-type-definition:member': (model, typeName, previous, next) => {
    const out = [];

    // Every projection typed with this enum refers to its members
    // through its initial value – scalar or an element of a list – and
    // its handler values.
    for (const [name, projection] of Object.entries(model['projection-definitions'])) {
      if (projection.valueType !== typeName) continue;
      const body = deepClone(projection);
      let touched = false;
      const renamed = (value) => {
        if (operandSource(value) === 'enum-member' && value.enumMember === previous) {
          touched = true;
          return { enumMember: next };
        }
        return value;
      };
      body.initialValue = Array.isArray(body.initialValue)
        ? body.initialValue.map(renamed)
        : renamed(body.initialValue);
      for (const handler of body.handlers || []) {
        rewriteHandlerOperand(handler && handler.value, (operand) => {
          if (operand.enumMember === previous) { operand.enumMember = next; touched = true; }
        });
      }
      if (touched) out.push({ kind: 'projection-definition', name, body });
    }

    // A derived predicate compares a projection's value against a
    // member the same way a condition does – resolved through the
    // operand it sits opposite.
    for (const [name, projection] of Object.entries(model['projection-definitions'])) {
      if (!derivedOf(projection)) continue;
      const body = deepClone(projection);
      let touched = false;
      const sides = [
        [body.derived.leftHandSide, body.derived.rightHandSide],
        [body.derived.rightHandSide, body.derived.leftHandSide],
      ];
      for (const [maybeEnum, other] of sides) {
        if (operandSource(maybeEnum) !== 'enum-member' || maybeEnum.enumMember !== previous) continue;
        if (operandSource(other) !== 'projection-read') continue;
        const target = model['projection-definitions'][other.projection];
        if (!target || target.valueType !== typeName) continue;
        maybeEnum.enumMember = next;
        touched = true;
      }
      if (touched) out.push({ kind: 'projection-definition', name, body });
    }

    // A command condition compares an entity's enum-typed property
    // against a member by value – resolved through the boundary rather
    // than assumed, since the bound entity is whichever the alias names.
    // An emission guard is the same comparison in the same scope.
    out.push(...rewriteCommands(model, (command) => {
      let touched = false;
      const guarded = [
        ...(command.conditions || []),
        ...(command.publishes || []).flatMap((e) => (e && e.when) || []),
      ];
      for (const condition of guarded) {
        if (!condition) continue;
        // In an `equalsAny` list every entry sits opposite the left-hand
        // side; the entry objects are mutated in place like any operand.
        const sides = Array.isArray(condition.rightHandSide)
          ? condition.rightHandSide.map((entry) => [entry, condition.leftHandSide])
          : [
            [condition.leftHandSide, condition.rightHandSide],
            [condition.rightHandSide, condition.leftHandSide],
          ];
        for (const [maybeEnum, other] of sides) {
          if (operandSource(maybeEnum) !== 'enum-member' || maybeEnum.enumMember !== previous) continue;
          if (operandSource(other) !== 'alias-property' && operandSource(other) !== 'projection-read') continue;
          const resolved = resolveOperandType(other, {
            boundary: command.boundary || [],
            commandProperties: command.properties || [],
            model,
          });
          if (!resolved || resolved.propertyType !== typeName) continue;
          maybeEnum.enumMember = next;
          touched = true;
        }
      }
      return touched;
    }));

    return out;
  },

  // An event property is read by whatever handles the event, and written
  // by whatever emits it.
  'event-definition:property': (model, eventName, previous, next) => {
    const out = [];
    const handlesIt = (handlers) => (handlers || []).some((h) => h && h.event === eventName);

    // Handlers live only on projections now – an entity property is a
    // binding with nothing inside it for this rename to reach.
    for (const [name, projection] of Object.entries(model['projection-definitions'])) {
      if (!handlesIt(projection.handlers)) continue;
      const body = deepClone(projection);
      let touched = false;
      for (const handler of body.handlers || []) {
        if (!handler || handler.event !== eventName) continue;
        rewriteHandlerOperand(handler.value, (operand) => {
          if (operand.eventProperty === previous) { operand.eventProperty = next; touched = true; }
        });
      }
      if (touched) out.push({ kind: 'projection-definition', name, body });
    }

    // An emission binds by *key*, so this is a key rename rather than
    // an operand rewrite.
    out.push(...rewriteCommands(model, (command) => {
      let touched = false;
      for (const emission of command.publishes || []) {
        if (!emission || emission.name !== eventName) continue;
        if (emission.parameters && previous in emission.parameters) {
          emission.parameters = renameKey(emission.parameters, previous, next);
          touched = true;
        }
      }
      return touched;
    }));

    // A scenario holds this event's payload by key, in its Given and in
    // the outcome it expects.
    out.push(...rewriteScenarios(model, (scenario) => {
      let touched = false;
      for (const payload of scenarioPayloads(model, scenario)) {
        if (payload.event !== eventName) continue;
        if (payload.owner[payload.key] && previous in payload.owner[payload.key]) {
          payload.owner[payload.key] = renameKey(payload.owner[payload.key], previous, next);
          touched = true;
        }
      }
      return touched;
    }));

    // The event's own tags name the property by path – a local name,
    // so it moves on the owner, the way an entity's `lifecycle` does.
    const event = model['event-definitions'][eventName];
    const retagged = renameTagPaths(event && event.tags, (property, field) =>
      (property === previous ? [next, field] : null));
    if (retagged) out.push({ kind: 'event-definition', name: eventName, body: { ...deepClone(event), tags: retagged } });
    return out;
  },

  // A command's payload is local to it – except that every scenario
  // exercising it supplies that payload by key.
  'command-definition:property': (model, commandName, previous, next) => [
    ...rewriteCommands(model, (command, name) => {
      if (name !== commandName) return false;
      let touched = false;
      forEachCommandOperand(command, (operand) => {
        if (operandSource(operand) === 'parameter' && operand.parameterName === previous) {
          operand.parameterName = next;
          touched = true;
        }
      });
      return touched;
    }),
    ...rewriteScenarios(model, (scenario) => {
      if (scenario.command !== commandName) return false;
      const when = scenario.when;
      if (!when || !when.arguments || !(previous in when.arguments)) return false;
      when.arguments = renameKey(when.arguments, previous, next);
      return true;
    }),
  ],

  // A composite's field is reached only through a parameter typed with
  // that composite – `{parameterName: items, property: productId}`.
  'custom-type-definition:field': (model, typeName, previous, next) => [
    // An event lists a record's tag field by path, `items.productId`.
    ...Object.entries(model['event-definitions']).flatMap(([name, event]) => {
      const typed = new Set((event.properties || [])
        .filter((p) => p && p.propertyType === typeName).map((p) => p.name));
      const retagged = renameTagPaths(event.tags, (property, field) =>
        (typed.has(property) && field === previous ? [property, next] : null));
      return retagged ? [{ kind: 'event-definition', name, body: { ...deepClone(event), tags: retagged } }] : [];
    }),
    ...rewriteCommands(model, (command) => {
      const parameters = new Set((command.properties || [])
        .filter((p) => p.propertyType === typeName).map((p) => p.name));
      let touched = false;
      forEachCommandOperand(command, (operand) => {
        if (operandSource(operand) === 'parameter'
            && parameters.has(operand.parameterName) && operand.property === previous) {
          operand.property = next;
          touched = true;
        }
      });
      return touched;
    }),
    // A scenario holds composites as values, so the field name is a key
    // inside the payload rather than a reference beside it – one level
    // deeper than anywhere else this rename reaches.
    ...rewriteScenarios(model, (scenario) => {
      let touched = false;
      for (const payload of scenarioPayloads(model, scenario)) {
        const held = payload.owner[payload.key] || {};
        for (const property of payload.properties || []) {
          if (property.propertyType !== typeName) continue;
          const value = held[property.name];
          const elements = property.isList ? (Array.isArray(value) ? value : []) : [value];
          elements.forEach((element, index) => {
            if (!element || typeof element !== 'object' || !(previous in element)) return;
            const renamed = renameKey(element, previous, next);
            if (property.isList) value[index] = renamed;
            else held[property.name] = renamed;
            touched = true;
          });
        }
      }
      return touched;
    }),
  ],

  // A read gives a projection's tags by name, so renaming one moves that
  // key in every read of it – an alias's, one in place, a derived
  // operand's, a projection scenario's – and, on a derived projection,
  // in its own operands wherever they pass the tag on (`{parameterName}`).
  // What a script reads as `tags.<name>` is code, and stays as written.
  // A projection's parameter is read by name everywhere it is given –
  // a read's `tags` or `arguments`, a projection scenario's, a derived
  // operand's – and named by its own derived predicate
  // (`{parameterName}`). Tags and arguments move the same way, each in
  // its own map.
  'projection-definition:tag': (model, projectionName, previous, next) =>
    renameProjectionParameter(model, projectionName, 'tags', previous, next),
  'projection-definition:argument': (model, projectionName, previous, next) =>
    renameProjectionParameter(model, projectionName, 'arguments', previous, next),
};

// Every `{parameterName}` a derived predicate names one of its owner's
// parameters by: a side, an operand's tag, an operand's argument.
function forEachOwnParameterRef(derived, visit) {
  for (const operand of derivedOperands(derived)) {
    if (operandSource(operand) === 'parameter') visit(operand);
    if (operandSource(operand) !== 'projection-read') continue;
    for (const value of [...readTagOperands(operand), ...Object.values(operand.arguments || {})]) {
      if (operandSource(value) === 'parameter') visit(value);
    }
  }
}

// Every read of `projectionName`, wherever one is stored, as
// `{kind, name, body, read}` over a deep copy – the commands' bindings
// and inline reads, the derived operands, the projection scenarios –
// and the projections deriving from anything (`owners`), so a caller
// can also rewrite a derived projection's own references. `mutate`
// returns whether it changed the read; the changed bodies come back
// once each, as rewrites.
function rewriteProjectionReads(model, projectionName, mutate, mutateOwner = () => false) {
  const changes = (read, kind) => !!read && read.projection === projectionName && mutate(read, kind);
  const out = rewriteCommands(model, (command) => {
    let touched = false;
    for (const binding of command.boundary || []) if (binding && changes(binding, 'command')) touched = true;
    forEachCommandOperand(command, (operand) => {
      if (operandSource(operand) === 'projection-read' && changes(operand, 'command')) touched = true;
    });
    return touched;
  });
  for (const [name, projection] of Object.entries(model['projection-definitions'])) {
    if (!projection || !projection.derived) continue;
    const body = deepClone(projection);
    let touched = false;
    for (const operand of derivedOperands(body.derived)) {
      if (operandSource(operand) === 'projection-read' && changes(operand, 'derived')) touched = true;
    }
    if (name === projectionName && mutateOwner(body)) touched = true;
    if (touched) out.push({ kind: 'projection-definition', name, body });
  }
  for (const [key, scenario] of Object.entries(model['projection-scenario-definitions'] || {})) {
    const body = deepClone(scenario);
    if (changes(body, 'scenario')) out.push({ kind: 'projection-scenario-definition', name: key, body });
  }
  return out;
}

function renameProjectionParameter(model, projectionName, map, previous, next) {
  return rewriteProjectionReads(model, projectionName, (read) => {
    if (!read[map] || typeof read[map] !== 'object' || !(previous in read[map])) return false;
    read[map] = renameKey(read[map], previous, next);
    return true;
  }, (body) => {
    let touched = false;
    forEachOwnParameterRef(body.derived, (ref) => {
      if (ref.parameterName === previous) { ref.parameterName = next; touched = true; }
    });
    return touched;
  });
}

// Applies `mutate` to a deep copy of every scenario and returns the ones
// it actually changed.
//
// A scenario stores *values* where a definition stores references, so
// what a member rename moves here is the keys of a payload rather than
// an operand. Renaming an event's property has to move that key in
// every Given step written from it and in every expected event holding
// it, or the scenario would report the rename as a change in behaviour.
function rewriteScenarios(model, mutate) {
  const out = [];
  for (const [name, scenario] of Object.entries(model['scenario-definitions'] || {})) {
    const body = deepClone(scenario);
    if (mutate(body, name)) out.push({ kind: 'scenario-definition', name, body });
  }
  return out;
}

// Every payload a scenario holds, paired with the definition its keys
// are written from. One walk serves both the event-property rename and
// the composite-field rename, which reach the same objects by different
// routes.
function scenarioPayloads(model, scenario) {
  const out = [];
  for (const step of scenario.given || []) {
    if (!step || !step.event) continue;
    const event = model['event-definitions'][step.event];
    if (event) out.push({ owner: step, key: 'data', event: step.event, properties: event.properties });
  }
  for (const event of (scenario.then || {}).events || []) {
    if (!event || !event.type) continue;
    const definition = model['event-definitions'][event.type];
    if (definition) {
      out.push({ owner: event, key: 'data', event: event.type, properties: definition.properties });
    }
  }
  const command = model['command-definitions'][scenario.command];
  if (command && scenario.when) {
    out.push({ owner: scenario.when, key: 'arguments', command: scenario.command,
      properties: command.properties });
  }
  return out;
}

// Applies `mutate` to a deep copy of every command and returns the ones
// it actually changed.
function rewriteCommands(model, mutate) {
  const out = [];
  for (const [name, command] of Object.entries(model['command-definitions'])) {
    const body = deepClone(command);
    if (mutate(body, name)) out.push({ kind: 'command-definition', name, body });
  }
  return out;
}

// Where a member of each kind lives inside its body. `list` is a
// dotted path – flat for most kinds, but an enum's members sit at
// `schema.enum`, one level into the custom type's JSON Schema.
const MEMBER_SHAPE = {
  property: { list: 'properties', named: true, label: 'Property' },
  member: { list: 'schema.enum', named: false, label: 'Member' },
  field: { list: 'properties', named: true, label: 'Field' },
  tag: { list: 'tags', named: true, label: 'Tag' },
  argument: { list: 'arguments', named: true, label: 'Argument' },
};

function renameMember(kind, modelId, definitionName, memberKind, previousName, newName) {
  const model = getCtxOrThrow(modelId);
  const body = (model[DEF_COLLECTIONS[kind]] || {})[definitionName];
  if (!body) {
    throw new DomainError(`No ${humanize(kind)} named "${definitionName}" exists in this model.`);
  }
  const shape = MEMBER_SHAPE[memberKind];
  const rewrite = MEMBER_REWRITES[`${kind}:${memberKind}`];
  if (!shape || !rewrite) {
    throw new DomainError(`A ${humanize(kind)} has no ${memberKind} to rename.`);
  }

  // Only emptiness refuses – an unidiomatic member name renames fine,
  // and the idiom is the advisories' to point out, not this gesture's
  // to refuse.
  const trimmed = (newName || '').trim();
  if (!trimmed) {
    throw new DomainError(`${shape.label} name must not be empty.`);
  }
  if (trimmed === previousName) return;

  const members = getAtDottedPath(body, shape.list) || [];
  const nameOf = (m) => (shape.named ? m && m.name : m);
  if (!members.some((m) => nameOf(m) === previousName)) {
    throw new DomainError(
      `${humanize(kind)} "${definitionName}" has no ${memberKind} "${previousName}".`
    );
  }
  if (members.some((m) => nameOf(m) === trimmed)) {
    throw new DomainError(
      `${humanize(kind)} "${definitionName}" already has a ${memberKind} named "${trimmed}".`
    );
  }
  // A projection's tags and arguments are one list to a read.
  if (kind === 'projection-definition' && projectionParameters(body).some((p) => p.name === trimmed)) {
    throw new DomainError(`Projection "${definitionName}" already has a parameter named "${trimmed}".`);
  }

  // A rewrite fixes *references*; the member list itself is renamed
  // here, uniformly, so each rewrite has one job. When a rewrite also
  // lands on the owning definition, its body is the one the list
  // rename is applied to.
  const rewrites = rewrite(model, definitionName, previousName, trimmed);
  const ownerRewrite = rewrites.find((r) => r.kind === kind && r.name === definitionName);
  const ownerBody = deepClone(ownerRewrite ? ownerRewrite.body : body);
  setAtDottedPath(ownerBody, shape.list, (getAtDottedPath(ownerBody, shape.list) || []).map((m) => {
    if (!shape.named) return m === previousName ? trimmed : m;
    return m && m.name === previousName ? { ...m, name: trimmed } : m;
  }));

  const events = [{
    type: `${kind}-updated`,
    data: { 'dcb-model-id': modelId, name: definitionName, body: ownerBody },
  }];
  for (const r of rewrites) {
    if (r.kind === kind && r.name === definitionName) continue;
    events.push({
      type: `${r.kind}-updated`,
      data: { 'dcb-model-id': modelId, name: r.name, body: r.body },
    });
  }
  appendEvents(events);
}

// A parameter's `tag` toggle (10.0): ticked, it is one of the tags the
// projection is read by, and narrows its query; unticked, an argument,
// which narrows nothing. The member moves between the two lists – an
// argument becomes the last tag, a tag the first argument, so the order
// a read gives them in holds – and every read's value moves with it,
// in one append. A literal changes spelling as it moves: a tag states
// its type (`CourseId("c1")`), an argument is the bare value. Ticking a
// value that is no tag type is not refused; the advisory says so.
function setProjectionParameterIsTag(modelId, projectionName, parameterName, isTag) {
  const model = getCtxOrThrow(modelId);
  const projection = model['projection-definitions'][projectionName];
  if (!projection) {
    throw new DomainError(`No projection named "${projectionName}" exists in this model.`);
  }
  const tags = projectionTagParams(projection);
  const slots = projectionSlots(projection);
  const tag = tags.find((t) => t.name === parameterName);
  const slot = slots.find((a) => a.name === parameterName);
  if (!tag && !slot) {
    throw new DomainError(`Projection "${projectionName}" has no parameter "${parameterName}".`);
  }
  if (isTag ? tag : slot) return;

  const type = isTag ? slot.propertyType : tag.tagType;
  const body = deepClone(projection);
  body.tags = isTag ? [...tags, { name: parameterName, tagType: type }] : tags.filter((t) => t !== tag);
  const nextSlots = isTag ? slots.filter((a) => a !== slot) : [{ name: parameterName, propertyType: type }, ...slots];
  if (nextSlots.length) body.arguments = nextSlots;
  else delete body.arguments;

  const [from, to] = isTag ? ['arguments', 'tags'] : ['tags', 'arguments'];
  const respelled = (value, kind) => {
    if (isTag) {
      const literal = kind === 'scenario' || operandSource(value) === 'static';
      return literal ? { tagType: type, tagValue: value } : value;
    }
    return operandSource(value) === 'tag-literal' ? value.tagValue : value;
  };
  const rewrites = rewriteProjectionReads(model, projectionName, (read, kind) => {
    const held = read[from];
    if (!held || typeof held !== 'object' || !(parameterName in held)) return false;
    const { [parameterName]: value, ...rest } = held;
    read[from] = rest;
    read[to] = { ...(read[to] && typeof read[to] === 'object' ? read[to] : {}), [parameterName]: respelled(value, kind) };
    if (from === 'arguments' && !Object.keys(rest).length) delete read.arguments;
    return true;
  });
  const own = rewrites.find((r) => r.kind === 'projection-definition' && r.name === projectionName);
  const ownerBody = own ? { ...own.body, tags: body.tags } : body;
  if (own) {
    if (body.arguments) ownerBody.arguments = body.arguments;
    else delete ownerBody.arguments;
  }
  const events = [{
    type: 'projection-definition-updated',
    data: { 'dcb-model-id': modelId, name: projectionName, body: ownerBody },
  }];
  for (const r of rewrites) {
    if (r === own) continue;
    events.push({ type: `${r.kind}-updated`, data: { 'dcb-model-id': modelId, name: r.name, body: r.body } });
  }
  appendEvents(events);
}

function removeDefinition(kind, modelId, name) {
  const model = getCtxOrThrow(modelId);
  const coll = model[DEF_COLLECTIONS[kind]];
  if (!(name in coll)) {
    throw new DomainError(`No ${humanize(kind)} named "${name}" exists in this model.`);
  }
  // Whatever still references this definition is left dangling and
  // says so – the rule scenarios always lived by ("a test exists to
  // report what a change broke, not to prevent it") now applied to
  // every kind: the dangling reference surfaces as an advisory on the
  // definition holding it, not as a refusal here.
  if (kind === 'entity-definition') {
    // The entity's own derived custom type is removed alongside it –
    // auto-created together, they go together. Anything else still
    // naming either is left broken, reported the same way this system
    // already reports every other broken reference: a scenario left
    // saying what it used to check, a definition carrying an advisory.
    const idType = idTypeOf(model, name);
    appendEvents([
      { type: 'entity-definition-removed', data: { 'dcb-model-id': modelId, name } },
      { type: 'custom-type-definition-removed', data: { 'dcb-model-id': modelId, name: idType } },
    ]);
    return;
  }
  appendEvents([{ type: `${kind}-removed`, data: { 'dcb-model-id': modelId, name } }]);
}

// Changes the order this collection's members are stored in – the order
// every listing reads directly off the collection, since nothing here
// keeps a separate position field. `order` has to name every current
// member exactly once; it says nothing about *which* moved, so the fold
// just replays the collection in that order.
function reorderDefinitions(kind, modelId, order) {
  const model = getCtxOrThrow(modelId);
  const coll = model[DEF_COLLECTIONS[kind]];
  const current = Object.keys(coll);
  const sameMembers = order.length === current.length && current.every((key) => order.includes(key));
  if (!sameMembers) {
    throw new DomainError(`Reordering ${humanize(kind)}s must name every one of them, exactly once.`);
  }
  appendEvents([{ type: `${kind}-reordered`, data: { 'dcb-model-id': modelId, order } }]);
}

// Two bodies that say the same thing. Stored bodies spell their
// defaults inconsistently – `isList: false` here, absent there, `when:
// []` on one emission and nothing on the next – and a writer that
// compared them literally would rewrite half a model to change one
// rule. So the defaults the schema names are dropped before comparing,
// as are key order and empty containers.
//
// Only on the schema's own keys, though. An operand, and the
// author-keyed maps of them (an emission's `parameters`, a read's
// `tags` and `arguments`), hold values rather than definition – `false`,
// `[]` and a property that happens to be called `isList` are content
// there – so they are compared as written, key order aside; the one
// thing dropped inside them is an empty `tags` or `arguments`, which
// says "none" the same way its absence does. An event's `tags` are a
// set of paths, so their order is not compared either. Data (`schema`, `initialState`,
// `initialValue`) is compared as written too. `rightHandSide`, `derived`
// and `script` keep their empties: `equalsAny []` holds for nothing,
// and an empty `derived` or `script` still decides what kind of
// projection this is.
const DEFAULT_FLAGS = ['isOptional', 'isList', 'negate', 'isTag'];
const DATA_FIELDS = ['schema', 'initialState', 'initialValue'];
const OPERAND_FIELDS = ['leftHandSide', 'rightHandSide', 'id', 'excluding', 'value', 'successor'];
const OPERAND_MAPS = ['parameters', 'arguments', 'tags'];
const KEEPS_EMPTY = ['rightHandSide', 'tagFilter', 'derived', 'script'];

// Keys are set as own properties: a key called `__proto__` is a key.
function normalizedPut(out, key, value) {
  Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true });
}

function isEmptyContainer(value) {
  if (Array.isArray(value)) return !value.length;
  return value !== null && typeof value === 'object' && !Object.keys(value).length;
}

function canonicalData(value) {
  if (Array.isArray(value)) return value.map(canonicalData);
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) normalizedPut(out, key, canonicalData(value[key]));
  return out;
}

function canonicalOperand(value) {
  if (Array.isArray(value)) return value.map(canonicalOperand);
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue;
    if (key === 'arguments' && isEmptyContainer(value[key])) continue;
    if (key === 'tags' && value.projection !== undefined && isEmptyContainer(value[key])) continue;
    normalizedPut(out, key, canonicalOperand(value[key]));
  }
  return out;
}

function normalizedDefinition(value) {
  if (Array.isArray(value)) return value.map(normalizedDefinition);
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const field = value[key];
    if (field === undefined) continue;
    if (DEFAULT_FLAGS.includes(key) && field === false) continue;
    if (key === 'tagSchema' && field === '{type}:{value}') continue;
    if (DATA_FIELDS.includes(key)) { normalizedPut(out, key, canonicalData(field)); continue; }
    if (OPERAND_FIELDS.includes(key)) { normalizedPut(out, key, canonicalOperand(field)); continue; }
    if (isEmptyContainer(field) && !KEEPS_EMPTY.includes(key)) continue;
    if (OPERAND_MAPS.includes(key) && field !== null && typeof field === 'object' && !Array.isArray(field)) {
      normalizedPut(out, key, canonicalOperand(field));
      continue;
    }
    if (key === 'tags' && Array.isArray(field) && field.every((tag) => typeof tag === 'string')) {
      normalizedPut(out, key, [...field].sort());
      continue;
    }
    normalizedPut(out, key, normalizedDefinition(field));
  }
  return out;
}

function sameDefinition(a, b) {
  return JSON.stringify(normalizedDefinition(a)) === JSON.stringify(normalizedDefinition(b));
}

// One collection against another, `{ name: body }` each: what the
// newer side added and changed (in its order), what it removed (in the
// older side's order), what it kept as it was, and whether it orders
// the survivors differently from where the fold would leave them –
// survivors where they were, additions at the end. Sameness is
// `sameDefinition`'s, so a body respelled is unchanged. The one notion
// of "the same definition" both Apply and Compare go by.
function diffCollection(older, newer) {
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const out = { added: [], changed: [], removed: [], unchanged: [], reordered: false };
  const order = Object.keys(older);
  for (const name of order) if (!has(newer, name)) out.removed.push(name);
  for (const [name, body] of Object.entries(newer)) {
    if (!has(older, name)) out.added.push(name);
    else if (sameDefinition(older[name], body)) out.unchanged.push(name);
    else out.changed.push(name);
  }
  const landed = [
    ...order.filter((name) => has(newer, name)),
    ...Object.keys(newer).filter((name) => !has(older, name)),
  ];
  out.reordered = landed.join('\n') !== Object.keys(newer).join('\n');
  return out;
}

// Two models, every stored kind – scenarios included, keyed by id –
// and the name: what reading `newer` against `older` shows. Pure and
// read-only, for models that need not be in the log at all (an earlier
// revision, a file read for comparing). `name` is null when it is the
// same.
function diffDefinitions(older, newer) {
  const kinds = {};
  for (const kind of DEF_KINDS) {
    kinds[kind] = diffCollection((older && older[DEF_COLLECTIONS[kind]]) || {}, (newer && newer[DEF_COLLECTIONS[kind]]) || {});
  }
  const from = (older && older.name) || '';
  const to = (newer && newer.name) || '';
  return { name: from === to ? null : { from, to }, kinds };
}

// Each command's derived boundary on both sides, query item by query
// item and round by round (`boundarySummary`), every item marked
// `same`, `added` or `removed`. An item is its types and tags, sorted –
// the alias or projection that brought it is not part of what is read.
// `lostTags` is the one finding named: an event type the older side
// read by a tag and the newer side reads untagged – the boundary grew
// from one instance to all of them. A body the derivation throws on
// reads as reading nothing; its problem is the advisories' to tell.
function compareBoundaries(older, newer) {
  const commandsOf = (model) => (model && model['command-definitions']) || {};
  const roundsOf = (model, body) => {
    if (!body) return [];
    let summary;
    try { summary = boundarySummary(model, body); } catch { return []; }
    const rounds = summary.queries.length ? summary.queries : (summary.items.length ? [summary.items] : []);
    return rounds.map((round) => {
      const seen = new Map();
      for (const item of round) {
        const types = [...item.types].sort();
        const tags = [...item.tags].sort();
        const key = `${types.join(',')}|${tags.join(',')}`;
        if (!seen.has(key)) seen.set(key, { key, types, tags });
      }
      return [...seen.values()];
    });
  };
  const olderCommands = commandsOf(older);
  const newerCommands = commandsOf(newer);
  const names = [...Object.keys(newerCommands), ...Object.keys(olderCommands).filter((name) => !(name in newerCommands))];
  return names.map((name) => {
    const before = roundsOf(older, olderCommands[name]);
    const after = roundsOf(newer, newerCommands[name]);
    const items = [];
    for (let r = 0; r < Math.max(before.length, after.length); r++) {
      const was = before[r] || [];
      const now = after[r] || [];
      const nowKeys = new Set(now.map((item) => item.key));
      const wasKeys = new Set(was.map((item) => item.key));
      for (const item of was) items.push({ round: r, types: item.types, tags: item.tags, mark: nowKeys.has(item.key) ? 'same' : 'removed' });
      for (const item of now) if (!wasKeys.has(item.key)) items.push({ round: r, types: item.types, tags: item.tags, mark: 'added' });
    }
    const wasItems = before.flat();
    const taggedBefore = new Set(wasItems.filter((item) => item.tags.length).flatMap((item) => item.types));
    const untaggedBefore = new Set(wasItems.filter((item) => !item.tags.length).flatMap((item) => item.types));
    const lostTags = after.flat()
      .filter((item) => !item.tags.length)
      .map((item) => (item.types.length ? item.types : [...taggedBefore].sort())
        .filter((type) => taggedBefore.has(type) && !untaggedBefore.has(type)))
      .filter((types) => types.length);
    const status = !(name in olderCommands) ? 'added'
      : !(name in newerCommands) ? 'removed'
      : items.some((item) => item.mark !== 'same') ? 'changed' : 'same';
    return { name, status, items, lostTags };
  });
}

// The Problems panel on both sides: what the newer side reports that
// the older did not (`introduced`) and the reverse (`fixed`), each
// advisory known by its kind, name and message.
function compareProblems(older, newer) {
  const key = (problem) => `${problem.kind}\n${problem.name}\n${problem.message}`;
  const was = older ? modelAdvisories(older) : [];
  const now = newer ? modelAdvisories(newer) : [];
  const wasKeys = new Set(was.map(key));
  const nowKeys = new Set(now.map(key));
  return {
    introduced: now.filter((problem) => !wasKeys.has(key(problem))),
    fixed: was.filter((problem) => !nowKeys.has(key(problem))),
  };
}

// The whole model at once – every definition kind but the two scenario
// kinds, as ordered `{ name: body }` maps – written as the difference
// from what is stored: an added, updated, removed or reordered event
// for exactly what changed, and all of them in one append, so a
// gesture that rewrote the model from a text is one undo step and one
// that changed nothing appends nothing. A body equal to its stored one
// up to `sameDefinition` keeps the stored spelling.
//
// The code view is the writer this exists for, and it is why this is
// a replacement and not a merge: a definition missing from the text is
// one the author deleted. The scenario kinds are replaced the same way
// when `next.collections` carries them, and left alone when it does not.
//
// Only structure is refused, the same as every other writer (see
// `assertStorableBody`); a body arriving whole keeps every read it came
// with – pruning is the next *edit's* business, as for an import. Names
// are trimmed like everywhere else, and a name the fold could not key
// a collection by (`constructor`, `__proto__`) is refused.
function replaceDefinitions(modelId, next) {
  const model = getCtxOrThrow(modelId);
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const events = [];
  const summary = { added: [], updated: [], removed: [], reordered: [], renamed: null };
  if (next.name !== undefined && next.name !== null) {
    const name = validateModelName(next.name);
    if (name !== model.name) {
      events.push({ type: 'dcb-model-renamed', data: { 'dcb-model-id': modelId, name } });
      summary.renamed = name;
    }
  }
  // The two scenario kinds are written only when asked for – a caller
  // that says nothing about them leaves them as they are.
  const kinds = [...ADVISORY_KINDS, ...ID_KEYED_KINDS.filter((kind) => next.collections[kind] !== undefined)];
  for (const kind of kinds) {
    const current = model[DEF_COLLECTIONS[kind]];
    const wanted = {};
    for (const [key, body] of Object.entries(next.collections[kind] || {})) {
      const name = validateDefinitionKey(kind, key, `${humanize(kind)} name`);
      if (name in Object.prototype) throw new DomainError(`"${name}" cannot name a ${humanize(kind).toLowerCase()}.`);
      if (has(wanted, name)) throw new DomainError(`Two ${humanize(kind).toLowerCase()}s are named "${name}".`);
      assertStorableBody(kind, body);
      wanted[name] = body;
    }
    const diff = diffCollection(current, wanted);
    for (const name of diff.removed) {
      events.push({ type: `${kind}-removed`, data: { 'dcb-model-id': modelId, name } });
      summary.removed.push({ kind, name });
    }
    for (const [name, body] of Object.entries(wanted)) {
      if (diff.added.includes(name)) {
        events.push({ type: `${kind}-added`, data: { 'dcb-model-id': modelId, name, body } });
        summary.added.push({ kind, name });
      } else if (diff.changed.includes(name)) {
        events.push({ type: `${kind}-updated`, data: { 'dcb-model-id': modelId, name, body } });
        summary.updated.push({ kind, name });
      }
    }
    if (diff.reordered) {
      events.push({ type: `${kind}-reordered`, data: { 'dcb-model-id': modelId, order: Object.keys(wanted) } });
      summary.reordered.push({ kind });
    }
  }
  // A caller that may not remove – an agent that did not say it means
  // to – is refused whole, told what the text left out.
  if (next.refuseRemovals && summary.removed.length) {
    const error = new DomainError(`This would remove ${removalWords(summary.removed)}, which the text leaves out `
      + '– nothing was applied.');
    error.removed = summary.removed;
    throw error;
  }
  if (events.length) appendEvents(events);
  return summary;
}

// `event A, command B and 3 scenarios`, for a refusal to say what goes.
function removalWords(removed) {
  const named = removed.filter((item) => !isIdKeyed(item.kind))
    .map((item) => `${item.kind.replace(/-definition$/, '').replace(/-/g, ' ')} ${item.name}`);
  const scenarios = removed.length - named.length;
  const parts = [...named, ...(scenarios ? [`${scenarios} scenario${scenarios === 1 ? '' : 's'}`] : [])];
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}

// ============================================================
// Utilities the model layer leans on.
// ============================================================

// The value a freshly created projection starts from, chosen from its
// type so the editor can pre-fill one – the stored value is always
// explicit, this is only the suggestion.
function defaultInitialValue(model, target) {
  if (target.isList) return [];
  const members = enumMembersFor(model, target.valueType);
  if (members) return { enumMember: members[0] || '' };
  if (literalKindOf(model, target.valueType) === 'number') return 0;
  if (literalKindOf(model, target.valueType) === 'boolean') return false;
  return '';
}

function humanize(kind) {
  return kind.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ');
}

function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

// ============================================================
// Sharing a model with the outside world.
//
// The wire format is `{ $schema, dcbModelVersion, name }` followed by
// the definition arrays themselves – the six kinds, plus
// `projectionScenarioDefinitions?` and `sandbox?` – and it is exactly what
// `dcb-model.schema.json` describes, so a file built by another tool
// against that schema drops straight in.
//
// The arrays sit at the top level rather than under a wrapper. They used
// to be nested, back when the published schema described only that inner
// object and an external tool needed something to target; once the
// schema grew to cover the whole document there was nothing left for the
// nesting to do but make the file claim to contain a model rather than
// be one. Flattening also stops `projectionScenarioDefinitions` reading as
// a second-class kind: it is listed apart from the six only because it
// hangs off an entity rather than being one of them.
//
// Two markers say what a document is, and they are not
// interchangeable. `dcbModelVersion` is the one an importer
// dispatches on. `$schema` is for editors – it is what makes a
// hand-edited export complete and validate in place – and nothing here
// ever reads it, deliberately: repointing it at a local copy to work
// offline is a legitimate thing to do to a document, and a reader that
// checked it would reject exactly the files someone had been careful
// with.
//
// Both ride in both directions out of the playground – readable JSON
// and the gzipped payload of a share link – because a marker one
// channel may omit is a marker `importModelFromEnvelope` could not
// insist on.
//
// `sandbox`, if present, is a list of driven commands: never part of
// the model, exactly the ephemeral thing it already is everywhere
// else in this app, and carried only so that a shared link opens on the
// state its sender was looking at.
// ============================================================

// The version of the wire format above, `major.minor`. A major bump
// means a reader built against an earlier one cannot correctly read the
// document; a minor means it can, because the addition is one it
// ignores – which the validation in this file makes possible by
// checking only what it knows about and never rejecting a key it has
// not heard of (`CommandDefinition.feature` has ridden along that way
// from the start). What counts as additive is judged from the reader's
// side, though, not the schema's: another member of a closed vocabulary
// – a condition operator, an operand shape, a handler operation – is a
// *major* change even where the schema merely grows an enum, because
// `operationsFor` fails on the value rather than passing it through.
// 2.0 unified projections: entity properties became bindings to
// ordinary projection definitions, partitions became explicit
// parameters, `isOptional` was dropped and initial values grew typed
// (possibly non-empty) lists, and property scenarios became projection
// scenarios asserting over a list of reads – every one of them a change
// a 1.x reader would misread rather than ignore.
// 4.0 added `isOptional` on boundary bindings: an unset identifier
// binds nothing instead of erroring, conditions over the alias hold
// vacuously, and reading a property of it yields null. Additive in
// shape – which is exactly the trap the reader-side rule exists for: a
// 3.x reader ignores the flag and errors on the very case the author
// declared expected, so this is a major. The other direction is safe:
// a 3.x document never says it, so this build reads 3.x whole
// (`READABLE_MAJORS`).
// 4.1 lifted a documented restriction rather than adding anything: a
// *scripted* projection's `valueType` may be a composite value type.
// No shape changed, and a 4.0 reader loads and evaluates such a
// document correctly – equality was always deep, a composite was
// always offered identity predicates only, and a scripted fold is
// opaque code either way. The one thing it does wrong is flag the
// projection with the advisory that used to guard the restriction,
// which is exactly the non-blocking miss `envelopeVersionWarning`
// exists to explain.
// 5.0 is the closed-vocabulary kind the reader-side rule names
// outright: `equalsAny` joined the binary predicates – one scalar
// against a literal list, spelled as a bare array of literals and
// enum-member references in `rightHandSide`, the same list spelling
// initial values already had. A 4.x reader fails on the predicate in
// `evApplyPredicate` rather than passing it through, so this is a
// major even though nothing a 4.x document says changed; this build
// reads 3.x and 4.x whole.
// 6.0 added two members at once, each the closed-vocabulary kind: an
// emission may carry `when` (conditions under which it publishes –
// failing a guard skips the emission, never rejects the command), and
// a projection may be derived (`derived` in place of handlers: one
// declared predicate over other projections, always a boolean). A 5.x
// reader would publish what an author made conditional and has no
// fold for a handlerless projection – both misreads, so this is a
// major; this build reads 3.x, 4.x and 5.x whole.
// 6.1 gave an entity an optional `lifecycle`, naming which of its own
// properties is the state it is in – and made the two-state case an
// ordinary `boolean` projection rather than a `NonExistent`/`Existent`
// enum. Judged from the reader's side this is a minor, which is the
// distinction 4.0 is here to sharpen: a 6.0 reader that ignores
// `lifecycle` loses a diagram, and a boolean-typed projection was
// always readable – no condition changed shape, `evaluate.js` did not
// change, and nothing evaluates differently. Contrast 4.0, where the
// ignored flag made the old reader error on exactly the case the flag
// declared expected. So the schema URL stays at v6 and `READABLE_MAJORS`
// is untouched. What a 6.0 reader misses is what the version warning
// exists to say.
// 7.0 gave every rule a rejection message – `rejection` on each of a
// command's conditions, the sentence it is refused with – and made a
// refusal known by it: a scenario's Then carries the message as
// `rejection`, and nothing else about the refusal – not the condition's
// text or index, nor the values it read. Required on both sides, so a 6.x
// reader cannot read a 7.0 document, and this build reads no earlier
// major: a 6.x rule has no message, and inventing one would put words
// in the author's mouth that every scenario then asserts.
// 8.0 made tags explicit: an event lists the values it is tagged by
// (`tags`, property paths), and one without the list carries none; a
// projection names the tags it is read by, and a read gives a value per
// name. A 7.x reader would tag what this document leaves untagged, and
// a 7.x document read here would carry no tag at all – so this build
// reads 8.x only. Nothing is public yet; there is no upgrader.
// 9.0 let a derived projection compute as well as compare: `operator`
// (`add`, `subtract`, `multiply`, `min`, `max`) in place of `predicate`,
// over two numbers, yielding a number. A new member of a closed
// vocabulary – an 8.x reader finds no predicate and errors – so a
// major; every 8.x document is a 9.0 document unchanged, so this build
// reads 8.x whole.
// 10.0 gave every kind of projection arguments – values a read gives
// besides its tags, which narrow nothing – where only a script had
// them: `arguments` moved from `script` onto the projection, and a
// derived projection compares or computes with its own parameters
// (`{parameterName}` as a side, or passed on as an operand's tag or
// argument). A new operand member and a moved field: a 9.x reader would
// find a derived side it cannot read and a script with no arguments.
// A 9.x document reads here whole, its scripts' arguments lifted on
// import (`liftScriptArguments`).
const MODEL_VERSION = '10.0';
const MODEL_SCHEMA_URL = 'https://dcb.events/schemas/model/v10.json';
const READABLE_MAJORS = [8, 9, 10];

const SCHEMA_FIELD = {
  'custom-type-definition': 'customTypeDefinitions',
  'event-definition': 'eventDefinitions',
  'entity-definition': 'entityDefinitions',
  'projection-definition': 'projectionDefinitions',
  'command-definition': 'commandDefinitions',
  'scenario-definition': 'scenarioDefinitions',
  'projection-scenario-definition': 'projectionScenarioDefinitions',
};

// The six kinds that carry a definition each. Projection scenarios are
// the seventh the schema documents; they are assembled separately only
// because they are authored against whatever set of projections someone
// wanted to check at once rather than being one of these.
const SCHEMA_KINDS = [
  'custom-type-definition', 'event-definition', 'entity-definition',
  'projection-definition', 'command-definition', 'scenario-definition',
];

function definitionsToSchemaArray(kind, coll) {
  const idField = isIdKeyed(kind) ? 'id' : 'name';
  return Object.entries(coll || {}).map(([key, body]) => {
    // A projection always says what it is tagged by, if only that it is
    // untagged: a body stored without the list writes the empty one.
    if (kind === 'projection-definition' && body && body.tags === undefined) {
      return { [idField]: key, tags: [], ...body };
    }
    return { [idField]: key, ...body };
  });
}

function schemaArrayToDefinitions(kind, list) {
  const idField = isIdKeyed(kind) ? 'id' : 'name';
  const coll = {};
  for (const item of list || []) {
    const { [idField]: key, ...body } = item;
    coll[key] = body;
  }
  return coll;
}

function definitionsToSchema(model) {
  const out = {};
  for (const kind of SCHEMA_KINDS) {
    out[SCHEMA_FIELD[kind]] = definitionsToSchemaArray(kind, model[DEF_COLLECTIONS[kind]]);
  }
  return out;
}

// ============================================================
// Value schemas.
//
// The values a model's definitions describe – a command's arguments, an
// event's payload – as JSON Schema 2020-12, for whatever has to state
// or check them outside the playground: an API contract, a validator.
// Nothing here enforces anything; the evaluator stays as lenient as it
// is, because a defective model must still run.
//
// A custom scalar type already *is* a JSON Schema (its `schema`), so it
// is carried over whole; a composite is an object of its fields, every
// one required and singular. `refOf(typeName)` says how a property
// names a custom type – a `$ref` into wherever the caller keeps
// `customTypeSchemas`, or, left out, the type's schema inline. An
// unresolved type allows any value; its advisory already says so.
// ============================================================

function customTypeSchema(model, typeName, refOf) {
  const body = model['custom-type-definitions'][typeName];
  if (!body) return {};
  if (Array.isArray(body.properties)) {
    return propertiesSchema(model, body.properties, refOf, { requireAll: true });
  }
  return deepClone(body.schema || {});
}

function customTypeSchemas(model, refOf) {
  const out = {};
  for (const typeName of Object.keys(model['custom-type-definitions'])) {
    out[typeName] = customTypeSchema(model, typeName, refOf);
  }
  return out;
}

function valueTypeSchema(model, typeName, refOf) {
  const cls = classifyType(model, typeName);
  if (cls.kind === 'simple') return { type: typeName };
  if (cls.kind !== 'value') return {};
  return refOf ? refOf(typeName) : customTypeSchema(model, typeName);
}

// One property: its type, a list of it, and `null` when it is optional
// – the one spelling of "no value". An optional list is advised against
// and evaluates as a plain list; it still admits the null it declares.
function propertySchema(model, property, refOf) {
  let schema = valueTypeSchema(model, property.propertyType, refOf);
  if (property.isList) schema = { type: 'array', items: schema };
  if (property.isOptional) schema = { anyOf: [schema, { type: 'null' }] };
  return schema;
}

// An object of `properties`, closed: a key no property declares is
// refused, so a misspelt optional argument is an error rather than a
// silent null. An optional property may be left out (`requireAll`
// false – what a command accepts) or must be spelt out, null or not
// (`requireAll` – what an event payload always carries).
function propertiesSchema(model, properties, refOf, { requireAll = false } = {}) {
  const out = { type: 'object', properties: {}, required: [], additionalProperties: false };
  for (const property of properties || []) {
    if (!property || !property.name) continue;
    out.properties[property.name] = propertySchema(model, property, refOf);
    if (requireAll || !property.isOptional) out.required.push(property.name);
  }
  return out;
}

function commandArgumentsSchema(model, commandName, refOf) {
  const body = model['command-definitions'][commandName];
  return propertiesSchema(model, body ? body.properties : [], refOf);
}

function eventPayloadSchema(model, eventName, refOf) {
  const body = model['event-definitions'][eventName];
  return propertiesSchema(model, body ? body.properties : [], refOf, { requireAll: true });
}

// `sandboxSteps` – `[{ command, args }]` – comes in from the caller
// rather than being read off a global here: this file knows nothing of
// the interactive session index.html keeps.
function buildShareEnvelope(model, sandboxSteps) {
  const envelope = {
    $schema: MODEL_SCHEMA_URL,
    dcbModelVersion: MODEL_VERSION,
    name: model.name,
    ...definitionsToSchema(model),
  };
  const propertyScenarios = definitionsToSchemaArray(
    'projection-scenario-definition', model['projection-scenario-definitions']
  );
  if (propertyScenarios.length) envelope.projectionScenarioDefinitions = propertyScenarios;
  if (sandboxSteps && sandboxSteps.length) envelope.sandbox = { steps: sandboxSteps };
  return envelope;
}

// The stored model a shared envelope would import as again, if there
// is one: the same example opened twice from dcb.events, a link pasted
// a second time. Compared as the envelope that model would share now,
// so a copy edited since is not mistaken for the original – an export
// is stable once imported, which a test holds. A sandbox session rides
// along only with a link that carries one, and such a link is always
// imported, so its steps replay.
function modelMatchingEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') return null;
  if (envelope.sandbox && envelope.sandbox.steps && envelope.sandbox.steps.length) return null;
  const wanted = JSON.stringify({ ...envelope, sandbox: undefined });
  const models = projectState();
  return Object.keys(models).find((id) => JSON.stringify(buildShareEnvelope(models[id])) === wanted) || null;
}

// Whether importing this envelope would run authored code the moment
// anything touches it – a property or a projection carrying a `script`
// both compile through the same unsandboxed path (see `evCompileHandler`
// in evaluate.js). This is what gates the confirmation before import.
function envelopeHasScript(envelope) {
  return envelopeScripts(envelope).length > 0;
}

// The code that would run, per scripted projection, as the gate shows
// it: a confirmation that only says *that* there is code asks for
// trust it gives the reader no way to check. Scripts live only on
// projections – an entity property is a binding and carries none of
// its own. Handlers are listed as they stand, `code` or not, so the
// list is what `evCompileHandler` would compile.
function envelopeScripts(envelope) {
  if (!envelope || typeof envelope !== 'object') return [];
  return (envelope.projectionDefinitions || [])
    .filter((p) => p && !!p.script)
    .map((p) => ({
      projection: String(p.name),
      handlers: (Array.isArray(p.handlers) ? p.handlers : [])
        .map((handler) => ({ event: String(handler && handler.event), code: String((handler && handler.code) ?? '') })),
    }));
}

// An entity, stripped down to what can exist before the projections
// its properties bind are added: the bindings are dropped wholesale
// and put back by `updateDefinition` once every projection exists. An
// entity with no properties is legal – one consulted purely by tag –
// so the bare form is always addable.
function bareEntityBody(body) {
  return { ...body, properties: [] };
}

// Adds a mixed batch of custom types and bare entities, retrying
// whatever fails until a full pass makes no progress. The two kinds
// collide over an entity's derived identifier type – a standalone
// value type and the auto-created one contending for a name – so
// neither can be finished first in general; nothing downstream of this
// (events, full entities, projections, commands, scenarios) has that
// problem, so it is the only phase that needs retrying rather than a
// single ordered pass. Whatever a stalled pass leaves is returned as
// skips, one per item with its own refusal, never thrown.
function addManyWithRetry(modelId, items) {
  const skipped = [];
  let remaining = items;
  while (remaining.length) {
    const next = [];
    let progressed = false;
    for (const item of remaining) {
      try {
        addDefinition(item.kind, modelId, item.name, item.body);
        progressed = true;
      } catch (error) {
        next.push({ item, error });
      }
    }
    if (!progressed) {
      for (const { item, error } of next) {
        skipped.push({ kind: item.kind, name: item.name, reason: error.message });
      }
      break;
    }
    remaining = next.map(({ item }) => item);
  }
  return skipped;
}

// The synthesizer: rebuilds a shared model into a brand-new one by
// replaying it through the same commands manual editing uses, so an
// untrusted export can never land in a state those commands would have
// refused. The commands refuse little now – structure, collisions –
// and what one does refuse is *skipped* rather than aborting the
// import: the rest of the model loads, and the skips come back to the
// caller to report. Semantic defects in what did load are the
// advisories' to surface, the same as for any other edit.
// The wire format's two markers, checked. Only `dcbModelVersion` is
// read: `$schema` has to be *present*, because a document without one
// was not written by anything that knows this format and its shape is
// a guess from there – but what it points at is the author's business,
// and a reader that insisted on a particular URL would reject exactly
// the file someone had repointed at a local copy to work offline.
//
// A major this build does not know is refused rather than half-read. A
// newer minor is read, since a minor only ever adds what an older
// reader ignores; `envelopeVersionWarning` is how that gets said out
// loud instead of silently.
function parseEnvelopeVersion(envelope) {
  const raw = envelope && envelope.dcbModelVersion;
  const match = typeof raw === 'string' && /^(\d+)\.(\d+)$/.exec(raw);
  if (!match) return null;
  return { raw, major: Number(match[1]), minor: Number(match[2]) };
}

function assertEnvelopeVersion(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    throw new DomainError('That does not look like a shared DCB model.');
  }
  if (typeof envelope.$schema !== 'string' || !envelope.$schema) {
    throw new DomainError(
      'That file declares no "$schema", so it was not written against the DCB '
      + 'model format.'
    );
  }
  const version = parseEnvelopeVersion(envelope);
  if (!version) {
    throw new DomainError(
      'That file declares no readable "dcbModelVersion", so there is no way '
      + 'to tell which format it is in.'
    );
  }
  // Earlier majors stay readable where the newer format only *added* –
  // a 3.x document never said `via` or a binding's `isOptional`, so
  // 6.x builds read it whole. 7.0 *required* something (a rule's
  // rejection message) that no earlier document has, so this build
  // reads 7.x only. What is refused is a major this build does not
  // read, in either direction.
  if (!READABLE_MAJORS.includes(version.major)) {
    const readable_ = READABLE_MAJORS.map((m) => `${m}.x`).join(' and ');
    throw new DomainError(
      `That file is DCB model ${version.raw}, and this playground reads `
      + `${readable_} (currently ${MODEL_VERSION}). Nothing here would `
      + 'read it correctly, so it is refused rather than half-read.'
    );
  }
  return version;
}

// Non-empty when a document comes from a newer minor than this build
// knows: readable, because that is what a minor promises, but it may
// carry things this playground drops without ever mentioning them.
function envelopeVersionWarning(envelope) {
  const version = parseEnvelopeVersion(envelope);
  const expected = parseEnvelopeVersion({ dcbModelVersion: MODEL_VERSION });
  if (!version || version.major !== expected.major) return '';
  if (version.minor <= expected.minor) return '';
  return `This model is version ${version.raw}; this playground knows `
    + `${MODEL_VERSION}. It will load, but anything the newer format adds is `
    + 'being ignored.';
}

// The five kinds a model must declare, even if empty. `scenarioDefinitions`
// is the sixth and is optional, the same way the schema has it.
const REQUIRED_SCHEMA_KINDS = SCHEMA_KINDS.filter((kind) => kind !== 'scenario-definition');

// A 9.x scripted projection kept its arguments in its script; 10.0
// keeps them on the projection, for every kind. The one shape that
// moved, lifted as it is read – a body that already states both is
// left to say so (`validateScript`).
function liftScriptArguments(body) {
  const script = body && body.script;
  if (!script || typeof script !== 'object' || script.arguments === undefined) return;
  if (body.arguments !== undefined) return;
  const { arguments: lifted, ...rest } = script;
  if (Array.isArray(lifted) && lifted.length) body.arguments = lifted;
  body.script = rest;
}

function importModelFromEnvelope(envelope) {
  assertEnvelopeVersion(envelope);
  // There is no wrapper object to look for any more – the definition
  // arrays sit directly on the envelope – so what identifies a model is
  // that the kinds one must declare are actually there and are lists.
  for (const kind of REQUIRED_SCHEMA_KINDS) {
    if (!Array.isArray(envelope[SCHEMA_FIELD[kind]])) {
      throw new DomainError('That does not look like a shared DCB model.');
    }
  }
  // Required, and deliberately not defaulted: inventing a name for a
  // document that has none buries the fact that it was malformed under
  // a model called something plausible.
  if (typeof envelope.name !== 'string' || !envelope.name) {
    throw new DomainError('That model has no name.');
  }
  const customTypes = schemaArrayToDefinitions('custom-type-definition', envelope.customTypeDefinitions);
  const events = schemaArrayToDefinitions('event-definition', envelope.eventDefinitions);
  const entities = schemaArrayToDefinitions('entity-definition', envelope.entityDefinitions);
  const projections = schemaArrayToDefinitions('projection-definition', envelope.projectionDefinitions);
  for (const body of Object.values(projections)) liftScriptArguments(body);
  const commands = schemaArrayToDefinitions('command-definition', envelope.commandDefinitions);
  const scenarios = schemaArrayToDefinitions('scenario-definition', envelope.scenarioDefinitions);
  const propertyScenarios = schemaArrayToDefinitions(
    'projection-scenario-definition', envelope.projectionScenarioDefinitions
  );

  const modelId = createDcbModel(envelope.name);

  const skipped = [];
  const skippedNames = (kind) => new Set(
    skipped.filter((s) => s.kind === kind).map((s) => s.name)
  );
  const attempt = (kind, name, write) => {
    try {
      write();
    } catch (error) {
      skipped.push({ kind, name, reason: error && error.message ? error.message : String(error) });
    }
  };

  // Created automatically by `addDefinition('entity-definition', ...)`
  // – never added again here as a standalone value type, only enriched
  // once its exported body is known to carry more than the bare default.
  const derivedIdTypeNames = new Set(
    Object.entries(entities).map(([name, body]) => body.identifierType || (name + 'Id'))
  );

  skipped.push(...addManyWithRetry(modelId, [
    ...Object.entries(customTypes)
      .filter(([name]) => !derivedIdTypeNames.has(name))
      .map(([name, body]) => ({ kind: 'custom-type-definition', name, body })),
    ...Object.entries(entities)
      .map(([name, body]) => ({ kind: 'entity-definition', name, body: bareEntityBody(body) })),
  ]));

  for (const [name, body] of Object.entries(events)) {
    attempt('event-definition', name, () => addDefinition('event-definition', modelId, name, body));
  }
  for (const [name, body] of Object.entries(customTypes)) {
    if (derivedIdTypeNames.has(name)) {
      attempt('custom-type-definition', name,
        () => updateDefinition('custom-type-definition', modelId, name, body));
    }
  }
  // Projections before the full entities: a property binding names a
  // projection, so every projection exists before the bindings render
  // against it. Ordering is a courtesy now, not a requirement – a
  // binding to a projection that never loads is an advisory.
  for (const [name, body] of Object.entries(projections)) {
    attempt('projection-definition', name, () => addDefinition('projection-definition', modelId, name, body));
  }
  // An entity whose bare form was skipped has nothing to enrich – the
  // one skip already tells the story, so no second entry for the
  // enrichment failing too.
  const skippedEntities = skippedNames('entity-definition');
  for (const [name, body] of Object.entries(entities)) {
    if (skippedEntities.has(name)) continue;
    attempt('entity-definition', name, () => updateDefinition('entity-definition', modelId, name, body));
  }
  for (const [name, body] of Object.entries(commands)) {
    attempt('command-definition', name, () => addDefinition('command-definition', modelId, name, body));
  }
  // Scenario ids come across as they were exported rather than being
  // reissued here, so that a model survives a round trip unchanged and
  // a re-import can be diffed against what was sent. `generateId` is the
  // fallback for a hand-written file that reached this point without one.
  for (const [id, body] of Object.entries(scenarios)) {
    attempt('scenario-definition', id, () => addDefinition('scenario-definition', modelId, id || generateId(), body));
  }
  for (const [id, body] of Object.entries(propertyScenarios)) {
    attempt('projection-scenario-definition', id,
      () => addDefinition('projection-scenario-definition', modelId, id || generateId(), body));
  }

  // Custom types land out of exported order: a standalone one is added
  // in the first pool pass now that nothing checks its references,
  // while an entity-derived one appears only when its entity does.
  // Every other kind imports in envelope order already; this puts the
  // one kind that cannot back into it, so a round trip diffs clean.
  const currentTypes = Object.keys(projectState()[modelId]['custom-type-definitions']);
  const exportedOrder = Object.keys(customTypes).filter((name) => currentTypes.includes(name));
  const desired = [...exportedOrder, ...currentTypes.filter((name) => !exportedOrder.includes(name))];
  if (desired.join('\n') !== currentTypes.join('\n')) {
    reorderDefinitions('custom-type-definition', modelId, desired);
  }
  return { modelId, skipped };
}

// An envelope read as a model to compare against, never stored: the
// import above, run against a scratch log (`inScratchLog`). The same
// refusals and the same skipped list as an import; the model returned
// is a fold of the scratch log and belongs to no one. Nothing in it is
// compiled or run here, so a scripted envelope needs no gate – what
// compares never evaluates.
function modelFromEnvelope(envelope) {
  return inScratchLog((log) => {
    const { modelId, skipped } = importModelFromEnvelope(envelope);
    return { model: projectEvents(log)[modelId], skipped };
  });
}

// A stored model without its last `count` events – as it was before
// its latest undo steps, say – or null if it did not exist yet. A fold
// of the model's own events only: every event belongs to one model, so
// what other models appended in between changes nothing here.
function modelWithoutLast(modelId, count) {
  const own = loadEvents().filter((event) => event.data && event.data['dcb-model-id'] === modelId);
  return projectEvents(own.slice(0, Math.max(0, own.length - count)))[modelId] || null;
}

// ============================================================
// Predefined models.
//
// Two models, each built in layers, because that is the order the
// design was arrived at: a course-subscription model as the plain
// thing, then generated identifiers, then schedules; and a product
// pricing model as the plain thing, then a grace period on repricing.
// Each layer is applied through the ordinary commands, so loading one
// exercises exactly the write path an author would hit typing it in –
// and ships advisory-clean, which the tests hold it to.
//
// Every layer keeps references resolvable at each step – entities
// first without handlers (nothing to reference yet), then the events,
// then the entities again with their handlers, then the commands.
// ============================================================

// A lifecycle enum is an ordinary scalar custom type whose schema
// carries `enum`, declared once and referenced from an ordinary
// property – the same shape any other enum property has. Only a
// lifecycle with three or more states needs one at all; two states are
// a `boolean` projection and no type.
const seedEnumType = (name, members) => ({ schema: { type: 'string', enum: members } });
const seedProp = (name, type) => ({ name, propertyType: type, isOptional: false, isList: false });
const seedListProp = (name, type) => ({ name, propertyType: type, isOptional: false, isList: true });
const seedHandler = (event, operation, value) => ({ event, operation, value });
const seedParam = (name) => ({ parameterName: name });
// `{alias}` with no property reads a bound projection's single value.
const seedOf = (alias, property) => (property === undefined ? { alias } : { alias, property });
const seedBind = (alias, entity, idParam) => ({ alias, entity, id: seedParam(idParam) });
const seedReadProjection = (alias, projection, tags = {}) =>
  ({ alias, projection, tags });
// The one tag a projection about one of `entityName`'s instances is
// tagged by – its identifier, named after it: `courseId: CourseId`.
const seedEntityTag = (entityName) => ({
  name: entityName.charAt(0).toLowerCase() + entityName.slice(1) + 'Id',
  tagType: entityName + 'Id',
});
// The projection behind one entity property: tagged by the entity's
// identifier, which is what an instance reads it by.
const seedPropertyProjection = (entityName, valueType, initialValue, handlers, extra = {}) => ({
  tags: [seedEntityTag(entityName)], valueType, isList: false, initialValue, handlers, ...extra,
});
// An event's tags, written out: every tag-typed value its properties
// hold. A seed states them like any author would – nothing is implied
// on the way in – and this only saves restating each list by hand.
const seedTags = (modelId, properties) => tagPathsOf(getCtxOrThrow(modelId), properties);
// The binding itself – everything else lives on the projection.
const seedBindProp = (name, projection) => ({ name, projection });

// A scenario a seed ships with. The id is written out rather than
// generated so that regenerating an example produces the same file –
// a fresh id on every run would make every regeneration a diff.
function seedProjectionScenario(modelId, id, body) {
  addDefinition('projection-scenario-definition', modelId, id, body);
}

// Reads a definition back and writes the modified copy, so a later
// layer never has to restate the shape an earlier one produced.
function seedPatch(kind, modelId, name, mutate) {
  const body = deepClone(getCtxOrThrow(modelId)[DEF_COLLECTIONS[kind]][name]);
  mutate(body);
  updateDefinition(kind, modelId, name, body);
}

function seedBase(modelId) {
  const prop = seedProp;
  const handler = seedHandler;
  const param = seedParam;
  const of = seedOf;
  const bind = seedBind;
  const bindProp = seedBindProp;

  // 1. One lifecycle enum – Course's, because a course has three states
  //    to be in. A student has two, so it needs no enum and gets none:
  //    its lifecycle is a plain boolean, which is the whole of what
  //    "does it exist" ever needed. The two spellings side by side in
  //    the first model anyone opens is deliberate – it is where the
  //    promotion from one to the other is taught.
  //
  //    Then the entities, bare: a property is a binding to a projection,
  //    and no projection exists yet. Student first, since Course's
  //    subscriber list is typed StudentId.
  addDefinition('custom-type-definition', modelId, 'CourseStatus', seedEnumType('CourseStatus', ['NonExistent', 'Existent', 'Archived']));

  addDefinition('entity-definition', modelId, 'Student', { icon: '🧑‍🎓', properties: [] });
  addDefinition('entity-definition', modelId, 'Course', { icon: '📚', properties: [] });

  // 2. Events. Their entity-id properties are what carry the tags.
  const event = (name, properties) =>
    addDefinition('event-definition', modelId, name, { properties, tags: seedTags(modelId, properties) });

  event('CourseDefined', [prop('courseId', 'CourseId'), prop('capacity', 'integer')]);
  event('CourseCapacityChanged', [prop('courseId', 'CourseId'), prop('newCapacity', 'integer')]);
  event('CourseArchived', [prop('courseId', 'CourseId')]);
  event('StudentRegistered', [prop('studentId', 'StudentId')]);
  event('StudentSubscribedToCourse', [prop('courseId', 'CourseId'), prop('studentId', 'StudentId')]);
  event('StudentUnsubscribedFromCourse', [prop('courseId', 'CourseId'), prop('studentId', 'StudentId')]);

  // 3. The projections themselves – ordinary definitions, each tagged
  //    by the identifier of what it is about, which is what lets an
  //    entity bind one as a property: an instance reads it by its own
  //    identifier. Nothing else about them says "entity property": that
  //    is entirely the binding's doing.
  const projection = (name, body) =>
    addDefinition('projection-definition', modelId, name, body);

  projection('StudentExists', seedPropertyProjection('Student', 'boolean',
    false,
    [handler('StudentRegistered', 'set', true)]));
  projection('StudentSubscriptionCount', seedPropertyProjection('Student', 'integer', 0, [
    handler('StudentSubscribedToCourse', 'increment', 1),
    handler('StudentUnsubscribedFromCourse', 'decrement', 1),
  ]));

  projection('CourseStatus', seedPropertyProjection('Course', 'CourseStatus',
    { enumMember: 'NonExistent' }, [
      handler('CourseDefined', 'set', { enumMember: 'Existent' }),
      handler('CourseArchived', 'set', { enumMember: 'Archived' }),
    ]));
  projection('CourseCapacity', seedPropertyProjection('Course', 'integer', 0, [
    handler('CourseDefined', 'set', { eventProperty: 'capacity' }),
    handler('CourseCapacityChanged', 'set', { eventProperty: 'newCapacity' }),
  ]));
  projection('CourseSubscriptionCount', seedPropertyProjection('Course', 'integer', 0, [
    handler('StudentSubscribedToCourse', 'increment', 1),
    handler('StudentUnsubscribedFromCourse', 'decrement', 1),
  ]));
  projection('CourseSubscribedStudentIds', seedPropertyProjection('Course', 'StudentId', [], [
    handler('StudentSubscribedToCourse', 'append', { eventProperty: 'studentId' }),
    handler('StudentUnsubscribedFromCourse', 'remove', { eventProperty: 'studentId' }),
  ], { isList: true }));

  // 4. The entities again, now binding them. A binding names the
  //    projection and nothing else – there is no second place where a
  //    type or an initial value could disagree with the first.
  seedPatch('entity-definition', modelId, 'Student', (student) => {
    student.properties = [
      bindProp(LIFECYCLE_PROPERTY, 'StudentExists'),
      bindProp('subscriptionCount', 'StudentSubscriptionCount'),
    ];
    student.lifecycle = LIFECYCLE_PROPERTY;
  });
  seedPatch('entity-definition', modelId, 'Course', (course) => {
    course.properties = [
      // Still called `status`, and that is the point: nothing privileges
      // the name any more, so a model is free to use the word it wants.
      // What makes this the lifecycle is the designation below.
      bindProp('status', 'CourseStatus'),
      bindProp('capacity', 'CourseCapacity'),
      bindProp('subscriptionCount', 'CourseSubscriptionCount'),
      bindProp('subscribedStudentIds', 'CourseSubscribedStudentIds'),
    ];
    course.lifecycle = 'status';
  });

  // 5. Commands. The boundary is the DCB.
  const command = (name, body) => addDefinition('command-definition', modelId, name, body);

  command('DefineCourse', {
    feature: 'Course management',
    properties: [prop('courseId', 'CourseId'), prop('capacity', 'integer')],
    boundary: [bind('course', 'Course', 'courseId')],
    conditions: [
      { leftHandSide: of('course', 'status'), predicate: 'equals', rightHandSide: { enumMember: 'NonExistent' },
        rejection: 'Course already exists' },
    ],
    publishes: [{
      name: 'CourseDefined',
      parameters: { courseId: param('courseId'), capacity: param('capacity') },
    }],
  });

  command('ChangeCourseCapacity', {
    feature: 'Course management',
    properties: [prop('courseId', 'CourseId'), prop('newCapacity', 'integer')],
    boundary: [bind('course', 'Course', 'courseId')],
    conditions: [
      { leftHandSide: of('course', 'status'), predicate: 'equals', rightHandSide: { enumMember: 'Existent' },
        rejection: 'Course is not active' },
      { leftHandSide: of('course', 'subscriptionCount'), predicate: 'lessThanOrEquals', rightHandSide: param('newCapacity'),
        rejection: 'Course has more subscriptions than that' },
    ],
    publishes: [{
      name: 'CourseCapacityChanged',
      parameters: { courseId: param('courseId'), newCapacity: param('newCapacity') },
    }],
  });

  command('ArchiveCourse', {
    feature: 'Course management',
    properties: [prop('courseId', 'CourseId')],
    boundary: [bind('course', 'Course', 'courseId')],
    conditions: [
      { leftHandSide: of('course', 'status'), predicate: 'equals', rightHandSide: { enumMember: 'Existent' },
        rejection: 'Course is not active' },
    ],
    publishes: [{ name: 'CourseArchived', parameters: { courseId: param('courseId') } }],
  });

  command('RegisterStudent', {
    feature: 'Student registration',
    properties: [prop('studentId', 'StudentId')],
    boundary: [bind('student', 'Student', 'studentId')],
    conditions: [
      { leftHandSide: of('student', LIFECYCLE_PROPERTY), predicate: 'isFalse',
        rejection: 'Student is already registered' },
    ],
    publishes: [{ name: 'StudentRegistered', parameters: { studentId: param('studentId') } }],
  });

  command('SubscribeStudentToCourse', {
    feature: 'Enrolment',
    properties: [prop('courseId', 'CourseId'), prop('studentId', 'StudentId')],
    boundary: [bind('course', 'Course', 'courseId'), bind('student', 'Student', 'studentId')],
    conditions: [
      { leftHandSide: of('course', 'status'), predicate: 'equals', rightHandSide: { enumMember: 'Existent' },
        rejection: 'Course is not active' },
      { leftHandSide: of('student', LIFECYCLE_PROPERTY), predicate: 'isTrue',
        rejection: 'Student is not registered' },
      { leftHandSide: of('course', 'subscriptionCount'), predicate: 'lessThan', rightHandSide: of('course', 'capacity'),
        rejection: 'Course is full' },
      { leftHandSide: of('course', 'subscribedStudentIds'), predicate: 'contains', rightHandSide: param('studentId'), negate: true,
        rejection: 'Student is already subscribed' },
      { leftHandSide: of('student', 'subscriptionCount'), predicate: 'lessThan', rightHandSide: 10,
        rejection: 'Student is subscribed to too many courses' },
    ],
    publishes: [{
      name: 'StudentSubscribedToCourse',
      parameters: { courseId: param('courseId'), studentId: param('studentId') },
    }],
  });

  command('UnsubscribeStudentFromCourse', {
    feature: 'Enrolment',
    properties: [prop('courseId', 'CourseId'), prop('studentId', 'StudentId')],
    // The course only. Which student is asserted by the caller, and
    // whether they are in this course is answered off the course – the
    // student's own state decides nothing here, so reading it would
    // widen the boundary and buy nothing. The event still carries the
    // `Student` tag, which is what makes a concurrent command that
    // *did* read this student conflict with it.
    boundary: [bind('course', 'Course', 'courseId')],
    conditions: [
      { leftHandSide: of('course', 'status'), predicate: 'equals', rightHandSide: { enumMember: 'Existent' },
        rejection: 'Course is not active' },
      { leftHandSide: of('course', 'subscribedStudentIds'), predicate: 'contains', rightHandSide: param('studentId'),
        rejection: 'Student is not subscribed' },
    ],
    publishes: [{
      name: 'StudentUnsubscribedFromCourse',
      parameters: { courseId: param('courseId'), studentId: param('studentId') },
    }],
  });
}

// Layer 2: course identifiers stop being supplied and start being
// issued. DefineCourse loses its identifier parameter and its "not
// already used" check, and gains a binding in their place – reading
// the projection contributes `types CourseDefined` to the append
// condition, which is what makes the numbering monotonic and what
// makes the check redundant.
//
// The numbering is an ordinary projection, untagged: its
// value is set to the *successor* of the id each CourseDefined
// carried, so it holds the next number to issue at every point in its
// life – `c1` before anything has happened, `successor(last)` after.
// Project to the last id instead and `initialValue` would have to mean
// two different things depending on whether anything had happened yet.
function seedAddSequence(modelId) {
  seedPatch('custom-type-definition', modelId, 'CourseId', (courseId) => {
    courseId.schema = { type: 'string', pattern: '^c[0-9]+$' };
  });

  addDefinition('projection-definition', modelId, 'CourseNumbering', {
    tags: [],
    valueType: 'CourseId',
    isList: false,
    initialValue: 'c1',
    handlers: [
      seedHandler('CourseDefined', 'set', { successor: { eventProperty: 'courseId' } }),
    ],
  });

  updateDefinition('command-definition', modelId, 'DefineCourse', {
    feature: 'Course management',
    properties: [seedProp('capacity', 'integer')],
    boundary: [seedReadProjection('courseNumbering', 'CourseNumbering')],
    conditions: [],
    publishes: [{
      name: 'CourseDefined',
      parameters: {
        courseId: seedOf('courseNumbering'),
        capacity: seedParam('capacity'),
      },
    }],
  });

}

// Two scenarios over the numbering itself – the thing no entity owns
// and no command page shows in isolation. A numbering is exactly the
// case worth asserting directly: its whole contract is "the next value
// to issue", at every point in its life, and that is a claim about the
// fold rather than about any decision made from it.
//
// A layer of its own rather than part of `seedAddSequence`, because a
// Given is written against the events as they are *now*: the tenancy
// and schedule layers both add properties to `CourseDefined`, and a
// scenario written before them is broken by them. That is the
// mechanism reporting honestly, and the models that go on to grow the
// event should not ship already saying so.
//
// The Then is stated here rather than derived, because a seed runs
// against `model.js` alone and the evaluator is not loaded. A test
// (`ui.test.js`) runs every shipped scenario to keep that honest.
function seedSequenceScenarios(modelId) {
  seedProjectionScenario(modelId, 'a29c2e1f-6b04-4f5a-9d13-5f0a2d7c8e41', {
    name: 'issues c1 before anything has happened',
    projection: 'CourseNumbering',
    given: [],
    then: 'c1',
  });
  seedProjectionScenario(modelId, 'f47b9c30-2a8d-4e16-b5c7-9e3a1d604f28', {
    name: 'issues c3 once two courses exist',
    projection: 'CourseNumbering',
    given: [
      { event: 'CourseDefined', data: { courseId: 'c1', capacity: 10 } },
      { event: 'CourseDefined', data: { courseId: 'c2', capacity: 10 } },
    ],
    then: 'c3',
  });
}

// Layer 3a: tenancy, and with it a numbering *tagged* by something.
//
// This is the case the old design could not express. It called
// numbering "global by nature" and gave a sequence no tag at all –
// which a numbering per tenant simply falsifies. A projection declares
// the tags it is read by, so restarting the numbering per tenant is a
// numbering tagged by the tenant and nothing else.
//
// Number is not identity. `CourseId` stays globally minted by the
// parameterless `CourseNumbering`, and the per-tenant projection
// issues a human-facing `CourseNumber` that restarts at 1 for each
// tenant. Doing it the other way – minting the id per tenant – would
// have two tenants both writing `Course:c1`, and tags are flat, so
// those two courses would be one instance. It is also how real systems
// work: invoice numbers restart, invoice ids never do.
//
// A side effect worth naming: because `CourseNumber` is not an
// identifier type, the minted value is not a tag, so write coverage
// has nothing to exempt here.
function seedAddTenancy(modelId) {
  addDefinition('entity-definition', modelId, 'Tenant', { icon: '🏢', properties: [] });
  addDefinition('custom-type-definition', modelId, 'CourseNumber', {
    schema: { type: 'string', pattern: '^[0-9]+$' },
  });

  addDefinition('event-definition', modelId, 'TenantRegistered', {
    properties: [seedProp('tenantId', 'TenantId')], tags: ['tenantId'],
  });
  seedPatch('event-definition', modelId, 'CourseDefined', (event) => {
    event.properties.unshift(seedProp('tenantId', 'TenantId'));
    event.properties.push(seedProp('courseNumber', 'CourseNumber'));
    event.tags = ['tenantId', ...event.tags];
  });

  addDefinition('projection-definition', modelId, 'TenantExists',
    seedPropertyProjection('Tenant', 'boolean', false,
      [seedHandler('TenantRegistered', 'set', true)]));
  seedPatch('entity-definition', modelId, 'Tenant', (tenant) => {
    tenant.properties = [seedBindProp(LIFECYCLE_PROPERTY, 'TenantExists')];
    tenant.lifecycle = LIFECYCLE_PROPERTY;
  });

  // Tagged by the tenant, so one tag: `Tenant:<id> AND type
  // CourseDefined`. Untagged, this would be a global numbering – that
  // is the whole difference.
  addDefinition('projection-definition', modelId, 'TenantCourseNumbering', {
    tags: [seedEntityTag('Tenant')],
    valueType: 'CourseNumber',
    isList: false,
    initialValue: '1',
    handlers: [
      seedHandler('CourseDefined', 'set', { successor: { eventProperty: 'courseNumber' } }),
    ],
  });

  addDefinition('command-definition', modelId, 'RegisterTenant', {
    feature: 'Tenancy',
    properties: [seedProp('tenantId', 'TenantId')],
    boundary: [seedBind('tenant', 'Tenant', 'tenantId')],
    conditions: [
      { leftHandSide: seedOf('tenant', LIFECYCLE_PROPERTY), predicate: 'isFalse',
        rejection: 'Tenant is already registered' },
    ],
    publishes: [{ name: 'TenantRegistered', parameters: { tenantId: seedParam('tenantId') } }],
  });

  // Three reads, all in round 1: none of them names another, so they
  // come back together. This is why rounds are counted by the depth of
  // the dependency graph and not by the length of the boundary.
  seedPatch('command-definition', modelId, 'DefineCourse', (define) => {
    define.properties.unshift(seedProp('tenantId', 'TenantId'));
    define.boundary.unshift(seedBind('tenant', 'Tenant', 'tenantId'));
    define.boundary.push(seedReadProjection('tenantCourseNumbering', 'TenantCourseNumbering',
      { tenantId: seedParam('tenantId') }));
    define.conditions.push({
      leftHandSide: seedOf('tenant', LIFECYCLE_PROPERTY),
      predicate: 'isTrue',
      rejection: 'Tenant is not registered',
    });
    define.publishes[0].parameters.tenantId = seedParam('tenantId');
    define.publishes[0].parameters.courseNumber = seedOf('tenantCourseNumbering');
  });
}

// Layer 3: schedules, and the rule that a student is never in two
// courses at once. A slot is an hour of wall-clock time and a course is
// scheduled by naming the slots it occupies, so a slot value *is* a
// discretised timestamp and the granularity is stated by the pattern.
//
// Slots are values, never tags. Occupancy is not stored per student –
// it is read from each course's current schedule at check time, which
// is exactly what lets a course be rescheduled underneath its
// subscribers without invalidating anything.
function seedAddSchedules(modelId) {
  addDefinition('custom-type-definition', modelId, 'TimeSlot', {
    schema: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}$' },
  });

  seedPatch('event-definition', modelId, 'CourseDefined', (event) => {
    event.properties.push(seedListProp('slots', 'TimeSlot'));
  });
  addDefinition('event-definition', modelId, 'CourseRescheduled', {
    properties: [seedProp('courseId', 'CourseId'), seedListProp('slots', 'TimeSlot')],
    tags: ['courseId'],
  });

  addDefinition('projection-definition', modelId, 'CourseSlots',
    seedPropertyProjection('Course', 'TimeSlot', [], [
      seedHandler('CourseDefined', 'set', { eventProperty: 'slots' }),
      seedHandler('CourseRescheduled', 'set', { eventProperty: 'slots' }),
    ], { isList: true }));
  // Names the courses whose *current* schedules the overlap check
  // reads. Nothing about time is stored here.
  addDefinition('projection-definition', modelId, 'StudentSubscribedCourseIds',
    seedPropertyProjection('Student', 'CourseId', [], [
      seedHandler('StudentSubscribedToCourse', 'append', { eventProperty: 'courseId' }),
      seedHandler('StudentUnsubscribedFromCourse', 'remove', { eventProperty: 'courseId' }),
    ], { isList: true }));

  seedPatch('entity-definition', modelId, 'Course', (course) => {
    course.properties.push(seedBindProp('slots', 'CourseSlots'));
  });
  seedPatch('entity-definition', modelId, 'Student', (student) => {
    student.properties.push(seedBindProp('subscribedCourseIds', 'StudentSubscribedCourseIds'));
  });

  seedPatch('command-definition', modelId, 'DefineCourse', (define) => {
    define.properties.push(seedListProp('slots', 'TimeSlot'));
    define.publishes[0].parameters.slots = seedParam('slots');
  });

  // Rescheduling is allowed while students are subscribed, so it has to
  // prove that nobody it moves ends up double-booked: bind the
  // subscribers, then every *other* course any of them is in, and
  // require none of those schedules to touch the new slots. `theirs`
  // would otherwise include this very course – every subscriber is in
  // it – and a course almost always overlaps its own old schedule.
  addDefinition('command-definition', modelId, 'RescheduleCourse', {
    feature: 'Course management',
    properties: [seedProp('courseId', 'CourseId'), seedListProp('slots', 'TimeSlot')],
    boundary: [
      seedBind('course', 'Course', 'courseId'),
      { alias: 'students', entity: 'Student', id: { each: seedOf('course', 'subscribedStudentIds') } },
      { alias: 'theirs', entity: 'Course', id: { each: seedOf('students', 'subscribedCourseIds') },
        excluding: seedParam('courseId') },
    ],
    conditions: [
      { leftHandSide: seedOf('course', 'status'), predicate: 'equals', rightHandSide: { enumMember: 'Existent' },
        rejection: 'Course is not active' },
      { leftHandSide: seedOf('theirs', 'slots'), predicate: 'containsAny',
        rightHandSide: seedParam('slots'), negate: true,
        rejection: 'Slots clash with a subscriber\'s other course' },
    ],
    publishes: [{
      name: 'CourseRescheduled',
      parameters: { courseId: seedParam('courseId'), slots: seedParam('slots') },
    }],
  });

  // `others` is the second link of the chain: the student names its
  // courses, and those courses' current schedules answer whether this
  // one clashes. The condition holds for every course bound.
  seedPatch('command-definition', modelId, 'SubscribeStudentToCourse', (subscribe) => {
    subscribe.boundary.push({
      alias: 'others', entity: 'Course', id: { each: seedOf('student', 'subscribedCourseIds') },
    });
    subscribe.conditions.push({
      leftHandSide: seedOf('others', 'slots'),
      predicate: 'containsAny',
      rightHandSide: seedOf('course', 'slots'),
      negate: true,
      rejection: 'Course clashes with the student\'s schedule',
    });
  });
}

// A command that acts on a *list* of instances at once.
//
// `OrderProducts` submits a cart: each line names a product and the
// price the customer was shown. Two things have to hold for every line
// – the product exists, and the price shown is still the price – and
// they hold or fail together, in one append.
//
// The list is what makes this different from every other example here:
//
//   - `Item` is a composite value type. Because one of its fields is a
//     `ProductId`, a property typed `Item[]` carries one Product tag
//     per element, and `ProductsOrdered` ends up tagged with every
//     product in the cart.
//   - `product` binds each of `items.productId`, a list, so it fans
//     out to one instance per line.
//   - the price condition reads `items.price` alongside the fanned
//     `product`. Both are rooted at `items`, so they are read at the
//     same index: each product is checked against the price submitted
//     *for that product*, not against any price in the cart.
//
// `order` is bound singularly beside it, so the same boundary holds one
// instance and many, and the derived DCB shows both shapes at once.
function seedProductPricing(modelId) {
  const prop = seedProp;
  const handler = seedHandler;
  const param = seedParam;
  const of = seedOf;

  // 1. Value types. Money is scalar; Item is composite, and its
  //    productId field is what turns a list of them into tags. The
  //    lifecycle enums are scalar too – just with `enum` instead of a
  //    numeric schema.
  addDefinition('custom-type-definition', modelId, 'Money', {
    schema: { type: 'number', minimum: 0 },
  });

  // 2. Entities, bare – Item cannot be declared until ProductId
  //    exists, and ProductId comes from Product.
  addDefinition('entity-definition', modelId, 'Product', { icon: '📦', properties: [] });
  addDefinition('entity-definition', modelId, 'Order', { icon: '🧾', properties: [] });

  addDefinition('custom-type-definition', modelId, 'Item', {
    properties: [
      { name: 'productId', propertyType: 'ProductId' },
      { name: 'price', propertyType: 'Money' },
    ],
  });

  // 3. Events.
  const event = (name, properties) =>
    addDefinition('event-definition', modelId, name, { properties, tags: seedTags(modelId, properties) });

  event('ProductDefined', [prop('productId', 'ProductId'), prop('price', 'Money')]);
  event('ProductPriceChanged', [prop('productId', 'ProductId'), prop('newPrice', 'Money')]);
  // One event, many tags: Order:<orderId> plus one Product per item.
  event('ProductsOrdered', [prop('orderId', 'OrderId'), seedListProp('items', 'Item')]);

  // 4. The projections, then the bindings. Neither product projection
  //    handles ProductsOrdered: a value-style handler would need to
  //    pick *this* product's line out of the event, which the model
  //    cannot yet express.
  addDefinition('projection-definition', modelId, 'ProductExists',
    seedPropertyProjection('Product', 'boolean', false,
      [handler('ProductDefined', 'set', true)]));
  // Starts at null – no value yet. A price of 0 on a product that does
  // not exist would be a lie the model then has to defend, and null is
  // a different answer from both 0 and "".
  addDefinition('projection-definition', modelId, 'ProductCurrentPrice',
    seedPropertyProjection('Product', 'Money', null, [
      handler('ProductDefined', 'set', { eventProperty: 'price' }),
      handler('ProductPriceChanged', 'set', { eventProperty: 'newPrice' }),
    ]));
  addDefinition('projection-definition', modelId, 'OrderExists',
    seedPropertyProjection('Order', 'boolean', false,
      [handler('ProductsOrdered', 'set', true)]));

  seedPatch('entity-definition', modelId, 'Product', (product) => {
    product.properties = [
      seedBindProp(LIFECYCLE_PROPERTY, 'ProductExists'),
      seedBindProp('currentPrice', 'ProductCurrentPrice'),
    ];
    product.lifecycle = LIFECYCLE_PROPERTY;
  });
  seedPatch('entity-definition', modelId, 'Order', (order) => {
    order.properties = [seedBindProp(LIFECYCLE_PROPERTY, 'OrderExists')];
    order.lifecycle = LIFECYCLE_PROPERTY;
  });

  // 5. Commands defining and repricing a single product, so the
  //    example can be exercised before anything is ordered.
  addDefinition('command-definition', modelId, 'DefineProduct', {
    feature: 'Catalogue',
    properties: [prop('productId', 'ProductId'), prop('price', 'Money')],
    boundary: [seedBind('product', 'Product', 'productId')],
    conditions: [{
      leftHandSide: of('product', LIFECYCLE_PROPERTY),
      predicate: 'isFalse',
      rejection: 'Product already exists',
    }],
    publishes: [{
      name: 'ProductDefined',
      parameters: { productId: param('productId'), price: param('price') },
    }],
  });
  addDefinition('command-definition', modelId, 'ChangeProductPrice', {
    feature: 'Catalogue',
    properties: [prop('productId', 'ProductId'), prop('newPrice', 'Money')],
    boundary: [seedBind('product', 'Product', 'productId')],
    conditions: [
      {
        leftHandSide: of('product', LIFECYCLE_PROPERTY),
        predicate: 'isTrue',
        rejection: 'Product does not exist',
      },
      // Repricing to the price already in force is a no-op, and saying
      // so does more than tidy the log: reading `currentPrice` pulls
      // ProductPriceChanged into this command's query, where the state
      // check alone would have covered only ProductDefined. Without it
      // two concurrent repricings both see an untouched product and
      // both succeed.
      {
        leftHandSide: of('product', 'currentPrice'),
        predicate: 'equals',
        rightHandSide: param('newPrice'),
        negate: true,
        rejection: 'Price is unchanged',
      },
    ],
    publishes: [{
      name: 'ProductPriceChanged',
      parameters: { productId: param('productId'), newPrice: param('newPrice') },
    }],
  });

  // 6. The command the example exists for.
  addDefinition('command-definition', modelId, 'OrderProducts', {
    feature: 'Checkout',
    properties: [prop('orderId', 'OrderId'), seedListProp('items', 'Item')],
    boundary: [
      seedBind('order', 'Order', 'orderId'),
      // Each element of a list, so this binds one Product per line.
      { alias: 'product', entity: 'Product', id: { each: { parameterName: 'items', property: 'productId' } } },
    ],
    conditions: [
      // Singular: the order must not already have been placed.
      {
        leftHandSide: of('order', LIFECYCLE_PROPERTY),
        predicate: 'isFalse',
        rejection: 'Order was already placed',
      },
      // Universal over the fanned alias: every product must exist.
      {
        leftHandSide: of('product', LIFECYCLE_PROPERTY),
        predicate: 'isTrue',
        rejection: 'Product does not exist',
      },
      // Zipped: product[i] against items[i].price.
      {
        leftHandSide: of('product', 'currentPrice'),
        predicate: 'equals',
        rightHandSide: { parameterName: 'items', property: 'price' },
        rejection: 'Price has changed',
      },
    ],
    publishes: [{
      name: 'ProductsOrdered',
      // `items` is emitted whole. Coverage reads through it to
      // items.productId, which is exactly what `product` bound.
      parameters: { orderId: param('orderId'), items: param('items') },
    }],
  });
}

// ============================================================
// Without entities (8.0).
//
// The course and content models were designed with entities, and the
// layers above still build them that way – which is the honest record
// of how they came about, and what the one entity example keeps. Every
// other shipped model is then stated without them, by this last layer:
// a property an entity read stood for becomes the projection it binds,
// read in place by the identifier the entity was read by – a fan-out
// staying one – and the entities and their lifecycles (experimental)
// go, the icons and feature groups with them. One append, through the
// ordinary command, like every layer.
// ============================================================

function seedWithoutEntities(modelId) {
  const model = getCtxOrThrow(modelId);
  const entities = model['entity-definitions'];
  const commands = {};
  for (const [name, stored] of Object.entries(model['command-definitions'])) {
    const body = deepClone(stored);
    const byAlias = new Map((body.boundary || []).filter((b) => b && b.entity).map((b) => [b.alias, b]));
    const convert = (operand) => {
      if (Array.isArray(operand)) return operand.map(convert);
      if (!operand || typeof operand !== 'object') return operand;
      if (operandSource(operand) === 'alias-property' && byAlias.has(operand.alias)) {
        const binding = byAlias.get(operand.alias);
        const property = (entities[binding.entity].properties || []).find((p) => p.name === operand.property);
        const [tag] = projectionTagParams(model['projection-definitions'][property.projection]);
        const read = { projection: property.projection, tags: { [tag.name]: convert(binding.id) } };
        if (binding.arguments && Object.keys(binding.arguments).length) read.arguments = convert(binding.arguments);
        return read;
      }
      const out = {};
      for (const [key, value] of Object.entries(operand)) out[key] = convert(value);
      return out;
    };
    const rule = (condition) => {
      const out = { ...condition, leftHandSide: convert(condition.leftHandSide) };
      if (condition.rightHandSide !== undefined) out.rightHandSide = convert(condition.rightHandSide);
      return out;
    };
    body.conditions = (body.conditions || []).map(rule);
    body.publishes = (body.publishes || []).map((emission) => {
      const out = { ...emission };
      if (emission.parameters) out.parameters = convert(emission.parameters);
      if (emission.when) out.when = emission.when.map(rule);
      return out;
    });
    body.boundary = (body.boundary || []).filter((b) => !b.entity).map(convert);
    delete body.icon;
    delete body.feature;
    commands[name] = body;
  }
  const events = {};
  for (const [name, body] of Object.entries(model['event-definitions'])) {
    events[name] = { ...body };
    delete events[name].icon;
  }
  replaceDefinitions(modelId, {
    collections: {
      'custom-type-definition': model['custom-type-definitions'],
      'event-definition': events,
      'entity-definition': {},
      'projection-definition': model['projection-definitions'],
      'command-definition': commands,
    },
  });
}

// ============================================================
// Content based decisions – one domain, five spellings.
//
// A document's Published/PendingChanges distinction depends on whether
// its current text equals the last published one: a decision made from
// *content*, not from a recorded status. The declared handler
// vocabulary cannot compare two values, so this family exists to
// compare the ways out: a scripted projection (the baseline below),
// the comparison moved into command conditions over two plain text
// projections (`seedDocumentAuthoring`), the client echoing the text
// it saw for the command to verify (`seedVerifiedPublish`), the
// decision made at write time and recorded as distinct events through
// guarded emissions (`seedGuardedAuthoring`), and the comparison
// declared once as a derived projection (`seedDerivedPending`).
// docs/research/2026-09-19-content-based-decision-alternatives.md
// holds the primary sources; the comparison note beside it holds the
// verdict.
// ============================================================

// The baseline: the status projection is scripted. It keeps both texts
// as private state and exposes only the status, and every command
// decides against that one exposed value. Publishing "restores"
// silently: re-typing the published text flips the status back to
// Published with no event saying so – and no event *carrying* the
// published text either, which is what every alternative fixes first.
function seedContentDecisionsScripted(modelId) {
  const prop = seedProp;
  const param = seedParam;
  const of = seedOf;
  const bind = seedBind;

  // 1. The lifecycle enum, then the entity, bare – declaring Document
  //    mints DocumentId, which the state type and events reference.
  addDefinition('custom-type-definition', modelId, 'DocumentStatus', seedEnumType('DocumentStatus',
    ['NonExistent', 'Draft', 'Published', 'PendingChanges', 'Archived']));
  addDefinition('entity-definition', modelId, 'Document', { icon: '📄', properties: [] });

  // The script's private state, written down as a composite type.
  // Nothing references it – the script's initialState is untyped by
  // design – but the shape a reader would otherwise reverse-engineer
  // out of four code strings is worth one declaration.
  addDefinition('custom-type-definition', modelId, 'DocumentChangeState', {
    properties: [
      { name: 'publishedText', propertyType: 'string' },
      { name: 'currentText', propertyType: 'string' },
      { name: 'status', propertyType: 'DocumentStatus' },
    ],
  });

  // 2. Events. The texts live here; no projection re-publishes them.
  const event = (name, properties) =>
    addDefinition('event-definition', modelId, name, { properties, tags: seedTags(modelId, properties) });

  event('DocumentAdded', [prop('id', 'DocumentId')]);
  event('TextUpdated', [prop('docId', 'DocumentId'), prop('text', 'string')]);
  event('DocumentPublished', [prop('docId', 'DocumentId')]);
  event('DocumentArchived', [prop('docId', 'DocumentId')]);

  // 3. The scripted projection. `exposes` is what keeps the two texts
  //    out of the boundary: conditions read `status` and nothing else,
  //    typed exactly as a declared projection would be.
  addDefinition('projection-definition', modelId, 'DocumentStatus', {
    tags: [seedEntityTag('Document')],
    valueType: 'DocumentStatus',
    isList: false,
    script: {
      initialState: { currentText: '', publishedText: '', status: 'NonExistent' },
      exposes: 'status',
    },
    handlers: [
      { event: 'DocumentAdded',
        code: '{"currentText":"","publishedText":"","status":"Draft"}' },
      { event: 'TextUpdated',
        code: '{"currentText":event.data.text,"publishedText":state.publishedText,'
          + '"status":event.data.text == state.publishedText ? "Published" : "PendingChanges"}' },
      { event: 'DocumentPublished',
        code: '{"currentText":state.currentText,"publishedText":state.currentText,"status":"Published"}' },
      { event: 'DocumentArchived',
        code: '{"currentText":state.currentText,"publishedText":state.publishedText,"status":"Archived"}' },
    ],
  });
  seedPatch('entity-definition', modelId, 'Document', (document) => {
    document.properties = [seedBindProp('status', 'DocumentStatus')];
    // Designated even though the fold is a script: what a document is in
    // *is* this property, and saying so is right whether or not a
    // machine can be drawn from it. The Lifecycles page reports why it
    // cannot rather than pretending the entity has no lifecycle.
    document.lifecycle = 'status';
  });

  // 4. Commands – every rule is a status check, and the two that allow
  //    more than one status use `equalsAny` rather than spelling the
  //    same read out once per member.
  const command = (name, body) => addDefinition('command-definition', modelId, name, body);

  command('AddDocument', {
    feature: 'Document Authoring',
    icon: '⭐',
    properties: [prop('id', 'DocumentId')],
    boundary: [bind('document', 'Document', 'id')],
    conditions: [
      { leftHandSide: of('document', 'status'), predicate: 'equals', rightHandSide: { enumMember: 'NonExistent' },
        rejection: 'Document already exists' },
    ],
    publishes: [{ name: 'DocumentAdded', parameters: { id: param('id') } }],
  });

  command('UpdateText', {
    feature: 'Document Authoring',
    icon: '✏️',
    properties: [prop('docId', 'DocumentId'), prop('text', 'string')],
    boundary: [bind('document', 'Document', 'docId')],
    conditions: [
      { leftHandSide: of('document', 'status'), predicate: 'equals',
        rightHandSide: { enumMember: 'NonExistent' }, negate: true,
        rejection: 'Document does not exist' },
      { leftHandSide: of('document', 'status'), predicate: 'equals',
        rightHandSide: { enumMember: 'Archived' }, negate: true,
        rejection: 'Document is archived' },
    ],
    publishes: [{
      name: 'TextUpdated',
      parameters: { docId: param('docId'), text: param('text') },
    }],
  });

  command('PublishDocument', {
    feature: 'Document Authoring',
    icon: '💾',
    properties: [prop('docId', 'DocumentId')],
    boundary: [bind('document', 'Document', 'docId')],
    conditions: [
      { leftHandSide: of('document', 'status'), predicate: 'equalsAny',
        rightHandSide: [{ enumMember: 'Draft' }, { enumMember: 'PendingChanges' }],
        rejection: 'Document cannot be published' },
    ],
    publishes: [{ name: 'DocumentPublished', parameters: { docId: param('docId') } }],
  });

  command('ArchiveDocument', {
    feature: 'Document Authoring',
    icon: '🗑️',
    properties: [prop('docId', 'DocumentId')],
    boundary: [bind('document', 'Document', 'docId')],
    conditions: [
      { leftHandSide: of('document', 'status'), predicate: 'equalsAny',
        rightHandSide: [{ enumMember: 'Draft' }, { enumMember: 'Published' }, { enumMember: 'PendingChanges' }],
        rejection: 'Document cannot be archived' },
    ],
    publishes: [{ name: 'DocumentArchived', parameters: { docId: param('docId') } }],
  });
}

// The comparison moved to decision time. Two plain `set` projections
// hold the texts – `DocumentPublished` carries the text it publishes,
// read off the boundary, so the log is self-contained – and the
// publish guard compares them: `not(currentText == publishedText)`.
// The stored status shrinks to a four-state lifecycle in which
// Published means *has been published*; pending-ness is never stored,
// only visible where the two bound texts differ. Initial values do
// real work here: `currentText` becomes "" on add while
// `publishedText` stays null, which is exactly what makes a fresh
// Draft publishable without ever comparing against null explicitly.
function seedDocumentAuthoring(modelId) {
  const prop = seedProp;
  const handler = seedHandler;
  const param = seedParam;
  const of = seedOf;
  const bind = seedBind;

  addDefinition('custom-type-definition', modelId, 'DocumentLifecycle', seedEnumType('DocumentLifecycle',
    ['NonExistent', 'Draft', 'Published', 'Archived']));
  addDefinition('entity-definition', modelId, 'Document', { icon: '📄', properties: [] });

  const event = (name, properties) =>
    addDefinition('event-definition', modelId, name, { properties, tags: seedTags(modelId, properties) });

  event('DocumentAdded', [prop('id', 'DocumentId')]);
  event('TextUpdated', [prop('docId', 'DocumentId'), prop('text', 'string')]);
  // The enrichment the scripted baseline lacked: the published text is
  // a fact of the publication, so the event carries it and a plain
  // handler can read it back.
  event('DocumentPublished', [prop('docId', 'DocumentId'), prop('text', 'string')]);
  event('DocumentArchived', [prop('docId', 'DocumentId')]);

  const projection = (name, body) =>
    addDefinition('projection-definition', modelId, name, body);

  projection('DocumentLifecycle', seedPropertyProjection('Document', 'DocumentLifecycle',
    { enumMember: 'NonExistent' }, [
      handler('DocumentAdded', 'set', { enumMember: 'Draft' }),
      handler('DocumentPublished', 'set', { enumMember: 'Published' }),
      handler('DocumentArchived', 'set', { enumMember: 'Archived' }),
    ]));
  projection('DocumentCurrentText', seedPropertyProjection('Document', 'string', null, [
    handler('DocumentAdded', 'set', ''),
    handler('TextUpdated', 'set', { eventProperty: 'text' }),
  ]));
  projection('DocumentPublishedText', seedPropertyProjection('Document', 'string', null, [
    handler('DocumentPublished', 'set', { eventProperty: 'text' }),
  ]));

  seedPatch('entity-definition', modelId, 'Document', (document) => {
    document.properties = [
      seedBindProp('status', 'DocumentLifecycle'),
      seedBindProp('currentText', 'DocumentCurrentText'),
      seedBindProp('publishedText', 'DocumentPublishedText'),
    ];
    document.lifecycle = 'status';
  });

  const command = (name, body) => addDefinition('command-definition', modelId, name, body);

  command('AddDocument', {
    feature: 'Document Authoring',
    icon: '⭐',
    properties: [prop('id', 'DocumentId')],
    boundary: [bind('document', 'Document', 'id')],
    conditions: [
      { leftHandSide: of('document', 'status'), predicate: 'equals', rightHandSide: { enumMember: 'NonExistent' },
        rejection: 'Document already exists' },
    ],
    publishes: [{ name: 'DocumentAdded', parameters: { id: param('id') } }],
  });

  command('UpdateText', {
    feature: 'Document Authoring',
    icon: '✏️',
    properties: [prop('docId', 'DocumentId'), prop('text', 'string')],
    boundary: [bind('document', 'Document', 'docId')],
    conditions: [
      { leftHandSide: of('document', 'status'), predicate: 'equalsAny',
        rightHandSide: [{ enumMember: 'Draft' }, { enumMember: 'Published' }],
        rejection: 'Document is not editable' },
      // Recording an unchanged text is a no-op, and saying so pulls
      // TextUpdated into this command's query – the same move
      // ChangeProductPrice documents in the pricing example.
      { leftHandSide: of('document', 'currentText'), predicate: 'equals',
        rightHandSide: param('text'), negate: true,
        rejection: 'Text is unchanged' },
    ],
    publishes: [{
      name: 'TextUpdated',
      parameters: { docId: param('docId'), text: param('text') },
    }],
  });

  command('PublishDocument', {
    feature: 'Document Authoring',
    icon: '💾',
    properties: [prop('docId', 'DocumentId')],
    boundary: [bind('document', 'Document', 'docId')],
    conditions: [
      { leftHandSide: of('document', 'status'), predicate: 'equalsAny',
        rightHandSide: [{ enumMember: 'Draft' }, { enumMember: 'Published' }],
        rejection: 'Document cannot be published' },
      // The content-based decision, in the boundary: publishing is
      // refused exactly while nothing differs – a fresh Draft ("" vs
      // null) differs, a republish does not, and re-typing the
      // published text makes the two equal again, so the revert needs
      // no event and no stored status to hold.
      { leftHandSide: of('document', 'currentText'), predicate: 'equals',
        rightHandSide: of('document', 'publishedText'), negate: true,
        rejection: 'No changes to publish' },
    ],
    publishes: [{
      name: 'DocumentPublished',
      parameters: { docId: param('docId'), text: of('document', 'currentText') },
    }],
  });

  command('ArchiveDocument', {
    feature: 'Document Authoring',
    icon: '🗑️',
    properties: [prop('docId', 'DocumentId')],
    boundary: [bind('document', 'Document', 'docId')],
    conditions: [
      { leftHandSide: of('document', 'status'), predicate: 'equalsAny',
        rightHandSide: [{ enumMember: 'Draft' }, { enumMember: 'Published' }],
        rejection: 'Document cannot be archived' },
    ],
    publishes: [{ name: 'DocumentArchived', parameters: { docId: param('docId') } }],
  });
}

// Layer: the client sends proof. `PublishDocument` gains the text as a
// parameter and verifies it against the boundary – the same pattern
// `OrderProducts` applies to prices, and the one the DCB canon's
// dynamic-product-price example blesses verbatim (`displayedPrice`).
// The published event carries the parameter, now proven identical to
// the current text; the pending-changes comparison stays, restated
// against the proven value.
function seedVerifiedPublish(modelId) {
  updateDefinition('command-definition', modelId, 'PublishDocument', {
    feature: 'Document Authoring',
    icon: '💾',
    properties: [seedProp('docId', 'DocumentId'), seedProp('text', 'string')],
    boundary: [seedBind('document', 'Document', 'docId')],
    conditions: [
      { leftHandSide: seedOf('document', 'status'), predicate: 'equalsAny',
        rightHandSide: [{ enumMember: 'Draft' }, { enumMember: 'Published' }],
        rejection: 'Document cannot be published' },
      // The proof: what the caller believes it is publishing must be
      // the current text – a stale echo is rejected, which is the
      // optimistic check made a domain rule.
      { leftHandSide: seedOf('document', 'currentText'), predicate: 'equals',
        rightHandSide: seedParam('text'),
        rejection: 'Text is not the current one' },
      { leftHandSide: seedParam('text'), predicate: 'equals',
        rightHandSide: seedOf('document', 'publishedText'), negate: true,
        rejection: 'No changes to publish' },
    ],
    publishes: [{
      name: 'DocumentPublished',
      parameters: { docId: seedParam('docId'), text: seedParam('text') },
    }],
  });
}

// Layer: the comparison declared once. `DocumentHasPendingChanges` is
// a *derived* projection – no handlers, one predicate over the two
// text projections – bound as an entity property and read by the
// publish guard, so the logic lives in exactly one declaration and a
// real application's read side could interpret the same data. Its
// query is its operands' union, so binding it guards the append
// exactly as reading both texts would.
function seedDerivedPending(modelId) {
  // Tagged by the document like the two it compares, and passing that
  // tag on to each of them by name.
  const own = { documentId: { parameterName: 'documentId' } };
  addDefinition('projection-definition', modelId, 'DocumentHasPendingChanges', {
    tags: [seedEntityTag('Document')],
    valueType: 'boolean',
    isList: false,
    derived: {
      leftHandSide: { projection: 'DocumentCurrentText', tags: own },
      predicate: 'equals',
      rightHandSide: { projection: 'DocumentPublishedText', tags: own },
      negate: true,
    },
  });

  seedPatch('entity-definition', modelId, 'Document', (document) => {
    document.properties.push(seedBindProp('hasPendingChanges', 'DocumentHasPendingChanges'));
  });

  seedPatch('command-definition', modelId, 'PublishDocument', (publish) => {
    publish.conditions = [
      publish.conditions[0],
      { leftHandSide: seedOf('document', 'hasPendingChanges'), predicate: 'isTrue',
        rejection: 'No changes to publish' },
    ];
  });
}

// Weekly developer hours: a developer registers with the hours they
// have per week, and every allocation is subtracted from that week's
// budget. What is left is *computed*, not folded – a derived
// projection subtracting the hours allocated that week from the weekly
// budget – and whether it covers a request is derived too, with the
// hours asked for as an argument (10.0): `AllocateHours` reads one
// boolean, and its boundary is still both queries: the developer's
// registration and that week's allocations.
function seedDeveloperHours(modelId) {
  const prop = seedProp;
  const handler = seedHandler;
  const param = seedParam;
  const read = (projection, tags, args) => ({ projection, tags, ...(args ? { arguments: args } : {}) });

  addDefinition('custom-type-definition', modelId, 'ProjectId', { schema: { type: 'string' }, isTag: true });
  addDefinition('custom-type-definition', modelId, 'ProjectStatus', seedEnumType('ProjectStatus', ['Active', 'Archived']));
  addDefinition('custom-type-definition', modelId, 'DeveloperId', { schema: { type: 'string' }, isTag: true });
  addDefinition('custom-type-definition', modelId, 'WeekNumber', { schema: { type: 'integer' }, isTag: true });

  const event = (name, properties) =>
    addDefinition('event-definition', modelId, name, { properties, tags: seedTags(modelId, properties) });
  event('ProjectAdded', [prop('projectId', 'ProjectId'), prop('requiredSeniorityLevel', 'integer')]);
  event('ProjectArchived', [prop('projectId', 'ProjectId')]);
  event('DeveloperRegistered', [
    prop('developerId', 'DeveloperId'), prop('seniorityLevel', 'integer'), prop('availableHoursPerWeek', 'integer'),
  ]);
  event('HoursAllocated', [
    prop('projectId', 'ProjectId'), prop('developerId', 'DeveloperId'), prop('week', 'WeekNumber'),
    prop('requestedHours', 'integer'),
  ]);

  const project = [{ name: 'projectId', tagType: 'ProjectId' }];
  const developer = [{ name: 'developerId', tagType: 'DeveloperId' }];
  const developerWeek = [...developer, { name: 'week', tagType: 'WeekNumber' }];
  const projection = (name, tags, valueType, initialValue, handlers) =>
    addDefinition('projection-definition', modelId, name, { tags, valueType, isList: false, initialValue, handlers });
  projection('ProjectStatus', project, 'ProjectStatus', null, [
    handler('ProjectAdded', 'set', { enumMember: 'Active' }),
    handler('ProjectArchived', 'set', { enumMember: 'Archived' }),
  ]);
  projection('ProjectRequiredSeniorityLevel', project, 'integer', null, [
    handler('ProjectAdded', 'set', { eventProperty: 'requiredSeniorityLevel' }),
  ]);
  projection('DeveloperExists', developer, 'boolean', false, [handler('DeveloperRegistered', 'set', true)]);
  projection('DeveloperSeniorityLevel', developer, 'integer', null, [
    handler('DeveloperRegistered', 'set', { eventProperty: 'seniorityLevel' }),
  ]);
  // Starts at 0, not null: a computation over null is null, and the
  // remaining hours of a developer nobody registered are better zero
  // than an ordering that errors.
  projection('DeveloperAvailableHoursPerWeek', developer, 'integer', 0, [
    handler('DeveloperRegistered', 'set', { eventProperty: 'availableHoursPerWeek' }),
  ]);
  projection('DeveloperAllocatedHoursForWeek', developerWeek, 'integer', 0, [
    handler('HoursAllocated', 'increment', { eventProperty: 'requestedHours' }),
  ]);
  const own = { developerId: param('developerId') };
  addDefinition('projection-definition', modelId, 'DeveloperRemainingHoursForWeek', {
    tags: developerWeek,
    valueType: 'integer',
    isList: false,
    derived: {
      leftHandSide: read('DeveloperAvailableHoursPerWeek', own),
      operator: 'subtract',
      rightHandSide: read('DeveloperAllocatedHoursForWeek', { ...own, week: param('week') }),
    },
  });
  addDefinition('projection-definition', modelId, 'DeveloperHasHoursForWeek', {
    tags: developerWeek,
    arguments: [{ name: 'hours', propertyType: 'integer' }],
    valueType: 'boolean',
    isList: false,
    derived: {
      leftHandSide: read('DeveloperRemainingHoursForWeek', { ...own, week: param('week') }),
      predicate: 'greaterThanOrEquals',
      rightHandSide: param('hours'),
    },
  });

  addDefinition('command-definition', modelId, 'AddProject', {
    feature: 'Projects',
    properties: [prop('projectId', 'ProjectId'), prop('requiredSeniorityLevel', 'integer')],
    boundary: [],
    conditions: [{
      leftHandSide: read('ProjectStatus', { projectId: param('projectId') }),
      predicate: 'equals', rightHandSide: null,
      rejection: 'Project already exists',
    }],
    publishes: [{
      name: 'ProjectAdded',
      parameters: { projectId: param('projectId'), requiredSeniorityLevel: param('requiredSeniorityLevel') },
    }],
  });
  addDefinition('command-definition', modelId, 'ArchiveProject', {
    feature: 'Projects',
    properties: [prop('projectId', 'ProjectId')],
    boundary: [],
    conditions: [{
      leftHandSide: read('ProjectStatus', { projectId: param('projectId') }),
      predicate: 'equals', rightHandSide: { enumMember: 'Active' },
      rejection: 'Project is not active',
    }],
    publishes: [{ name: 'ProjectArchived', parameters: { projectId: param('projectId') } }],
  });
  addDefinition('command-definition', modelId, 'RegisterDeveloper', {
    feature: 'Developers',
    properties: [
      prop('developerId', 'DeveloperId'), prop('seniorityLevel', 'integer'), prop('availableHoursPerWeek', 'integer'),
    ],
    boundary: [],
    conditions: [{
      leftHandSide: read('DeveloperExists', { developerId: param('developerId') }),
      predicate: 'isFalse',
      rejection: 'Developer is already registered',
    }],
    publishes: [{
      name: 'DeveloperRegistered',
      parameters: {
        developerId: param('developerId'), seniorityLevel: param('seniorityLevel'),
        availableHoursPerWeek: param('availableHoursPerWeek'),
      },
    }],
  });
  addDefinition('command-definition', modelId, 'AllocateHours', {
    feature: 'Projects',
    properties: [
      prop('projectId', 'ProjectId'), prop('developerId', 'DeveloperId'), prop('week', 'WeekNumber'),
      prop('requestedHours', 'integer'),
    ],
    boundary: [],
    conditions: [
      {
        leftHandSide: read('ProjectStatus', { projectId: param('projectId') }),
        predicate: 'equals', rightHandSide: { enumMember: 'Active' },
        rejection: 'Project is not active',
      },
      {
        leftHandSide: read('DeveloperExists', { developerId: param('developerId') }),
        predicate: 'isTrue',
        rejection: 'Developer is not registered',
      },
      {
        leftHandSide: read('DeveloperSeniorityLevel', { developerId: param('developerId') }),
        predicate: 'greaterThanOrEquals',
        rightHandSide: read('ProjectRequiredSeniorityLevel', { projectId: param('projectId') }),
        rejection: 'Developer seniority level too low',
      },
      {
        leftHandSide: read('DeveloperHasHoursForWeek', { developerId: param('developerId'), week: param('week') },
          { hours: param('requestedHours') }),
        predicate: 'isTrue',
        rejection: 'Developer does not have enough hours left that week',
      },
    ],
    publishes: [{
      name: 'HoursAllocated',
      parameters: {
        projectId: param('projectId'), developerId: param('developerId'), week: param('week'),
        requestedHours: param('requestedHours'),
      },
    }],
  });

  const added = { event: 'ProjectAdded', data: { projectId: 'p1', requiredSeniorityLevel: 2 } };
  const registered = { event: 'DeveloperRegistered', data: { developerId: 'd1', seniorityLevel: 3, availableHoursPerWeek: 40 } };
  const allocated = (week, requestedHours) =>
    ({ projectId: 'p1', developerId: 'd1', week, requestedHours });
  const scenario = (id, body) => addDefinition('scenario-definition', modelId, id, { command: 'AllocateHours', ...body });
  scenario('3b0f6c52-8d1e-4a7f-9c24-6e5d1a8b7f03', {
    name: 'allocates hours the developer has left that week',
    given: [added, registered, { event: 'HoursAllocated', data: allocated(12, 30) }],
    when: { arguments: allocated(12, 10) },
    then: { outcome: 'published', events: [{ type: 'HoursAllocated', data: allocated(12, 10) }] },
  });
  scenario('9e41d7a3-2c6b-4f58-b0e1-7a3c5d9f2e64', {
    name: 'refuses more hours than are left that week',
    given: [added, registered, { event: 'HoursAllocated', data: allocated(12, 30) }],
    when: { arguments: allocated(12, 11) },
    then: { outcome: 'rejected', events: [], rejection: 'Developer does not have enough hours left that week' },
  });
  scenario('c7a2e9f1-5b3d-4e86-a1f4-0d8b6c2e9a75', {
    name: 'another week starts from the whole weekly budget',
    given: [added, registered, { event: 'HoursAllocated', data: allocated(12, 40) }],
    when: { arguments: allocated(13, 40) },
    then: { outcome: 'published', events: [{ type: 'HoursAllocated', data: allocated(13, 40) }] },
  });
  scenario('5d8c1b46-e7f2-4a93-8c05-b2f6e4a1d387', {
    name: 'refuses a developer nobody registered',
    given: [added],
    when: { arguments: allocated(12, 10) },
    then: { outcome: 'rejected', events: [], rejection: 'Developer is not registered' },
  });
  seedProjectionScenario(modelId, '1f6e3a9d-4b72-4c08-9e5a-d3c7b8f2a160', {
    name: 'is the weekly budget less what that week has allocated',
    projection: 'DeveloperRemainingHoursForWeek',
    given: [registered, { event: 'HoursAllocated', data: allocated(12, 30) }],
    tags: {
      developerId: { tagType: 'DeveloperId', tagValue: 'd1' },
      week: { tagType: 'WeekNumber', tagValue: 12 },
    },
    then: 10,
  });
  seedProjectionScenario(modelId, '8a4d2f71-c6e9-4b30-a5d8-2e7f1c9b4a06', {
    name: 'covers a request no larger than what is left',
    projection: 'DeveloperHasHoursForWeek',
    given: [registered, { event: 'HoursAllocated', data: allocated(12, 30) }],
    tags: {
      developerId: { tagType: 'DeveloperId', tagValue: 'd1' },
      week: { tagType: 'WeekNumber', tagValue: 12 },
    },
    arguments: { hours: 11 },
    then: false,
  });
}

// The decision made at write time and recorded. `UpdateText` carries
// two guarded emissions – `TextChanged` while the new text differs
// from the published one, `TextRevertedToPublished` while it does not
// – so the log *says* a revert happened and the five-state status is
// fully declarative again: one plain handler per event type, no
// comparison anywhere downstream of the command. This is the decider
// pattern's shape (decide: state and command in, one of several event
// types out), which the DCB canon itself never exercises.
function seedGuardedAuthoring(modelId) {
  const prop = seedProp;
  const handler = seedHandler;
  const param = seedParam;
  const of = seedOf;
  const bind = seedBind;

  addDefinition('custom-type-definition', modelId, 'DocumentStatus', seedEnumType('DocumentStatus',
    ['NonExistent', 'Draft', 'Published', 'PendingChanges', 'Archived']));
  addDefinition('entity-definition', modelId, 'Document', { icon: '📄', properties: [] });

  const event = (name, properties) =>
    addDefinition('event-definition', modelId, name, { properties, tags: seedTags(modelId, properties) });

  event('DocumentAdded', [prop('id', 'DocumentId')]);
  event('TextChanged', [prop('docId', 'DocumentId'), prop('text', 'string')]);
  event('TextRevertedToPublished', [prop('docId', 'DocumentId'), prop('text', 'string')]);
  event('DocumentPublished', [prop('docId', 'DocumentId'), prop('text', 'string')]);
  event('DocumentArchived', [prop('docId', 'DocumentId')]);

  const projection = (name, body) =>
    addDefinition('projection-definition', modelId, name, body);

  // The five states, every transition a plain `set` – the split events
  // carry the distinction the scripted baseline computed.
  projection('DocumentStatus', seedPropertyProjection('Document', 'DocumentStatus',
    { enumMember: 'NonExistent' }, [
      handler('DocumentAdded', 'set', { enumMember: 'Draft' }),
      handler('TextChanged', 'set', { enumMember: 'PendingChanges' }),
      handler('TextRevertedToPublished', 'set', { enumMember: 'Published' }),
      handler('DocumentPublished', 'set', { enumMember: 'Published' }),
      handler('DocumentArchived', 'set', { enumMember: 'Archived' }),
    ]));
  projection('DocumentCurrentText', seedPropertyProjection('Document', 'string', null, [
    handler('DocumentAdded', 'set', ''),
    handler('TextChanged', 'set', { eventProperty: 'text' }),
    handler('TextRevertedToPublished', 'set', { eventProperty: 'text' }),
  ]));
  projection('DocumentPublishedText', seedPropertyProjection('Document', 'string', null, [
    handler('DocumentPublished', 'set', { eventProperty: 'text' }),
  ]));

  seedPatch('entity-definition', modelId, 'Document', (document) => {
    document.properties = [
      seedBindProp('status', 'DocumentStatus'),
      seedBindProp('currentText', 'DocumentCurrentText'),
      seedBindProp('publishedText', 'DocumentPublishedText'),
    ];
    document.lifecycle = 'status';
  });

  const command = (name, body) => addDefinition('command-definition', modelId, name, body);

  command('AddDocument', {
    feature: 'Document Authoring',
    icon: '⭐',
    properties: [prop('id', 'DocumentId')],
    boundary: [bind('document', 'Document', 'id')],
    conditions: [
      { leftHandSide: of('document', 'status'), predicate: 'equals', rightHandSide: { enumMember: 'NonExistent' },
        rejection: 'Document already exists' },
    ],
    publishes: [{ name: 'DocumentAdded', parameters: { id: param('id') } }],
  });

  command('UpdateText', {
    feature: 'Document Authoring',
    icon: '✏️',
    properties: [prop('docId', 'DocumentId'), prop('text', 'string')],
    boundary: [bind('document', 'Document', 'docId')],
    conditions: [
      { leftHandSide: of('document', 'status'), predicate: 'equalsAny',
        rightHandSide: [{ enumMember: 'Draft' }, { enumMember: 'Published' }, { enumMember: 'PendingChanges' }],
        rejection: 'Document is not editable' },
      { leftHandSide: of('document', 'currentText'), predicate: 'equals',
        rightHandSide: param('text'), negate: true,
        rejection: 'Text is unchanged' },
    ],
    // The guards are complements, so exactly one emission fires and
    // the accepted command always records which fact it was. Guard
    // reads count toward the query like any condition's, so the
    // comparison hides nothing from the derived DCB.
    publishes: [
      {
        name: 'TextChanged',
        when: [{ leftHandSide: param('text'), predicate: 'equals',
          rightHandSide: of('document', 'publishedText'), negate: true }],
        parameters: { docId: param('docId'), text: param('text') },
      },
      {
        name: 'TextRevertedToPublished',
        when: [{ leftHandSide: param('text'), predicate: 'equals',
          rightHandSide: of('document', 'publishedText') }],
        parameters: { docId: param('docId'), text: param('text') },
      },
    ],
  });

  command('PublishDocument', {
    feature: 'Document Authoring',
    icon: '💾',
    properties: [prop('docId', 'DocumentId')],
    boundary: [bind('document', 'Document', 'docId')],
    conditions: [
      // The stored status is trustworthy again, so the five-state
      // guard the scripted baseline used works verbatim.
      { leftHandSide: of('document', 'status'), predicate: 'equalsAny',
        rightHandSide: [{ enumMember: 'Draft' }, { enumMember: 'PendingChanges' }],
        rejection: 'Document cannot be published' },
    ],
    publishes: [{
      name: 'DocumentPublished',
      parameters: { docId: param('docId'), text: of('document', 'currentText') },
    }],
  });

  command('ArchiveDocument', {
    feature: 'Document Authoring',
    icon: '🗑️',
    properties: [prop('docId', 'DocumentId')],
    boundary: [bind('document', 'Document', 'docId')],
    conditions: [
      { leftHandSide: of('document', 'status'), predicate: 'equalsAny',
        rightHandSide: [{ enumMember: 'Draft' }, { enumMember: 'Published' }, { enumMember: 'PendingChanges' }],
        rejection: 'Document cannot be archived' },
    ],
    publishes: [{ name: 'DocumentArchived', parameters: { docId: param('docId') } }],
  });
}

// `experimental` marks the entries that use what the experimental flag
// keeps off the pages (entities, guards, derived projections…); the
// model list shows those only with the flag on. A test holds the mark
// to the built model's own `experimentalFeatures`.
const PREDEFINED_MODELS = [
  {
    name: 'Course Example (simple)',
    slug: 'course-simple',
    description: 'Courses and students, capacity and subscriptions. '
      + 'Identifiers are supplied by the caller and checked with a state condition.',
    build: (modelId) => { seedBase(modelId); seedWithoutEntities(modelId); },
  },
  {
    name: 'Course Example (with sequence)',
    slug: 'course-sequence',
    description: 'Adds a projection issuing c1, c2, c3… DefineCourse loses its identifier '
      + 'parameter and its conditions – reading the numbering guards it instead.',
    build: (modelId) => {
      seedBase(modelId); seedAddSequence(modelId); seedSequenceScenarios(modelId);
      seedWithoutEntities(modelId);
    },
  },
  {
    name: 'Course Example (with sequence and tenant)',
    slug: 'course-tenant',
    description: 'The numbering restarts per tenant – the case a tagless sequence could not '
      + 'express. Identity stays globally minted; what restarts is the number, so no two '
      + 'tenants ever write the same Course tag.',
    build: (modelId) => {
      seedBase(modelId); seedAddSequence(modelId); seedAddTenancy(modelId);
      seedWithoutEntities(modelId);
    },
  },
  {
    name: 'Course Example (with schedules)',
    slug: 'course-schedules',
    experimental: true,
    description: 'Adds hourly slots and the rule that a student is never in two courses at '
      + 'once, checked against live schedules so courses can be rescheduled under subscribers. '
      + 'Stated with entities – rescheduling excludes the course itself from its subscribers\' '
      + 'other courses, which only an entity read can say.',
    build: (modelId) => { seedBase(modelId); seedAddSequence(modelId); seedAddSchedules(modelId); },
  },
  {
    name: 'Dynamic Product Price (simple)',
    slug: 'pricing-simple',
    description: 'A cart ordered in one append. Each line names a product and the price shown '
      + 'to the customer; the boundary fans out over the lines and checks each price against '
      + 'the product it belongs to.',
    build: (modelId) => { seedProductPricing(modelId); seedWithoutEntities(modelId); },
  },
  {
    name: 'Content based decisions (scripted projection)',
    slug: 'content-decisions-scripted',
    experimental: true,
    description: 'The baseline: a document is Published or PendingChanges depending on whether '
      + 'its current text equals the last published one – a comparison no declared handler can '
      + 'express, so the status projection is scripted, keeps both texts as hidden state and '
      + 'exposes only the status.',
    build: (modelId) => { seedContentDecisionsScripted(modelId); seedWithoutEntities(modelId); },
  },
  {
    name: 'Content based decisions (boundary comparison)',
    slug: 'content-decisions-boundary',
    description: 'The comparison moved into the boundary: two plain text projections, '
      + 'DocumentPublished carrying the text it publishes, and a publish guard comparing them. '
      + 'Nothing is scripted; pending-ness is never stored, only visible where the texts differ.',
    build: (modelId) => { seedDocumentAuthoring(modelId); seedWithoutEntities(modelId); },
  },
  {
    name: 'Content based decisions (client-verified)',
    slug: 'content-decisions-verified',
    description: 'Publishing takes the text the caller saw and verifies it against the current '
      + 'one – the optimistic check OrderProducts applies to prices, made a domain rule. A stale '
      + 'echo is rejected; the published event carries the proven text.',
    build: (modelId) => { seedDocumentAuthoring(modelId); seedVerifiedPublish(modelId); seedWithoutEntities(modelId); },
  },
  {
    name: 'Content based decisions (guarded emissions)',
    slug: 'content-decisions-guarded',
    experimental: true,
    description: 'The decision made at write time and recorded: UpdateText emits TextChanged or '
      + 'TextRevertedToPublished under complementary guards, so the log says a revert happened '
      + 'and the five-state status folds from plain handlers again.',
    build: (modelId) => { seedGuardedAuthoring(modelId); seedWithoutEntities(modelId); },
  },
  {
    name: 'Content based decisions (derived projection)',
    slug: 'content-decisions-derived',
    description: 'The comparison declared once: hasPendingChanges is a derived projection – no '
      + 'handlers, one predicate over the two text projections – read by the publish guard, so '
      + 'a frontend could interpret the same declaration.',
    build: (modelId) => { seedDocumentAuthoring(modelId); seedDerivedPending(modelId); seedWithoutEntities(modelId); },
  },
  {
    name: 'Developer hours (derived computation)',
    slug: 'developer-hours',
    description: 'Developers register the hours they have per week, and allocations to '
      + 'projects are subtracted from that week\'s budget. The hours left are a derived '
      + 'projection – the weekly budget less that week\'s allocations – so allocating reads '
      + 'one value, and its boundary is still both queries.',
    build: (modelId) => { seedDeveloperHours(modelId); },
  },
  {
    name: 'Course Example (with entities)',
    slug: 'course-entities',
    experimental: true,
    description: 'The simple course example stated with entities and lifecycles – the '
      + 'experimental way of grouping projections under the thing they are about.',
    build: (modelId) => { seedBase(modelId); },
  },
];

function loadPredefinedModel(index) {
  const entry = PREDEFINED_MODELS[index];
  if (!entry) throw new DomainError('No such predefined model.');
  const modelId = createDcbModel(entry.name);
  entry.build(modelId);
  return modelId;
}
