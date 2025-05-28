In software architecture, how we view and handle data often comes down to two fundamental perspectives: **event-based** and **state-based**. The state-based view focuses on the current snapshot of data. It’s straightforward and efficient for querying, reporting, and displaying data to users. In contrast, the event-based view captures every change over time, providing a complete history of how the state evolved.

Depending on your use case, one view may serve better than the other — or you might need both. That’s where projections come in: they translate an event-based history into a state-based model tailored to specific needs.

The result is commonly used for persistent <dfn title="Representation of data tailored for specific read operations, often denormalized for performance">Read Models</dfn>. In Event Sourcing, however, projections are also used to build the <dfn title="Representation of the system's current state, used to enforce integrity constraints before moving the system to a new state">Decision Model</dfn> needed to enforce consistency constraints. 

This website typically refers to this latter kind of projection since DCB primarily focuses on ensuring the consistency of the Event Store during write operations.

This article explains how to write projections that can be queried by a DCB-capable Event Store, and how to compose those projections in a way that keeps them simple and reusable.

## What is a Projection

In 2013 Greg Young posted the following minimal definition of a projection:

![course subscriptions example](img/greg-young-tweet.png)
/// caption
Greg Young, 2013 on Twitter/X [:octicons-link-external-16:](https://x.com/gregyoung/status/313358540821647360){:target="_blank" .small}
///

In TypeScript the equivalent Type definition would be:

```ts
type Projection<S, E> = (state: S, event: E) => S
```

## Implementation

!!! note

    To use a common theme, we refer to Events from the [course subscription example](../examples/course-subscriptions.md):

    - new courses can be added (`CourseDefined`)
    - courses can be archived (`CourseArchived`)
    - courses can be renamed (`CourseRenamed`)

    We use JavaScript in the examples below, but the main ideas are applicable to all programming languages

A typical DCB projection might look something like this:

```js
{
  initialState: null,
  handlers: {
    CourseDefined: (state, event) => event.data.title,
    CourseRenamed: (state, event) => event.data.newTitle,
  },
  tags: [`course:${courseId}`],
}
```

Let's see how we got here...

### Basic functionality

To start simple, we can implement Events as an array of strings:

```js
const events = [
  "CourseDefined",
  "CourseDefined",
  "CourseRenamed",
  "CourseArchived",
  "CourseDefined"
]
```
<codapi-snippet id="example1" engine="browser"></codapi-snippet>

In order to find out how many active courses there are in total, the following simple projection could be defined and we can use JavaScripts `reduce`[:octicons-link-external-16:](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce){:target="_blank" .small} function to aggregate all Events creating a single state, starting with the `initialState`:

```js
// ...
const projection = (state, event) => {
  switch (event) {
    case 'CourseDefined':
      return state + 1;
    case 'CourseArchived':
      return state - 1;
    default:
      return state;
  }
}
const initialState = 0
const numberOfActiveCourses = events.reduce(projection, initialState)

console.log({numberOfActiveCourses})
```
<codapi-snippet engine="browser" sandbox="javascript" depends-on="example1"></codapi-snippet>

!!! note

    A projection function has to be pure, i.e. it must be free of side effects in order to produce deterministic results. When replaying a projection for the same events, the resulting `state` has to be the same every time

## Query only relevant Events

In the above example, the reducer iterates over all Events even though it only changes the state for `CourseDefined` and `CourseArchived` events. This is not an issue for this simple example. But in reality, those events are not stored in memory, and there can be many of them. So obviously, they should be filtered _before_ they are read from the Event Store.

As previously mentioned, in the context of DCB, projections are typically used to reconstruct the minimal model required to validate the constraints the system needs to enforce — usually in response to a command issued by the user.

Given that the system should ensure a performant response to user input, it becomes clear how paramount it is to minimize the time and effort needed to rebuild the Decision Model.
The most effective approach, then, is to limit the reconstruction to the absolute minimum, by loading only the Events that are relevant to validating the received command.

### Filter Events by Type

The Event Type is the main criteria for filtering Events before reading them from an Event Store.

By defining the Event handlers more declaratively, the handled Event Types can be determined from the projection definition itself:

```js
const projection = {
  initialState: 0,
  handlers: {
    CourseDefined: (state, event) => state + 1,
    CourseArchived: (state, event) => state - 1,
  }
}

// filter events (should exclude "CourseRenamed" events)
console.log(
  events.filter((event) =>
      event in projection.handlers
  )
)
```
<codapi-snippet engine="browser" sandbox="javascript" depends-on="example1"></codapi-snippet>

### Filter Events by Tags

Decision Models are usually only concerned about single entities. E.g. in order to determine whether a course with a specific id exists, it's not appropriate to read _all_ `CourseDefined` events but only those related to the course in question.

This could be done with a projection like this:
```js hl_lines="4-5"
const projection = {
  initialState: false,
  handlers: {
    CourseDefined: (state, event) => event.data.courseId === courseId ? true : state,
    CourseArchived: (state, event) => event.data.courseId === courseId ? false : state,
  }
}
```
But this is not a good idea because all `CourseDefined` Events would have to be loaded still.

A traditional <dfn title="Specialized storage system for Events that ensures they are stored sequentially and can be retrieved efficiently">Event Store</dfn> usually allows to partition Events into Event Streams (sometimes called _subjects_).

In DCB there is no concept of multiple streams, Events are stored in a single global sequence.
Instead, with DCB Events can be associated with entities (or other domain concepts) using **Tags**.
And a compliant Event Store allows to filter Events by their Tags, in addition to their Type.

To demonstrate that, we add Data and Tags to the example Events:

```js
const events = [
  {
    type: "CourseDefined",
    data: { id: "c1", title: "Course 1", capacity: 10 },
    tags: ["course:c1"],
  },
  {
    type: "CourseDefined",
    data: { id: "c2", title: "Course 2", capacity: 20 },
    tags: ["course:c2"],
  },
  {
    type: "CourseRenamed",
    data: { id: "c1", newTitle: "Course 1 renamed" },
    tags: ["course:c1"],
  },
  {
    type: "CourseArchived",
    data: { id: "c2" },
    tags: ["course:c2"],
  },
]
```
<codapi-snippet id="example3" engine="browser"></codapi-snippet>

...and extend the projection by some `tagFilter`:

```js hl_lines="7 13"
const projection = {
  initialState: false,
  handlers: {
    CourseDefined: (state, event) => true,
    CourseArchived: (state, event) => false,
  },
  tagFilter: [`course:c1`]
}

// filter events (should only include "CourseDefined" and "CourseArchived" events with a tag of "course:c1")
console.log(
  events.filter((event) =>
      event.type in projection.handlers &&
      projection.tagFilter.every((tag) => event.tags.includes(tag))
  )
)
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example3"></codapi-snippet>

In the above example, the projection is hard-coded to filter events tagged `course:c1`. In a real application, the `tagFilter` is the most dynamic part of the projection as it depends on the specific use case, i.e. the affected entity instance(s). So it makes sense to create some kind of _factory_ that allows to pass in the relevant dynamic information (the **course id** in this case):

```js
const CourseExistsProjection = (courseId) => ({
  initialState: false,
  handlers: {
    // ...
  },
  tagFilter: [`course:${courseId}`]
})
```

### Library

We have built a small library [:octicons-link-external-16:](https://github.com/dcb-events/dcb-events.github.io/tree/main/libraries/dcb){:target="_blank" .small} that provides functions to create projections and test them.

The `createProjection` function accepts a projection object like we defined above:

```js
const CourseExistsProjection = (courseId) =>
  createProjection({
    initialState: false,
    handlers: {
      CourseDefined: (state, event) => true,
      CourseArchived: (state, event) => false,
    },
    tagFilter: [`course:${courseId}`],
  })
```

<codapi-snippet id="example4" engine="browser"></codapi-snippet>

The resulting object can be used to easily filter events and to build the projection state:

```js
const projection = CourseExistsProjection("c1")

console.log("query:", projection.query.items)
console.log("initialState:", projection.initialState)

const state = events
  .filter((event) => projection.query.matchesEvent(event))
  .reduce(
    (state, event) => projection.apply(state, event),
    projection.initialState
  )

console.log("projected state:", state)
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example3 example4" template="/assets/js/dcb.js"></codapi-snippet>

Similarly a projection for the current `title` of a course would look like this:

```js
const CourseTitleProjection = (courseId) =>
  createProjection({
    initialState: null,
    handlers: {
      CourseDefined: (state, event) => event.data.title,
      CourseRenamed: (state, event) => event.data.newTitle,
    },
    tagFilter: [`course:${courseId}`],
  })
```
<codapi-snippet id="example5" engine="browser"></codapi-snippet>

??? info "The library is not a requirement"

    This library [:octicons-link-external-16:](https://github.com/dcb-events/dcb-events.github.io/tree/main/libraries/dcb){:target="_blank" .small}  is not required in order to use DCB, but we'll use it in this article and in some of the other [examples](../examples/index.md) in order to keep them simple.

    The `createProjection` function returns an object with the following properties:

    ```typescript
    type Projection<S> = {
      get initialState(): S
      apply(state: S, event: SequencedEvent): S
      get query(): Query
    }
    ```

    The `Query` can be used to "manually" filter events, like in the example above. In a productive application it will be translated to a query that the corresponding Event Store can execute.

## Composing projections

As mentioned above, these in-memory projections can be used to build Decision Models that can be used to enforce hard constraints.

So far, the example projections in this article were only concerned about a very specific question, e.g. whether a given course exists. Usually, there are _multiple_ hard constraints involved though.
For example: In the [course subscription example](../examples/course-subscriptions.md) in order to change a courses capacity, we have to ensure that...

- ...the course exists
- ...and that the specified new capacity is different from the current capacity

It is tempting to write a slightly more sophisticated projection that can answer both questions, like:

```javascript
const CourseProjection = (courseId) =>
  createProjection({
    initialState: { courseExists: false, courseCapacity: 0 },
    handlers: {
      CourseDefined: (state, event) => ({
        courseExists: true,
        courseCapacity: event.data.capacity,
      }),
      CourseCapacityChanged: (state, event) => ({
        ...state,
        courseCapacity: event.data.newCapacity,
      }),
    },
    tagFilter: [`course:${courseId}`],
  })

const courseProjection = CourseProjection("c1")
const state = events
  .filter((event) => courseProjection.query.matchesEvent(event))
  .reduce(courseProjection.apply, courseProjection.initialState)

console.log(state)
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example3" template="/assets/js/dcb.js"></codapi-snippet>

But that has some drawbacks, namely:

- It increases complexity of the projection code and makes it harder to reason about
- It makes the projection more "greedy", i.e. if it was used to make a decision based on _parts_ of the state it would consume more events than required and increase the consistency boundary needlessly (see article about [Aggregates](aggregates.md) for more details)

Instead, the `composeProjections` function allows to combine multiple smaller projections into one, depending on the use case:

```javascript
const compositeProjection = composeProjections({
  courseExists: CourseExistsProjection("c1"),
  courseTitle: CourseTitleProjection("c1"),
})

console.log("initial state:", compositeProjection.initialState)

const state = events
  .filter((event) => compositeProjection.query.matchesEvent(event))
  .reduce(compositeProjection.apply, compositeProjection.initialState)

console.log("projected state:", state)
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example3 example4 example5" template="/assets/js/dcb.js"></codapi-snippet>

As you can see, the state of the composite projection is an object with a key for every projection of the composition. Likewise, the resulting query will match only Events that are relevant for at least one of the composed projections.

## How to use this with DCB

In the context of DCB, composite projections are particularly useful for building Decision Models that require strong consistency.

A lightweight translation layer can extract a query that efficiently loads only the events relevant to the composed projections.

The `buildDecisionModel` function from the library mentioned above handles this for example: it lets you compose multiple projections dynamically, allowing to enforce dynamic consistency boundaries that inspired the name DCB:

```javascript
const eventStore = new InMemoryDcbEventStore()

const { state, appendCondition } = buildDecisionModel(eventStore, {
  courseExists: CourseExistsProjection("c1"),
  courseTitle: CourseTitleProjection("c1"),
})

console.log("state:", state)
console.log("append condition:", appendCondition)
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example3 example4 example5" template="/assets/js/dcb.js"></codapi-snippet>

!!! note

    The `state` will contain the composed state of all projections.
    
    The `appendCondition` can be passed to the `append()` method of the DCB capable event store in order to enforce consistency (see [specification](../specification.md) for more details)

## Conclusion

Projections play a fundamental role in DCB and Event Sourcing as a whole. The ability to combine multiple simple projections into more complex ones tailored to specific use cases unlocks a range of possibilities that can influence application design.
