// ============================================================
// DCB Playground – evaluation layer.
//
// `model.js` says what a definition *means*; this says what it *does*.
// Given a model, a log of events and a command with its arguments,
// it resolves the boundary, folds every projection the boundary reads,
// checks the conditions and returns either the events the command
// publishes or the rule that refused it.
//
// Nothing here touches the DOM, `localStorage` or the event log the
// playground stores its own history in. It takes a model object and
// a list of events and returns a value – which is what makes it usable
// from a scenario, from the sandbox, and eventually from a worker,
// without any of them knowing about the others.
//
// **A log or a read port.** Where a log goes in, a function may go in
// instead: `read(items) → events`, `items` one DCB query – a list of
// `{ types, tags }`, ORed – answered with the matching events in order.
// The playground passes its log; a runtime over a real event store
// passes the port. A command asks it once per round of reads, its
// folds' items merged (`evDecideThroughPort`), and returns the `query`
// it decided on – what the runtime's append condition has to cover.
// The port is synchronous, as everything here is; an asynchronous
// store is the caller's to block on.
//
// **Closures, not generated code.** Every handler compiles to a small
// JavaScript function `(state, event, args) => state`, one per handler
// per projection, built by walking the declarative operand tree and
// closing over it. A scripted handler compiles to a function of the
// *same signature* through `new Function`, so the fold engine never
// branches on whether a projection is scripted – the difference is
// gone by the time anything folds. What this deliberately avoids is
// emitting source: a generated fold would be a third copy of semantics
// that `deriveDcb` and validation already hold, and the only copy of
// the three you could not read, grep or breakpoint.
//
// **Scripts run on the main thread, unsandboxed – and unprompted.**
// The contract is the one the schema states: each body is an
// expression over `state`, `event`, `args` and `tags` returning the next
// state. A scripted projection folds wherever and whenever a declared
// one would, repaints included. What stands between an untrusted
// model and that is the import gate (nothing external loads without a
// confirmation – index.html), and what stands between a hanging
// script and a page that hangs again on every reload is safe mode:
// `setScriptsDisabled(true)` – flipped by the interface for a `?safe`
// URL, or after a load that hung – compiles every script handler to a
// thrower instead, so the model still loads and the script can be reached and fixed.
//
// **Failure has two kinds and they are not the same.** A command whose
// conditions do not hold is *rejected* – an ordinary, expected outcome
// this returns. A scenario that cannot be run at all – an event that no
// longer exists, an argument the command never got, a script that threw
// – is *broken*, and comes back as an `EvaluationError`. Real bugs in
// this file are neither: they propagate as ordinary exceptions, so a
// mistake here can never be mistaken for a modelling mistake.
// ============================================================

// ============================================================
// Errors.
// ============================================================

// Thrown when the inputs cannot be evaluated at all. Callers map this
// to the "broken" status; anything else escaping this file is a bug in
// it.
class EvaluationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EvaluationError';
  }
}

function fail(message) {
  throw new EvaluationError(message);
}

// What a thrown thing says. A script may throw anything at all –
// `throw null` included – and reading `.message` off that must not be
// the second, unexplained failure.
function evErrorText(error) {
  return String((error && error.message) || error);
}

// ============================================================
// Values.
//
// One normal form, applied at every edge. A status is stored as
// `{enumMember: 'Existent'}` in initial values, in handler operands and
// in conditions alike; carrying that wrapper into the fold would mean
// every predicate unwrapping it again, so it is unwrapped once, here,
// and a status is a string everywhere downstream. The unwrapping goes
// all the way down – a list of statuses, a record holding one – and
// hands a value back untouched when there was nothing to unwrap.
// ============================================================

function evNormalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value.enumMember !== undefined) return value.enumMember;
  if (Array.isArray(value)) {
    let out = value;
    value.forEach((item, i) => {
      const normal = evNormalize(item);
      if (normal !== item) {
        if (out === value) out = value.slice();
        out[i] = normal;
      }
    });
    return out;
  }
  let out = value;
  for (const key of Object.keys(value)) {
    const normal = evNormalize(value[key]);
    if (normal !== value[key]) {
      if (out === value) out = { ...value };
      out[key] = normal;
    }
  }
  return out;
}

// A value held under a key the object itself has – a definition in a
// collection, a field of a payload, an argument supplied. Never what
// Object inherits under `constructor` or `toString`; see emptyCollection
// (model.js) for the projection's side of the same rule.
function evOwn(object, key) {
  return object !== null && typeof object === 'object' && Object.hasOwn(object, key) ? object[key] : undefined;
}

function evDeepEqual(a, b) {
  const x = evNormalize(a);
  const y = evNormalize(b);
  if (x === y) return true;
  if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') return false;
  // Canonicalised first: two records carrying the same fields are the
  // same value no matter what order they were authored in – the rule
  // evSameOutcome already applies to scenario comparison.
  return JSON.stringify(evCanonical(x)) === JSON.stringify(evCanonical(y));
}

// The successor of a value, for the operand that mints identifiers.
// Integers step by one; a string ending in digits steps its trailing
// run and keeps the width it was written with, so `c1` becomes `c2` and
// `inv-009` becomes `inv-010`. Anything else has no successor, which
// validation already refuses – reaching it here means a body was
// written past the validator.
function evSuccessor(value) {
  const v = evNormalize(value);
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    return fail(
      'A composite identifier has no successor – auto-incrementing makes sense for a single ' +
      'value, and a composite is a record of them.'
    );
  }
  if (typeof v === 'number') return v + 1;
  if (typeof v === 'string') {
    const match = /^(.*?)(\d+)$/.exec(v);
    if (match) {
      // BigInt: past 2^53 a Number rounds, and the successor of
      // inv-12345678901234567891 came out as …7000.
      const next = String(BigInt(match[2]) + 1n);
      return match[1] + next.padStart(match[2].length, '0');
    }
  }
  return fail(`No successor is defined for ${JSON.stringify(v)}.`);
}

function evIsEmpty(value) {
  const v = evNormalize(value);
  if (v === null || v === undefined) return true;
  if (Array.isArray(v) || typeof v === 'string') return v.length === 0;
  return false;
}

