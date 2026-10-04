# DCB Playground integration plan

Goal: host the DCB Playground (currently a local repo, `dcb-playground`) at
`https://dcb.events/playground/`, link it from the site header, and make every
example on the site openable in the playground. Running examples via codapi goes away.

## Decisions

### Hosting

- The playground stays a separate repository, published under the `dcb-events` GitHub
  organization with an MIT license (the license file has to exist before publishing). The website
  includes it as a **git submodule** at `playground/`, pinned to the exact version the examples
  were built against.
- There is no build step on the playground side. An `on_post_build` mkdocs hook copies
  `playground/app/` to `site/playground/`, leaving out `*.test.js`, `test-harness.js`,
  `generate-*.js` and other dev-only files. The hook also runs for `mkdocs serve`.
- The same hook copies `dcb-model.schema.json` to `site/schemas/model/v6.json`, so the schema's
  `$id` and the `$schema` field of every model actually resolve.
- CI (`.github/workflows/ci.yml`) needs `actions/checkout` with `submodules: true` and
  `setup-node`. PHP stays until phase 3 is decided. Monaco adds about 10 MB to the
  Pages deploy, which is acceptable.

### Playground page

- `/playground/` runs as its own full-screen app, without the Material layout and not in an iframe.
- The playground header gets a "← dcb.events" link and a "Preview" badge, since the model format
  is young and major changes are expected.
- Colours: the chrome (header, buttons, links, focus rings) uses the site's teal / deep orange. The
  colours for commands, events, entities, projections and rules stay as they are (EventStorming
  conventions). If deep orange next to orange events reads as "event", use teal for the accent
  inside the playground. These changes go into the playground's own tokens in `shared.css`.
- **One theme setting, shared with the site.** On dcb.events the playground reads Material's
  same-origin localStorage key `/.__palette` (`color.scheme`: `slate` / `default`), and its own
  theme toggle writes back to it. The bridge lives in the playground repo and only takes effect
  when that key exists, so the playground keeps working when hosted elsewhere. The site gets a
  third, automatic palette (`media: "(prefers-color-scheme)"`) so the playground's
  system/light/dark options map one-to-one.

### Site header

- Override `overrides/partials/header.html` to add a playground icon button next to search
  (e.g. `material/play-box-outline`), opening in the same tab. This is a copy of Material's
  partial, so it has to be re-synced on Material upgrades.
- Also link the playground prominently from `docs/examples/index.md`.

### Examples: source format and build

- **The source of truth is the DCB notation (the DSL),** written as a superfences fence in the
  markdown. It replaces the `<script type="application/dcb+json">` blocks:

  ````
  ```dcb id="course_subscription_02" extends="course_subscription_01"
  ...
  ```
  ````

- `extends`: a block only holds the changes, i.e. definitions added or replaced by kind + name.
  The build merges them onto the parent. Every rendered block and every playground link is still
  the complete model. Removing a definition is rare; support it via `remove <kind> <Name>` or not
  at all.
- The Python markdown extension (same place as `extensions/replace_dcb_scenarios.py`) hands
  each block to a Node CLI in `scripts/dcb-render/`. The CLI loads `model.js`, `dsl.js` and
  `evaluate.js` from the submodule through the playground's own `vm` test harness (see
  `app/dsl.test.js` / `app/test-harness.js`).
- **The build fails** on any DSL diagnostic, any definition that falls back to JSON when printed,
  or any failing scenario. Every example is then also a regression test against the pinned
  playground version.

### Examples: rendering

- Tab **"DCB notation"** (the default): highlighted at build time with the playground's lexer
  (`lexSource` → HTML spans), in the playground's colours. No client-side highlighter. Lines
  changed against the `extends` parent are highlighted.
- Tab **"Consistency boundary"**: generated from `deriveDcb` / `boundarySummary`. For each
  command it lists the event types, the tags and the resulting append condition, in the same
  terms as the specification. This keeps the site's core teaching point visible, since the
  playground derives the DCB instead of showing it.
- **"Open in Playground ↗"** button in the tab bar (top right), opening in a **new tab**. The link
  carries the whole model: `/playground/#model=<base64url(gzip(JSON envelope))>`. This is
  deterministic, because a link keeps showing the same model even after the example is edited.
  The JSON envelope is used rather than the DSL because it is versioned (`dcbModelVersion`) and
  migrated on import. Measured link sizes are 1.1–1.9 KB with JSON and 0.7–1.4 KB with the DSL.
- A small **"Download JSON"** link next to the button. No JSON tab.
- Removed: the JS tab, the TS tab (for now), the GWT (WIP) tab, `dcb-scenario.bundle.js`.

### Examples: content migration

Migration is done by hand, one commit per page, starting from the validated drafts in
`scripts/dcb-render/drafts/`. Validate a draft with:

