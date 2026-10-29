// ============================================================
// WebMCP – the playground's tools for an in-browser agent.
//
// Registers the model on `document.modelContext` (the WebMCP browser
// API) so an agent in the browser can inspect the open model, drive
// commands against a hypothetical event log, and edit definitions –
// through the same command functions the buttons call, so every edit
// lands in the app's own event log and is undoable like any other.
//
// Loaded as a classic script like everything else here, and inert in
// two directions: without the API (no flag, no extension) nothing is
// registered, and without an open model every tool answers with that
// instead of an error trace. Tool execution never works from a
// `file:` origin – WebMCP needs a real one, e.g. `npx serve` over
// this directory.
//
// Every call is announced with a toast, and a tool that changed the
// model repaints the page, so what the agent does is watchable.
//
// **Text first.** An agent builds a model best the way a developer
// does: by writing the whole of it in the model language
// (`get_model_language` teaches it; `start_model` with a `source`,
// then `apply_model_source`, write it). The per-kind `add_*` /
// `update_*` tools stay for one targeted edit; their inlined schemas
// are too large to compose a model from, and an agent that tried
// stalled before its first call.
//
// **Nothing experimental is offered.** What the experimental flag
// keeps off the pages is kept out of this API whether the flag is on
// or not: no entity tools, no experimental members in a schema, and
// an edit that would introduce a use is refused. The tools are
// registered once, so following the flag would mean re-registering on
// every toggle. A model that already uses those constructs still
// reads whole and stays editable – only a *new* use is refused
// (`introducedExperimentalFeatures`), as the flag gates an offer and
// never the display of something stored.
// ============================================================