function evAsList(value) {
  const v = evNormalize(value);
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function evAsNumber(value, where) {
  const v = evNormalize(value);
  if (typeof v !== 'number') {
    fail(`${where} needs a number but got ${JSON.stringify(v)}.`);
  }
  return v;
}

// ============================================================
// Tags.
//
// Which events belong to an instance. An event carries the tags it
// lists (`eventTagLeaves`, model.js): a property typed with a tag type,
// or one field of a record, one tag per element when the property is a
// list. That is the same walk the derived DCB reads, so the query a
// boundary displays and the query a fold actually runs come from one
// place and cannot drift apart.
// ============================================================

function tagsOfEvent(model, eventName, data) {
  const definition = evOwn(model['event-definitions'], eventName);
  if (!definition) return [];
  const tags = new Set();
  for (const leaf of eventTagLeaves(model, definition)) {
    const held = evOwn(data, leaf.property);
    const elements = leaf.isList ? evAsList(held) : [held];
    for (const element of elements) {
      if (element === null || element === undefined) continue;
      const value = leaf.field === null ? element : (element || {})[leaf.field];
      if (value === null || value === undefined) continue;
      tags.add(renderTag(identifierTypeOf(model, leaf.identifierType), String(value)));
    }
  }
  return [...tags];
}

// The tags an event carries, worked out once per model and event. A
// fold reads the whole log, and a fan-out folds once per instance, so
// working them out per read made a command over a few thousand events
// cost seconds. Both keys are stable: the model is the projection's
// shared object for its revision, and an event in a log is never
// changed.
const evTagSets = new WeakMap();

function evTagSetOf(model, event) {
  let perModel = evTagSets.get(model);
  if (!perModel) evTagSets.set(model, perModel = new WeakMap());
  let set = perModel.get(event);
  if (!set) perModel.set(event, set = new Set(tagsOfEvent(model, event.type, event.data)));
  return set;
}

function evMatchesTags(model, event, tags) {
  if (!tags.length) return true;
  const carried = evTagSetOf(model, event);
  return tags.every((tag) => carried.has(tag));
}

// Which of a log's events carry a tag, as positions – so a read starts
// from the events carrying its rarest tag instead of scanning the log.
// Kept per model and log array, and rebuilt when the log is no longer
// the one it was built over – longer, or ending elsewhere (the
// sandbox's log is appended to in place).
const evTagIndexes = new WeakMap();

function evTagIndex(model, events) {
  let perModel = evTagIndexes.get(model);
  if (!perModel) evTagIndexes.set(model, perModel = new WeakMap());
  let entry = perModel.get(events);
  const last = events[events.length - 1];
  if (!entry || entry.length !== events.length || entry.last !== last) {
    const index = new Map();
    events.forEach((event, at) => {
      for (const tag of evTagSetOf(model, event)) {
        if (!index.has(tag)) index.set(tag, []);
        index.get(tag).push(at);
      }
    });
    perModel.set(events, entry = { length: events.length, last, index });
  }
  return entry.index;
}

// The events a fold reads: those carrying every one of `tags`, of the
// `types` it handles. `events` is a log – an array – or a *read port*
// (see the header), asked here with the one item this fold needs.
// A command does not ask fold by fold: `evDecideThroughPort` hands its
// folds a port of its own that answers from what it fetched per round.
// A log keeps the other types in: the fold skips what it has no
// handler for, and filtering here would cost a pass for nothing.
function evSelectEvents(model, events, types, tags) {
  if (typeof events !== 'function') return evEventsTagged(model, events, tags);
  // A fold that handles nothing reads nothing – and an empty `types`
  // would mean "any type" to a store.
  if (!types.length) return [];
  return events([{ types: [...types], tags: [...tags] }]) || [];
}

// The events carrying every one of `tags`, in log order.
function evEventsTagged(model, events, tags) {
  if (!tags.length) return events;
  const index = evTagIndex(model, events);
  let rarest = null;
  for (const tag of tags) {
    const at = index.get(tag) || [];
    if (!rarest || at.length < rarest.length) rarest = at;
  }
  return rarest.map((at) => events[at]).filter((event) => evMatchesTags(model, event, tags));
}

// ============================================================
// Compiling a fold.
//
// A projection – an entity property or a standalone one – becomes three
// things: the state it starts from, a step function per event type, and
// the reading a condition sees. Declared and scripted projections
// produce the same three, which is the point: below this line nothing
// knows the difference.
// ============================================================

// A handler operand, as a function of the state and the event it is
// folding. `event-property` is only available to a handler – a
// condition gets a different operand set.
function evCompileHandlerOperand(operand) {
  switch (operandSource(operand)) {
    case 'event-property':
      return (state, event) => evOwn(event.data, operand.eventProperty);
    case 'current-value':
      return (state) => state;
    case 'successor': {
      const inner = evCompileHandlerOperand(operand.successor);
      return (state, event) => evSuccessor(inner(state, event));
    }
    case 'enum-member':
      return () => operand.enumMember;
    default:
      return () => evNormalize(operand);
  }
}

// Safe mode. Flipped by the interface for a `?safe` URL or after a
// load that hung (and by tests directly): every script handler compiles to a thrower, so a model
// whose script hangs the tab on load can still be opened, edited and
// repaired. Declared handlers are untouched – this is a way back in,
// not a mode the app runs in.
let evScriptsDisabled = false;
function setScriptsDisabled(disabled) {
  evScriptsDisabled = !!disabled;
  evCompiled = new WeakMap();
}

// What a script is handed of an event: a deep-frozen copy, made once
// per event. The log is shared by every fold, read and repaint, so an
// event a script changed in place would change what every later fold
// sees; a copy keeps the log as it was, and freezing makes the attempt
// an error the author sees instead of a silent no-op.
const evFrozenEvents = new WeakMap();

function evFrozenEvent(event) {
  let frozen = evFrozenEvents.get(event);
  if (!frozen) evFrozenEvents.set(event, frozen = evDeepFreeze(deepClone(event)));
  return frozen;
}

function evDeepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) evDeepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

// One handler, as `(state, event, args, tags) => nextState`. `args` are
// the read's argument values, `tags` the values it is tagged by, keyed
// by the names the projection declares (`tags.courseId`) – a script
// sees what it is read by, but cannot change it.
//
// Code runs only on a projection that declares a `script`: that is
// what the import gate (`envelopeHasScript`) asks about, so it is the
// one thing that may decide whether authored JavaScript runs. A `code`
// left on an ordinary handler is inert here – the validator reports it.
function evCompileHandler(handler, label, scripted) {
  if (scripted && handler.code !== undefined) {
    if (evScriptsDisabled) {
      return () => fail(
        `The script for "${handler.event}" on ${label} did not run: scripts are off in safe mode. ` +
        'Remove "?safe" from the address to run them.'
      );
    }
    // The contract the schema states, and the only place in this file
    // where authored JavaScript runs. In strict mode, so that writing to
    // the frozen event it is handed throws rather than doing nothing.
    let body;
    try {
      body = new Function('state', 'event', 'args', 'tags', `'use strict'; return (${handler.code}\n);`);
    } catch (error) {
      fail(`The script for "${handler.event}" on ${label} does not parse: ${evErrorText(error)}`);
    }
    return (state, event, args, tags) => {
      try {
        return body(state, evFrozenEvent(event), args, tags);
      } catch (error) {
        return fail(`The script for "${handler.event}" on ${label} threw: ${evErrorText(error)}`);
      }
    };
  }

  const valueOf = evCompileHandlerOperand(handler.value);
  const where = `The handler for "${handler.event}" on ${label}`;

  switch (handler.operation) {
    case 'set':
      return (state, event) => evNormalize(valueOf(state, event));
    case 'increment':
      return (state, event) =>
        evAsNumber(state, where) + evAsNumber(valueOf(state, event), where);
    case 'decrement':
      return (state, event) =>
        evAsNumber(state, where) - evAsNumber(valueOf(state, event), where);
    case 'append':
      return (state, event) => {
        const value = evNormalize(valueOf(state, event));
        // Appending a list appends its elements: a handler that reads a
        // list-typed event property is adding those items, not adding
        // one item that happens to be a list.
        return [...evAsList(state), ...(Array.isArray(value) ? value : [value])];
      };
    case 'remove':
      return (state, event) => {
        const value = evNormalize(valueOf(state, event));
        const out = [...evAsList(state)];
        // The first match only. Where duplicates cannot occur this is
        // indistinguishable from removing every match; where they can,
        // one event undoing one earlier event is what the operation
        // means.
        const at = out.findIndex((element) => evDeepEqual(element, value));
        if (at >= 0) out.splice(at, 1);
        return out;
      };
    default:
      return fail(`${where} has no operation this can run.`);
  }
}

