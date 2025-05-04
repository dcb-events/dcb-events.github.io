With DCB there are more flexible ways to enforce consistency (see article about [Aggregates](../topics/aggregates.md)).

Sometimes, however, an [Event-Sourced Aggregate](../topics/aggregates.md#event-sourced-aggregate) can still be useful. For example to slowly migrate an existing Event-Sourced application or if the flexibility of DCB is not required (see [conclusion](#conclusion) below)

## Challenge

The goal is to implement an Event-Sourced Aggregate that works with a DCB compliant <dfn title="Specialized storage system for Events that ensures they are stored sequentially and can be retrieved efficiently">Event Store</dfn>

## Traditional approaches

The Implementation of an Event-Sourced Aggregate depends on the Programming Language and Framework, but the common functionality is:

1. Relevant Events are loaded, remembering the position of the last consumed Event
2. A decision is made based on the projected state of those Events
3. If successful, a new Event is appended specifying the remembered position
4. The Event Store appends the new Event only if no other Event was stored in the meantime and fails otherwise
5. Upon failure the process can be repeated until the Event was successfully persisted

The following is a potential JavaScript version of an Aggregate representing a course students can be subscribed to:

```js title="CourseAggregate.js"
/**
 * @typedef {{type: string}} Event
 * @typedef {{position: number, type: string}} SequencedEvent
 */
class CourseAggregate {
  /**
   * @type {Event[]} Every state change is stored as a corresponding Event
   */
  #recordedEvents = []

  /**
   * @type {number} The version of this Aggregate at the time of reconstitution
   */
  #version = 0

  /** @type {string} Identifier of the course */
  #id
  #capacity = 0
  #numberOfSubscriptions = 0

  /**
   * Static constructor that returns a new CourseAggregate instance
   *
   * @param {string} id
   * @param {string} title
   * @param {number} capacity
   * @returns {CourseAggregate}
   */
  static create(id, title, capacity) {
    const instance = new CourseAggregate()
    instance.#recordEvent({
      type: "CourseDefined",
      data: { courseId: id, title, capacity },
    })
    return instance
  }

  /**
   * Static constructor that returns an existing CourseAggregate instance
   * from previously persisted events
   *
   * @param {SequencedEvent[]} sequencedEvents
   * @returns {CourseAggregate}
   */
  static reconstitute(sequencedEvents) {
    const instance = new CourseAggregate()
    for (const event of sequencedEvents) {
      instance.#apply(event)
      instance.#version = event.position
    }
    return instance
  }

  /**
   * @returns {string} The identifier of this Aggregate
   */
  get id() {
    return this.#id
  }

  /**
   * @returns {number} The version of this Aggregate (for optimistic locking)
   */
  get version() {
    return this.#version
  }

  /**
   * API to change the course's capacity
   * @param {number} newCapacity
   * @returns {void}
   */
  changeCapacity(newCapacity) {
    if (newCapacity === this.#capacity) {
      throw new Error(
        `Course "${this.#id}" already has a capacity of "${newCapacity}`
      )
    }
    if (newCapacity < this.#numberOfSubscriptions) {
      throw new Error(
        `Course "${this.#id}" already has ${
          this.#numberOfSubscriptions
        } active subscriptions, can\'t set the capacity below that`
      )
    }
    this.#recordEvent({
      type: "CourseCapacityChanged",
      data: { courseId: this.#id, newCapacity },
    })
  }

  /**
   * API to subscribe a student to this course
   * @param {string} studentId Identifier of the student to subscribe
   * @returns {void}
   */
  subscribeStudent(studentId) {
    if (this.#numberOfSubscriptions === this.#capacity) {
      throw new Error(`Course "${this.#id}" is already fully booked`)
    }
    this.#recordEvent({
      type: "StudentSubscribedToCourse",
      data: { courseId: this.#id, studentId },
    })
  }

  /**
   * Internal method to store an event and apply it to the in-memory state
   * @param {Event} event
   */
  #recordEvent(event) {
    this.#recordedEvents.push(event)
    this.#apply(event)
  }

  /**
   * Internal method to apply an event to the in-memory state of this Aggregate
   * @param {Event} event
   */
  #apply(event) {
    switch (event.type) {
      case "CourseDefined":
        this.#id = event.data.courseId
        this.#capacity = event.data.capacity
        break
      case "CourseCapacityChanged":
        this.#capacity = event.data.newCapacity
        break
      case "StudentSubscribedToCourse":
        this.#numberOfSubscriptions++
        break
    }
  }

  /**
   * Public method to retrieve and flush all recorded events
   * @returns {Event[]}
   */
  pullRecordedEvents() {
    const recordedEvents = this.#recordedEvents
    this.#recordedEvents = []
    return recordedEvents
  }
}
```

<codapi-snippet id="example-event-sourced-aggregate" engine="browser"></codapi-snippet>

With that, a `CourseAggregate` can be created:

```js
const course = CourseAggregate.create('c1', 'Course 01', 10)
course.changeCapacity(15)
const events = course.pullRecordedEvents()
console.log(events.map(e => e.type)) // ["CourseDefined","CourseCapacityChanged"]
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example-event-sourced-aggregate"></codapi-snippet>

