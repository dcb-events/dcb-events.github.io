/**
 * @typedef {{eventTypes?: string[], tags?: string[]}} QueryItem
 * @typedef {QueryItem[]} Query
 * @typedef {{type: string}} Event
 * @typedef {{position: number, type: string}} SequencedEvent
 */
class InMemoryDcbEventStore {
  /** @type {SequencedEvent[]} */
  #sequencedEvents = []

  /**
   * @param {Query} query
   * @param {{from?: number, backwards?: boolean, limit?: number}} [options]
   * @returns {{SequencedEvent[]}}
   */
  read(query, options) {
    if (options === undefined) {
      options = {}
    }
    let filteredEvents = this.#sequencedEvents.filter((event) => {
      // if `from` is specified and the event position is lower (with `backwards` option _higher_) the event is skipped
      if (
        options.from &&
        ((options.backwards && event.position > options.from) ||
          (!options.backwards && event.position < options.from))
      ) {
        return false
      }
      // empty query === Query.all() (wildcard)
      if (query.length === 0) {
        return true
      }
      // apply query item filter: if the event matches one of the query items, it will be included
      return query.some(
        (queryItem) =>
          (!queryItem.eventTypes ||
            queryItem.eventTypes.includes(event.type)) &&
          (!queryItem.tags ||
            queryItem.tags.every((tag) => event.tags.includes(tag)))
      )
    })
    // reverse the order if the `backwards` option is set
    if (options.backwards) {
      filteredEvents = filteredEvents.reverse()
    }
    // limit the result if the `limit` option is set
    if (options.limit) {
      filteredEvents = filteredEvents.slice(0, options.limit)
    }
    return filteredEvents
  }

  /**
   * @param {Event|Event[]} events
   * @param {{failIfEventsMatch: Query, after?: number}} [condition]
   * @returns {void}
   */
  append(events, condition) {
    if (condition) {
      const lastMatchingEventPosition =
        this.read(condition.failIfEventsMatch, {
          backwards: true,
          limit: 1,
        })[0]?.position || null
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
    let sequencePosition = this.#sequencedEvents.length + 1
    this.#sequencedEvents = this.#sequencedEvents.concat(
      events.map((e) => ({ ...e, position: sequencePosition++ }))
    )
  }
}