// A projection or entity property, compiled once and folded many times –
// once per model and target, so a fan-out reading the same projection
// two hundred times compiles it (scripts included) once. Safe mode
// changes what a script compiles to, so switching it starts afresh.
let evCompiled = new WeakMap();

function evCompileTarget(model, target, label) {
  let perModel = evCompiled.get(model);
  if (!perModel) evCompiled.set(model, perModel = new WeakMap());
  let perTarget = perModel.get(target);
  if (!perTarget) perModel.set(target, perTarget = new Map());
  if (!perTarget.has(label)) perTarget.set(label, evCompileTargetAfresh(model, target, label));
  return perTarget.get(label);
}

function evCompileTargetAfresh(model, target, label) {
  const script = scriptOf(target);
  const steps = new Map();
  for (const handler of target.handlers || []) {
    if (!handler || !handler.event) continue;
    steps.set(handler.event, evCompileHandler(handler, label, !!script));
  }

  const initial = script
    ? deepClone(script.initialState ?? null)
    : (target.initialValue === undefined
      ? evNormalize(defaultInitialValue(model, target))
      : evNormalize(target.initialValue));

  // What a condition reads. A script may keep bookkeeping the boundary
  // never sees; `exposes` names the one field that reaches it.
  const expose = script && script.exposes !== undefined
    ? (state) => (state === null || state === undefined ? state : state[script.exposes])
    : (state) => state;

  const run = (events, args, tags) => {
    // A script may change its state in place; the initial one is shared
    // by every fold of this compiled target, so each starts from a copy.
    let state = script ? deepClone(initial) : initial;
    for (const event of events) {
      const step = steps.get(event.type);
      if (step) state = step(state, event, args || {}, tags || {});
    }
    return state;
  };

  return {
    types: [...steps.keys()],
    fold: (events, args, tags) => evNormalize(expose(run(events, args, tags))),
    // The same fold read before `exposes` trims it: the whole state,
    // bookkeeping included. Hidden from conditions – a statement about
    // the boundary, not about the person watching the script work.
    foldState: (events, args, tags) => evNormalize(run(events, args, tags)),
  };
}

// ============================================================
// Folding.
//
// There is one fold, `foldProjection`, and one way into it: a *read* –
// `{ tags: { courseId: 'c1' }, args }`, a value for each tag the
// projection declares (8.0), keyed by its name, and the arguments it
// takes. The declared type of each tag is its key, so the
// projection and the read together say which events it folds. Reading
// an entity's property is the same read, its one tag the instance's
// identifier: nothing left for two paths to disagree about.
//
// `foldProjectionState` is not a second fold but a second reading of
// the same one: the state before `exposes` trims it to the exposed
// field. Without `exposes` the two answers coincide.
//
// It replays from the start of the log every time. That is the same
// choice the playground already makes for its own state, and it stays
// until something measured says otherwise – an incremental fold only
// helps scrubbing forwards, and pays for it with a snapshot regime that
// a replay does not need.
// ============================================================

// One property of one entity instance – the projection it binds, read
// by its one tag, the instance's identifier.
function foldEntityProperty(model, events, entityName, propertyName, instanceId, args) {
  const entity = evOwn(model['entity-definitions'], entityName);
  if (!entity) fail(`This model has no entity "${entityName}".`);
  const binding = (entity.properties || []).find((p) => p && p.name === propertyName);
  if (!binding) fail(`"${entityName}" has no property "${propertyName}".`);
  const projection = evOwn(model['projection-definitions'], binding.projection);
  if (!projection) {
    fail(`"${entityName}.${propertyName}" binds projection "${binding.projection}", which this model no longer defines.`);
  }
  const [tag, ...more] = projectionTagParams(projection);
  if (!tag || more.length || tag.tagType !== idTypeOf(model, entityName)) {
    fail(`"${entityName}.${propertyName}" binds "${binding.projection}", which is not tagged by one ${idTypeOf(model, entityName)}.`);
  }
  return foldProjection(model, events, binding.projection, {
    tags: { [tag.name]: instanceId },
    args: args || {},
  });
}

// The value a read gives one declared tag (`{name, tagType}`), as the
// leaves it renders to – a scalar tag type renders one tag, a record
// one per tag-marked field – paired with the type each leaf is keyed by.
function evReadTagLeaves(model, projectionName, tag, value) {
  const normalized = evNormalize(value);
  if (value === undefined) {
    fail(`Projection "${projectionName}" was read without a value for its "${tag.name}" tag.`);
  }
  // null has no tag – "Type:null" would be one phantom read every unset
  // value shares.
  if (normalized === null) {
    fail(`Projection "${projectionName}" was read tagged by no value (null) for its "${tag.name}" tag.`);
  }
  const leaves = idLeavesOfType(model, tag.tagType);
  if (!leaves.length) fail(`Projection "${projectionName}"'s "${tag.name}" tag is a ${tag.tagType}, which is no tag type.`);
  return leaves.map((leaf) => ({
    type: leaf.identifierType,
    value: leaf.field === null ? normalized : (normalized || {})[leaf.field],
  }));
}

// The tags a read's query carries, rendered. Extracted so the interface
// can *say* what a fold will read – a watched projection's query, with
// the actual values in it – without running the fold to find out. A
// derived projection's operands are read by the tags it passes them, so
// its query is theirs.
function projectionQueryTags(model, projectionName, read) {
  const projection = evOwn(model['projection-definitions'], projectionName);
  if (!projection) fail(`This model has no projection "${projectionName}".`);
  const held = (read && read.tags) || {};
  return [...new Set(projectionTagParams(projection)
    .flatMap((tag) => evReadTagLeaves(model, projectionName, tag, evOwn(held, tag.name)))
    .map((leaf) => renderTag(identifierTypeOf(model, leaf.type), String(leaf.value))))];
}

// What a script sees of the tags it is read by: one value per declared
// tag, by name – `tags.courseId`.
function evScriptTags(model, projectionName, read) {
  const out = {};
  const held = (read && read.tags) || {};
  for (const tag of projectionTagParams(evOwn(model['projection-definitions'], projectionName))) {
    out[tag.name] = evNormalize(evOwn(held, tag.name));
  }
  return out;
}

// Events reach a fold carrying an explicit key for every optional
// property their definition declares – null when unset. One spelling
// of "no value" downstream: a Given step may omit the key, an emission
// writes the null out, and a handler or script reads the same thing
// either way. Optional lists are exempt (they evaluate as plain
// lists; the advisories point the combination out).
function evWithExplicitOptionals(model, event) {
  const definition = evOwn(model['event-definitions'], event.type);
  let data = event.data;
  for (const property of (definition || {}).properties || []) {
    if (!property.isOptional || property.isList) continue;
    if (evOwn(data, property.name) !== undefined) continue;
    data = { ...(data || {}), [property.name]: null };
  }
  return data === event.data ? event : { ...event, data };
}

function foldProjection(model, events, projectionName, read, seen = []) {
  const projection = evOwn(model['projection-definitions'], projectionName);
  if (projection && derivedOf(projection)) {
    return evDeriveProjection(model, events, projectionName, read, seen);
  }
  const { compiled, selected, args, tags } = evProjectionFold(model, events, projectionName, read);
  return compiled.fold(selected, args, tags);
}

function foldProjectionState(model, events, projectionName, read) {
  const projection = evOwn(model['projection-definitions'], projectionName);
  if (projection && derivedOf(projection)) {
    // A derived projection keeps no bookkeeping: its whole state is
    // the one value its predicate or computation yields.
    return evDeriveProjection(model, events, projectionName, read);
  }
  const { compiled, selected, args, tags } = evProjectionFold(model, events, projectionName, read);
  return compiled.foldState(selected, args, tags);
}

