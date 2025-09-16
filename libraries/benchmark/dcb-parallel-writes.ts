import exec from 'k6/execution';
import { Trend, Counter, Rate } from "k6/metrics"
import { Event, EventStore, Query } from "./lib/types.ts"
import { QueryBuilder } from "./lib/helpers.ts"


const api:EventStore = require(__ENV.ADAPTER || './adapters/http_default.js')

/**
 * This script tests how concurrent, unrelated, append calls behave
 * 
 * The "dcb_append_error_rate" should be low or 0%
 */

/**
 * k6 scenarios
 *
 * @todo make partly configurable via ENV/config file
 */
export const options = {
  vus: 20,
  duration: "10s",
};

const dcbAppendDurations = new Trend("dcb_append_duration", true)
const dcbAppendCounter = new Counter("dcb_append_count")
const dcbAppendErrorRate = new Rate("dcb_append_error_rate")
const dcbConsistencyCounter = new Counter("dcb_consistency_count")

export default function () {
  const vuId = exec.vu.idInInstance;
  const iter = exec.vu.iterationInInstance;
  const uniqueTag = `vu${vuId}-iter${iter}`;
  const event: Event = {
    type: 'SomeEvent',
    tags: [uniqueTag],
    data: '{}'
  }
  const appendConditionQuery: Query = QueryBuilder.fromItems([{
    tags: [uniqueTag],
    types: ["SomeEvent"]
  }])
  const response = api.append([event], {failIfEventsMatch: appendConditionQuery})
  dcbAppendDurations.add(response.durationInMicroseconds / 1000, { group: "dcb" })
  dcbAppendCounter.add(1, { group: "dcb" })
  dcbAppendErrorRate.add(response.appendConditionFailed, { group: "dcb" })
}