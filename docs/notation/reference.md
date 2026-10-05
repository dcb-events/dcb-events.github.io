---
icon: material/book-alphabet
---

# DCB notation reference

Every construct of the [DCB notation](index.md), grouped like the help of the [:material-play-box-outline: DCB Playground](/playground/). The [advanced](#advanced) constructs, which are not needed to read most examples, are listed at the end. The [guide](index.md) introduces the notation step by step.

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
event CourseDefined { courseId: CourseId, capacity: Capacity }
event CourseCapacityChanged { courseId: CourseId, newCapacity: Capacity }
event CourseArchived { courseId: CourseId }
event CourseRescheduled { courseId: CourseId, slots: TimeSlot[] }
event StudentRegistered { studentId: StudentId, name: PersonName, email?: string }
event StudentSubscribedToCourse { courseId: CourseId, studentId: StudentId }
event StudentWaitlistedForCourse { courseId: CourseId, studentId: StudentId }

// Entities
@icon("📚")
entity Course {
  lifecycle status
  status = CourseStatus
  capacity = CourseCapacity
  subscriptionCount = CourseSubscriptionCount
  subscribedStudentIds = CourseSubscribedStudentIds
  slots = CourseSlots
  isFull = CourseIsFull
}

@icon("🧑‍🎓")
entity Student {
  lifecycle exists
  exists = StudentExists
  subscribedCourseIds = StudentSubscribedCourseIds
}

// Projections
projection CourseStatus(courseId: CourseId): CourseStatus = NonExistent {
  on CourseDefined => set Existent
  on CourseArchived => set Archived

  scenario "a defined course exists" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    then CourseStatus("c1") == Existent
  }
}

projection StudentExists(studentId: StudentId): boolean = false {
  on StudentRegistered => set true
}

projection CourseCapacity(courseId: CourseId): integer = 0 {
  on CourseDefined => set event.data.capacity
  on CourseCapacityChanged => set event.data.newCapacity
}

projection CourseSubscriptionCount(courseId: CourseId): integer = 0 {
  on StudentSubscribedToCourse => increment 1
}

projection CourseSubscribedStudentIds(courseId: CourseId): StudentId[] = [] {
  on StudentSubscribedToCourse => append event.data.studentId
}

projection StudentSubscribedCourseIds(studentId: StudentId): CourseId[] = [] {
  on StudentSubscribedToCourse => append event.data.courseId
}

projection CourseSlots(courseId: CourseId): TimeSlot[] = [] {
  on CourseRescheduled => set event.data.slots
}

projection CourseNumbering: CourseId = "c1" {
  on CourseDefined => set successor(event.data.courseId)
}

projection CourseIsFull(courseId: CourseId): boolean
  derived CourseSubscriptionCount(courseId) >= CourseCapacity(courseId)

projection CoursePeakSubscriptions: integer {
  script(courseId: CourseId)
  tagFilter ["CourseId:{courseId}"]
  initialState { current: 0, peak: 0 }
  exposes peak
  on StudentSubscribedToCourse => ```({ current: state.current + 1, peak: Math.max(state.peak, state.current + 1) })```
}

// Commands
@feature("Course management")
command DefineCourse(capacity: Capacity) {
  read numbering = CourseNumbering()

  emit CourseDefined { courseId: numbering, capacity }
}

@feature("Course management")
command ChangeCourseCapacity(courseId: CourseId, newCapacity: Capacity) {
  read course = Course[courseId]

  require course.status == Existent
  require course.subscriptionCount <= newCapacity

  emit CourseCapacityChanged { courseId, newCapacity }
}

@feature("Course management")
command ArchiveCourse(courseId: CourseId) {
  read course = Course[courseId]

  require course.status == Existent

  emit CourseArchived { courseId }

  scenario "an archived course cannot be archived again" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    given CourseArchived { courseId: "c1" }
    when ArchiveCourse { courseId: "c1" }
    then rejected by course.status == Existent saw Archived, Existent
  }

  scenario "an existing course is archived" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    when ArchiveCourse { courseId: "c1" }
    then CourseArchived { courseId: "c1" }
  }
}