// A derived projection is not folded but computed: each operand that
// reads a projection folds it – by the tags and arguments the operand
// gives it, each a literal or one of this read's own parameters
// (`{parameterName}`, a tag or an argument) – a side that names a
// parameter is the value the read gave it, and the predicate decides,
// or the operator computes. `seen` is the cycle guard – a value derived through itself
// has nowhere to start, and the advisory said so before this error does.
function evDeriveProjection(model, events, projectionName, read, seen = []) {
  if (seen.includes(projectionName)) {
    fail(`Projection "${projectionName}" derives from itself – a cycle has no value to start from.`);
  }
  const projection = evOwn(model['projection-definitions'], projectionName);
  const derived = derivedOf(projection);

  // One of this projection's own parameters, as the read gave it – a
  // tag or an argument, by name.
  const parameter = (value) => {
    const name = value.parameterName;
    const given = evOwn((read && read.tags) || {}, name) !== undefined
      ? evOwn(read.tags, name) : evOwn((read && read.args) || {}, name);
    if (given === undefined) {
      fail(`Projection "${projectionName}" was read without a value for "${name}".`);
    }
    return evNormalize(given);
  };
  const literal = (value) => (operandSource(value) === 'parameter' ? parameter(value)
    : operandSource(value) === 'tag-literal' ? value.tagValue : evNormalize(value));
  const readOperand = (operand) => {
    if (operandSource(operand) === 'parameter') return parameter(operand);
    if (operandSource(operand) !== 'projection-read') return evNormalize(operand);
    const args = {};
    for (const [name, argument] of Object.entries(operand.arguments || {})) args[name] = literal(argument);
    const tags = {};
    for (const [name, value] of readTagEntries(operand)) tags[name] = literal(value);
    return foldProjection(model, events, operand.projection, { tags, args }, [...seen, projectionName]);
  };

  const left = readOperand(derived.leftHandSide);
  const right = readOperand(derived.rightHandSide);
  if (derivedComputes(derived)) return evApplyOperator(projectionName, derived, left, right);
  return evApplyPredicate(derived, left, right);
}

// One computation over two numbers. A null side yields null – "not
// known yet" stays unknown rather than counting as zero – and a side
// that is no number at all is an error the advisory named first.
function evApplyOperator(projectionName, derived, left, right) {
  const l = evNormalize(left);
  const r = evNormalize(right);
  if (l === null || l === undefined || r === null || r === undefined) return null;
  if (typeof l !== 'number' || typeof r !== 'number') {
    return fail(`Projection "${projectionName}" computes "${derivedText(derived)}" over `
      + `${JSON.stringify(typeof l !== 'number' ? l : r)}, which is no number.`);
  }
  switch (derived.operator) {
    case 'add': return l + r;
    case 'subtract': return l - r;
    case 'multiply': return l * r;
    case 'min': return Math.min(l, r);
    case 'max': return Math.max(l, r);
    default:
      return fail(`"${derived.operator}" is not an operator this can compute.`);
  }
}

function evProjectionFold(model, events, projectionName, read) {
  const projection = evOwn(model['projection-definitions'], projectionName);
  if (!projection) fail(`This model has no projection "${projectionName}".`);

  const queryTags = projectionQueryTags(model, projectionName, read);
  const compiled = evCompileTarget(model, projection, `projection "${projectionName}"`);
  const selected = evSelectEvents(model, events, compiled.types, queryTags)
    .map((event) => evWithExplicitOptionals(model, event));
  return {
    compiled,
    selected,
    args: (read && read.args) || {},
    tags: evScriptTags(model, projectionName, read),
  };
}

// ============================================================
// Command scope.
//
// What a command's operands can see: its own arguments, and whatever
// the boundary has bound so far. An entity binding may hold one
// instance or many – the boundary is resolved in rounds, and a later
// round may read an earlier one, so this grows as the rounds run.
// ============================================================

function evEntityInstance(model, events, entityName, id, args) {
  const cache = new Map();
  return {
    id,
    // Exposed so the boundary can be reported afterwards as the set of
    // properties the decision actually depended on.
    cache,
    read(propertyName) {
      if (!cache.has(propertyName)) {
        cache.set(propertyName, foldEntityProperty(model, events, entityName, propertyName, id, args));
      }
      return cache.get(propertyName);
    },
  };
}

// An operand as a command reads it: whole, with no iteration index
// applied. Reading a property off a plural alias yields one value per
// instance, and a list read that way flattens – a list of lists is not
// a shape anything downstream can use.
function evReadOperand(operand, scope) {
  // The one array operand – `equalsAny`'s literal list – reads as its
  // entries, each normalized like any other literal.
  if (Array.isArray(operand)) return operand.map(evNormalize);
  switch (operandSource(operand)) {
    case 'parameter': {
      const held = evOwn(scope.args, operand.parameterName);
      if (held === undefined) {
        fail(`This command was given no value for "${operand.parameterName}".`);
      }
      if (!operand.property) return evNormalize(held);
      const value = evNormalize(held);
      return Array.isArray(value)
        ? value.map((element) => evOwn(element, operand.property))
        : evOwn(value, operand.property);
    }
    case 'alias-property': {
      const binding = scope.bound[operand.alias];
      if (!binding) fail(`Nothing in this boundary is bound as "${operand.alias}".`);
      if (binding.kind === 'projection') {
        if (operand.property) {
          fail(`"${operand.alias}" reads a projection, which holds one value and has no properties.`);
        }
        // Fanned out, it is one value per element; read whole, a list
        // of lists flattens, as a fanned entity property's does.
        if (binding.fanned) return binding.value.some(Array.isArray) ? binding.value.flat() : binding.value;
        return binding.value;
      }
      if (!operand.property) {
        fail(`"${operand.alias}" is an entity, so reading it needs a property.`);
      }
      if (!binding.fanned) {
        // An absent optional binding bound nothing; reading it yields
        // null – the one spelling of "no value" – rather than erroring.
        if (!binding.instances.length) return null;
        return binding.instances[0].read(operand.property);
      }
      const each = binding.instances.map((instance) => instance.read(operand.property));
      return each.some(Array.isArray) ? each.flat() : each;
    }
    case 'enum-member':
      return operand.enumMember;
    // An inline read is folded where it is first needed and once per
    // spelling – the same read written in two rules is one query – and
    // reported beside the aliases, under how it reads.
    case 'projection-read': {
      const key = JSON.stringify(canonicalOperand(operand));
      if (!scope.inline.has(key)) {
        scope.inline.set(key, evProjectionRead(scope.model, scope.events, scope.body, operand, scope,
          `"${operandText(operand)}"`));
      }
      return scope.inline.get(key).value;
    }
    default:
      return evNormalize(operand);
  }
}

// ============================================================
// The boundary.
// ============================================================

// Where each element of a fan came from, as an index into the list the
// fan is rooted in – what a zipped parameter is read at. Fanned from a
// list, an element is its own index. Fanned from an alias that is
// itself fanned out (`Course(each student.courses)`), it is the index
// the instance it was read off came from: every course of the first
// student pairs with the first element the students were fanned from,
// however many courses each holds and whichever students `excluding`
// left out. The values are flattened the way reading the alias whole
// flattens them, a list per instance into its elements.
function evFanSourceIndexes(operand, scope, count) {
  const parent = operandSource(operand) === 'alias-property' ? scope.bound[operand.alias] : null;
  if (parent && parent.fanned && parent.instances) {
    const out = [];
    parent.instances.forEach((instance, j) => {
      const value = parent.kind === 'projection' ? instance.value : instance.read(operand.property);
      const root = parent.sourceIndexes && parent.sourceIndexes[j] !== undefined ? parent.sourceIndexes[j] : j;
      const many = Array.isArray(value) ? value.length : 1;
      for (let k = 0; k < many; k++) out.push(root);
    });
    if (out.length === count) return out;
  }
  return Array.from({ length: count }, (_, i) => i);
}

