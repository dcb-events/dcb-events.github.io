import redis from "k6/experimental/redis"
import { Trend, Counter, Rate } from "k6/metrics"
import { check, fail } from "k6"
import { DcbOptions, Query, ReadOptions, SequencedEvent } from "./lib/types.ts"
import { fixtureBuilder } from "./lib/fixture.ts"
import { createApi, QueryBuilder } from "./lib/helpers.ts"

/**
 * This script verifies whether the position of the read events is always monotonic increasing
 */

/**
 * The fixture "variety" (number of types, tags, query complexity, ...)
 *
 * @todo make configurable via ENV/config file
 */
const dcbOptions: DcbOptions = {
  numberOfEventTypes: 5,
  numberOfTags: 5,
  numberOfItemsPerQuery: { min: 0, max: 3 },
  eventTypesPerQueryItem: { min: 0, max: 4 },
  tagsPerQueryItem: { min: 0, max: 3 },
  eventsPerAppend: { min: 2, max: 5 },
}

const api = require(__ENV.ADAPTER || './adapters/http_default.js')

/**
 * k6 scenarios
 *
 * @todo make partly configurable via ENV/config file
 */
export const options = {
  scenarios: {
    // randomly append events for x seconds
    append_events: {
      executor: "constant-vus",
      exec: "appendEvents",
      startTime: "0s",
      vus: 5,
      duration: "10s",
    },
    // in parallel: read positions of events
    read_sequence_positions: {
      executor: "constant-vus",
      exec: "readPositions",
      startTime: "0s",
      vus: 1,
      duration: "10s",
    },
    // then: verify the read positions
    verify_sequence_positions: {
      executor: "shared-iterations",
      exec: "verifyPositions",
      startTime: "10s",
      vus: 1,
      iterations: 1,
    },
  },
}

const positionBatchSize = 6

const dcbAppendDurations = new Trend("dcb_append_duration", true)
const dcbAppendCounter = new Counter("dcb_append_count")
const dcbAppendErrorRate = new Rate("dcb_append_error_rate")
const dcbConsistencyCounter = new Counter("dcb_consistency_count")

if (!__ENV.REDIS_DSN) {
  fail("REDIS_DSN environment variable is not set, usage: k6 run <script> -e DCB_ENDPOINT=http://domain.tld -e REDIS_DSN=redis://localhost:6379")
}
const redisClient = new redis.Client(__ENV.REDIS_DSN)

const fixture = fixtureBuilder(dcbOptions)

export async function setup() {
  await redisClient.del("sequence_numbers")
}

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

export function readPositions() {
  const lastPositions = readLastEventPositions(positionBatchSize)
  redisClient.rpush("sequence_numbers", JSON.stringify(lastPositions))
}

export async function verifyPositions() {
  const positionBatches = await redisClient.lrange("sequence_numbers", 0, -1)
  console.log({ posLen: positionBatches.length })
  let lastBatch: number[] = []
  for (const positionBatch of positionBatches) {
    const newBatch = JSON.parse(positionBatch)
      .reverse()
      .map((pos: string) => parseInt(pos, 10))
    if (lastBatch.length === 0) {
      lastBatch = newBatch
      continue
    }
    if (Math.min(...newBatch) < Math.min(...lastBatch)) {
      console.log(`New batch ${newBatch} has positions less than last batch ${lastBatch}`)
      lastBatch = newBatch
      continue
    }
    let startIndex = lastBatch.indexOf(newBatch[0])
    if (startIndex === -1) {
      lastBatch = newBatch
      continue
    }
    const b1 = lastBatch.slice(startIndex).join(",")
    const b2 = newBatch.slice(0, lastBatch.length - startIndex).join(",")
    check(
      null,
      {
        "DCB: positions increase monotonically": () => b1 === b2,
      },
      { group: "dcb" }
    )
    dcbConsistencyCounter.add(1, { group: "dcb" })
    if (b1 !== b2) {
      console.error(`New batch ${b1} does not match last batch ${b2} (previousBatch: ${lastBatch}, newBatch: ${newBatch})`)
    }
    lastBatch = newBatch
  }
}

function lastEventPosition(query: Query): number {
  return api.readLastEvent(query)?.position ?? 0
}

function readLastEventPositions(numberOfEvents: number): number[] {
  return api
    .read(QueryBuilder.all())
    .map((event) => event.position)
    .slice(-numberOfEvents)
    .reverse()
}
