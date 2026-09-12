/**
 * @typedef {{type: string}} Event
 * @typedef {{position: number, type: string}} SequencedEvent
 */
class InMemoryEventStore {
  /** @type {Object<string, SequencedEvent[]>}} */
  #eventsByStreamName

  constructor() {
    this.#eventsByStreamName = {}
  }

  /**
   * @param {string} streamName
   * @returns {SequencedEvent[]}
   */
  readStream(streamName) {
    return this.#eventsByStreamName[streamName] || []
  }

  /**
   * @param {string} streamName
   * @param {Event|Event[]} events
   * @param {{streamState?: number}} options
   * @returns {void}
   */
  appendToStream(streamName, events, options) {
    if (!this.#eventsByStreamName.hasOwnProperty(streamName)) {
      this.#eventsByStreamName[streamName] = []
    }
    let pos = this.#eventsByStreamName[streamName].length
    const { streamState } = options
    if (streamState && pos !== streamState) {
      throw new Error(
        `Expected stream state to be ${streamState} but it was ${pos} for stream "${streamName}"`
      )
    }
    if (!Array.isArray(events)) {
      events = [events]
    }
    this.#eventsByStreamName[streamName] = this.#eventsByStreamName[
      streamName
    ].concat(
      events.map((e) => ({
        ...e,
        position: ++pos,
      }))
    )
  }
}