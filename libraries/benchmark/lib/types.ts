export type Range = {
  min: number
  max: number
}

export type DcbOptions = {
  numberOfEventTypes: number
  numberOfTags: number
  numberOfItemsPerQuery: Range
  eventTypesPerQueryItem: Range
  tagsPerQueryItem: Range
  eventsPerAppend: Range
}

export type QueryItem = {
  types?: string[]
  tags?: string[]
}

export type Query = {
  items: QueryItem[]
}

export type Event = {
  type: string
  tags: string[]
  data: string
}

export type SequencedEvent = Event & {
  position: number
}

export type ReadOptions = {
  from?: number
  limit?: number
  backwards?: boolean
}

export type AppendCondition = {
  failIfEventsMatch: Query
  after?: number
}

export type EventStore = {
  read(query: Query, options?: ReadOptions): SequencedEvent[]
  readLastEvent(query: Query): SequencedEvent | null
  append(
    events: Event[],
    condition?: AppendCondition
  ): {
    durationInMicroseconds: number
    appendConditionFailed: boolean
  }
}
