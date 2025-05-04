/**
 * A single event that can be stored in the event store
 */
export type Event = {
  data: Record<string, unknown>
  type: string
  tags: string[]
}

/**
 * A collection of events that can be stored in the event store
 */
export type Events = [Event, ...Event[]]

/**
 * A persisted event that includes a position in the event store
 */
export type SequencedEvent = Event & {
  position: number
}

/**
 * A stream of sequenced events that can be iterated over
 */
export interface SequencedEvents extends Iterable<SequencedEvent> {
  first(): SequencedEvent | null
}

/**
 * One of the items in a query. It can filter by tags and/or types
 */
export type QueryItem =
  | { tags: [string, ...string[]]; types?: [string, ...string[]] }
  | { tags?: [string, ...string[]]; types: [string, ...string[]] }

/**
 * A query that can be used to filter events in the event store
 */
export type Query = {
  items: QueryItem[]
  matchesEvent(event: SequencedEvent): boolean
  merge(other: Query): Query
}

/**
 * A condition that must be met for an event to be appended to the event store
 */
export type AppendCondition = {
  failIfEventsMatch: Query
  after?: number
}

/**
 * Options for reading events from the event store
 * @param {number|null} from - an optional Sequence Position to start streaming Events from (depending on the `backwards` flag, this is either a _minimum_ or _maximum_ sequence number of the resulting stream)
 * @param {boolean|null} backwards - a flag that, if set to `true`, returns the Events in reverse order (default: `false`)
 * @param {number|null} limit - an optional number that, if set, limits the Event stream to a maximum number of Events. This can be useful for retrieving only the last Event, for example.
 */
export type ReadOptions = {
  from?: number
  backwards?: boolean
  limit?: number
}

/**
 * Interface for an event store that can read and append events
 */
export interface EventStore {
  read(query: Query, options?: ReadOptions): SequencedEvents
  append(events: Event | Events, condition?: AppendCondition): void
}

/**
 * Creates a query that can be used to filter events in the event store
 *
 * Example:
 * createQuery([
 *  {
 *    types: ["SomeEventType", "SomeOtherEventType"],
 *  },
 *  {
 *    tags: ["someTag", "someOtherTag"],
 *  },
 *  {
 *    types: ["SomeEventType"],
 *    tags: ["someThirdTag"],
 *  },
 * ])
 */
export function createQuery(items: [QueryItem, ...QueryItem[]]): Query {
  return {
    items,
    matchesEvent(event: SequencedEvent): boolean {
      return this.items.some(
        (queryItem) =>
          (!queryItem.types || queryItem.types.includes(event.type)) &&
          (!queryItem.tags ||
            queryItem.tags.every((tag) => event.tags.includes(tag)))
      )
    },
    merge(other: Query): Query {
      if (other.items.length === 0) {
        return other
      }
      return createQuery([...this.items, ...other.items] as [
        QueryItem,
        ...QueryItem[]
      ])
    },
  }
}

/**
 * Creates a query that matches all events
 */
export function queryAll(): Query {
  return {
    items: [],
    matchesEvent(event: SequencedEvent): boolean {
      return true
    },
    merge(other: Query): Query {
      return queryAll()
    },
  }
}

/**
 * Helper function to add metadata to an event
 */
export function addEventMetadata(
  event: Event,
  metadata: Record<string, unknown>
): Event & { metadata: Record<string, unknown> } {
  return Object.assign(event, {
    metadata,
  })
}