@feature("Course management")
command RescheduleCourse(courseId: CourseId, slots: TimeSlot[]) {
  read course = Course[courseId]
  read students = Student[course.subscribedStudentIds]
  read theirs = Course[students.subscribedCourseIds] excluding courseId

  require course.status == Existent
  require theirs.slots not containsAny slots

  emit CourseRescheduled { courseId, slots }
}

@feature("Students")
command RegisterStudent(studentId: StudentId, name: PersonName, email?: string) {
  read student = Student[studentId]

  require student.exists is false

  emit StudentRegistered { studentId, name, email }
}

@feature("Enrolment")
command SubscribeStudentToCourse(courseId: CourseId, studentId: StudentId) {
  read course = Course[courseId]
  read student = Student[studentId]

  require course.status == Existent
  require student.exists is true
  require course.subscribedStudentIds not contains studentId
  require count(student.subscribedCourseIds) < 10

  emit StudentSubscribedToCourse { courseId, studentId }
    when course.isFull is false
  emit StudentWaitlistedForCourse { courseId, studentId }
    when course.isFull is true
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

Values are written as JSON. Keys of objects may be written without quotes. Members of an [`enum`](#enum) are written without quotes wherever the type is known.

## Data

### `tag type` { #tag-type }

```dcb excerpt="notation_reference" show="type CourseId, type StudentId"
```

An identifier. Every Event with a property of this type is [tagged](../specification.md#tag) with its value: `CourseId:c1`. The Tags of an Event are never declared, they follow from the types of its properties.

The constraints after the base type are optional, see [`type`](#type). With `@tagSchema("{type}={value}")` a Tag is written differently, `{type}:{value}` is the default.

### `event` { #event }

```dcb excerpt="notation_reference" show="event CourseDefined, event StudentRegistered"
```

An [Event](../specification.md#event), named in the past tense, with its properties:

| Property | Meaning |
|---|---|
| `courseId: CourseId` | a property, typed with a declared type or a basic one (`string`, `number`, `integer`, `boolean`) |
| `email?: string` | optional: `null` when not set |
| `slots: TimeSlot[]` | a list |

## State

### `projection` { #projection }

```dcb excerpt="notation_reference" show="projection CourseCapacity, projection CourseSubscribedStudentIds"
```

A fold over Events: parameters, the value's type, the initial value, and one handler per Event type. The parameters are tag types: `CourseCapacity("c1")` only sees Events tagged `CourseId:c1`. A projection without parameters sees all Events of the types it handles:

```dcb excerpt="notation_reference" show="projection CourseNumbering"
```

See [projections](../topics/projections.md) for the concept.

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

### `command` { #command }

```dcb excerpt="notation_reference" show="command ChangeCourseCapacity"
```

What can be done: the command's properties (`?` optional, `[]` a list), then its [reads](#read), [conditions](#require) and [Events](#emit), in this order.

### `read` { #read }

```dcb-fragment
read numbering = CourseNumbering()
read count = CourseSubscriptionCount(courseId)
```

Binds the value of a projection to a name that conditions and Events refer to. There is one argument per parameter of the projection, `StudentExists(studentId: tutorId)`, and `(courseId)` is short for `(courseId: courseId)`. The arguments are properties of the command, earlier reads or literals.

### `require` { #require }

```dcb excerpt="notation_reference" show="command SubscribeStudentToCourse"
```

A condition that has to hold, otherwise the command is rejected. Operands are properties of the command (`studentId`), reads and their properties (`course.status`), literals and enum members.

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

```dcb-fragment
emit CourseDefined { courseId: numbering, capacity }
```

Appends an Event if all conditions hold. Each property is taken from a property of the command, a read or a literal. `capacity` is short for `capacity: capacity`.

### Consistency boundary { #consistency-boundary }

Never written. Each read contributes the Event types of the projections it uses, with the Tags of their arguments. The Events are appended with an [Append Condition](../specification.md#append-condition) that fails if an Event matching that Query was appended since the command read. See [from notation to DCB](index.md#from-notation-to-dcb) in the guide.

## Scenarios

### `scenario` { #scenario }

```dcb excerpt="notation_reference" show="command ArchiveCourse"
```

An example that pins behaviour down, inside the command or projection it is about. The name is optional.

| Line | Meaning |
|---|---|
| `given E { … }` | an Event already appended. Values are JSON, enum members without quotes |
| `when C { … }` | the command, with all of its properties |
| `then E { … }` | the Events appended |
| `then nothing` | no Event appended |
| `then rejected by <condition>` | the condition that rejected the command |

In the DCB Playground the `then` is optional, applying a text without one records what the model does. On this website every scenario has to state it.

## Advanced

The constructs below are not needed to read most examples. They are listed in the same order as the ones above.

### Annotations <span class="dcb-badge">advanced</span> { #annotations data-toc-label="Annotations" }

| Annotation | On | Effect |
|---|---|---|
| `@icon("📚")` | entities, events, commands | the symbol the playground shows it with |
| `@feature("Enrolment")` | commands | the feature the playground lists it under |
| `@tagSchema("{type}={value}")` | tag types | how a Tag of the type is written, see [`tag type`](#tag-type) |

```dcb excerpt="notation_reference" show="entity Student, command RegisterStudent"
```

### `json` <span class="dcb-badge">advanced</span> { #json data-toc-label="json" }

```dcb-fragment
// Written as JSON: …
command Foo json { … }
```

A definition the notation cannot express is written as the JSON the DCB Playground stores, under a comment explaining why. Examples on this website never contain one. See [the guide](index.md#json-fallback).

### `type` <span class="dcb-badge">advanced</span> { #type data-toc-label="type" }

```dcb excerpt="notation_reference" show="type Capacity, type TimeSlot"
```

A named type based on `string`, `number`, `integer`, `boolean`, `object`, `array` or `null`, optionally followed by JSON Schema keywords that constrain it. `type Point = { …schema… }` declares a type by a complete JSON Schema.

### `enum` <span class="dcb-badge">advanced</span> { #enum data-toc-label="enum" }

```dcb excerpt="notation_reference" show="enum CourseStatus"
```

A fixed set of values. The members are strings and are written without quotes wherever the type is known: `set Existent`, `course.status == Existent`.

### `record` <span class="dcb-badge">advanced</span> { #record data-toc-label="record" }

```dcb excerpt="notation_reference" show="record PersonName"
```

A value with fields, each typed with a basic or declared type. A record has no identity and no Tag of its own.

### `successor` <span class="dcb-badge">advanced</span> { #successor data-toc-label="successor" }

```dcb-fragment
on CourseDefined => set successor(event.data.courseId)
```

The value following another one: `7` → `8`, `c1` → `c2`, `inv-009` → `inv-010`. See [numbering](index.md#numbering) in the guide.

### `currentValue` <span class="dcb-badge">advanced</span> { #current-value data-toc-label="currentValue" }

```dcb-fragment
on CourseDefined => set successor(currentValue)
```

The projection's own value, before the handler is applied.

### `entity` <span class="dcb-badge">advanced</span> { #entity data-toc-label="entity" }

```dcb excerpt="notation_reference" show="entity Course"
```

A name for projections that share an identity. Each property is a projection with the entity's identifier as its only parameter. The identifier's type is the entity's name with `Id` appended (`CourseId`). `entity Course[CourseKey] { … }` names a different one.

An entity is not stored, and it is not a consistency boundary: a command's Query contains only the Events of the properties it uses. See [entities](index.md#entities) in the guide.

### `lifecycle` <span class="dcb-badge">advanced</span> { #lifecycle data-toc-label="lifecycle" }

```dcb excerpt="notation_reference" show="entity Student, projection StudentExists"
```

Marks the property of an entity that holds the state an instance is in, a `boolean` (two states) or an [`enum`](#enum). The DCB Playground draws the state machine from its handlers and the conditions that guard them. An entity doesn't need a lifecycle.

### `derived` <span class="dcb-badge">advanced</span> { #derived data-toc-label="derived" }

```dcb excerpt="notation_reference" show="projection CourseIsFull"
```

A boolean defined by one condition over other projections, written like a [`require`](#require), without handlers or initial value. Reading it reads its operands, so their Events are part of the Query.

### `script` <span class="dcb-badge">advanced</span> { #script data-toc-label="script" }

```dcb excerpt="notation_reference" show="projection CoursePeakSubscriptions"
```

A projection written in JavaScript:

| Field | Meaning |
|---|---|
| `script(courseId: CourseId)` | the arguments a command passes, available as `args` |
| `tagFilter ["CourseId:{courseId}"]` | the Tags of its Query, all of which an Event must have. `{courseId}` is replaced by the argument, `[]` means all Events of the handled types |
| `initialState { … }` | the state before the first Event |
| `exposes peak` | the field of the state commands read. Without it, the whole state is the value |
| ``on E => ```expr``` `` | a handler: an expression over `state`, `event` and `args` that returns the next state |

The DCB Playground asks for confirmation before it opens a model containing scripts, and `?safe` in its address disables them.

### `read` an entity <span class="dcb-badge">advanced</span> { #read-entity data-toc-label="read an entity" }

```dcb-fragment
read course = Course[courseId]
```

One instance of an [entity](#entity), by its identifier. Only the properties that are used contribute to the Query.

### Fan-out <span class="dcb-badge">advanced</span> { #fan-out data-toc-label="Fan-out" }

```dcb excerpt="notation_reference" show="command RescheduleCourse"
```

| Read | Meaning |
|---|---|
| `read students = Student[course.subscribedStudentIds]` | one instance per element of a list. A condition over it has to hold for every instance |
| `… excluding courseId` | drops one identifier from the list |

Reads can build on earlier ones, and the Query is then as deep as the chain. See [fan-out reads](index.md#fan-out-reads) in the guide.

### Optional reads <span class="dcb-badge">advanced</span> { #optional-read data-toc-label="Optional reads" }

```dcb-fragment
read tutor? = Student[tutorId]
```

The identifier may be `null`. Then nothing is read, and conditions over the read hold.

### `with` <span class="dcb-badge">advanced</span> { #with data-toc-label="with" }

```dcb-fragment
read course = Course[courseId] with (since: today)
```

Arguments for the [scripted projections](#script) among the entity's properties.

### `emit … when` <span class="dcb-badge">advanced</span> { #emit-when data-toc-label="emit … when" }

```dcb-fragment
emit StudentSubscribedToCourse { courseId, studentId }
  when course.isFull is false
emit StudentWaitlistedForCourse { courseId, studentId }
  when course.isFull is true
```

The Event is only appended if its conditions hold, combined with `and`. A failing `when` does not reject the command. If no Event is appended, the command still succeeds. The conditions count towards the Query like the ones of `require`.

### `saw` and `at` <span class="dcb-badge">advanced</span> { #saw data-toc-label="saw and at" }

```dcb-fragment
then rejected by course.status == Existent saw Archived, Existent
then rejected by otherCourses.slots not containsAny slots saw ["mon-9"], ["mon-9", "tue-9"] at 0
```

The values the rejecting condition saw, left and right. For a condition over a [fan-out](#fan-out), `at` is the position of the instance it failed for. Both are optional when written. The DCB Playground fills them in.

### Projection scenarios <span class="dcb-badge">advanced</span> { #projection-scenario data-toc-label="Projection scenarios" }

```dcb excerpt="notation_reference" show="projection CourseStatus"
```

A scenario inside a projection asserts the value the `given` Events fold to, at the projection's arguments in declared order.