...or reconstituted from previously recorded events:

```js
const events = [
  {
    position: 1,
    type: "CourseDefined",
    data: { courseId: "c1", title: "Course 01", capacity: 10 },
    tags: ["course:c1"],
  },
  {
    position: 2,
    type: "CourseCapacityChanged",
    data: { courseId: "c1", newCapacity: 15 },
    tags: ["course:c1"],
  },
]
const course = CourseAggregate.reconstitute(events)
course.changeCapacity(15) // Error: Course "c1" already has a capacity of "15
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example-event-sourced-aggregate"></codapi-snippet>

### Repository

Aggregates are often paired with a corresponding <dfn title="Abstraction over data storage, providing a collection-like interface to access and manipulate domain entities">Repository</dfn> that handles saving and retrieving instances.

The following shows a simple implementation that works with a traditional Event Store:

```js title="CourseRepository.js"
class CourseRepository {
  #eventStore
  constructor(eventStore) {
    this.#eventStore = eventStore
  }
  load(courseId) {
    const streamName = `course-${courseId}`
    const eventsForThisCourse = this.#eventStore.readStream(streamName)
    return CourseAggregate.reconstitute(eventsForThisCourse)
  }
  save(course) {
    const streamName = `course-${course.id}`
    // fails if there are new events in the stream
    // with a position > course.version
    this.#eventStore.appendToStream(
      streamName,
      course.pullRecordedEvents(),
      {
        streamState: course.version
      }
    )
  }
}
```

<codapi-snippet id="example-repository" engine="browser" depends-on="example-event-sourced-aggregate"></codapi-snippet>

It can be used with an `InMemoryEventStore.js`[:octicons-link-external-16:](../assets/js/InMemoryEventStore.js){:target="_blank" .small}

```js
// create and save a new instance:
const repository = new CourseRepository(eventStore)
const course = CourseAggregate.create('c1', 'Course 01', 10)
repository.save(course)

// update an existing instance:
const course2 = repository.load('c1')
course2.changeCapacity(15)
repository.save(course2)

console.log(
  eventStore.readStream('course-c1')
  .map(e => e.type)
) // ["CourseDefined","CourseCapacityChanged"]
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example-repository" template="/assets/js/InMemoryEventStoreTemplate.js"></codapi-snippet>

## DCB approach

With DCB we can reuse the `CourseAggregate` from above and only need to adjust the repository implementation:

```js title="DcbCourseRepository.js"
class DcbCourseRepository {
  #eventStore
  constructor(eventStore) {
    this.#eventStore = eventStore
  }
  load(courseId) {
    const tags = [`course:${courseId}`]
    const query = createQuery([{ tags }])
    const eventsForThisCourse = this.#eventStore.read(query)
    return CourseAggregate.reconstitute(eventsForThisCourse)
  }
  save(course) {
    const tags = [`course:${course.id}`]
    const query = createQuery([{ tags }])
    const eventsWithTags = course
      .pullRecordedEvents()
      .map((event) => ({ ...event, tags }))
    this.#eventStore.append(eventsWithTags, {
      failIfEventsMatch: query,
      after: course.version,
    })
  }
}
```

<codapi-snippet id="example-dcb-repository" engine="browser" depends-on="example-event-sourced-aggregate"></codapi-snippet>

It can be used with an `InMemoryDcbEventStore.js`[:octicons-link-external-16:](../assets/js/InMemoryDcbEventStore.js){:target="_blank" .small}

```js
// create and save a new instance:
const dcbEventStore = new InMemoryDcbEventStore()
const repository = new DcbCourseRepository(dcbEventStore)
const course = CourseAggregate.create("c1", "Course 01", 10)
repository.save(course)

// update an existing instance:
const course2 = repository.load("c1")
course2.changeCapacity(15)
repository.save(course2)

console.log(
  dcbEventStore.read(createQuery([{ tags: ["course:c1"] }])).first()
) // {type: 'CourseDefined', data: { courseId: 'c1', title: 'Course 01', capacity: 10 }, tags: [ 'course:c1' ], position: 1}
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example-dcb-repository" template="/assets/js/dcb.js"></codapi-snippet>

## Conclusion

This example demonstrates how the Aggregate pattern can be used with DCB