(() => {
  const context = document.modelContext
    || (typeof navigator !== 'undefined' && navigator.modelContext);
  if (!context || typeof context.registerTool !== 'function') return;

  const asText = (value) => ({
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  });
  const refusal = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

  // What a mutation left the model saying about itself: the advisories
  // this edit introduced, spelled out so the agent can fix them in the
  // same session, plus the standing count so twenty of them cannot
  // pile up unnoticed. Empty when the model is as clean as before.
  const advisoryNote = (before, after) => {
    const keyOf = (a) => `${a.kind}:${a.name}:${a.message}`;
    const seen = new Set(before.map(keyOf));
    const fresh = after.filter((a) => !seen.has(keyOf(a)));
    if (!fresh.length && !after.length) return '';
    const lines = fresh.map((a) => `- ${humanize(a.kind)} "${a.name}": ${a.message}`);
    const standing = `${after.length} advisor${after.length === 1 ? 'y' : 'ies'} standing on the model`;
    return fresh.length
      ? `\n\nAdvisories introduced by this change:\n${lines.join('\n')}\n(${standing}.)`
      : `\n\n(${standing}; none introduced by this change.)`;
  };

  // The shared wrapper: resolve the open model, run the tool, announce
  // what happened. A domain refusal or an evaluation error is a normal
  // answer for an agent – it comes back as an `isError` result with the
  // message the interface would have shown, not as a broken call. A
  // mutation that *succeeded* may still have left the model with
  // something to say – the demoted validations – and that rides along
  // in the result rather than blocking it.
  // `mutates` marks a tool that edits the model – it repaints and
  // echoes advisories. `mutatesSandbox` marks one that only moves the
  // page's sandbox session: it repaints too, but the model is exactly
  // as it was, so there is nothing advisory to say about it.
  // `destructive` marks a writing tool that overwrites or removes what
  // is there, rather than only adding to it – said in every writing
  // tool's annotations, since a client takes an unmarked writer to be
  // destructive and could not tell the two apart.
  const register = ({ name, description, inputSchema, mutates, mutatesSandbox, destructive, needsModel = true, run }) => {
    context.registerTool({
      name,
      description,
      inputSchema,
      annotations: mutates || mutatesSandbox
        ? { readOnlyHint: false, destructiveHint: !!destructive }
        : { readOnlyHint: true },
      async execute(args) {
        try {
          const model = activeModel();
          if (needsModel && !model) {
            return refusal('No model is open in the playground – open or create one first.');
          }
          const before = mutates && model ? modelAdvisories(model) : [];
          // One undo step per model the call changed, marked as the
          // agent's (`asAgent`, index.html – absent where the page is not).
          const call = () => run(model, args || {});
          const { summary, payload } = typeof asAgent === 'function' ? asAgent(call) : call();
          if ((mutates || mutatesSandbox) && typeof render === 'function') render();
          toast('Agent · ' + summary);
          const value = payload === undefined ? summary : payload;
          if (mutates) {
            // A tool that opened another model (start_model) has no
            // before on that one: everything it says is new.
            const current = activeModel();
            const same = current && model && current.id === model.id;
            const note = advisoryNote(same ? before : [], current ? modelAdvisories(current) : []);
            if (note) {
              const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
              return asText(text + note);
            }
          }
          return asText(value);
        } catch (err) {
          toast('Agent · ' + name + ': ' + err.message, true);
          return refusal(err.message);
        }
      },
    });
  };

  const commandBodyOf = (model, commandName) => {
    const body = model['command-definitions'][commandName];
    if (!body) throw new Error(`This model has no command "${commandName}".`);
    return body;
  };

  const kindSchema = (kinds) => ({
    type: 'string',
    enum: kinds,
    description: 'Which kind of definition.',
  });

  // The full shape of one definition, straight from the model schema
  // (see webmcp-schemas.js and the generator that writes it). The
  // definition's key – `name`, or `id` for the id-keyed scenario
  // kinds – is part of the object; `withKey` says whether a call must
  // supply it, and an add of an id-keyed kind must not have to.
  const definitionSchema = (kind, withKey) => {
    const base = WEBMCP_DEFINITION_SCHEMAS[kind];
    const key = isIdKeyed(kind) ? 'id' : 'name';
    const required = new Set(base.required || []);
    if (withKey) required.add(key); else required.delete(key);
    return { ...base, required: [...required] };
  };

  // The kinds an agent may author – entities are experimental.
  const KINDS = DEF_KINDS.filter((kind) => kind !== 'entity-definition');

  // Refuses an edit that would introduce an experimental construct,
  // naming each use – with its line, when the edit is a text.
  const refuseNewExperimental = (before, after, lineOf = () => null) => {
    const fresh = introducedExperimentalFeatures(before, after);
    if (!fresh.length) return;
    throw new DomainError('Nothing was applied – experimental constructs are not offered to agents:\n'
      + fresh.map(({ feature, where }) => {
        const line = lineOf(where);
        return `- ${line ? `line ${line}: ` : ''}${where} uses ${EXPERIMENTAL_FEATURES[feature]}`;
      }).join('\n')
      + '\nWrite it with what get_model_language describes instead.');
  };

  // A whole model text, checked against the model it would replace:
  // refused whole on any error, or on an experimental construct the
  // model does not already use. Answers the parse, ready to apply.
  // A scenario written without a then is no error here: an agent is not
  // asked to predict an outcome, so the apply records it and says so.
  const checkedSource = (model, source) => {
    const parsed = parseModelSource(source);
    const errors = parsed.diagnostics.length ? parsed.diagnostics : sourceScenarioReport(model, parsed, { recordOutcomes: true }).errors;
    if (errors.length) {
      throw new DomainError('Nothing was applied – the text has '
        + `${errors.length} error${errors.length === 1 ? '' : 's'}:\n`
        + errors.map((e) => `- line ${e.line}, column ${e.col}: ${e.message}`).join('\n'));
    }
    refuseNewExperimental(model, sourceDraftModel(model, parsed),
      (name) => (parsed.spans.find((span) => span.name === name) || {}).line);
    return parsed;
  };

  // A model with nothing in it, never stored – what a source for a
  // model not yet created is checked against.
  const emptyModel = (name) => {
    const model = { id: null, name };
    for (const kind of DEF_KINDS) model[DEF_COLLECTIONS[kind]] = {};
    return model;
  };

  // ---------- reading ----------

  register({
    name: 'get_model',
    description: 'The DCB model currently open in the playground, in full, as stored JSON: its '
      + 'custom types, events, projections and the commands that guard them. Every other tool '
      + 'speaks in this model\'s names. get_model_source says the same far shorter, as code – '
      + 'prefer it for reading, and for any edit beyond one definition.',
    inputSchema: { type: 'object', properties: {} },
    run: (model) => ({
      summary: `read model "${model.name}"`,
      payload: model,
    }),
  });

  // The same model as code (dsl.js) – usually the shorter read, and
  // the one an agent can edit as a whole with `apply_model_source`.
  register({
    name: 'get_model_source',
    description: 'The open model as code – the playground\'s own model language, the text its '
      + 'Code view edits: types, events, projections and commands, each command\'s and '
      + 'projection\'s scenarios inside its block. Usually far shorter than get_model. Edit it and '
      + 'send it back with apply_model_source; get_model_language explains the language.',
    inputSchema: { type: 'object', properties: {} },
    run: (model) => ({
      summary: `read model "${model.name}" as code`,
      payload: modelSource(model),
    }),
  });

  // The language itself (dsl.js), so an agent can write a model it has
  // never seen one of – `start_model` leaves it nothing to imitate.
  register({
    name: 'get_model_language',
    description: 'How to write a DCB model as code: the rules, every construct in a commented '
      + 'tour, and a complete example. Read it before writing a model with start_model\'s source '
      + 'or apply_model_source – the fastest way to build a model with its events, projections '
      + 'and commands is to write the whole text and send it in one call.',
    inputSchema: { type: 'object', properties: {} },
    needsModel: false,
    run: () => ({ summary: 'read the model language', payload: sourceLanguageReference() }),
  });

  register({
    name: 'derive_boundary',
    description: 'The consistency boundary derived for one command: what it reads '
      + '(per binding: the tags queried, the event types consulted, the properties '
      + 'the decision depends on) and the tags its published events write.',
    inputSchema: {
      type: 'object',
      properties: {
        commandName: { type: 'string', description: 'A command defined in the open model.' },
      },
      required: ['commandName'],
    },
    run: (model, { commandName }) => ({
      summary: `derived the boundary of ${commandName}`,
      payload: deriveDcb(model, commandBodyOf(model, commandName)),
    }),
  });

  register({
    name: 'evaluate_command',
    description: 'Run a command of the open model against a hypothetical event log and '
      + 'report the outcome: `published` with the events it would record, or `rejected` '
      + 'with the message it was refused with and the rule that refused it. Pure – nothing '
      + 'in the playground changes; to stage a run the person can see and scrub through, '
      + 'use drive_command instead. '
      + '`reads` shows what the boundary resolved to when it decided.',
    inputSchema: {
      type: 'object',
      properties: {
        commandName: { type: 'string', description: 'A command defined in the open model.' },
        arguments: {
          type: 'object',
          description: 'A value for each of the command\'s properties, keyed by name.',
        },
        givenEvents: {
          type: 'array',
          description: 'The events already in the log, oldest first. Defaults to an empty log. '
            + 'Each is {type, data} – the shape evaluate_command itself publishes, so outcomes chain.',
          items: {
            type: 'object',
            properties: { type: { type: 'string' }, data: { type: 'object' } },
            required: ['type', 'data'],
          },
        },
      },
      required: ['commandName'],
    },
    run: (model, { commandName, arguments: args, givenEvents }) => {
      const outcome = evaluateCommand(model, givenEvents || [], commandName, args || {});
      return {
        summary: `evaluated ${commandName} – ${outcome.outcome === 'published'
          ? 'published ' + outcome.events.map((e) => e.type).join(', ')
          : 'rejected: ' + (outcome.failedRule.rejection || outcome.failedRule.text)}`,
        payload: outcome,
      };
    },
  });

  register({
    name: 'list_problems',
    description: 'Everything findably wrong with the open model, without judging it: '
      + 'loose ends (events nothing records, entities nothing reads, commands that '
      + 'record nothing), advisories (what a definition got wrong without being '
      + 'refused – dangling references, boundary gaps, mistyped values) and '
      + 'scenarios the model no longer agrees with.',
    inputSchema: { type: 'object', properties: {} },
    run: (model) => {
      const found = problems(model).map(({ what, why }) => ({ what, why }));
      return {
        summary: found.length
          ? `listed ${found.length} problem${found.length === 1 ? '' : 's'}`
          : 'listed problems – none found',
        payload: found,
      };
    },
  });

  // ---------- editing ----------
  //
  // These go through the same command functions the interface calls, so
  // an agent's edit is an event in the app's own log: visible on the
  // next repaint, undoable, and refused by the same domain rules – a
  // refusal comes back verbatim as the tool's error text.

  register({
    name: 'start_model',
    description: 'Start a new model and open it, so every other tool speaks about it from here '
      + 'on. Pass the whole model as source to create it with its types, events, projections, '
      + 'commands and scenarios in this one call – see get_model_language for how to write it; '
      + 'without source the model starts empty. A source with any error is refused whole and '
      + 'nothing is created. The model that was open before stays stored and can be reopened '
      + 'from the Models modal.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What the new model is called. A model line in the source renames it.' },
        source: {
          type: 'string',
          description: 'Optional: the whole model, as code – what apply_model_source would take.',
        },
      },
      required: ['name'],
    },
    mutates: true,
    needsModel: false,
    run: (_, { name, source }) => {
      if (source !== undefined) checkedSource(emptyModel(name), source);
      // `openNewModel` is `createNamedModel` unwrapped from its `run`
      // wrapper – the refusal has to reach the agent, not only the
      // toast – so both paths open a model the same one way.
      const id = openNewModel(name);
      if (typeof state === 'object' && state) state.models = false;
      if (source !== undefined) {
        const applied = sourceApplySummary(applyModelSource(id, source, { recordOutcomes: true }));
        return { summary: `started model "${name.trim()}" from code: ${applied}`, payload: { id, applied } };
      }
      return {
        summary: `started model "${name.trim()}"`,
        payload: {
          id,
          name: name.trim(),
          next: 'The model is empty. To build it, read get_model_language, write the whole model '
            + 'as code and send it with apply_model_source – one call, not one per definition.',
        },
      };
    },
  });

  // One add and one update per kind, so each tool's inputSchema is the
  // full shape of that one definition – an agent discovers what a
  // command body looks like from the tool itself, not by fishing an
  // example out of get_model.
  for (const kind of KINDS) {
    const label = humanize(kind);
    const suffix = kind.replace(/-/g, '_');
    const idKeyed = isIdKeyed(kind);
    const keyOf = (args) => (idKeyed ? args.id : args.name);
    const bodyOf = (args) => {
      const { name, id, ...body } = args;
      return idKeyed && args.name !== undefined ? { name: args.name, ...body } : body;
    };
    // The model as it would be with this one body in place.
    const withBody = (model, key, body) => {
      const collection = DEF_COLLECTIONS[kind];
      return { ...model, [collection]: { ...model[collection], [key]: body } };
    };
    const prefer = ' For creating a model or changing several definitions, write code instead '
      + '(get_model_language, apply_model_source); this tool suits one targeted edit.';

    register({
      name: 'add_' + suffix,
      description: `Add a ${label.toLowerCase()} to the open model. The input is the `
        + 'definition itself, in the shape this schema describes.'
        + (idKeyed ? ' The id is generated when omitted.' : '')
        + ' Refused only when the name is taken or the body is structurally not a '
        + 'definition; anything semantically wrong – a dangling reference, a boundary '
        + 'gap – is accepted and comes back as an advisory in the result. Fix what it '
        + 'reports before moving on.' + prefer,
      inputSchema: definitionSchema(kind, !idKeyed),
      mutates: true,
      run: (model, args) => {
        const key = idKeyed ? (args.id || generateId()) : args.name;
        refuseNewExperimental(model, withBody(model, key, bodyOf(args)));
        addDefinition(kind, model.id, key, bodyOf(args));
        return { summary: `added ${label} "${idKeyed ? args.name || key : key}"` };
      },
    });

    register({
      name: 'update_' + suffix,
      description: `Replace the ${label.toLowerCase()} the ${idKeyed ? 'id' : 'name'} `
        + 'points at, wholesale. A body that strands a reference elsewhere is accepted '
        + 'and the stranding comes back as an advisory in the result – renames still '
        + 'belong in rename_definition and rename_member, which move the references '
        + 'along instead of stranding them.' + prefer,
      inputSchema: definitionSchema(kind, true),
      mutates: true,
      destructive: true,
      run: (model, args) => {
        refuseNewExperimental(model, withBody(model, keyOf(args), bodyOf(args)));
        updateDefinition(kind, model.id, keyOf(args), bodyOf(args));
        return { summary: `updated ${label} "${idKeyed ? args.name || args.id : args.name}"` };
      },
    });
  }

  register({
    name: 'remove_definition',
    description: 'Remove a definition of any kind from the open model. Whatever still '
      + 'references it is left dangling, and each dangling reference comes back as an '
      + 'advisory in the result. For the id-keyed scenario kinds, `name` is the id.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: kindSchema(KINDS),
        name: {
          type: 'string',
          description: 'The name of the definition to remove – or its id, for the '
            + 'id-keyed scenario kinds.',
        },
      },
      required: ['kind', 'name'],
    },
    mutates: true,
    destructive: true,
    run: (model, { kind, name }) => {
      removeDefinition(kind, model.id, name);
      return { summary: `removed ${humanize(kind)} "${name}"` };
    },
  });

  register({
    name: 'apply_model_source',
    description: 'Replace the open model\'s definitions with the ones a whole model text declares '
      + '(the text get_model_source returns, edited; get_model_language explains the language). '
      + 'The way to build or restructure a model: write all of it and send it in one call. Only '
      + 'what differs is written, as one undoable step. A definition or scenario left out of the '
      + 'text is removed – but only with allowRemovals: true; without it, a text that leaves '
      + 'anything out is refused, naming what it would remove. A scenario written without a then is recorded with what the model does; '
      + 'one with a then asserts it, and a drift is reported by list_problems, never accepted '
      + 'silently. A renamed definition is a removal plus an addition – references to it in the '
      + 'text move only if the text moves them. A text with any error is refused whole, with every '
      + 'error and its line.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'The whole model, as code.' },
        allowRemovals: {
          type: 'boolean',
          description: 'Whether the definitions and scenarios the text leaves out may be '
            + 'removed. Off by default: send the text without it first, and again with it only '
            + 'if the removals the refusal names are meant.',
        },
      },
      required: ['source'],
    },
    mutates: true,
    destructive: true,
    run: (model, { source, allowRemovals }) => {
      checkedSource(model, source);
      // One step of many changes, read as code applied (index.html).
      if (typeof markStepVia === 'function') markStepVia('code');
      let summary;
      try {
        summary = applyModelSource(model.id, source, { refuseRemovals: allowRemovals !== true, recordOutcomes: true });
      } catch (error) {
        if (error.removed) {
          throw new DomainError(error.message + ' Send it again with allowRemovals: true if the removals are meant '
            + '– or, to rename, use rename_definition, which moves the references along.');
        }
        throw error;
      }
      return { summary: 'applied code: ' + sourceApplySummary(summary) };
    },
  });

  register({
    name: 'rename_definition',
    description: 'Rename a definition and rewrite every reference to it across the model '
      + 'in the same change – never rename by editing bodies one at a time. The id-keyed '
      + 'scenario kinds have no name to rename, so they are not offered here.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: kindSchema(KINDS.filter((k) => !isIdKeyed(k))),
        previousName: { type: 'string', description: 'The definition\'s current name.' },
        newName: {
          type: 'string',
          description: 'The name to give it – PascalCase, and not already taken by '
            + 'another definition of the same kind.',
        },
      },
      required: ['kind', 'previousName', 'newName'],
    },
    mutates: true,
    run: (model, { kind, previousName, newName }) => {
      renameDefinition(kind, model.id, previousName, newName);
      return { summary: `renamed ${humanize(kind)} "${previousName}" to "${newName}"` };
    },
  });

  // The combinations that exist are exactly the keys of MEMBER_REWRITES
  // ('<kind>:<memberKind>') of the kinds offered here, so the schema is
  // derived from them rather than restated here.
  const memberCombos = Object.keys(MEMBER_REWRITES).map((k) => k.split(':'))
    .filter(([kind]) => KINDS.includes(kind));
  register({
    name: 'rename_member',
    description: 'Rename one member of a definition – a property, an enum member, a '
      + 'composite type\'s field – and rewrite everything '
      + 'that referred to it by that name. The valid kind/memberKind pairs: '
      + memberCombos.map(([k, m]) => `${k} + ${m}`).join('; ') + '.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: kindSchema([...new Set(memberCombos.map(([k]) => k))]),
        definitionName: {
          type: 'string',
          description: 'The name of the definition the member belongs to.',
        },
        memberKind: {
          type: 'string',
          enum: [...new Set(memberCombos.map(([, m]) => m))],
          description: 'What is being renamed; only the pairs listed in the tool '
            + 'description are valid.',
        },
        previousName: { type: 'string', description: 'The member\'s current name.' },
        newName: {
          type: 'string',
          description: 'The name to give it – not already taken by another member of '
            + 'the same definition.',
        },
      },
      required: ['kind', 'definitionName', 'memberKind', 'previousName', 'newName'],
    },
    mutates: true,
    run: (model, { kind, definitionName, memberKind, previousName, newName }) => {
      renameMember(kind, model.id, definitionName, memberKind, previousName, newName);
      return {
        summary: `renamed ${memberKind} "${previousName}" of ${humanize(kind)} `
          + `"${definitionName}" to "${newName}"`,
      };
    },
  });

  // ---------- the sandbox ----------
  //
  // The page's other way to try a model: commands driven against each
  // other, events piling up on a timeline the person can scrub (see
  // section D of the page script). These tools drive that same
  // session, so an agent can stage a worked example to look at
  // together – the model and its stored log are untouched throughout,
  // and a reload clears it, like anything else in the sandbox.

  register({
    name: 'drive_command',
    description: 'Drive a command in the sandbox: evaluate it against the events already '
      + 'recorded there and, when it publishes, append its events to the sandbox timeline '
      + 'the person sees (the Sandbox page in the playground). A rejection is an ordinary '
      + 'outcome – reported, nothing recorded. The model itself never changes. Drive '
      + 'commands in sequence to stage a worked example; for a what-if that should leave '
      + 'no trace, use evaluate_command instead.',
    inputSchema: {
      type: 'object',
      properties: {
        commandName: { type: 'string', description: 'A command defined in the open model.' },
        arguments: {
          type: 'object',
          description: 'A value for each of the command\'s properties, keyed by name.',
        },
      },
      required: ['commandName'],
    },
    mutatesSandbox: true,
    run: (model, { commandName, arguments: args }) => {
      const outcome = sessionDrive(model, commandName, args || {});
      return {
        summary: `drove ${commandName} in the sandbox – ${outcome.outcome === 'published'
          ? 'published ' + outcome.events.map((e) => e.type).join(', ')
          : 'rejected: ' + (outcome.failedRule.rejection || outcome.failedRule.text)}`,
        payload: outcome,
      };
    },
  });

  register({
    name: 'get_sandbox',
    description: 'The sandbox as it stands: every command driven so far – with its '
      + 'arguments and the range of events it appended – and the full event log those '
      + 'runs have built up, oldest first. Empty when nothing has been driven.',
    inputSchema: { type: 'object', properties: {} },
    run: () => ({
      summary: `read the sandbox – ${session.steps.length} step${session.steps.length === 1 ? '' : 's'}, `
        + `${session.log.length} event${session.log.length === 1 ? '' : 's'}`,
      payload: { steps: session.steps, events: session.log },
    }),
  });

  register({
    name: 'reset_sandbox',
    description: 'Clear the sandbox: every driven command, its events and whatever was '
      + 'being watched. The model is untouched – this only empties the timeline, ready '
      + 'for a fresh example.',
    inputSchema: { type: 'object', properties: {} },
    mutatesSandbox: true,
    destructive: true,
    run: () => {
      if (typeof state === 'object' && state) state.sandboxDraft = null;
      sessionReset();
      return { summary: 'reset the sandbox' };
    },
  });
})();