```
DCB_PLAYGROUND_APP=../dcb-playground/app node scripts/dcb-render/drafts/check.js scripts/dcb-render/drafts/<file>.dcb
```

| Page | Draft | Notes |
|---|---|---|
| course-subscriptions (3 blocks) | `course-03.dcb` (F1–F3 merged) | Direct. Split back into an `extends` chain. |
| unique-username (4 blocks) | `username-04-scripted.dcb`, `username-04-declarative.dcb` | F3 (username change) needs a scripted projection. The declarative variant raises the "fires for every partition" advisory. |
| opt-in-token (2 blocks) | `optin-02.dcb` | Direct, with time as data. |
| invoice-number | `invoice.dcb` | Direct (`successor`). The derived DCB is type-only, no tags. |
| prevent-record-duplication | `dedup.dcb` | Direct. |
| dynamic-product-price (3 stages, hand-written JS) | `price-03.dcb` | F1 matches the playground's `pricing-simple`. F2/F3 need a scripted projection with time as data. Blocked until the playground's `CartLine[]` → `Item[]` advisory exists (see below). |
| event-sourced-aggregate, topics/projections | none | Aggregates can't be expressed in the playground model. Turn them into static code blocks without a Run button. |

- **Time is modelled as data.** The playground has no event metadata and no clock, by design, so
  that replays are deterministic. `metadata.daysAgo` / `minutesAgo` are replaced by a timestamp or
  deadline in the event payload (`closedOn`, `expiresAt`, `at`), and commands take a `today` /
  `now` parameter. Rewrite the prose to match. The pages already call the metadata approach
  a simplification.
- Custom rejection messages ("Username u1 is claimed") are lost. A rejection is shown as the
  rule that failed. Accepted for now.
- Remove codapi entirely: `docs/assets/js/codapi-snippet.js`, `dcb.js`,
  `InMemoryEventStoreTemplate.js`, `InMemoryDcbEventStore*.js`, `InMemoryEventStore.js`,
  `lib.js`, the unused `custom.js`, the codapi styles in `custom.css`, and the entries in
  `mkdocs.yml` `extra_javascript`.
- The old PHP renderer (`scripts/scenario-generator/`) and `extensions/replace_dcb_scenarios.py`
  are removed once no page uses the JSON blocks any more.

### Changes needed in the playground

- Opening a `#model=` link for a model that already exists (same content hash) switches to the
  existing model instead of importing a duplicate. Today `importModelFromEnvelope` always
  creates a new model.
- **The script confirmation gate stays for every link, including dcb.events' own.** Because links
  carry the model inline, anyone can craft a `dcb.events/playground/#model=…` link carrying
  scripted-projection JS that would run on the dcb.events origin.
- Emitting a `CartLine[]` into an `Item[]` event field currently raises no advisory and publishes
  the wrong shape. Fix this before migrating dynamic-product-price.
- "← dcb.events" link, "Preview" badge, colour changes, theme bridge (see above).
- The playground's built-in examples (`PREDEFINED_MODELS`) stay independent of the site for now.

## Phases

0. **Now, independent of everything else.** Fix existing bugs in the example pages:
   - `docs/examples/course-subscriptions.md:214`: the `changeCourseCapacity` schema declares
     `studentId` instead of `courseId`.
   - `docs/examples/course-subscriptions.md`: the prose says "not more than 10 courses" (line 15)
     but the check uses 5 (line 498).
   - `docs/examples/opt-in-token.md:375`: the "expired OTP" test confirms with OTP `000000`
     while the given event has `333333`, so it never tests expiry. `minutesAgo` is the string
     `"61"` (line 367).
1. **Host the playground.** LICENSE + publish the repo, add the submodule, the copy hook, the
   schema publishing, the CI changes, the header icon, the automatic site palette, and in the
   playground the theme bridge, colours, "← dcb.events" link and "Preview" badge. The examples
   stay untouched.
2. **Migrate the examples.** DSL fences, Node renderer, the "DCB notation" and "Consistency
   boundary" tabs, "Open in Playground", "Download JSON", content migration per page, codapi
   and PHP renderer removal. Playground: dedupe on import, the `CartLine[]` → `Item[]` advisory.
3. **Decide on code tabs.** Once phase 2 is live, decide whether a generated TypeScript tab
   (a Node generator reading the new model, in the site's existing "composed projections"
   style) is still worth it, or whether the "Consistency boundary" tab covers enough.

## Parked

- DSL instead of JSON in share links, only once the DSL carries a version marker.
- Optional custom rejection messages in the DSL (`require … else "…"`).
- Feeding the site's examples into the playground's built-in list (e.g. "Examples from
  dcb.events", backed by a build-generated `examples/index.json`), possibly retiring the
  playground's own course and pricing examples.
