import { Trend, Counter, Rate } from "k6/metrics"
import { fail, check, randomSeed } from "k6"
import { QueryBuilder } from "./lib/helpers.ts"
import exec from "k6/execution"
import { DcbOptions, Query } from "./lib/types.ts"
import { fixtureBuilder } from "./lib/fixture.ts"

/**
 * This script verifies whether the append condition of an Event Store is enforced correctly event with parallel writes
 */

/**
 * The fixture "variety" (number of types, tags, query complexity, ...)
 *
 * @todo make configurable via ENV/config file
 */
const dcbOptions: DcbOptions = {
  numberOfEventTypes: 10,
  numberOfTags: 10,
  numberOfItemsPerQuery: { min: 0, max: 3 },
  eventTypesPerQueryItem: { min: 0, max: 4 },
  tagsPerQueryItem: { min: 0, max: 3 },
  eventsPerAppend: { min: 1, max: 2 },
}

const api = require(__ENV.ADAPTER || './adapters/http_default.js')

/**
 * k6 scenarios
 *
 * @todo make partly configurable via ENV/config file
 */
export const options = {
  scenarios: {
    // append events for x seconds in parallel
    append_events: {
      executor: "constant-vus",
      exec: "appendEvents",
      startTime: "0s",
      vus: 20,
      duration: "10s",
    },
    // then verify the first x events
    verify_events: {
      executor: "shared-iterations",
      exec: "verifyEvents",
      startTime: "10s",
      vus: 5,
      iterations: 1000,
    },
  },
}

const dcbAppendDurations = new Trend("dcb_append_duration", true)
const dcbAppendCounter = new Counter("dcb_append_count")
const dcbAppendErrorRate = new Rate("dcb_append_error_rate")
const dcbConsistencyCounter = new Counter("dcb_consistency_count")

if (__ENV.SEED) {
  randomSeed(parseInt(__ENV.SEED, 10))
}

const fixture = fixtureBuilder(dcbOptions)

export function appendEvents() {
  const query = fixture.createQuery()

  const lastMatchingEventPosition = lastEventPosition(query)
  const events = fixture.createEvents(query, lastMatchingEventPosition)

  const response = api.append(events, {
    failIfEventsMatch: query,
    after: lastMatchingEventPosition,
  })

  dcbAppendDurations.add(response.durationInMicroseconds / 1000, { group: "dcb" })
  dcbAppendCounter.add(1, { group: "dcb" })
  dcbAppendErrorRate.add(response.appendConditionFailed, { group: "dcb" })
}

export function verifyEvents() {
  const event = api.read(QueryBuilder.all(), { from: exec.scenario.iterationInTest, limit: 1 })[0] ?? null
  if (event === null) {
    return
  }
  const eventData = JSON.parse(event.data)
  if (eventData.batchIndex !== 0) {
    return
  }

  const lastMatchingEventPosition = lastEventPositionBefore(eventData.query, event.position)

  if (eventData.lastMatchingEventPosition !== lastMatchingEventPosition) {
    console.error(`Event position mismatch: expected ${lastMatchingEventPosition}, got ${eventData.lastMatchingEventPosition} in event ${event.position}`)
  }

  check(
    lastMatchingEventPosition,
    {
      "DCB: append condition is met": (d) => eventData.lastMatchingEventPosition === lastMatchingEventPosition,
    },
    { group: "dcb" }
  )
  dcbConsistencyCounter.add(1, { group: "dcb" })
}

function lastEventPosition(query: Query): number {
  return api.readLastEvent(query)?.position ?? 0
}

function lastEventPositionBefore(query: Query, before: number): number {
  let lastMatchingPosition = 0
  api.read(query).forEach((event) => {
    if (event.position >= before) {
      return
    }
    lastMatchingPosition = event.position
  })
  return lastMatchingPosition
}
