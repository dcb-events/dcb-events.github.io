---
icon: material/code-braces
---

# DCB notation

The examples on this website are written in the *DCB notation*, a small text language for describing a DCB model: the Events of a system, the projections that fold them into state, and the command handlers that decide on that state and append new Events.

What makes it useful for DCB is what it does *not* contain: a command never states its consistency boundary. The notation says what a command reads, and the [Query](../specification.md#query) and [Append Condition](../specification.md#append-condition) are derived from that. Every example on this site shows the result in its "Consistency boundary" tab.

!!! warning "Experimental"

    The DCB notation is the text form of models in the [:material-play-box-outline: DCB Playground](/playground/) and, like the playground, it is subject to change.
    The source of truth is the playground's JSON format ([schema v8](/schemas/model/v8.json)): every construct of the notation is exactly one shape of that format, so a model can be turned into text and back without losing anything.

This page introduces the notation step by step. The first part covers the basics needed to read the examples. The second part, marked <span class="dcb-badge">advanced</span>, covers the rest of the language, and the last part, marked <span class="dcb-badge dcb-badge--experimental">experimental</span>, covers features that are still being tried out. Every keyword is listed in the [reference](reference.md).

## Basics

### A first model

The following model allows to define courses, each with a unique id:

```dcb id="notation_01"
model "Courses"

tag type CourseId = string

event CourseDefined { tag courseId: CourseId, capacity: integer }

projection CourseExists (tag courseId: CourseId): boolean = false {
  on CourseDefined => set true
}

handler DefineCourse(courseId: CourseId, capacity: integer) {
  require CourseExists(courseId) is false
    else reject "Course already exists"

  emit CourseDefined { courseId, capacity }

  scenarios {
    scenario "Define course with existing id" {
      given CourseDefined { courseId: "c1", capacity: 10 }
      when DefineCourse { courseId: "c1", capacity: 15 }
      then rejected "Course already exists"
    }
    scenario "Define course with new id" {
      when DefineCourse { courseId: "c1", capacity: 15 }
      then CourseDefined { courseId: "c1", capacity: 15 }
    }
  }
}
```

It consists of four kinds of declarations, which may appear in any order, and the scenarios that test them. The rendered model is always printed the way the DCB Playground prints it: grouped by kind, under comments like `// Types`.

### Types

```dcb-fragment
tag type CourseId = string
```

A `type` gives a value a name. A type marked with `tag` is an identifier that can [tag](../specification.md#tag) an Event: its name is the key of the Tag, so the value `"c1"` becomes the Tag `CourseId:c1`. Only a value of a tag type can be a Tag.

### Events

```dcb-fragment
event CourseDefined { tag courseId: CourseId, capacity: integer }
```

An [Event](../specification.md#event) has a name in the past tense and a list of typed properties. A property is typed with a type declared in the model or with one of JSON's basic types: `string`, `number`, `integer`, `boolean`. `email?: string` is an optional property and `courseIds: CourseId[]` a list.

`tag` marks a property as one of the Event's Tags: `CourseDefined { courseId: "c1", … }` is tagged with `CourseId:c1`. An Event has no other Tags than the ones it marks, so its declaration says exactly which Tags it is appended with.

### Projections

```dcb-fragment
projection CourseExists (tag courseId: CourseId): boolean = false {
  on CourseDefined => set true
}
```

A [projection](../topics/projections.md) folds Events into a value. It has a value type and an initial value (`boolean = false`), and one handler per Event type it reacts to: `on CourseDefined => set true`.

In parentheses, it names the Tags it is kept by: `CourseExists` is a value per course, and for the course `"c1"` it only sees Events tagged `CourseId:c1`. A projection with several Tags only sees Events that have all of them. A projection that is kept for the whole Event log says so with `untagged`, see [numbering](#numbering).

The handlers are a fixed set of operations:

| Handler | Effect |
|---|---|
| `set <value>` | replaces the value |
| `increment <n>`, `decrement <n>` | changes an integer |
| `append <value>`, `remove <value>` | changes a list |

A value is a literal (`true`, `0`, `"c1"`) or a property of the Event: `event.data.capacity`.

### Command handlers

```dcb-fragment
handler DefineCourse(courseId: CourseId, capacity: integer) {
  require CourseExists(courseId) is false
    else reject "Course already exists"

  emit CourseDefined { courseId, capacity }
}
```

A `handler` declares a command and decides it. Its header is the command: its name and its properties, `DefineCourse` with a `courseId` and a `capacity`. Its body has two parts, in this order:

1. `require` states a condition that has to hold. If one does not, the command is rejected with the message after `else reject`. Every condition needs one
2. `emit` appends an Event. Each of its properties is taken from the command, a read or a literal. `{ courseId, capacity }` is short for `{ courseId: courseId, capacity: capacity }`

`CourseExists(courseId)` *reads* the projection: it gives a value for each of the projection's Tags, in parentheses, here the course of the command. A read can be written wherever a value is expected.

### Scenarios

```dcb-fragment
scenarios {
  scenario "Define course with existing id" {
    given CourseDefined { courseId: "c1", capacity: 10 }
    when DefineCourse { courseId: "c1", capacity: 15 }
    then rejected "Course already exists"
  }
}
```

The scenarios of a handler sit in one `scenarios` group at its end. Each one states the Events already appended (`given`), the command that is handled (`when`), and `then` the Events it appends, `nothing`, or the message it was rejected with.

The scenarios are not just documentation: the build of this website fails if one of them does not hold.

### Adding a command

The next step adds a command to change the capacity of a course. `CourseCapacity` shows a projection that takes its value from the Events:

```dcb id="notation_02" extends="notation_01"
event CourseCapacityChanged { tag courseId: CourseId, newCapacity: integer }

projection CourseCapacity (tag courseId: CourseId): integer = 0 {
  on CourseDefined => set event.data.capacity
  on CourseCapacityChanged => set event.data.newCapacity
}

handler ChangeCourseCapacity(courseId: CourseId, newCapacity: integer) {
  require CourseExists(courseId) is true
    else reject "Course does not exist"
  require CourseCapacity(courseId) != newCapacity
    else reject "Capacity is unchanged"

  emit CourseCapacityChanged { courseId, newCapacity }

  scenarios {
    scenario "Change capacity of a non-existing course" {
      when ChangeCourseCapacity { courseId: "c0", newCapacity: 15 }
      then rejected "Course does not exist"
    }
    scenario "Change capacity of a course to a new value" {
      given CourseDefined { courseId: "c1", capacity: 12 }
      when ChangeCourseCapacity { courseId: "c1", newCapacity: 15 }
      then CourseCapacityChanged { courseId: "c1", newCapacity: 15 }
    }
  }
}
```

!!! tip

    The highlighted lines are the ones that changed compared to the previous step. ":material-play-box-outline: Open in Playground" opens the complete model in the [DCB Playground](/playground/), where it can be edited and run.

### Constraints across entities

The last basic step adds the command that is the reason this example exists: a student subscribes to a course, as long as the course is not full and the student is not subscribed to more than five courses:

```dcb id="notation_03" extends="notation_02"
tag type StudentId = string

event StudentSubscribedToCourse { tag courseId: CourseId, tag studentId: StudentId }

projection CourseSubscriptionCount (tag courseId: CourseId): integer = 0 {
  on StudentSubscribedToCourse => increment 1
}

projection StudentCourseIds (tag studentId: StudentId): CourseId[] = [] {
  on StudentSubscribedToCourse => append event.data.courseId
}

handler SubscribeStudentToCourse(courseId: CourseId, studentId: StudentId) {
  alias studentCourseIds = StudentCourseIds(studentId)

  require CourseExists(courseId) is true
    else reject "Course does not exist"
  require CourseSubscriptionCount(courseId) < CourseCapacity(courseId)
    else reject "Course is full"
  require studentCourseIds not contains courseId
    else reject "Student is already subscribed"
  require count(studentCourseIds) < 5
    else reject "Student is subscribed to too many courses"

  emit StudentSubscribedToCourse { courseId, studentId }

  scenarios {
    scenario "Subscribe student to fully booked course" {
      given CourseDefined { courseId: "c1", capacity: 1 }
      given StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
      when SubscribeStudentToCourse { courseId: "c1", studentId: "s2" }
      then rejected "Course is full"
    }
    scenario "Subscribe student to the same course twice" {
      given CourseDefined { courseId: "c1", capacity: 10 }
      given StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
      when SubscribeStudentToCourse { courseId: "c1", studentId: "s1" }
      then rejected "Student is already subscribed"
    }
    scenario "Subscribe student to course with capacity" {
      given CourseDefined { courseId: "c1", capacity: 10 }
      when SubscribeStudentToCourse { courseId: "c1", studentId: "s1" }
      then StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
    }
  }
}
```

`StudentSubscribedToCourse` marks two properties as Tags, so it is tagged with both, the course *and* the student. Conditions can compare two reads (`CourseSubscriptionCount(courseId) < CourseCapacity(courseId)`), test lists (`not contains`, `count(…)`) and more, see [conditions](reference.md#require) in the reference.

`alias` gives a read a name, here because two conditions use it. It does not read anything at that line: a read is part of the command wherever it is written, and the same read written twice is read once.

## From notation to DCB

A command's reads are all it takes to derive its consistency boundary. Each read contributes one [Query Item](../specification.md#query-item): the Event types the projection handles, with the Tags it is read for. The "Consistency boundary" tab of the last example shows this for every command, for `SubscribeStudentToCourse`:

| Read | Event Types | Tags |
|---|---|---|
| `CourseExists(courseId)` | `CourseDefined` | `CourseId:{courseId}` |
| `CourseSubscriptionCount(courseId)` | `StudentSubscribedToCourse` | `CourseId:{courseId}` |
| `CourseCapacity(courseId)` | `CourseDefined`, `CourseCapacityChanged` | `CourseId:{courseId}` |
| `studentCourseIds` | `StudentSubscribedToCourse` | `StudentId:{studentId}` |

The command reads the Events matching this Query, decides, and appends its Event with an [Append Condition](../specification.md#append-condition) that fails if an Event matching the same Query was appended in the meantime.

That is exactly the right boundary, and it was not written down anywhere:

- a concurrent subscription to the same course, or by the same student, makes the append fail, since `StudentSubscribedToCourse` is tagged with both
- so does a concurrent change of the course's capacity, because the command read `CourseCapacity(courseId)`
- subscriptions to other courses by other students don't interfere at all

Adding a condition to a command, or removing one, changes its boundary accordingly. Since the boundary is derived, it cannot become outdated.

## Advanced features

The rest of this page covers features that are not needed to read most examples. Each section shows only the declarations it is about. The complete model, with everything combined, is at [the end](#the-complete-model).

### Fan-out reads <span class="dcb-badge">advanced</span> { #fan-out-reads data-toc-label="Fan-out reads" }

A projection can be read for a whole list of values at once, with `each` in front of the list:

```dcb-fragment
require ProductExists(each items.productId) is true
  else reject "Product does not exist"
```

The read is one read per element, and a condition over it has to hold for every element. The Query contains one Query Item per element, too. The shopping cart of the [dynamic product price](../examples/dynamic-product-price.md#feature-3-multiple-products-shopping-cart) example uses this to check the price of every product in an order.

An Event can be tagged with every element of a list in the same way: `event ProductsOrdered { items: Item[] tag each productId }`.

### Scripted projections <span class="dcb-badge">advanced</span> { #scripted-projections data-toc-label="Scripted projections" }

The handler operations are deliberately few, because the DCB Playground analyses them (e.g. to draw lifecycles). For anything else, a projection can be written in JavaScript:

```dcb id="notation_scripted" extends="notation_03" hidden="true"
projection CoursePeakSubscriptions (tag courseId: CourseId): integer {
  script
  initialState { current: 0, peak: 0 }
  exposes peak
  on StudentSubscribedToCourse => ```({ current: state.current + 1, peak: Math.max(state.peak, state.current + 1) })```
}
```

```dcb excerpt="notation_scripted" show="projection CoursePeakSubscriptions"
```

Each handler is an expression over `state` and `event` that returns the next state. The Tags are declared like for any other projection, so the Query is derived the same way, and a handler can access their values as `tags.courseId`. `exposes` names the part of the state commands read.

Unlike other projections, a scripted one can take further values after its Tags, `(tag courseId: CourseId, days: integer)`. A read gives them after the Tags, `CourseActivity(courseId, 14)`, and a handler accesses them as `args.days`. The [unique username](../examples/unique-username.md) example uses this for a retention period.

The playground runs scripts unsandboxed in the browser, so it asks for confirmation before opening a model that contains one.

### Numbering <span class="dcb-badge">advanced</span> { #numbering data-toc-label="Numbering" }

Instead of the client choosing a course id, the model can number courses itself. `successor(…)` is the value following another one (`c1` → `c2`, `inv-009` → `inv-010`), and an `untagged` projection sees all Events of its types:

```dcb id="notation_numbering" extends="notation_03" removes="handler DefineCourse" hidden="true"
untagged projection CourseNumbering: CourseId = "c1" {
  on CourseDefined => set successor(event.data.courseId)
}

handler DefineCourse(capacity: integer) {
  emit CourseDefined { courseId: CourseNumbering(), capacity }

  scenarios {
    scenario "Define the second course" {
      given CourseDefined { courseId: "c1", capacity: 10 }
      when DefineCourse { capacity: 15 }
      then CourseDefined { courseId: "c2", capacity: 15 }
    }
  }
}
```

```dcb excerpt="notation_numbering" show="projection CourseNumbering, handler DefineCourse"
```

An untagged projection has no Tags to read it for, so its read is `CourseNumbering()`. It is written right where its value is needed, in the Event.

The [invoice number](../examples/invoice-number.md) example uses this to create a gapless sequence.

### Types with constraints, enums and records <span class="dcb-badge">advanced</span> { #constrained-types data-toc-label="Constrained types, enums, records" }

Besides tag types, a model can declare types that constrain a value, enums and records:

```dcb id="notation_types" extends="notation_scripted" hidden="true"
type Capacity = integer { minimum: 1 }

enum CourseStatus { NonExistent, Existent, Archived }

record PersonName { given: string, family: string }

event StudentRegistered { tag studentId: StudentId, name: PersonName, email?: string }
```

```dcb excerpt="notation_types" show="type Capacity, enum CourseStatus, record PersonName, event StudentRegistered"
```

The constraints after a type are JSON Schema keywords. An enum's members are strings, written without quotes wherever the type is known. A record has fields, but no identity of its own.

### Rejections in detail <span class="dcb-badge">advanced</span> { #rejections data-toc-label="Rejections in detail" }

A rejection is identified by its message, not by the condition. Several conditions may share one message, and they are then one outcome:

```dcb-fragment
require CourseStatus(courseId) != NonExistent
  else reject "Course is not available"
require CourseStatus(courseId) != Archived
  else reject "Course is not available"
```

The messages of a command are the complete set of reasons it can be rejected for, and the DCB Playground lists them for each command. A message is static text, one line, by convention in sentence case without a full stop.

A scenario that expects a rejection states the message and nothing else. Which condition rejected the command, and the values it read, are not part of the outcome: conditions sharing a message are interchangeable, and a projection that stores its state differently still rejects for the same reason. The DCB Playground shows both when a scenario is opened.

### When the notation can't express something <span class="dcb-badge">advanced</span> { #json-fallback data-toc-label="JSON fallback" }

The DCB Playground can store a few things the notation has no spelling for (yet). Instead of dropping them, it writes such a definition as its JSON, with a comment explaining why:

```dcb-fragment
// Written as JSON: …
handler Foo json { … }
```

Examples on this website never contain JSON definitions, the build fails if one would be needed.

## Experimental features

The features below are still being tried out. The DCB Playground only offers them once *experimental features* are switched on in its settings. A model that uses them opens and runs either way, and the examples below switch them on when they are opened.

### Entities <span class="dcb-badge dcb-badge--experimental">experimental</span> { #entities data-toc-label="Entities" }

The commands above read four projections, three of them about the same course. An *entity* gives projections that share an identity one name:

```dcb id="notation_04" extends="notation_types" hidden="true"
entity Course (tag courseId: CourseId) {
  exists = CourseExists
  capacity = CourseCapacity
  subscriptionCount = CourseSubscriptionCount
}

entity Student (tag studentId: StudentId) {
  courseIds = StudentCourseIds
}

handler DefineCourse(courseId: CourseId, capacity: integer) {
  alias course = Course(courseId)

  require course.exists is false
    else reject "Course already exists"

  emit CourseDefined { courseId, capacity }
}

handler ChangeCourseCapacity(courseId: CourseId, newCapacity: integer) {
  alias course = Course(courseId)

  require course.exists is true
    else reject "Course does not exist"
  require course.capacity != newCapacity
    else reject "Capacity is unchanged"

  emit CourseCapacityChanged { courseId, newCapacity }
}

handler SubscribeStudentToCourse(courseId: CourseId, studentId: StudentId) {
  alias course = Course(courseId)
  alias student = Student(studentId)

  require course.exists is true
    else reject "Course does not exist"
  require course.subscriptionCount < course.capacity
    else reject "Course is full"
  require student.courseIds not contains courseId
    else reject "Student is already subscribed"
  require count(student.courseIds) < 5
    else reject "Student is subscribed to too many courses"

  emit StudentSubscribedToCourse { courseId, studentId }
}
```

```dcb excerpt="notation_04" show="entity Course, entity Student"
```

An entity declares its identifier like a projection declares its Tag, and each of its properties is a projection with exactly that Tag. A command names one instance with an `alias` and reads it like a projection, `Course(courseId)`:

```dcb excerpt="notation_04" show="handler SubscribeStudentToCourse"
```

!!! info "An entity is not a consistency boundary"

    It is tempting to read `alias course = Course(courseId)` as "load the course", like an Aggregate. That is not what happens: an entity is not stored and has no boundary of its own. A command's Query contains only the Events of the properties it *uses*. `ChangeCourseCapacity` uses `course.exists` and `course.capacity`, so a concurrent subscription to the course does not affect it, although `subscriptionCount` belongs to the same entity.

    The Query of each command selects exactly the same Events as in the previous steps. The only difference is that the Query Items for the same course are combined into one, see the "Consistency boundary" tab of the [complete model](#the-complete-model).

Entities are optional. Everything they do can be written with plain projections, as in the basics. They are useful when several commands read the same things, and they make lifecycles possible.

### Lifecycles <span class="dcb-badge dcb-badge--experimental">experimental</span> { #lifecycles data-toc-label="Lifecycles" }

An entity may mark one property as its *lifecycle*, the property that says which state an instance is in:

```dcb id="notation_05" extends="notation_04" removes="projection CourseExists" hidden="true"
event CourseArchived { tag courseId: CourseId }

entity Course (tag courseId: CourseId) {
  lifecycle status
  status = CourseStatus
  capacity = CourseCapacity
  subscriptionCount = CourseSubscriptionCount
}

projection CourseStatus (tag courseId: CourseId): CourseStatus = NonExistent {
  on CourseDefined => set Existent
  on CourseArchived => set Archived
}

handler DefineCourse(courseId: CourseId, capacity: integer) {
  alias course = Course(courseId)

  require course.status == NonExistent
    else reject "Course already exists"

  emit CourseDefined { courseId, capacity }
}

handler ChangeCourseCapacity(courseId: CourseId, newCapacity: integer) {
  alias course = Course(courseId)

  require course.status == Existent
    else reject "Course is not active"
  require course.capacity != newCapacity
    else reject "Capacity is unchanged"

  emit CourseCapacityChanged { courseId, newCapacity }

  scenarios {
    scenario "Change capacity of a non-existing course" {
      when ChangeCourseCapacity { courseId: "c0", newCapacity: 15 }
      then rejected "Course is not active"
    }
  }
}

handler ArchiveCourse(courseId: CourseId) {
  alias course = Course(courseId)

  require course.status == Existent
    else reject "Course is not active"

  emit CourseArchived { courseId }

  scenarios {
    scenario "Archive an archived course" {
      given CourseDefined { courseId: "c1", capacity: 10 }
      given CourseArchived { courseId: "c1" }
      when ArchiveCourse { courseId: "c1" }
      then rejected "Course is not active"
    }
  }
}

handler SubscribeStudentToCourse(courseId: CourseId, studentId: StudentId) {
  alias course = Course(courseId)
  alias student = Student(studentId)

  require course.status == Existent
    else reject "Course is not active"
  require course.subscriptionCount < course.capacity
    else reject "Course is full"
  require student.courseIds not contains courseId
    else reject "Student is already subscribed"
  require count(student.courseIds) < 5
    else reject "Student is subscribed to too many courses"

  emit StudentSubscribedToCourse { courseId, studentId }
}
```

```dcb excerpt="notation_05" show="enum CourseStatus, entity Course, projection CourseStatus, handler ArchiveCourse"
```

A lifecycle is either a `boolean` (two states, e.g. `lifecycle exists`) or an `enum` (`enum CourseStatus { … }` declares one). The DCB Playground draws the state machine from it: which Event moves an instance to which state, and which conditions guard each move. For the model itself, a lifecycle is an ordinary projection.

### Chained reads <span class="dcb-badge dcb-badge--experimental">experimental</span> { #chained-reads data-toc-label="Chained reads" }

An entity can be [fanned out](#fan-out-reads) like a projection, and a read can take its values from an earlier one. Rescheduling a course must not clash with the other courses of its students. The command reads the course, then every student subscribed to it, then every other course of those students:

```dcb id="notation_06" extends="notation_05" hidden="true"
event CourseRescheduled { tag courseId: CourseId, slots: string[] }

entity Course (tag courseId: CourseId) {
  lifecycle status
  status = CourseStatus
  capacity = CourseCapacity
  subscriptionCount = CourseSubscriptionCount
  studentIds = CourseStudentIds
  slots = CourseSlots
}

projection CourseStudentIds (tag courseId: CourseId): StudentId[] = [] {
  on StudentSubscribedToCourse => append event.data.studentId
}

projection CourseSlots (tag courseId: CourseId): string[] = [] {
  on CourseRescheduled => set event.data.slots
}

handler RescheduleCourse(courseId: CourseId, slots: string[]) {
  alias course = Course(courseId)
  alias students = Student(each course.studentIds)
  alias otherCourses = Course(each students.courseIds) excluding courseId

  require course.status == Existent
    else reject "Course is not active"
  require otherCourses.slots not containsAny slots
    else reject "Slots clash with a subscriber's other course"

  emit CourseRescheduled { courseId, slots }

  scenarios {
    scenario "Reschedule a course into a slot of another course of a student" {
      given CourseDefined { courseId: "c1", capacity: 10 }
      given CourseDefined { courseId: "c2", capacity: 10 }
      given CourseRescheduled { courseId: "c2", slots: ["mon-9"] }
      given StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
      given StudentSubscribedToCourse { courseId: "c2", studentId: "s1" }
      when RescheduleCourse { courseId: "c1", slots: ["mon-9", "tue-9"] }
      then rejected "Slots clash with a subscriber's other course"
    }
  }
}
```

```dcb excerpt="notation_06" show="handler RescheduleCourse"
```

`students` is one instance per element of `course.studentIds`, and a condition over it has to hold for every instance. `excluding` drops one identifier from the list.

The boundary is then as deep as the chain of reads: the Query contains one Query Item per instance read, so a student subscribing to yet another course in the meantime makes the append fail.

### Conditional emits <span class="dcb-badge dcb-badge--experimental">experimental</span> { #conditional-emits data-toc-label="Conditional emits" }

A command can append different Events depending on the state it read. Instead of rejecting a subscription to a full course, it can put the student on a waiting list:

```dcb id="notation_07" extends="notation_06" hidden="true"
event StudentWaitlistedForCourse { tag courseId: CourseId, tag studentId: StudentId }

entity Course (tag courseId: CourseId) {
  lifecycle status
  status = CourseStatus
  capacity = CourseCapacity
  subscriptionCount = CourseSubscriptionCount
  studentIds = CourseStudentIds
  slots = CourseSlots
  isFull = CourseIsFull
}

projection CourseIsFull (tag courseId: CourseId): boolean
  derived CourseSubscriptionCount(courseId) >= CourseCapacity(courseId)

handler SubscribeStudentToCourse(courseId: CourseId, studentId: StudentId) {
  alias course = Course(courseId)
  alias student = Student(studentId)

  require course.status == Existent
    else reject "Course is not active"
  require student.courseIds not contains courseId
    else reject "Student is already subscribed"
  require count(student.courseIds) < 5
    else reject "Student is subscribed to too many courses"

  emit StudentSubscribedToCourse { courseId, studentId }
    when course.isFull is false
  emit StudentWaitlistedForCourse { courseId, studentId }
    when course.isFull is true

  scenarios {
    scenario "Subscribe student to fully booked course" {
      given CourseDefined { courseId: "c1", capacity: 1 }
      given StudentSubscribedToCourse { courseId: "c1", studentId: "s1" }
      when SubscribeStudentToCourse { courseId: "c1", studentId: "s2" }
      then StudentWaitlistedForCourse { courseId: "c1", studentId: "s2" }
    }
  }
}
```

```dcb excerpt="notation_07" show="handler SubscribeStudentToCourse"
```

An Event with a `when` is only appended if its conditions hold (several are combined with `and`). Unlike a `require`, a failing `when` does not reject the command. The conditions count towards the consistency boundary just like the ones of `require`.

### Derived projections <span class="dcb-badge dcb-badge--experimental">experimental</span> { #derived-projections data-toc-label="Derived projections" }

`course.isFull` in the previous section is a *derived* projection: a boolean defined by one condition over other projections, without handlers of its own:

```dcb excerpt="notation_07" show="projection CourseIsFull"
```

It declares its Tags like any projection and passes them on to the projections it reads. Reading it reads its operands: every command that uses `course.isFull` has `StudentSubscribedToCourse`, `CourseDefined` and `CourseCapacityChanged` in its Query.

### More experimental features <span class="dcb-badge dcb-badge--experimental">experimental</span> { #more-experimental data-toc-label="More experimental features" }

- `currentValue` refers to a projection's own value in a handler, e.g. `on CourseDefined => set successor(currentValue)`
- An optional read, `alias tutor? = Student(tutorId)`, reads nothing if the value is `null`, and conditions over it hold
- Annotations change how the DCB Playground presents a definition, not what it means:

```dcb-fragment
@icon("📚")
entity Course (tag courseId: CourseId) { … }

@feature("Course management")
handler ArchiveCourse(courseId: CourseId) { … }

@tagSchema("{type}={value}")
tag type CourseId = string
```

`@icon` and `@feature` are for the playground's pages only. `@tagSchema` changes how a Tag of that type is written, `CourseId:c1` by default.

### The complete model { data-toc-label="The complete model" }

All features above combined, except the numbering, which replaces how courses are defined:

```dcb id="notation_complete" extends="notation_07"
model "Courses (complete)"
```

## Prior art

The DCB notation is not the first language for event-sourced models, and it borrows from two of them.

**heklang** [:octicons-link-external-16:](https://git.tqwewe.com/tephra/heklang){:target="_blank" .small} is a total language for event-sourced application logic and, like this notation, built around DCB: the Events a command folded are the condition its append is checked against.

- *Borrowed:* `emit Event { field, other: value }` including the shorthand for fields named like the command's properties, and `on Event => …` for the handlers of a fold.
- *Different:* heklang folds Events *inline*, inside the command that needs the result. The DCB notation declares every fold once, as a named projection, and commands read it by name. A projection that two entities share and three commands read would otherwise have to be written five times, and the DCB Playground stores models that way, too.
- *Different:* a heklang fold arm is an expression (`=> state + 1`). The notation only allows a fixed set of operations (`set`, `increment`, `append`, …), because the playground analyses them, e.g. to draw a lifecycle from the Events that move it. A [scripted projection](#scripted-projections) is the way out.

**Weltenwanderer** [:octicons-link-external-16:](https://www.weltenwanderer.dev/){:target="_blank" .small} is a specification language for domain models that compiles to verified TypeScript, organised around *deciders*: a state, the commands decided on it, and the Events that evolve it.

- *Borrowed:* `require … else reject "…"` for a condition and the message the command is rejected with, required in both languages, `type X = string`, and `X[]` for lists.
- *Different:* a decider groups commands around one state, which is what an Aggregate does. The DCB notation deliberately has no such grouping: an [entity](#entities) only names projections, and each command's boundary is derived from what it reads, not from what it belongs to.

Both use `@annotation(…)` for metadata, as does the notation.

What is new is mostly what DCB requires: Tags marked on the Events (`tag courseId: CourseId`) and named by the projections that are kept by them, reads that give a value for each of those Tags (`CourseCapacity(courseId)`), and the derived "Consistency boundary".

The descriptions above reflect both languages as of October 2026.

## Try it

- Every example on this website has an ":material-play-box-outline: Open in Playground" button. The [:material-play-box-outline: DCB Playground](/playground/) shows a model as pages or as text, in the DCB notation. The text can be edited and applied, and its help links back to this page
- The [reference](reference.md) lists every keyword
- The [course subscriptions](../examples/course-subscriptions.md) example uses the same domain as this page