// One projection read – an alias's or an inline one – resolved in the
// command's scope: a value for each tag the projection declares, which
// has to be of the declared type (the tag's key – the advisory said so
// first), the arguments it takes, and the value folded from them.
// The tags and arguments are kept beside the value because they are
// what makes it reproducible: the value alone says what was read, and
// they say how, which is the half a reader needs to go and look at it.
// `tags` is reported as `[{name, type, value}]`, in declaration order.
//
// A read fanned out (`ProductExists(each items.productId)`) is made once
// per element of that list – `instances`, each with its tags and value,
// in the list's order so a zipped parameter pairs by index – and `value`
// is then every one of them, in order.
function evProjectionRead(model, events, body, read, scope, label) {
  const projection = evOwn(model['projection-definitions'], read.projection);
  if (!projection) fail(`${label} reads "${read.projection}", which this model does not define.`);
  const held = (read.tags && typeof read.tags === 'object' && !Array.isArray(read.tags)) ? read.tags : {};
  let fanned = null;
  const tags = projectionTagParams(projection).map((tag) => {
    const operand = evOwn(held, tag.name);
    if (operand === undefined) fail(`${label} gives no value for ${read.projection}'s "${tag.name}" tag.`);
    const resolved = tagOperandType(model, body, operand);
    if (resolved && resolved.propertyType !== tag.tagType) {
      fail(`${label} is tagged by ${operandText(operand)}, ${typeArticle(resolved.propertyType)} ` +
        `${resolved.propertyType} – but ${read.projection}'s "${tag.name}" tag is ` +
        `${typeArticle(tag.tagType)} ${tag.tagType}.`);
    }
    if (operandSource(operand) === 'each') {
      const values = evAsList(evReadOperand(operand.each, scope));
      fanned = { name: tag.name, values, roots: evFanSourceIndexes(operand.each, scope, values.length) };
      return { name: tag.name, type: tag.tagType, value: null };
    }
    const value = operandSource(operand) === 'tag-literal' ? operand.tagValue : evReadOperand(operand, scope);
    if ((resolved && resolved.isList) || Array.isArray(value)) {
      fail(`${label} is tagged by ${operandText(operand)}, a list – its "${tag.name}" tag takes one value.`);
    }
    return { name: tag.name, type: tag.tagType, value };
  });
  const args = {};
  for (const [name, operand] of Object.entries(read.arguments || {})) {
    args[name] = evReadOperand(operand, scope);
  }
  const byName = (list) => Object.fromEntries(list.map((tag) => [tag.name, tag.value]));
  if (!fanned) {
    return {
      kind: 'projection',
      projection: read.projection,
      tags,
      arguments: args,
      value: foldProjection(model, events, read.projection, { tags: byName(tags), args }),
    };
  }
  const instances = fanned.values.map((element) => {
    const own = tags.map((tag) => (tag.name === fanned.name ? { ...tag, value: element } : tag));
    return { tags: own, value: foldProjection(model, events, read.projection, { tags: byName(own), args }) };
  });
  return {
    kind: 'projection',
    projection: read.projection,
    fanned: true,
    tags,
    arguments: args,
    instances,
    sourceIndexes: fanned.roots,
    value: instances.map((instance) => instance.value),
  };
}

function evResolveBinding(model, events, body, binding, scope) {
  if (binding.projection) {
    scope.bound[binding.alias] = evProjectionRead(model, events, body, binding, scope, `Binding "${binding.alias}"`);
    return;
  }

  if (!evOwn(model['entity-definitions'], binding.entity)) {
    fail(`Binding "${binding.alias}" reads entity "${binding.entity}", which this model does not define.`);
  }

  const values = {};
  for (const [name, operand] of Object.entries(binding.arguments || {})) {
    values[name] = evReadOperand(operand, scope);
  }

  const fanned = isFannedOut(model, body, binding);
  const held = evReadOperand(entityIdOperand(binding), scope);
  // Many instances are read where the binding says so, `each`; a list
  // read as one identifier has no one instance to be.
  if (!fanned && Array.isArray(evNormalize(held))) {
    fail(`Binding "${binding.alias}" reads ${binding.entity} by ${operandText(binding.id)}, which holds ` +
      `many – ${binding.entity}(each ${operandText(binding.id)}) reads one instance per element.`);
  }
  // A null identifier binds nothing. Folding at "Entity:null" would
  // invent one phantom instance every unset value shares. A binding
  // flagged `isOptional` declares the absence expected and binds zero
  // instances instead: conditions over it hold vacuously and reading a
  // property of it yields null. Without the flag the error stays – an
  // unset identifier nobody declared possible is an accident, and this
  // is the error the optional-parameter advisory promises.
  if (!fanned && evNormalize(held) === null) {
    if (binding.isOptional) {
      scope.bound[binding.alias] = {
        kind: 'entity',
        entity: binding.entity,
        fanned: false,
        absent: true,
        sourceIndexes: [],
        instances: [],
      };
      return;
    }
    fail(`Binding "${binding.alias}" has no instance to read: ${operandText(binding.id)} is unset (null).`);
  }
  // Order is preserved and duplicates are kept: a binding fanned from a
  // list parameter is read at the same index as that parameter, and
  // collapsing it would silently pair a line of the cart with the wrong
  // one's price.
  const ids = fanned ? evAsList(held) : [held];
  const roots = fanned ? evFanSourceIndexes(entityIdOperand(binding), scope, ids.length) : [0];

  // Each instance remembers the index it was fanned out from, because
  // a zipped parameter is read at *that* index – `excluding` compacts
  // the instance list, but it must not shift the pairing against the
  // list the fan came from.
  let entries = ids.map((id, i) => ({ id, sourceIndex: roots[i] }));
  if (binding.excluding !== undefined) {
    const excludedHeld = evReadOperand(binding.excluding, scope);
    // Same rule as the identifier above: null is not "exclude
    // nothing", it is a value that never got supplied.
    if (evNormalize(excludedHeld) === null) {
      fail(`Binding "${binding.alias}" excludes ${operandText(binding.excluding)}, which is unset (null).`);
    }
    const excluded = evAsList(excludedHeld);
    entries = entries.filter(({ id }) => !excluded.some((other) => evDeepEqual(id, other)));
  }

  scope.bound[binding.alias] = {
    kind: 'entity',
    entity: binding.entity,
    fanned,
    sourceIndexes: entries.map((entry) => entry.sourceIndex),
    instances: entries.map(({ id }) => evEntityInstance(model, events, binding.entity, evNormalize(id), values)),
  };
}

// ============================================================
// Conditions.
//
// A condition over a plural alias holds when it holds for every
// instance. Where a list parameter is read beside an alias fanned out
// from that very list, the two are read at the same index – `zipped`,
// in the language `model.js` uses for it – so each product is checked
// against the price submitted for that product.
// ============================================================

