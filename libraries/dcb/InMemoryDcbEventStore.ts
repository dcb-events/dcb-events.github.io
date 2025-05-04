import {
  AppendCondition,
  Event,
  Events,
  EventStore,
  Query,
  ReadOptions,
  SequencedEvent,
  SequencedEvents,
} from "./EventStore"

/**
 * InMemoryDcbEventStore is an in-memory implementation of the EventStore interface
 *
 * NOTE: This implementation should only be used for testing purposes
 */
export default class InMemoryDcbEventStore implements EventStore {
  private sequencedEvents: SequencedEvent[] = []

  read(query: Query, options?: ReadOptions): SequencedEvents {
    if (options === undefined) {
      options = { backwards: false }
    }
    let filteredEvents = this.sequencedEvents.filter((event) => {
      // if `from` is specified and the event position is lower (with `backwards` option _higher_) the event is skipped
      if (
        options.from &&
        ((options.backwards && event.position > options.from) ||
          (!options.backwards && event.position < options.from))
      ) {
        return false
      }
      // empty query === Query.all() (wildcard)
      if (query.items.length === 0) {
        return true
      }
      return query.matchesEvent(event)
    })
    // reverse the order if the `backwards` option is set
    if (options.backwards) {
      filteredEvents = filteredEvents.reverse()
    }
    // limit the result if the `limit` option is set
    if (options.limit) {
      filteredEvents = filteredEvents.slice(0, options.limit)
    }
    return {
      [Symbol.iterator](): Iterator<SequencedEvent> {
        return filteredEvents[Symbol.iterator]()
      },
      first(): SequencedEvent | null {
        return filteredEvents.length > 0 ? filteredEvents[0] : null
      },
    }
  }

  append(events: Event | Events, condition?: AppendCondition): void {
    if (condition) {
      const lastMatchingEventPosition =
        this.read(condition.failIfEventsMatch, {
          backwards: true,
          limit: 1,
        }).first()?.position || null
      if (lastMatchingEventPosition !== null) {
        if (!condition.after) {
          throw new Error(
            "The Event Store contained events matching the specified query but none were expected"
          )
        }
        if (lastMatchingEventPosition > condition.after) {
          throw new Error(
            `The Event Store contained events matching the specified query after position ${condition.after}`
          )
        }
      }
    }
    if (!Array.isArray(events)) {
      events = [events]
    }
    let sequencePosition = this.sequencedEvents.length + 1
    this.sequencedEvents = this.sequencedEvents.concat(
      events.map((e) => ({ ...e, position: sequencePosition++ }))
    )
  }

  _flush(): void {
    this.sequencedEvents = []
  }
}
