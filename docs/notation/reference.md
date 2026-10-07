---
icon: material/book-alphabet
---

# DCB notation reference

Every construct of the [DCB notation](index.md), grouped like the help of the [:material-play-box-outline: DCB Playground](/playground/). The [advanced](#advanced) constructs, which are not needed to read most examples, and the [experimental](#experimental) ones are listed at the end. The [guide](index.md) introduces the notation step by step.

The snippets are taken from one model about courses and students, which the build of this website checks like every example.

````dcb id="notation_reference" hidden="true"
model "Course reference"

// Types
tag type CourseId = string { pattern: "^c[0-9]+$" }
tag type StudentId = string
type Capacity = integer { minimum: 1 }
type TimeSlot = string { pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}$" }
enum CourseStatus { NonExistent, Existent, Archived }
record PersonName { given: string, family: string }

// Events
event CourseDefined { tag courseId: CourseId, capacity: Capacity }
event CourseCapacityChanged { tag courseId: CourseId, newCapacity: Capacity }
event CourseArchived { tag courseId: CourseId }
event CourseRescheduled { tag courseId: CourseId, slots: TimeSlot[] }
event StudentRegistered { tag studentId: StudentId, name: PersonName, email?: string }
event StudentSubscribedToCourse { tag courseId: CourseId, tag studentId: StudentId }

// Entities
@icon("📚")
entity Course (tag courseId: CourseId) {
  lifecycle status
  status = CourseStatus
  capacity = CourseCapacity
  subscriptionCount = CourseSubscriptionCount
  subscribedStudentIds = CourseSubscribedStudentIds
  slots = CourseSlots
  isFull = CourseIsFull
}

@icon("🧑‍🎓")
entity Student (tag studentId: StudentId) {
  lifecycle exists
  exists = StudentExists
  subscribedCourseIds = StudentSubscribedCourseIds
}

// Projections
projection CourseStatus (tag courseId: CourseId): CourseStatus = NonExistent {
  on CourseDefined => set Existent
  on CourseArchived => set Archived

  scenarios {
    scenario "a defined course exists" {
      given CourseDefined { courseId: "c1", capacity: 10 }
      then CourseStatus(CourseId("c1")) == Existent
    }
  }
}

projection StudentExists (tag studentId: StudentId): boolean = false {
  on StudentRegistered => set true
}

projection CourseCapacity (tag courseId: CourseId): integer = 0 {
  on CourseDefined => set event.data.capacity
  on CourseCapacityChanged => set event.data.newCapacity
}

projection CourseSubscriptionCount (tag courseId: CourseId): integer = 0 {
  on StudentSubscribedToCourse => increment 1
}

projection CourseSubscribedStudentIds (tag courseId: CourseId): StudentId[] = [] {
  on StudentSubscribedToCourse => append event.data.studentId
}

projection StudentSubscribedCourseIds (tag studentId: StudentId): CourseId[] = [] {
  on StudentSubscribedToCourse => append event.data.courseId
}

projection CourseSlots (tag courseId: CourseId): TimeSlot[] = [] {
  on CourseRescheduled => set event.data.slots
}

untagged projection CourseNumbering: CourseId = "c1" {
  on CourseDefined => set successor(event.data.courseId)
}

projection CourseIsFull (tag courseId: CourseId): boolean
  derived CourseSubscriptionCount(courseId) >= CourseCapacity(courseId)

projection CoursePeakSubscriptions (tag courseId: CourseId): integer {
  script
  initialState { current: 0, peak: 0 }
  exposes peak
  on StudentSubscribedToCourse => ```({ current: state.current + 1, peak: Math.max(state.peak, state.current + 1) })```
}

// Command handlers
@feature("Course management")
handler DefineCourse(capacity: Capacity) {
  emit CourseDefined { courseId: CourseNumbering(), capacity }
}

@feature("Course management")
handler ChangeCourseCapacity(courseId: CourseId, newCapacity: Capacity) {
  require CourseStatus(courseId) == Existent
    else reject "Course is not active"
  require CourseSubscriptionCount(courseId) <= newCapacity
    else reject "Course has more subscriptions than that"

  emit CourseCapacityChanged { courseId, newCapacity }
}

@feature("Course management")
handler ArchiveCourse(courseId: CourseId) {
  require CourseStatus(courseId) == Existent
    else reject "Course is not active"

  emit CourseArchived { courseId }

  scenarios {
    scenario "an archived course cannot be archived again" {
      given CourseDefined { courseId: "c1", capacity: 10 }
      given CourseArchived { courseId: "c1" }
      when ArchiveCourse { courseId: "c1" }
      then rejected "Course is not active"
    }

    scenario "an existing course is archived" {
      given CourseDefined { courseId: "c1", capacity: 10 }
      when ArchiveCourse { courseId: "c1" }
      then CourseArchived { courseId: "c1" }
    }
  }
}

@feature("Course management")
handler RescheduleCourse(courseId: CourseId, slots: TimeSlot[]) {
  alias course = Course(courseId)
  alias students = Student(each course.subscribedStudentIds)
  alias theirs = Course(each students.subscribedCourseIds) excluding courseId

  require course.status == Existent
    else reject "Course is not active"
  require theirs.slots not containsAny slots
    else reject "Slots clash with a subscriber's other course"

  emit CourseRescheduled { courseId, slots }
}

@feature("Students")
handler RegisterStudent(studentId: StudentId, name: PersonName, email?: string) {
  alias student = Student(studentId)

  require student.exists is false
    else reject "Student is already registered"

  emit StudentRegistered { studentId, name, email }
}

@feature("Enrolment")
handler SubscribeStudentToCourse(courseId: CourseId, studentId: StudentId) {
  alias subscribedCourseIds = StudentSubscribedCourseIds(studentId)

  require CourseStatus(courseId) == Existent
    else reject "Course is not active"
  require StudentExists(studentId) is true
    else reject "Student is not registered"
  require CourseSubscribedStudentIds(courseId) not contains studentId
    else reject "Student is already subscribed"
  require count(subscribedCourseIds) < 10
    else reject "Student is subscribed to too many courses"

  emit StudentSubscribedToCourse { courseId, studentId }
}
````

## Text

### `model` { #model }

The model's name, once per text.

```dcb-fragment
model "Course reference"
```

### Comments { #comments }

```dcb-fragment
// a line comment
/* a block comment */
```

Comments are for the reader only. The DCB Playground does not store them, so they get lost once a text is applied.

### Literals { #literals }

```dcb-fragment
"text"  42  1.5  true  false  null  ["c1", "c2"]  { given: "Ada", family: "Lovelace" }
```

Values are written as JSON. Keys of objects may be written without quotes. Members of an [`enum`](#enum) are written without quotes wherever the type is known. A value of a [tag type](#tag-type) may be written with its type, `CourseId("c1")`, and has to be where a [read](#read) is given one.

## Data

### `tag type` { #tag-type }

```dcb excerpt="notation_reference" show="type CourseId, type StudentId"
```

An identifier that can be a [Tag](../specification.md#tag). The type's name is the key of the Tag: the value `"c1"` is the Tag `CourseId:c1`. Only a value of a tag type can be a Tag.

The constraints after the base type are optional, see [`type`](#type). With `@tagSchema("{type}={value}")` a Tag is written differently, `{type}:{value}` is the default.

### `event` { #event }

```dcb excerpt="notation_reference" show="event CourseDefined, event StudentRegistered"
```

An [Event](../specification.md#event), named in the past tense, with its properties:

| Property | Meaning |
|---|---|
| `capacity: Capacity` | a property, typed with a declared type or a basic one (`string`, `number`, `integer`, `boolean`) |
| `email?: string` | optional: `null` when not set |
| `slots: TimeSlot[]` | a list |
| `tag courseId: CourseId` | a Tag of the Event, see [`tag`](#tag) |

### `tag` { #tag }

```dcb excerpt="notation_reference" show="event StudentSubscribedToCourse"
```

Marks a property of an Event as one of its Tags. The property has to be of a [tag type](#tag-type). An Event has no other Tags than the ones it marks.

| Mark | Meaning |
|---|---|
| `tag courseId: CourseId` | the value is a Tag |
| `items: Item[] tag each productId` | every element of the list is a Tag, by the field of the [record](#record) it holds |

## State

### `projection` { #projection }

```dcb excerpt="notation_reference" show="projection CourseCapacity, projection CourseSubscribedStudentIds"
```

A fold over Events: the Tags it is kept by, the value's type, the initial value, and one handler per Event type. `CourseCapacity` is kept per course: read for `"c1"`, it only sees Events tagged `CourseId:c1`. A projection with several Tags, `(tag courseId: CourseId, tag studentId: StudentId)`, only sees Events with all of them.

See [projections](../topics/projections.md) for the concept.

### `untagged` { #untagged }

```dcb excerpt="notation_reference" show="projection CourseNumbering"
```

A projection without Tags, which sees all Events of the types it handles. A projection either names its Tags or says it has none.

### `on` { #on }

| Handler | Effect |
|---|---|
| `on E => set <value>` | replaces the value |
| `on E => increment 1`, `on E => decrement 1` | changes an integer |
| `on E => append <value>`, `on E => remove <value>` | changes a list |

The set of operations is fixed, because the DCB Playground analyses them. A [scripted projection](#script) can do anything else.

### `event.data` { #event-data }

```dcb-fragment
on CourseDefined => set event.data.capacity
```

A property of the Event being handled. Besides that, a handler's value is a [literal](#literals) or an enum member.

## Behaviour

### `handler` { #command }

```dcb excerpt="notation_reference" show="handler ChangeCourseCapacity"
```

A command and how it is decided. The header is the command: its name and its properties (`?` optional, `[]` a list). The body has its [aliases](#alias), [conditions](#require) and [Events](#emit), in this order.

### Reads { #read }

```dcb-fragment
CourseStatus(courseId)
CourseNumbering()
CourseStatus(CourseId("c1"))
```

The value of a projection, for a value of each of its Tags, in the order the projection declares them. An [untagged](#untagged) projection is read with `()`. A value is a property of the command, an alias, another read or a literal of the [tag type](#literals).

A read can be written wherever a value is: in a condition, in an Event's property, or as the value of another read. The same read written twice is read once.

### `alias` { #alias }

```dcb-fragment
alias subscribedCourseIds = StudentSubscribedCourseIds(studentId)
```

A name for a [read](#read), for conditions and Events that use it more than once. It does not read anything where it is written: which Events a command reads follows from what its conditions and Events use.

### `require` { #require }

```dcb excerpt="notation_reference" show="handler SubscribeStudentToCourse"
```

A condition that has to hold, otherwise the command is rejected with the message after `else reject`. The message is required, on the same line or the next. It is static text, one line, by convention in sentence case without a full stop. Several conditions may share a message: the messages are the complete set of reasons a command can be rejected for, and a scenario names a rejection by its message.

Operands are properties of the command (`studentId`), reads, aliases and their properties (`course.status`), literals and enum members.

| Condition | Meaning |
|---|---|
| `a == b`, `a != b`, `<`, `<=`, `>`, `>=` | comparison |
| `x in [Draft, Published]`, `x not in […]` | one of a list of values |
| `xs contains x`, `xs containsAny ys` | lists |
| `s startsWith "c"`, `s endsWith "1"` | strings |
| `count(xs) < 10`, `==`, `>` | the length of a list |
| `x is empty`, `x is not empty` | an empty string or list, or `null` |
| `b is true`, `b is false` | booleans |
| `not a < b`, `xs not contains x` | negation |

### `emit` { #emit }

```dcb excerpt="notation_reference" show="handler DefineCourse"
```

Appends an Event if all conditions hold. Each property is taken from a property of the command, a read, an alias or a literal. `capacity` is short for `capacity: capacity`.

### Consistency boundary { #consistency-boundary }

Never written. Each read contributes the Event types of the projection it reads, with the Tags it is read for. The Events are appended with an [Append Condition](../specification.md#append-condition) that fails if an Event matching that Query was appended since the command read. See [from notation to DCB](index.md#from-notation-to-dcb) in the guide.

## Scenarios

### `scenario` { #scenario }

```dcb excerpt="notation_reference" show="handler ArchiveCourse"
```

An example that pins behaviour down. The scenarios of a handler or projection sit in one `scenarios { … }` group at its end. The name is optional.

| Line | Meaning |
|---|---|
| `given E { … }` | an Event already appended. Values are JSON, enum members without quotes |
| `when C { … }` | the command, with all of its properties |
| `then E { … }` | the Events appended |
| `then nothing` | no Event appended |
| `then rejected "<message>"` | the message the command was rejected with |

In the DCB Playground the `then` is optional, applying a text without one records what the model does. On this website every scenario has to state it.

### Projection scenarios { #projection-scenario }

```dcb excerpt="notation_reference" show="projection CourseStatus"
```

A scenario of a projection asserts the value the `given` Events fold to, [read](#read) for the Tags it names.

## Advanced

The constructs below are not needed to read most examples. They are listed in the same order as the ones above.

### `json` <span class="dcb-badge">advanced</span> { #json data-toc-label="json" }

```dcb-fragment
// Written as JSON: …
handler Foo json { … }
```

A definition the notation cannot express is written as the JSON the DCB Playground stores, under a comment explaining why. Examples on this website never contain one. See [the guide](index.md#json-fallback).

### `type` <span class="dcb-badge">advanced</span> { #type data-toc-label="type" }

```dcb excerpt="notation_reference" show="type Capacity, type TimeSlot"
```

A named type based on `string`, `number`, `integer`, `boolean`, `object`, `array` or `null`, optionally followed by JSON Schema keywords that constrain it. `type Point = { …schema… }` declares a type by a complete JSON Schema.

### `enum` <span class="dcb-badge">advanced</span> { #enum data-toc-label="enum" }

```dcb excerpt="notation_reference" show="enum CourseStatus"
```

A fixed set of values. The members are strings and are written without quotes wherever the type is known: `set Existent`, `CourseStatus(courseId) == Existent`.

### `record` <span class="dcb-badge">advanced</span> { #record data-toc-label="record" }

```dcb excerpt="notation_reference" show="record PersonName"
```

A value with fields, each typed with a basic or declared type. A record has no identity of its own. A list of records can tag an Event by one of its fields, see [`tag`](#tag).

### `successor` <span class="dcb-badge">advanced</span> { #successor data-toc-label="successor" }

```dcb-fragment
on CourseDefined => set successor(event.data.courseId)
```

The value following another one: `7` → `8`, `c1` → `c2`, `inv-009` → `inv-010`. See [numbering](index.md#numbering) in the guide.

### `script` <span class="dcb-badge">advanced</span> { #script data-toc-label="script" }

```dcb excerpt="notation_reference" show="projection CoursePeakSubscriptions"
```

A projection written in JavaScript. Its Tags are declared like for any projection, so its Query is derived the same way.

| Field | Meaning |
|---|---|
| `(tag courseId: CourseId, days: integer)` | the Tags, then further values the script takes. A [read](#read) gives them in that order: `CourseActivity(courseId, 14)` |
| `script` | marks the projection as scripted |
| `initialState { … }` | the state before the first Event |
| `exposes peak` | the field of the state commands read. Without it, the whole state is the value |
| ``on E => ```expr``` `` | a handler: an expression over `state`, `event`, `tags` (`tags.courseId`) and `args` (`args.days`) that returns the next state |

The DCB Playground asks for confirmation before it opens a model containing scripts, and `?safe` in its address disables them.

### Fan-out <span class="dcb-badge">advanced</span> { #fan-out data-toc-label="Fan-out" }

```dcb-fragment
require ProductExists(each items.productId) is true
  else reject "Product does not exist"
```

`each` in front of a list reads once per element. A condition over the read has to hold for every element, and the Query contains one Query Item per element. See [fan-out reads](index.md#fan-out-reads) in the guide.

## Experimental

The constructs below are still being tried out. The DCB Playground only offers them once experimental features are switched on in its settings.

### Annotations <span class="dcb-badge dcb-badge--experimental">experimental</span> { #annotations data-toc-label="Annotations" }

| Annotation | On | Effect |
|---|---|---|
| `@icon("📚")` | entities, events, handlers | the symbol the playground shows it with |
| `@feature("Enrolment")` | handlers | the feature the playground lists it under |
| `@tagSchema("{type}={value}")` | tag types | how a Tag of the type is written, see [`tag type`](#tag-type) |

```dcb excerpt="notation_reference" show="entity Student, handler RegisterStudent"
```

### `currentValue` <span class="dcb-badge dcb-badge--experimental">experimental</span> { #current-value data-toc-label="currentValue" }

```dcb-fragment
on CourseDefined => set successor(currentValue)
```

The projection's own value, before the handler is applied.

### `entity` <span class="dcb-badge dcb-badge--experimental">experimental</span> { #entity data-toc-label="entity" }

```dcb excerpt="notation_reference" show="entity Course"
```

A name for projections that share an identity. The entity declares its identifier like a projection declares a Tag, and each property is a projection with exactly that Tag.

An entity is not stored, and it is not a consistency boundary: a command's Query contains only the Events of the properties it uses. See [entities](index.md#entities) in the guide.

### `lifecycle` <span class="dcb-badge dcb-badge--experimental">experimental</span> { #lifecycle data-toc-label="lifecycle" }

```dcb excerpt="notation_reference" show="entity Student, projection StudentExists"
```

Marks the property of an entity that holds the state an instance is in, a `boolean` (two states) or an [`enum`](#enum). The DCB Playground draws the state machine from its handlers and the conditions that guard them. An entity doesn't need a lifecycle.

### `derived` <span class="dcb-badge dcb-badge--experimental">experimental</span> { #derived data-toc-label="derived" }

```dcb excerpt="notation_reference" show="projection CourseIsFull"
```

A boolean defined by one condition over other projections, written like a [`require`](#require), without handlers or initial value. It declares its Tags and passes them on to the projections it reads. Reading it reads its operands, so their Events are part of the Query.

### Reading an entity <span class="dcb-badge dcb-badge--experimental">experimental</span> { #read-entity data-toc-label="Reading an entity" }

```dcb excerpt="notation_reference" show="handler RescheduleCourse"
```

| Read | Meaning |
|---|---|
| `alias course = Course(courseId)` | one instance of an [entity](#entity), by its identifier. Only the properties that are used contribute to the Query |
| `alias students = Student(each course.subscribedStudentIds)` | one instance per element of a list, see [fan-out](#fan-out) |
| `… excluding courseId` | drops one identifier from the list |

Reads can build on earlier ones, and the Query is then as deep as the chain. See [chained reads](index.md#chained-reads) in the guide.

### Arguments of an entity <span class="dcb-badge dcb-badge--experimental">experimental</span> { #with data-toc-label="Arguments of an entity" }

```dcb-fragment
alias course = Course(courseId, since: today)
```

Values for the further arguments of the [scripted projections](#script) among the entity's properties, by name after the identifier.

### Optional reads <span class="dcb-badge dcb-badge--experimental">experimental</span> { #optional-read data-toc-label="Optional reads" }

```dcb-fragment
alias tutor? = Student(tutorId)
```

The value may be `null`. Then nothing is read, and conditions over the alias hold.

### `emit … when` <span class="dcb-badge dcb-badge--experimental">experimental</span> { #emit-when data-toc-label="emit … when" }

```dcb-fragment
emit StudentSubscribedToCourse { courseId, studentId }
  when CourseIsFull(courseId) is false
emit StudentWaitlistedForCourse { courseId, studentId }
  when CourseIsFull(courseId) is true
```

The Event is only appended if its conditions hold, combined with `and`. A failing `when` does not reject the command. If no Event is appended, the command still succeeds. The conditions count towards the Query like the ones of `require`.
