import { EventStore, Event, queryAll } from "./EventStore"
import InMemoryDcbEventStore from "./InMemoryDcbEventStore"

/**
 * Internal helper function to compare two values for deep equality.
 */
function partialDeepEqual(value1: any, value2: any): boolean {
  if (typeof value1 !== "object" || value1 === null) {
    return value1 === value2
  }
  if (typeof value2 !== "object" || value2 === null) {
    return false
  }

  return Object.keys(value1).every(
    (key) => key in value2 && partialDeepEqual(value1[key], value2[key])
  )
}

/**
 * TestDefinition describes a test case for the runTests function
 */
type TestDefinition = {
  description: string
  given?: {
    events: Event[]
  }
  when: {
    command: {
      type: string
      data: any
    }
  }
  then: {
    expectedEvent?: Event
    expectedError?: string
  }
}

/**
 * Executes a series of tests against the provided command handlers and event store.
 */
export function runTests(
  commandHandlers: any,
  eventStore: EventStore,
  testCases: TestDefinition[]
) {
  for (const testCase of testCases) {
    if (eventStore instanceof InMemoryDcbEventStore) {
      eventStore._flush()
    }
    for (const event of testCase.given?.events ?? []) {
      eventStore.append(event)
    }
    const lastEventPosition =
      eventStore
        .read(queryAll(), {
          backwards: true,
          limit: 1,
        })
        .first()?.position || null
    const commandHandler = commandHandlers[testCase.when.command.type]
    if (typeof commandHandler !== "function") {
      throw new Error(`Unknown command type: ${testCase.when.command.type}`)
    }
    try {
      commandHandler.call(commandHandlers, testCase.when.command.data)
    } catch (error) {
      if (!testCase.then.expectedError) {
        console.log(
          `✖ ${testCase.description} – expected no error, but got '${error.message}'`
        )
        continue
      }
      if (testCase.then.expectedError !== error.message) {
        console.log(
          `✖ ${testCase.description} – expected error '${testCase.then.expectedError}' but got '${error.message}'`
        )
        continue
      }
      console.log(`✔ ${testCase.description}`)
      continue
    }

    const newEvents = Array.from(
      eventStore.read(queryAll(), {
        from: lastEventPosition !== null ? lastEventPosition + 1 : undefined,
      })
    ).map(({ position, ...event }) => ({
      ...event,
    }))
    if (
      testCase.then.expectedEvent &&
      !partialDeepEqual([testCase.then.expectedEvent], newEvents)
    ) {
      console.log(
        `✖ ${testCase.description} – expected event ${JSON.stringify(
          testCase.then.expectedEvent
        )}' but got ${JSON.stringify(newEvents[0] ?? null)}`
      )
      continue
    }
    if (!testCase.then.expectedError) {
      console.log(`✔ ${testCase.description}`)
      continue
    }
    console.log(
      `✖ ${testCase.description} – expected error '${testCase.then.expectedError}' but none was thrown`
    )
  }
}
