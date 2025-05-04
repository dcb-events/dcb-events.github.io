# DCB interfaces and helpers

This package contains:

- `EventStore` related interfaces and type definitions: [EventStore.ts](EventStore.ts)
- an in-memory implementation of a DCB `EventStore`: [InMemoryDcbEventStore.ts](InMemoryDcbEventStore.ts)
- type definitions and helper methods to build Projections and Decision Models: [Projections.ts](Projection.ts), [DecisionModels.ts](DecisionModel.ts)
- a simple Test Runner that can perform Given/When/Then tests: [TestRunner.ts](TestRunner.ts)

## Usage

```typescript
import { createProjection } from "./Projection"
import InMemoryDcbEventStore from "./InMemoryDcbEventStore"
import { buildDecisionModel } from "./DecisionModel"
import { createQuery, queryAll } from "./EventStore"

// create an instance of the in-memory event store
const eventStore = new InMemoryDcbEventStore()

// define event types for reusability and type safety
function CourseDefined({
  courseId,
  capacity,
}: {
  courseId: string
  capacity: number
}) {
  return {
    type: "CourseDefined" as const,
    data: { courseId, capacity },
    tags: [`course:${courseId}`],
  }
}

function CourseCapacityChanged({
  courseId,
  newCapacity,
}: {
  courseId: string
  newCapacity: number
}) {
  return {
    type: "CourseCapacityChanged" as const,
    data: { courseId, newCapacity },
    tags: [`course:${courseId}`],
  }
}

type EventTypes = ReturnType<
  typeof CourseDefined | typeof CourseCapacityChanged
>

// append a single event (without condition)
eventStore.append(CourseDefined({ courseId: "c1", capacity: 10 }))

// append multiple events (without condition)
eventStore.append([
  CourseCapacityChanged({ courseId: "c1", newCapacity: 15 }),
  CourseDefined({ courseId: "c2", capacity: 20 }),
])

// append event with condition
try {
  eventStore.append(CourseDefined({ courseId: "c1", capacity: 20 }), {
    failIfEventsMatch: createQuery([
      { types: ["CourseDefined"], tags: ["course:c1"] },
    ]),
  })
} catch (error) {
  console.log("append failed, as expected")
}

// read all events
const events = eventStore.read(queryAll())
console.log(Array.from(events).map((e) => `${e.position}: ${e.type}`)) // [ '1: CourseDefined', '2: CourseCapacityChanged', '3: CourseDefined' ]

// read events with query
const filteredEvents = eventStore.read(
  createQuery([{ types: ["CourseDefined"] }])
)
console.log(Array.from(filteredEvents).map((e) => `${e.position}: ${e.type}`)) // [ '1: CourseDefined', '3: CourseDefined' ]

// read events with options
const options = { from: 2, backwards: true, limit: 1 }
console.log(eventStore.read(queryAll(), options).first()) // {type: 'CourseCapacityChanged', data: { courseId: 'c1', newCapacity: 15 }, tags: [ 'course:c1' ], position: 2}

// create a projection
function CourseCapacityProjection(courseId: string) {
  return createProjection<EventTypes, number>({
    initialState: 0,
    handlers: {
      CourseDefined: (state, event) => event.data.capacity,
      CourseCapacityChanged: (state, event) => event.data.newCapacity,
    },
    tagFilter: [`course:${courseId}`],
  })
}

const projection = CourseCapacityProjection("c1")
console.log("projection initial state:", projection.initialState) // projection initial state: 0
console.log("projection query:", projection.query.items) // projection query: [{types: [ 'CourseDefined', 'CourseCapacityChanged' ], tags: [ 'course:c1' ]}]

// create a decision model
const { state, appendCondition } = buildDecisionModel(eventStore, {
  courseCapacity: CourseCapacityProjection("c1"),
})

console.log("decision model state:", state) // decision model state: { courseCapacity: 15 }

// append new event with append condition
eventStore.append(
  CourseCapacityChanged({ courseId: "c1", newCapacity: 30 }),
  appendCondition
)
```