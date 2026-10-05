---
icon: material/code-braces
---

# DCB notation

The examples on this website are written in the *DCB notation*, a small text language for describing a DCB model: the Events of a system, the projections that fold them into state, and the commands that decide on that state and append new Events.

What makes it useful for DCB is what it does *not* contain: a command never states its consistency boundary. The notation says what a command reads, and the [Query](../specification.md#query) and [Append Condition](../specification.md#append-condition) are derived from that. Every example on this site shows the result in its "Consistency boundary" tab.

!!! warning "Experimental"

    The DCB notation is the text form of models in the [:material-play-box-outline: DCB Playground](/playground/) and, like the playground, it is subject to change.
    The source of truth is the playground's JSON format ([schema v6](/schemas/model/v6.json)): every construct of the notation is exactly one shape of that format, so a model can be turned into text and back without losing anything.

This page introduces the notation step by step. The first part covers the basics needed to read the examples. The second part, marked <span class="dcb-badge">advanced</span>, covers the rest. Every keyword is listed in the [reference](reference.md).

## Basics

### A first model

The following model allows to define courses, each with a unique id:

```dcb id="notation_01"
model "Courses"

tag type CourseId = string

event CourseDefined { courseId: CourseId, capacity: integer }

projection CourseExists(courseId: CourseId): boolean = false {
  on CourseDefined => set true
}

command DefineCourse(courseId: CourseId, capacity: integer) {
  read courseExists = CourseExists(courseId)

  require courseExists is false

  emit CourseDefined { courseId, capacity }

  scenario "Define course with existing id" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    when DefineCourse { courseId: "c1", capacity: 15 }
    then rejected by courseExists is false
  }
  scenario "Define course with new id" {
    when DefineCourse { courseId: "c1", capacity: 15 }
    then CourseDefined { courseId: "c1", capacity: 15 }
  }
}
```

It consists of five kinds of declarations, which may appear in any order. The rendered model is always printed the way the DCB Playground prints it: grouped by kind, under comments like `// Types`.

### Types

```dcb-fragment
tag type CourseId = string
```

A `type` gives a value a name. A type marked with `tag` is an identifier: every Event carrying a value of that type is [tagged](../specification.md#tag) with it, `CourseDefined { courseId: "c1", … }` gets the Tag `CourseId:c1`.

Tags are never declared on an Event: they follow from the types of its properties. That is what allows the notation to derive which Events a command has to query.

### Events

```dcb-fragment
event CourseDefined { courseId: CourseId, capacity: integer }
```

An [Event](../specification.md#event) has a name in the past tense and a list of typed properties. A property is typed with a type declared in the model or with one of JSON's basic types: `string`, `number`, `integer`, `boolean`. `email?: string` is an optional property and `courseIds: CourseId[]` a list.

### Projections

```dcb-fragment
projection CourseExists(courseId: CourseId): boolean = false {
  on CourseDefined => set true
}
```

A [projection](../topics/projections.md) folds Events into a value. It has a value type and an initial value (`boolean = false`), and one handler per Event type it reacts to: `on CourseDefined => set true`.

Its parameters are tag types and determine which Events it receives: `CourseExists("c1")` only sees Events tagged `CourseId:c1`. A projection without parameters sees all Events of the types it handles.

The handlers are a fixed set of operations:

| Handler | Effect |
|---|---|
| `set <value>` | replaces the value |
| `increment <n>`, `decrement <n>` | changes an integer |
| `append <value>`, `remove <value>` | changes a list |

A value is a literal (`true`, `0`, `"c1"`) or a property of the Event: `event.data.capacity`.

### Commands

```dcb-fragment
command DefineCourse(courseId: CourseId, capacity: integer) {
  read courseExists = CourseExists(courseId)

  require courseExists is false

  emit CourseDefined { courseId, capacity }
}
```

A command has three parts, always in this order:

1. `read` binds the value of a projection to a name, here the projection `CourseExists` for the course of the command
2. `require` states a condition that has to hold. If one does not, the command is rejected
3. `emit` appends an Event. Each of its properties is taken from the command or from a read. `{ courseId, capacity }` is short for `{ courseId: courseId, capacity: capacity }`

### Scenarios

```dcb-fragment
scenario "Define course with existing id" {
  given CourseDefined { courseId: "c1", capacity: 10 }
  when DefineCourse { courseId: "c1", capacity: 15 }
  then rejected by courseExists is false
}
```

A scenario sits inside the command it tests: `given` the Events already appended, `when` the command is handled, `then` the Events it appends, `nothing`, or the condition that rejected it.

In the rendered model, a rejection also states the values the condition [saw](#rejections): `then rejected by courseExists is false saw true`.

The scenarios are not just documentation: the build of this website fails if one of them does not hold.

### Adding a command

The next step adds a command to change the capacity of a course. `CourseCapacity` shows a projection that takes its value from the Events:

```dcb id="notation_02" extends="notation_01"
event CourseCapacityChanged { courseId: CourseId, newCapacity: integer }

projection CourseCapacity(courseId: CourseId): integer = 0 {
  on CourseDefined => set event.data.capacity
  on CourseCapacityChanged => set event.data.newCapacity
}

command ChangeCourseCapacity(courseId: CourseId, newCapacity: integer) {
  read courseExists = CourseExists(courseId)
  read capacity = CourseCapacity(courseId)

  require courseExists is true
  require capacity != newCapacity

  emit CourseCapacityChanged { courseId, newCapacity }

  scenario "Change capacity of a non-existing course" {
    when ChangeCourseCapacity { courseId: "c0", newCapacity: 15 }
    then rejected by courseExists is true
  }
  scenario "Change capacity of a course to a new value" {
    given CourseDefined { courseId: "c1", capacity: 12 }
    when ChangeCourseCapacity { courseId: "c1", newCapacity: 15 }
    then CourseCapacityChanged { courseId: "c1", newCapacity: 15 }
  }
}
```

!!! tip

    The highlighted lines are the ones that changed compared to the previous step. ":material-play-box-outline: Open in Playground" opens the complete model in the [DCB Playground](/playground/), where it can be edited and run.

### Constraints across entities

The last basic step adds the command that is the reason this example exists: a student subscribes to a course, as long as the course is not full and the student is not subscribed to more than five courses:

```dcb id="notation_03" extends="notation_02"
tag type StudentId = string

event StudentSubscribedToCourse { courseId: CourseId, studentId: StudentId }

projection CourseSubscriptionCount(courseId: CourseId): integer = 0 {
  on StudentSubscribedToCourse => increment 1
}

projection StudentCourseIds(studentId: StudentId): CourseId[] = [] {
  on StudentSubscribedToCourse => append event.data.courseId
}

command SubscribeStudentToCourse(courseId: CourseId, studentId: StudentId) {
  read courseExists = CourseExists(courseId)
  read capacity = CourseCapacity(courseId)
  read subscriptionCount = CourseSubscriptionCount(courseId)
  read studentCourseIds = StudentCourseIds(studentId)

  require courseExists is true
  require subscriptionCount < capacity
  require studentCourseIds not contains courseId
  require count(studentCourseIds) < 5

  emit StudentSubscribedToCourse { courseId, studentId }

  scenario "Subscribe student to fully booked course" {
    given CourseDefined { courseId: "c1", capacity: 1 }
    given StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
    when SubscribeStudentToCourse { courseId: "c1", studentId: "s2" }
    then rejected by subscriptionCount < capacity
  }
  scenario "Subscribe student to the same course twice" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    given StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
    when SubscribeStudentToCourse { courseId: "c1", studentId: "s1" }
    then rejected by studentCourseIds not contains courseId
  }
  scenario "Subscribe student to course with capacity" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    when SubscribeStudentToCourse { courseId: "c1", studentId: "s1" }
    then StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
  }
}
```

`StudentSubscribedToCourse` has two properties of a tag type, so it is tagged with both, the course *and* the student. Conditions can compare two reads (`subscriptionCount < capacity`), test lists (`not contains`, `count(…)`) and more, see [conditions](reference.md#require) in the reference.

## From notation to DCB

A command's reads are all it takes to derive its consistency boundary. Each read contributes one [Query Item](../specification.md#query-item): the Event types the projection handles, with the Tags of its arguments. The "Consistency boundary" tab of the last example shows this for every command, for `SubscribeStudentToCourse`:

| Read | Event Types | Tags |
|---|---|---|
| `courseExists` | `CourseDefined` | `CourseId:{courseId}` |
| `capacity` | `CourseDefined`, `CourseCapacityChanged` | `CourseId:{courseId}` |
| `subscriptionCount` | `StudentSubscribedToCourse` | `CourseId:{courseId}` |
| `studentCourseIds` | `StudentSubscribedToCourse` | `StudentId:{studentId}` |

The command reads the Events matching this Query, decides, and appends its Event with an [Append Condition](../specification.md#append-condition) that fails if an Event matching the same Query was appended in the meantime.

That is exactly the right boundary, and it was not written down anywhere:

- a concurrent subscription to the same course, or by the same student, makes the append fail, since `StudentSubscribedToCourse` is tagged with both
- so does a concurrent change of the course's capacity, because the command read `capacity`
- subscriptions to other courses by other students don't interfere at all

Adding a condition to a command, or removing one, changes its boundary accordingly. Since the boundary is derived, it cannot become outdated.

## Advanced features

The rest of this page covers features that are not needed to read most examples. Each section shows only the declarations it is about. The complete model, with everything combined, is at [the end](#the-complete-model).

### Entities <span class="dcb-badge">advanced</span> { #entities data-toc-label="Entities" }

The commands above read four projections, two of them about the same course. An *entity* gives projections that share an identity one name:

```dcb id="notation_04" extends="notation_03" hidden="true"
entity Course {
  exists = CourseExists
  capacity = CourseCapacity
  subscriptionCount = CourseSubscriptionCount
}

entity Student {
  courseIds = StudentCourseIds
}

command DefineCourse(courseId: CourseId, capacity: integer) {
  read course = Course[courseId]

  require course.exists is false

  emit CourseDefined { courseId, capacity }

  scenario "Define course with existing id" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    when DefineCourse { courseId: "c1", capacity: 15 }
    then rejected by course.exists is false
  }
}

command ChangeCourseCapacity(courseId: CourseId, newCapacity: integer) {
  read course = Course[courseId]

  require course.exists is true
  require course.capacity != newCapacity

  emit CourseCapacityChanged { courseId, newCapacity }

  scenario "Change capacity of a non-existing course" {
    when ChangeCourseCapacity { courseId: "c0", newCapacity: 15 }
    then rejected by course.exists is true
  }
}

command SubscribeStudentToCourse(courseId: CourseId, studentId: StudentId) {
  read course = Course[courseId]
  read student = Student[studentId]

  require course.exists is true
  require course.subscriptionCount < course.capacity
  require student.courseIds not contains courseId
  require count(student.courseIds) < 5

  emit StudentSubscribedToCourse { courseId, studentId }

  scenario "Subscribe student to fully booked course" {
    given CourseDefined { courseId: "c1", capacity: 1 }
    given StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
    when SubscribeStudentToCourse { courseId: "c1", studentId: "s2" }
    then rejected by course.subscriptionCount < course.capacity
  }
  scenario "Subscribe student to the same course twice" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    given StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
    when SubscribeStudentToCourse { courseId: "c1", studentId: "s1" }
    then rejected by student.courseIds not contains courseId
  }
}
```

```dcb excerpt="notation_04" show="entity Course, entity Student"
```

Each property of an entity is a projection with the entity's identifier as its only parameter. The identifier's type is the entity's name with `Id` appended (`CourseId`), and a command reads one instance by it, with brackets:

```dcb excerpt="notation_04" show="command SubscribeStudentToCourse"
```

!!! info "An entity is not a consistency boundary"

    It is tempting to read `Course[courseId]` as "load the course", like an Aggregate. That is not what happens: an entity is not stored and has no boundary of its own. A command's Query contains only the Events of the properties it *uses*. `ChangeCourseCapacity` uses `course.exists` and `course.capacity`, so a concurrent subscription to the course does not affect it, although `subscriptionCount` belongs to the same entity.

    The Query of each command selects exactly the same Events as in the previous step. The only difference is that the Query Items for the same course are combined into one, see the "Consistency boundary" tab of the [complete model](#the-complete-model).

Entities are optional. Everything they do can be written with plain projections, as in the basics. They are useful when several commands read the same things, and they make lifecycles possible.

### Lifecycles <span class="dcb-badge">advanced</span> { #lifecycles data-toc-label="Lifecycles" }

An entity may mark one property as its *lifecycle*, the property that says which state an instance is in:

```dcb id="notation_05" extends="notation_04" removes="projection CourseExists" hidden="true"
enum CourseStatus { NonExistent, Existent, Archived }

event CourseArchived { courseId: CourseId }

entity Course {
  lifecycle status
  status = CourseStatus
  capacity = CourseCapacity
  subscriptionCount = CourseSubscriptionCount
}

projection CourseStatus(courseId: CourseId): CourseStatus = NonExistent {
  on CourseDefined => set Existent
  on CourseArchived => set Archived
}

command DefineCourse(courseId: CourseId, capacity: integer) {
  read course = Course[courseId]

  require course.status == NonExistent

  emit CourseDefined { courseId, capacity }

  scenario "Define course with existing id" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    when DefineCourse { courseId: "c1", capacity: 15 }
    then rejected by course.status == NonExistent
  }
}

command ChangeCourseCapacity(courseId: CourseId, newCapacity: integer) {
  read course = Course[courseId]

  require course.status == Existent
  require course.capacity != newCapacity

  emit CourseCapacityChanged { courseId, newCapacity }

  scenario "Change capacity of a non-existing course" {
    when ChangeCourseCapacity { courseId: "c0", newCapacity: 15 }
    then rejected by course.status == Existent
  }
}

command ArchiveCourse(courseId: CourseId) {
  read course = Course[courseId]

  require course.status == Existent

  emit CourseArchived { courseId }

  scenario "Archive an archived course" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    given CourseArchived { courseId: "c1" }
    when ArchiveCourse { courseId: "c1" }
    then rejected by course.status == Existent
  }
}

command SubscribeStudentToCourse(courseId: CourseId, studentId: StudentId) {
  read course = Course[courseId]
  read student = Student[studentId]

  require course.status == Existent
  require course.subscriptionCount < course.capacity
  require student.courseIds not contains courseId
  require count(student.courseIds) < 5

  emit StudentSubscribedToCourse { courseId, studentId }
}
```

```dcb excerpt="notation_05" show="enum CourseStatus, entity Course, projection CourseStatus, command ArchiveCourse"
```

A lifecycle is either a `boolean` (two states, e.g. `lifecycle exists`) or an `enum` (`enum CourseStatus { … }` declares one). The DCB Playground draws the state machine from it: which Event moves an instance to which state, and which conditions guard each move. For the model itself, a lifecycle is an ordinary projection.

### Fan-out reads <span class="dcb-badge">advanced</span> { #fan-out-reads data-toc-label="Fan-out reads" }

An entity can be read for a whole list of identifiers at once. Rescheduling a course must not clash with the other courses of its students. The command reads the course, then every student subscribed to it, then every other course of those students:

```dcb id="notation_06" extends="notation_05" hidden="true"
event CourseRescheduled { courseId: CourseId, slots: string[] }

entity Course {
  lifecycle status
  status = CourseStatus
  capacity = CourseCapacity
  subscriptionCount = CourseSubscriptionCount
  studentIds = CourseStudentIds
  slots = CourseSlots
}

projection CourseStudentIds(courseId: CourseId): StudentId[] = [] {
  on StudentSubscribedToCourse => append event.data.studentId
}

projection CourseSlots(courseId: CourseId): string[] = [] {
  on CourseRescheduled => set event.data.slots
}

command RescheduleCourse(courseId: CourseId, slots: string[]) {
  read course = Course[courseId]
  read students = Student[course.studentIds]
  read otherCourses = Course[students.courseIds] excluding courseId

  require course.status == Existent
  require otherCourses.slots not containsAny slots

  emit CourseRescheduled { courseId, slots }

  scenario "Reschedule a course into a slot of another course of a student" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    given CourseDefined { courseId: "c2", capacity: 10 }
    given CourseRescheduled { courseId: "c2", slots: ["mon-9"] }
    given StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
    given StudentSubscribedToCourse { courseId: "c2", studentId: "s1" }
    when RescheduleCourse { courseId: "c1", slots: ["mon-9", "tue-9"] }
    then rejected by otherCourses.slots not containsAny slots
  }
}
```

```dcb excerpt="notation_06" show="command RescheduleCourse"
```

Whether a read fans out follows from its identifier: `course.studentIds` is a list, so `students` is one instance per element, and a condition over it has to hold for every instance. `excluding` drops one identifier from the list.

The boundary is then as deep as the chain of reads: the Query contains one Query Item per instance read, so a student subscribing to yet another course in the meantime makes the append fail.

### Conditional emits <span class="dcb-badge">advanced</span> { #conditional-emits data-toc-label="Conditional emits" }

A command can append different Events depending on the state it read. Instead of rejecting a subscription to a full course, it can put the student on a waiting list:

```dcb id="notation_07" extends="notation_06" hidden="true"
event StudentWaitlistedForCourse { courseId: CourseId, studentId: StudentId }

entity Course {
  lifecycle status
  status = CourseStatus
  capacity = CourseCapacity
  subscriptionCount = CourseSubscriptionCount
  studentIds = CourseStudentIds
  slots = CourseSlots
  isFull = CourseIsFull
}

projection CourseIsFull(courseId: CourseId): boolean
  derived CourseSubscriptionCount(courseId) >= CourseCapacity(courseId)

command SubscribeStudentToCourse(courseId: CourseId, studentId: StudentId) {
  read course = Course[courseId]
  read student = Student[studentId]

  require course.status == Existent
  require student.courseIds not contains courseId
  require count(student.courseIds) < 5

  emit StudentSubscribedToCourse { courseId, studentId }
    when course.isFull is false
  emit StudentWaitlistedForCourse { courseId, studentId }
    when course.isFull is true

  scenario "Subscribe student to fully booked course" {
    given CourseDefined { courseId: "c1", capacity: 1 }
    given StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
    when SubscribeStudentToCourse { courseId: "c1", studentId: "s2" }
    then StudentWaitlistedForCourse { courseId: "c1", studentId: "s2" }
  }
}
```

```dcb excerpt="notation_07" show="command SubscribeStudentToCourse"
```

An Event with a `when` is only appended if its conditions hold (several are combined with `and`). Unlike a `require`, a failing `when` does not reject the command. The conditions count towards the consistency boundary just like the ones of `require`.

### Derived projections <span class="dcb-badge">advanced</span> { #derived-projections data-toc-label="Derived projections" }

`course.isFull` in the previous section is a *derived* projection: a boolean defined by one condition over other projections, without handlers of its own:

```dcb excerpt="notation_07" show="projection CourseIsFull"
```

Reading it reads its operands: every command that uses `course.isFull` has `StudentSubscribedToCourse`, `CourseDefined` and `CourseCapacityChanged` in its Query.

### Scripted projections <span class="dcb-badge">advanced</span> { #scripted-projections data-toc-label="Scripted projections" }

The handler operations are deliberately few, because the DCB Playground analyses them (e.g. to draw lifecycles). For anything else, a projection can be written in JavaScript:

```dcb id="notation_scripted" extends="notation_07" hidden="true"
projection CoursePeakSubscriptions: integer {
  script(courseId: CourseId)
  tagFilter ["CourseId:{courseId}"]
  initialState { current: 0, peak: 0 }
  exposes peak
  on StudentSubscribedToCourse => ```({ current: state.current + 1, peak: Math.max(state.peak, state.current + 1) })```
}
```

```dcb excerpt="notation_scripted" show="projection CoursePeakSubscriptions"
```

Each handler is an expression over `state`, `event` and `args` that returns the next state. Since the script can't be analysed, its Query is declared instead of derived: `tagFilter` lists the Tags, with `{courseId}` replaced by the argument of the same name. `exposes` names the part of the state commands read.

The playground runs scripts unsandboxed in the browser, so it asks for confirmation before opening a model that contains one.

### Numbering <span class="dcb-badge">advanced</span> { #numbering data-toc-label="Numbering" }

Instead of the client choosing a course id, the model can number courses itself. `successor(…)` is the value following another one (`c1` → `c2`, `inv-009` → `inv-010`), and a projection without parameters sees all Events of its types:

```dcb id="notation_numbering" extends="notation_07" removes="command DefineCourse" hidden="true"
projection CourseNumbering: CourseId = "c1" {
  on CourseDefined => set successor(event.data.courseId)
}

command DefineCourse(capacity: integer) {
  read nextCourseId = CourseNumbering()

  emit CourseDefined { courseId: nextCourseId, capacity }

  scenario "Define the second course" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    when DefineCourse { capacity: 15 }
    then CourseDefined { courseId: "c2", capacity: 15 }
  }
}
```

```dcb excerpt="notation_numbering" show="projection CourseNumbering, command DefineCourse"
```

`currentValue` refers to the projection's own value in a handler, e.g. `on CourseDefined => set successor(currentValue)`.

The [invoice number](../examples/invoice-number.md) example uses this to create a gapless sequence.

### Types with constraints, enums and records <span class="dcb-badge">advanced</span> { #constrained-types data-toc-label="Constrained types, enums, records" }

Besides tag types, a model can declare types that constrain a value, enums and records:

```dcb id="notation_types" extends="notation_scripted" hidden="true"
type Capacity = integer { minimum: 1 }

record PersonName { given: string, family: string }

event StudentRegistered { studentId: StudentId, name: PersonName, email?: string }
```

```dcb excerpt="notation_types" show="type Capacity, enum CourseStatus, record PersonName, event StudentRegistered"
```

The constraints after a type are JSON Schema keywords. An enum's members are strings, written without quotes wherever the type is known. A record has fields, but no identity and no Tag.

### Annotations <span class="dcb-badge">advanced</span> { #annotations data-toc-label="Annotations" }

Annotations change how the DCB Playground presents a definition, not what it means:

```dcb-fragment
@icon("📚")
entity Course { … }

@feature("Course management")
command ArchiveCourse(courseId: CourseId) { … }

@tagSchema("{type}={value}")
tag type CourseId = string
```

`@icon` and `@feature` are for the playground's pages only. `@tagSchema` changes how a Tag of that type is written, `CourseId:c1` by default.

### Rejections in detail <span class="dcb-badge">advanced</span> { #rejections data-toc-label="Rejections in detail" }

A rejection in a scenario can state the values the condition saw, left and right of the operator:

```dcb-fragment
then rejected by course.status == Existent saw Archived, Existent
then rejected by otherCourses.slots not containsAny slots saw ["mon-9"], ["mon-9", "tue-9"] at 0
```

When writing a scenario, `saw` can be left out. The DCB Playground fills it in, which is why every rendered model contains it. For a condition over a [fan-out read](#fan-out-reads), `at` is the position of the instance it failed for.

A rejection carries no custom message: the condition that failed *is* the message.

### When the notation can't express something <span class="dcb-badge">advanced</span> { #json-fallback data-toc-label="JSON fallback" }

The DCB Playground can store a few things the notation has no spelling for (yet). Instead of dropping them, it writes such a definition as its JSON, with a comment explaining why:

```dcb-fragment
// Written as JSON: …
command Foo json { … }
```

Examples on this website never contain JSON definitions, the build fails if one would be needed.

### The complete model { data-toc-label="The complete model" }

All advanced features above combined, except the numbering, which replaces how courses are defined:

```dcb id="notation_complete" extends="notation_types"
model "Courses (complete)"
```

## Prior art

The DCB notation is not the first language for event-sourced models, and it borrows from two of them.

**heklang** [:octicons-link-external-16:](https://git.tqwewe.com/tephra/heklang){:target="_blank" .small} is a total language for event-sourced application logic and, like this notation, built around DCB: the Events a command folded are the condition its append is checked against.

- *Borrowed:* `emit Event { field, other: value }` including the shorthand for fields named like the command's properties, and `on Event => …` for the handlers of a fold.
- *Different:* heklang folds Events *inline*, inside the command that needs the result. The DCB notation declares every fold once, as a named projection, and commands read it by name. A projection that two entities share and three commands read would otherwise have to be written five times, and the DCB Playground stores models that way, too.
- *Different:* a heklang fold arm is an expression (`=> state + 1`). The notation only allows a fixed set of operations (`set`, `increment`, `append`, …), because the playground analyses them, e.g. to draw a lifecycle from the Events that move it. A [scripted projection](#scripted-projections) is the way out.

**Weltenwanderer** [:octicons-link-external-16:](https://www.weltenwanderer.dev/){:target="_blank" .small} is a specification language for domain models that compiles to verified TypeScript, organised around *deciders*: a state, the commands decided on it, and the Events that evolve it.

- *Borrowed:* `require` for a condition, `type X = string`, and `X[]` for lists.
- *Different:* a decider groups commands around one state, which is what an Aggregate does. The DCB notation deliberately has no such grouping: an [entity](#entities) only names projections, and each command's boundary is derived from what it reads, not from what it belongs to.
- *Different:* Weltenwanderer attaches a message to a condition (`require … else reject "…"`). The DCB Playground's model has no place for such a message, so a rejection is reported as the condition that failed.

Both use `@annotation(…)` for metadata, as does the notation.

What is new is mostly what DCB requires: `tag type` to derive Tags from properties, brackets to look up an entity instance (`Course[courseId]`) versus parentheses to pass a projection its arguments (`CourseCapacity(courseId)`), and the derived "Consistency boundary".

The descriptions above reflect both languages as of October 2026.

## Try it

- Every example on this website has an ":material-play-box-outline: Open in Playground" button. The [:material-play-box-outline: DCB Playground](/playground/) shows a model as pages or as text, in the DCB notation. The text can be edited and applied, and its help links back to this page
- The [reference](reference.md) lists every keyword
- The [course subscriptions](../examples/course-subscriptions.md) example uses the same domain as this page