function evApplyPredicate(condition, left, right) {
  const l = evNormalize(left);
  const r = evNormalize(right);
  let held;

  switch (condition.predicate) {
    case 'isEmpty': held = evIsEmpty(l); break;
    case 'isNotEmpty': held = !evIsEmpty(l); break;
    case 'isTrue': held = l === true; break;
    case 'isFalse': held = l === false; break;
    case 'equals': held = evDeepEqual(l, r); break;
    case 'equalsAny':
      // Membership is repeated equality – a null left is simply not a
      // member unless listed – and an empty list holds for nothing
      // (negated: for everything), which the advisory said ahead of
      // time. A non-list right (a defect the advisories flag) wraps to
      // one entry rather than erroring: a defective model evaluates.
      held = evAsList(r).some((entry) => evDeepEqual(l, entry));
      break;
    case 'countEquals': held = evAsList(l).length === r; break;
    case 'countLessThan': held = evAsList(l).length < r; break;
    case 'countGreaterThan': held = evAsList(l).length > r; break;
    case 'contains':
      // No value is no text: a string holds no null in it (String(null)
      // is "null", which "annulled" did). A list may hold one.
      held = typeof l === 'string'
        ? r !== null && r !== undefined && l.includes(String(r))
        : evAsList(l).some((element) => evDeepEqual(element, r));
      break;
    case 'containsAny': {
      const right_ = evAsList(r);
      held = evAsList(l).some((element) => right_.some((other) => evDeepEqual(element, other)));
      break;
    }
    case 'lessThan':
    case 'lessThanOrEquals':
    case 'greaterThan':
    case 'greaterThanOrEquals':
      // `null < 3` would coerce to `0 < 3` and quietly hold – an unset
      // optional has no place in an ordering, and saying so beats
      // ranking it as zero.
      if (l === null || l === undefined || r === null || r === undefined) {
        return fail(`"${conditionText(condition)}" orders against no value (null) – an ordering needs both sides.`);
      }
      if (condition.predicate === 'lessThan') held = l < r;
      else if (condition.predicate === 'lessThanOrEquals') held = l <= r;
      else if (condition.predicate === 'greaterThan') held = l > r;
      else held = l >= r;
      break;
    case 'startsWith':
    case 'endsWith':
      held = l !== null && l !== undefined && r !== null && r !== undefined
        && String(l)[condition.predicate](String(r));
      break;
    default:
      return fail(`"${condition.predicate}" is not a predicate this can check.`);
  }

  return condition.negate ? !held : held;
}

// The aliases a condition reads that hold more than one instance. All
// of them share one fan root – validation refuses a condition
// quantified over two unrelated lists – so they are read side by side.
function evFannedAliasesOf(condition, scope) {
  const out = [];
  for (const operand of conditionOperands(condition)) {
    if (operandSource(operand) !== 'alias-property') continue;
    const binding = scope.bound[operand.alias];
    if (binding && binding.fanned && !out.includes(operand.alias)) out.push(operand.alias);
  }
  return out;
}

function evCheckCondition(model, body, condition, scope) {
  // A condition reading an alias the boundary flagged optional and
  // could not bind holds vacuously – the same reading a fanned alias
  // with zero instances already gets. `skippedFor` names the alias, so
  // an interface can say the rule stepped aside rather than passed.
  for (const operand of conditionOperands(condition)) {
    if (operandSource(operand) !== 'alias-property') continue;
    const binding = scope.bound[operand.alias];
    if (binding && binding.kind === 'entity' && binding.absent) {
      return { held: true, index: null, skippedFor: operand.alias };
    }
  }

  const fannedAliases = evFannedAliasesOf(condition, scope);
  // A read in place that fans out quantifies the same way an alias
  // does: folded once (`scope.inline`), then read at the index.
  const fannedReads = conditionOperands(condition)
    .filter((operand) => operandSource(operand) === 'projection-read' && readFanTag(operand));
  for (const read of fannedReads) evReadOperand(read, scope);
  const inlineOf = (read) => scope.inline.get(JSON.stringify(canonicalOperand(read)));
  const fannedSources = [
    ...fannedAliases.map((alias) => scope.bound[alias]),
    ...fannedReads.map(inlineOf),
  ];

  // The instance list may be compacted by `excluding`, so a zipped
  // parameter is read at the instance's original fan-out index, never
  // at its position in the compacted list.
  const sourceIndexAt = (index) => {
    const indexes = fannedSources[0].sourceIndexes;
    return indexes && indexes[index] !== undefined ? indexes[index] : index;
  };

  const readAt = (operand, index) => {
    if (index === null) return evReadOperand(operand, scope);
    const source = operandSource(operand);
    if (source === 'alias-property' && fannedAliases.includes(operand.alias)) {
      const bound = scope.bound[operand.alias];
      return bound.kind === 'projection' ? bound.instances[index].value : bound.instances[index].read(operand.property);
    }
    if (source === 'projection-read' && fannedReads.includes(operand)) {
      return inlineOf(operand).instances[index].value;
    }
    if (source === 'parameter' && isZipped(model, body, condition, operand)) {
      return evAsList(evReadOperand(operand, scope))[sourceIndexAt(index)];
    }
    return evReadOperand(operand, scope);
  };

  const check = (index) => {
    const left = readAt(condition.leftHandSide, index);
    const right = condition.rightHandSide === undefined
      ? undefined
      : readAt(condition.rightHandSide, index);
    return { held: evApplyPredicate(condition, left, right), left, right, index };
  };

  if (!fannedSources.length) return check(null);

  const lengths = fannedSources.map((source) => source.instances.length);
  if (uniq(lengths).length > 1) {
    fail(
      `Condition "${conditionText(condition)}" reads ${[...fannedAliases, ...fannedReads.map(operandText)].join(' and ')} ` +
      'together, but they hold different numbers of instances, so there is no pairing to check.'
    );
  }
  // Quantified over nothing is vacuously true – a course with no
  // subscribers cannot double-book any of them.
  for (let index = 0; index < lengths[0]; index++) {
    // The dry run reads every instance; see `evDecide`.
    if (scope.collect) {
      try { check(index); } catch (error) { /* stepped over */ }
      continue;
    }
    const outcome = check(index);
    if (!outcome.held) return outcome;
  }
  return { held: true, index: null };
}

// ============================================================
// Evaluating a command.
// ============================================================

// `(model, events, commandName, args)` in, one outcome out:
//
//   { outcome: 'published', events, reads }
//   { outcome: 'rejected', failedRule, reads }
//
// The discriminator is there from the start so that publishing an
// alternative event on refusal – a rejection that also carries events –
// is a change to what a `rejected` outcome holds rather than a change
// to the shape every stored scenario was written in.
//
// `reads` is what the boundary resolved to. Nothing stored in a
// scenario's expected outcome keeps it; the sandbox shows it, because
// "what did this command see when it decided" is the question a step
// raises.
function evaluateCommand(model, events, commandName, args) {
  if (typeof events === 'function') return evDecideThroughPort(model, events, commandName, args);
  return evDecide(model, events || [], commandName, args, false);
}

