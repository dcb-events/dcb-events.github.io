Projections can be used to persist [read models](../glossary.md#read-model); however, since DCB primarily focuses on the write side, this website typically refers to projections used to construct an in-memory [decision model](../glossary.md#decision-model).

This article explains, how projections can be written such that a DCB-capable Event Store can [query](../libraries/specification.md#query) the corresponding events and how they can be composed in order to keep them simple and reusable.

## What is a Projection

In 2013 Greg Young posted the following minimal definition of a projection:

![course subscriptions example](img/greg-young-tweet.png)
/// caption
Greg Young, 2013 on [Twitter/X](https://x.com/gregyoung/status/313358540821647360){:target="_blank"}
///

In TypeScript the equivalent type definition could be:

```ts
type Projection<S, E> = (state: S, event: E) => S
```

### Example

To use a common theme, we use events from the [Course subscription example](../examples/course-subscriptions.md).

!!! note
    We use JavaScript in the examples below, but the main ideas are applicable to all programming languages

To start of simple, we can implement events a simple string array:

```js
const events = ["CourseDefined", "CourseDefined", "StudentRegistered", "CourseDefined"]
```
<codapi-snippet id="example1" engine="browser"></codapi-snippet>

In order to find out how many courses there are in total, the following simple projection could be defined and we can use JavaScripts [reduce](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce){:target="_blank"} function to aggregate all events creating a single state, starting with the `initialState`:

```js
// ...
const projection = (state, event) => (event === "CourseDefined" ? state + 1 : state)
const initialState = 0
const numberOfCourses = events.reduce(projection, initialState)

console.log({numberOfCourses})
```
<codapi-snippet engine="browser" sandbox="javascript" depends-on="example1"></codapi-snippet>

## Query only relevant events

In the above example the reducer iterates over all events even though it only changes the state for `CourseDefined` events. This is not an issue for this simple example. But in reality those events are not stored in memory and there can be many of them. So obviously, they should be filtered _before_ they are read from the Event Store.

The Type of the event is the first important element used to filter the events that affect my projection inside a large Event Store.

Events of the same type are typically handled using the same code and business rules. For this reason, it feels natural to partition the function that processes the state into a more declarative format, where business rules are defined based on the types of events they handle.


By defining the event handlers more declaratively, the handled event types can be determined from the projection definition:

```js
const projection = {
    initialState: 0,
    handlers: {
        CourseDefined: (state, event) => state + 1
    }
}
```
<codapi-snippet id="example2" engine="browser" sandbox="javascript" depends-on="example1"></codapi-snippet>

With that, we can now filter the events before applying them to the projection:

```js
const numberOfCourses = events
  .filter(event => event in projection.handlers)
  .reduce((state, event) => projection.handlers[event](state, event), projection.initialState)

console.log({numberOfCourses})
```
<codapi-snippet engine="browser" sandbox="javascript" depends-on="example1 example2"></codapi-snippet>

## Filter events by tags

As previously mentioned, in the context of DCB, projections are typically used to reconstruct in memory the minimal model required to validate a business decision the system needs to make—usually in response to a command from a user.

Given that the system should ensure a performant response to user input, it becomes clear how paramount it is to minimize the time and effort needed to rebuild the model.

It's therefore evident that generating on the fly the state model for all entities in the system is not feasible, as it would require reading and transforming an overwhelming number of events.

Moreover, such an approach would be unnecessary, since a business decision usually concerns only a limited number of business entities.

The most effective approach, then, is to limit the reconstruction to the absolute minimum, by rebuilding the state of only the business entities involved in validating the received command.

To do this efficiently, we filter the relevant events using tags associated with those entities.

In our example, a more realistic in-memory projection would be one that determines whether a course with a specific id exists at all.
By only looking at the event type, this could be done with a projection like this:
```js
const courseExistsProjection = (courseId) => ({
  initialState: false,
  handlers: {
      CourseDefined: (state, event) => event.data.courseId === courseId ? true : state,
  }
})
```
But this is not a good idea because all `CourseDefined` events would have to be loaded still.

A traditional [Event Store](../glossary.md#event-store) usually allows to filter events by their type and event stream (sometimes called _subject_).
In DCB there is no concept of multiple streams, events are stored in a single global sequence, but they can be tagged and it is essential to be able to filter them by their tags.

To demonstrate that, we add data and tags to the example events:

```js
const events = [
  {
    type: "CourseDefined",
    data: { capacity: 10 },
    tags: ["course:c1"],
  },
  {
    type: "CourseDefined",
    data: { capacity: 20 },
    tags: ["course:c2"],
  },
  {
    type: "CourseCapacityChanged",
    data: { newCapacity: 15 },
    tags: ["course:c1"],
  },
]
```
<codapi-snippet id="example3" engine="browser"></codapi-snippet>

...and extend the projection definition

```js
const courseExistsProjection = (courseId) => ({
  initialState: false,
  handlers: {
    CourseDefined: (state, event) => true,
  },
  tagFilter: [`course:${courseId}`],
})
```
<codapi-snippet id="example4" engine="browser"></codapi-snippet>

With that, events can be filtered by their type _and_ specific tags:

```js hl_lines="5"
const projection = courseExistsProjection("c1")
const filteredEvents = events
  .filter((event) =>
    event.type in projection.handlers &&
    projection.tagFilter.every((tag) => event.tags.includes(tag))
  )

console.log(filteredEvents)
```
<codapi-snippet engine="browser" sandbox="javascript" depends-on="example3 example4"></codapi-snippet>

Let's put this new filter into a function and combine it with the reducer for convenience:

```js
const runProjection = (projection, events) => events
  .filter((event) =>
    event.type in projection.handlers &&
    projection.tagFilter.every((tag) => event.tags.includes(tag))
  )
  .reduce((state, event) => projection.handlers[event.type](state, event), projection.initialState)
```
<codapi-snippet id="example5" engine="browser"></codapi-snippet>

And test it:

```js
console.log(runProjection(courseExistsProjection("c0"), events))
console.log(runProjection(courseExistsProjection("c1"), events))
```
<codapi-snippet engine="browser" sandbox="javascript" depends-on="example3 example4 example5"></codapi-snippet>

Similarily a projection for the current `capacity` of a course:

```js
const courseCapacityProjection = (courseId) => ({
  initialState: 0,
  handlers: {
      CourseDefined: (state, event) => event.data.capacity,
      CourseCapacityChanged: (state, event) => event.data.newCapacity,
  },
  tagFilter: [`course:${courseId}`]
})
```
<codapi-snippet id="example6" engine="browser"></codapi-snippet>

```js
console.log(runProjection(courseCapacityProjection("c1"), events))
console.log(runProjection(courseCapacityProjection("c2"), events))
```
<codapi-snippet engine="browser" sandbox="javascript" depends-on="example3 example5 example6"></codapi-snippet>

## Composing projections

As mentioned above, these in-memory projections can be used to build [decision model](../glossary.md#decision-model) that can be used to enforce hard constraints.

So far, the example projections in this article were only concerned about a very specific question, e.g. whether a given course exists. Usually, there are _multiple_ hard constraints though.
For example: In the [Course subscription example](../examples/course-subscriptions.md) in order to change a courses capacity, we have to ensure that...

- ...the course exists
- ...and that the specified new capacity is different from the current capacity

It is tempting to write a slightly more complex projection that can answer both questions, like:

```javascript
const courseProjection = (courseId) => ({
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

console.log(runProjection(courseProjection("c0"), events))
console.log(runProjection(courseProjection("c1"), events))
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example3 example5"></codapi-snippet>

But that has some drawbacks that are covered in the article about [Aggregates](aggregates.md).

Instead, we can create a generic _composite_ projection like this:

```js
// expects an object in the form
// {
//   "<projection1Name>": <projection1Definition>,
//   "<projection2Name>": <projection2Definition>,
//   ...
// }
const compositeProjection = (projections) => {
  return {
    // comopsed initial state in the form
    // {"<projection1Name>": <projection1InitialState>, ...}
    initialState: Object.fromEntries(
      Object.entries(projections).map(([key, projection]) => [
        key,
        projection.initialState,
      ])
    ),
    // handle the event with all relevant projections
    handle: (state, event) => {
      for (const projectionName in projections) {
        const projection = projections[projectionName]
        if (
          event.type in projection.handlers &&
          projection.tagFilter.every((tag) => event.tags.includes(tag))
        ) {
          state[projectionName] = projection.handlers[event.type](
            state[projectionName] ?? null,
            event
          )
        }
      }
      return state
    },
  }
}
```

<codapi-snippet id="example7" engine="browser"></codapi-snippet>

This code is not easy to read, but it basically composes the projections dynamically such that the state is an object with one key for every projection:

```javascript
const projection = compositeProjection({
  courseExists: courseExistsProjection("c1"),
  courseCapacity: courseCapacityProjection("c1"),
})

console.log(projection.initialState)
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example4 example6 example7"></codapi-snippet>

Finally, in order to be able to filter the events, we can add a function that evaluates the event types and tags of all projections:

```js hl_lines="24-29"
const compositeProjection = (projections) => {
  return {
    initialState: Object.fromEntries(
      Object.entries(projections).map(([key, projection]) => [
        key,
        projection.initialState,
      ])
    ),
    handle: (state, event) => {
      for (const projectionName in projections) {
        const projection = projections[projectionName]
        if (
          event.type in projection.handlers &&
          projection.tagFilter.every((tag) => event.tags.includes(tag))
        ) {
          state[projectionName] = projection.handlers[event.type](
            state[projectionName] ?? null,
            event
          )
        }
      }
      return state
    },
    // returns an array of filter objects in the form
    // [{eventTypes: ['<EventType1>', ...], tags: ['<tag1>', ...]}, ...]
    filters: Object.entries(projections).map(([_, projection]) => ({
      eventTypes: Object.keys(projection.handlers),
      tags: projection.tagFilter,
    })),
  }
}
```
<codapi-snippet id="example8" engine="browser"></codapi-snippet>

Now, we can filter events that are relevant for _any_ of the composed projections:

```js
const projection = compositeProjection({
  courseExists: courseExistsProjection("c1"),
  courseCapacity: courseCapacityProjection("c1"),
})

console.log(
  events.filter((event) =>
    projection.filters.some(
      (filter) =>
        filter.eventTypes.includes(event.type) &&
        filter.tags.every((tag) => event.tags.includes(tag))
    )
  )
)
```

<codapi-snippet engine="browser" sandbox="javascript" depends-on="example3 example4 example6 example8"></codapi-snippet>

```js
const runCompositeProjection = (projection, events) =>
  events
    .filter((event) =>
      projection.filters.some(
        (filter) =>
          filter.eventTypes.includes(event.type) &&
          filter.tags.every((tag) => event.tags.includes(tag))
      )
    )
    .reduce(
      (state, event) => projection.handle(state, event),
      projection.initialState
    )

console.log(
  runCompositeProjection(
    compositeProjection({
      courseExists: courseExistsProjection("c1"),
      courseCapacity: courseCapacityProjection("c1"),
    }),
    events
  )
)
```
<codapi-snippet engine="browser" sandbox="javascript" depends-on="example3 example4 example6 example8"></codapi-snippet>

## How to use this with DCB

The complexity of above examples might be daunting.
In an actual project, the composability would be provided by some generic [library](../libraries/index.md). Unlike here, an actual implementation would not filter the events in memory, but build a [query object](../libraries/specification.md#query) from the given projections that allows to performantly fetch only relevant events from the Event Store.

Most of the [examples](../examples/index.md) use this technique.