// One decision over `events` – a log, or the fold-by-fold port
// `evDecideThroughPort` serves. `collect` is that driver's dry run: it
// only wants to see which reads the decision makes, so it reads all of
// them – every rule, every instance of a quantified one, every guard and
// emission – and steps over whatever fails. Its outcome is discarded.
function evDecide(model, events, commandName, args, collect) {
  const body = evOwn(model['command-definitions'], commandName);
  if (!body) fail(`This model has no command "${commandName}".`);

  const supplied = args || {};
  const log = events;
  // `model`, `body` and `events` ride along for an inline read, which is
  // folded from inside an operand; `inline` holds what it folded.
  // `args` and `bound` are keyed by authored names, so have no
  // prototype (see evOwn).
  const scope = {
    args: Object.create(null), bound: Object.create(null), inline: new Map(), model, body, events: log, collect,
  };
  // In the dry run a step that fails is stepped over, not reported.
  const attempt = (step) => {
    if (!collect) return step();
    try { return step(); } catch (error) { return undefined; }
  };
  for (const property of body.properties || []) {
    if (evOwn(supplied, property.name) === undefined) {
      // An optional property may be unset. `null` is the one spelling
      // of "no value" downstream, so the lenient read normalizes here:
      // an absent key and an explicit null reach every condition and
      // emission identically. An optional *list* is a modelling slip
      // the advisories point out; it evaluates as a plain list.
      if (property.isOptional && !property.isList) {
        scope.args[property.name] = null;
        continue;
      }
      fail(`"${commandName}" needs a value for "${property.name}".`);
    }
    scope.args[property.name] = evNormalize(evOwn(supplied, property.name));
  }

  for (const round of deriveRounds(body)) {
    for (const { binding } of round) attempt(() => evResolveBinding(model, log, body, binding, scope));
  }

  // Described at each way out rather than here, because a binding
  // reports the properties the decision *depended on* – and it has not
  // depended on any of them until the conditions have run.
  const conditions = body.conditions || [];
  for (let index = 0; index < conditions.length; index++) {
    const condition = conditions[index];
    if (!condition) continue;
    const outcome = attempt(() => evCheckCondition(model, body, condition, scope));
    if (collect || outcome.held) continue;
    return {
      outcome: 'rejected',
      events: [],
      // `rejection` is what the refusal is known by; `index` and `text`
      // say which rule it was, for the interface – a scenario keeps
      // neither (`deriveThen`).
      failedRule: {
        index,
        rejection: condition.rejection === undefined ? null : condition.rejection,
        text: conditionText(condition),
        leftValue: outcome.left === undefined ? null : outcome.left,
        rightValue: outcome.right === undefined ? null : outcome.right,
        // Which instance refused it, when the rule was quantified.
        atInstance: outcome.index === null ? null : outcome.index,
      },
      reads: evDescribeReads(scope),
    };
  }

  const published = [];
  for (const emission of body.publishes || []) {
    if (!emission || !emission.name) continue;
    const definition = evOwn(model['event-definitions'], emission.name);
    if (!definition) {
      fail(`"${commandName}" publishes "${emission.name}", which this model does not define.`);
    }
    // A guarded emission fires only while every guard holds. A guard
    // that does not hold *skips* the emission and nothing else – the
    // command has already been accepted; `when` decides what it
    // records, never whether it happens.
    let held = true;
    for (const condition of emission.when || []) {
      if (!condition) continue;
      const guard = attempt(() => evCheckCondition(model, body, condition, scope));
      if (!collect && !guard.held) { held = false; break; }
    }
    if (!held) continue;
    const data = {};
    for (const property of definition.properties || []) {
      const operand = evOwn(emission.parameters, property.name);
      if (operand === undefined) {
        // An optional event property needs no mapping. The published
        // payload still carries the key, holding the explicit null –
        // canonical form, so a stored event always spells out every
        // property its definition declares.
        if (property.isOptional && !property.isList) {
          data[property.name] = null;
          continue;
        }
        fail(`"${commandName}" publishes "${emission.name}" without a value for "${property.name}".`);
      }
      data[property.name] = attempt(() => evReadOperand(operand, scope));
    }
    published.push({ type: emission.name, data });
  }

  return { outcome: 'published', events: published, reads: evDescribeReads(scope) };
}

// A decision through a read port, asking the store as few times as the
// boundary allows: once per round of reads, never once per fold.
//
// Which reads a round makes is a question only evaluation answers – a
// read's tags are the command's arguments, fanned out, excluded, or an
// answer from the round before – so it is answered by evaluating. A dry
// run (`evDecide` collecting) records every query its folds ask that
// nothing fetched yet answers, and gets nothing back for them; the
// queries are merged by their tags – types are ORed within a DCB query
// item, so two items with the same tags are exactly one with both type
// lists – and asked in one call. The next dry run then reads the round
// those answers unlock, and so on until a run asks for nothing new: a
// command whose reads all hang off its arguments asks once, a chained
// one once per link. A dry run's guesses cost bandwidth, never
// correctness: the decision is the run after them, over fetched events
// only.
//
// The result carries `query`, the items the deciding run read – what an
// append condition has to cover.
const EV_MAX_READ_ROUNDS = 64;

function evDecideThroughPort(model, read, commandName, args) {
  const keyOf = (tags) => JSON.stringify([...tags].sort());
  const fetched = new Map();
  let asked = new Map();
  let missing = new Map();
  const note = (into, tags, types) => {
    const key = keyOf(tags);
    if (!into.has(key)) into.set(key, { tags: [...tags].sort(), types: new Set() });
    for (const type of types) into.get(key).types.add(type);
  };
  const port = (items) => items.flatMap(({ types, tags }) => {
    note(asked, tags, types);
    const have = fetched.get(keyOf(tags));
    if (have && types.every((type) => have.types.has(type))) {
      return have.events.filter((event) => types.includes(event.type));
    }
    note(missing, tags, types);
    return [];
  });

  for (let rounds = 0; ; rounds++) {
    missing = new Map();
    try { evDecide(model, port, commandName, args, true); } catch (error) { /* the deciding run reports it */ }
    if (!missing.size) break;
    if (rounds === EV_MAX_READ_ROUNDS) fail(`"${commandName}" kept asking for more reads.`);
    // A tag set asked again with more types is fetched again whole, so
    // every fold over it reads one answer.
    const items = [...missing.values()].map(({ tags, types }) => ({
      tags,
      types: [...new Set([...((fetched.get(keyOf(tags)) || {}).types || []), ...types])].sort(),
    }));
    const answered = read(items) || [];
    for (const item of items) {
      fetched.set(keyOf(item.tags), {
        types: new Set(item.types),
        events: answered.filter((event) => item.types.includes(event.type) && evMatchesTags(model, event, item.tags)),
      });
    }
  }

  asked = new Map();
  missing = new Map();
  const result = evDecide(model, port, commandName, args, false);
  if (missing.size) throw new Error(`"${commandName}" read past what its dry runs fetched.`);
  return { ...result, query: [...asked.values()].map(({ tags, types }) => ({ tags, types: [...types].sort() })) };
}

// The boundary as a plain value – every instance it bound and every
// property that was actually read while deciding. Only what the fold
// touched appears, because that is what the command consulted.
function evDescribeReads(scope) {
  const out = {};
  for (const [alias, binding] of Object.entries(scope.bound)) {
    if (binding.kind === 'projection') {
      out[alias] = {
        kind: 'projection',
        projection: binding.projection,
        tags: binding.tags || [],
        arguments: binding.arguments || {},
        value: binding.value,
      };
      continue;
    }
    out[alias] = {
      kind: 'entity',
      entity: binding.entity,
      fanned: binding.fanned,
      // An optional binding whose identifier was unset – it bound
      // nothing, and the reader deserves to see that said, not an
      // empty list that looks like a fan-out over nothing.
      ...(binding.absent ? { absent: true } : {}),
      instances: binding.instances.map((instance) => {
        const properties = {};
        // `read` memoises, so re-reading here costs nothing and reports
        // exactly the properties the decision depended on.
        for (const [name, value] of instance.cache || []) properties[name] = value;
        return { id: instance.id, properties };
      }),
    };
  }
  // An inline read has no alias; it is reported under how it reads.
  for (const read of scope.inline.values()) {
    const said = Object.fromEntries(read.tags.map((t) => [t.name, { tagType: t.type, tagValue: t.value }]));
    out[operandText({ projection: read.projection, tags: said })] = {
      kind: 'projection',
      projection: read.projection,
      inline: true,
      tags: read.tags,
      arguments: read.arguments,
      value: read.value,
    };
  }
  return out;
}


// ============================================================
// Scenarios.
//
// A scenario stores what the definitions made of its Given and When at
// the moment it was accepted. Running one derives that again and
// compares: agreement is `current`, disagreement is `drifted`, and a
// scenario that cannot be run at all is `broken`.
//
// The three are not degrees of the same thing. Drift is answerable by
// reading the difference and accepting it; broken is answerable only by
// repairing the scenario, because there was no answer to compare. A
// count that mixed them would say less the more of them there were.
// ============================================================

// Key order is not information. A payload built here follows the order
// the event declares its properties in; one edited by hand may not, and
// nothing about the outcome changed because two keys swapped places.
function evCanonical(value) {
  if (Array.isArray(value)) return value.map(evCanonical);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = evCanonical(value[key]);
    return out;
  }
  return value === undefined ? null : value;
}

// A refusal is compared by its message alone (`deriveThen`): a rule
// moved by hand still refuses with what the scenario named. If the move
// made a rule with a *different* message refuse first, that is drift.
function evSameOutcome(a, b) {
  return JSON.stringify(evCanonical(a)) === JSON.stringify(evCanonical(b));
}

// The Given, as the evaluator reads a log.
function scenarioLog(scenario) {
  return (scenario.given || []).map((step) => ({
    type: step.event,
    data: step.data || {},
  }));
}

// What the current definitions make of this scenario – the same shape
// that gets stored as its Then.
function deriveThen(model, scenario) {
  // A Given written against definitions that have since moved is not a
  // scenario that fails – it is one that cannot be run. Without this
  // the fold would simply not match an event it no longer recognises,
  // and a deleted event would report as agreement rather than as the
  // repair it actually needs.
  (scenario.given || []).forEach((step, index) => {
    const definition = evOwn(model['event-definitions'], (step || {}).event);
    if (!definition) {
      fail(`Given step ${index + 1} records "${(step || {}).event}", which this model no longer defines.`);
    }
    for (const property of definition.properties || []) {
      // An optional property legitimately absent is not an event the
      // scenario has fallen behind – the fold reads it as undefined.
      if (property.isOptional) continue;
      if (evOwn(step.data, property.name) === undefined) {
        fail(
          `Given step ${index + 1} ("${step.event}") carries no value for "${property.name}", ` +
          'which that event has gained since this scenario was written.'
        );
      }
    }
  });

  const result = evaluateCommand(
    model, scenarioLog(scenario), scenario.command, (scenario.when || {}).arguments
  );
  if (result.outcome === 'published') {
    return { outcome: 'published', events: result.events.map((e) => ({ type: e.type, data: e.data })) };
  }
  // A refusal is its message and nothing else: which rule refused, and
  // what it read, are how the decision was made, not what it was – so
  // rules sharing a message are one outcome, and a projection storing
  // its state differently is no change in behaviour. A refusal a
  // scenario cannot name is not an outcome it can assert: the rule has
  // no message, and the repair is the rule's, so the scenario is broken.
  const { rejection, text } = result.failedRule;
  if (rejectionProblem(rejection)) {
    fail(`"${scenario.command}" was refused by "${text}", which has no rejection message to test against.`);
  }
  return { outcome: 'rejected', events: [], rejection };
}

// Why something could not be worked out. An EvaluationError is a
// sentence written for the modeller; anything else is a defect in the
// model this file did not foresee. Both are an *error* – a scenario
// broken, a card saying so – rather than escaping: the scenario runners
// and the sandbox evaluate while the page renders, and an imported
// model must not be able to take that down.
function evaluationFailure(error) {
  if (error instanceof EvaluationError) return error.message;
  return `The model is malformed here: ${evErrorText(error)}`;
}

// `{ status, expected, actual, reason }`. `reason` is set only when the
// scenario is broken, and is the sentence to show instead of a
// difference.
function runScenario(model, scenario) {
  const expected = scenario.then || null;
  let actual;
  try {
    actual = deriveThen(model, scenario);
  } catch (error) {
    return { status: 'broken', expected, actual: null, reason: evaluationFailure(error) };
  }
  return {
    status: evSameOutcome(actual, expected) ? 'current' : 'drifted',
    expected,
    actual,
  };
}

// What the current definitions make of this projection scenario – the
// same shape that gets stored as its Then: the value its one projection
// folds to, over the Given. `scenarioLog` reads the Given unchanged – a
// projection scenario's is the same shape a command scenario's is.
//
// There is nothing to say about *which* of several reads to fold any
// more: a scenario is about one projection, and its Then is that
// projection's value. What used to be a scenario asserting four
// properties of a course is four scenarios sharing a Given, each
// answerable and each drifting on its own.
function deriveProjectionScenarioThen(model, spec) {
  // A Given written against definitions that have since moved is not a
  // scenario that fails – it is one that cannot be run. See deriveThen
  // for why this is checked ahead of the fold rather than left to fall
  // out of it as a silent, empty match.
  (spec.given || []).forEach((step, index) => {
    const definition = evOwn(model['event-definitions'], (step || {}).event);
    if (!definition) {
      fail(`Given step ${index + 1} records "${(step || {}).event}", which this model no longer defines.`);
    }
    for (const property of definition.properties || []) {
      // An optional property legitimately absent is not an event the
      // scenario has fallen behind – the fold reads it as undefined.
      if (property.isOptional) continue;
      if (evOwn(step.data, property.name) === undefined) {
        fail(
          `Given step ${index + 1} ("${step.event}") carries no value for "${property.name}", ` +
          'which that event has gained since this scenario was written.'
        );
      }
    }
  });

  if (!evOwn(model['projection-definitions'], spec.projection)) {
    fail(`This scenario is about "${spec.projection}", which this model no longer defines.`);
  }
  const tags = {};
  for (const [name, tag] of Object.entries(spec.tags || {})) tags[name] = tag && tag.tagValue;
  return foldProjection(model, scenarioLog(spec), spec.projection, { tags, args: spec.arguments || {} });
}

// `{ status, expected, actual, reason }` – the projection analogue of
// runScenario.
function runProjectionScenario(model, spec) {
  // `null` and `[]` are values a projection really holds, so what the
  // scenario expects is read with `in` rather than by truthiness.
  const expected = 'then' in spec ? spec.then : null;
  let actual;
  try {
    actual = deriveProjectionScenarioThen(model, spec);
  } catch (error) {
    return { status: 'broken', expected, actual: null, reason: evaluationFailure(error) };
  }
  return {
    status: evSameOutcome(actual, expected) ? 'current' : 'drifted',
    expected,
    actual,
  };
}

// Loadable both as a classic script – the way the playground loads
// everything, so it opens from the filesystem without a server – and as
// a module, so this can be exercised outside a browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EvaluationError,
    evaluationFailure,
    evaluateCommand,
    foldEntityProperty,
    foldProjection,
    tagsOfEvent,
    deriveThen,
    runScenario,
    scenarioLog,
    deriveProjectionScenarioThen,
    runProjectionScenario,
  };
}
