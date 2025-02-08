# EventStore

## Reading

Expects a [StreamQuery](#StreamQuery) and an optional starting [SequenceNumber](#SequenceNumber) and returns an [EventStream](#EventStream).

!!! info

    The EventStore should also allow for _backwards_ iteration on the EventStream in order to support cursor based pagination.

## Writing

Expects a single [Event](#Event) or a set of [Events](#Events) and (optionally) an [AppendCondition](#AppendCondition).

## API

A potential interface of the `EventStore` (pseudo-code):

```
EventStore {
  read(query: StreamQuery, options?: ReadOptions): EventStream
  append(events: Events|Event, condition?: AppendCondition): void
}
```

### ReadOptions

An optional parameter to `EventStore.read()` that allows for cursor-based pagination of events.
It has two parameters:

- `from` an optional [SequenceNumber](#SequenceNumber) to start streaming events from (depending on the `backwards` flag this is either a _minimum_ or _maximum_ sequence number of the resulting stream)
- `backwards` a flag that, if set to `true`, returns the events in reverse order (default: `false`)
- `limit` an optional number that, if set, limits the event stream to a maximum number of events. This can be useful to only retrieve the last event for example.

```
ReadOptions {
  from?: SequenceNumber
  backwards: boolean
  limit?: integer
}
```

### StreamQuery

The `StreamQuery` describes constraints that must be matched by [Event](#Event)s in the [EventStore](#EventStore)
It effectively allows for filtering events by their [type](#EventType) and/or [tags](#Tags)

- It _MUST_ contain a set of [StreamQuery Criteria](#StreamQuery-Criterion)

!!! info
    All criteria of a StreamQuery are merged into a _logical disjunction_, so events match the query if they match the first **OR** the second criterion...

### StreamQuery Criterion

Each criterion of a [StreamQuery](#StreamQuery) allows to target events by their [type](#EventType) and/or [tags](#Tags)

!!! info
    event type filters of a single criterion are merged into a _logical disjunction_, so events match the criterion if they match **ANY** of the specified types
    
    tags are merged into a _logical conjunction_, so events match the criterion if they are tagged with **ALL** specified tags

#### Example StreamQuery

The following example query would match events that are either...

- ...of type `EventType1` **OR** `EventType2`
- ...tagged `tag1` **AND** `tag2`
- ...of type `EventType2` **OR** `EventType3` **AND** tagged `tag1`**AND** `tag3`

```json
{
  "criteria": [
    {
      "event_types": ["EventType1", "EventType2"]
    },
    {
      "tags": ["tag1", "tag2"]
    },
    {
      "event_types": ["EventType2", "EventType3"],
      "tags": ["tag1", "tag3"]
    }
  ]
}
```

### SequenceNumber

When an [Event](#Event) is appended to the [EventStore](#EventStore) a `SequenceNumber` is assigned to it.

It...

- _MUST_ be unique for one EventStore
- _MUST_ be monotonic increasing
- _MUST_ have an allowed minimum value of `1`
- _CAN_ contain gaps
- _SHOULD_ have a reasonably high maximum value (depending on programming language and environment)

### EventStream

When reading from the [EventStore](#EventStore) an `EventStream` is returned.

- It _MUST_ be iterable (e.g. via generator or reactive pattern, depending on the specific implementation)
- It _MUST_ return an [EventEnvelope](#EventEnvelope) for every iteration
- It _CAN_ include new events if they occur during iteration
- Batches of events _MAY_ be loaded from the underlying storage at once for performance optimization
- It _CAN_ provide additional functionality, e.g. a `subscribe()` function to realize reactive behavior

### EventEnvelope

Each item in the [EventStream](#EventStream) is an `EventEnvelope` that consists of the underlying event and metadata, like the [SequenceNumber](#SequenceNumber) that was added during the `append()` call.

It...

- It _MUST_ contain the [SequenceNumber](#SequenceNumber)
- It _MUST_ contain the [Event](#Event)
- It _CAN_ include more fields, like timestamps or metadata

#### EventEnvelope example

```json
{
  "event": {
    "type": "SomeEventType",
    "data": "{\"some\":\"data\"}",
    "tags": ["tag1", "tag2"]
  },
  "sequence_number": 1234,
  "recorded_at": "2024-12-10 14:02:40"
}
```

### Events

A set of [Event](#Event) instances that is passed to the `append()` method of the [EventStore](#EventStore)

It...

- _MUST_ not be empty
- _MUST_ be iterable, each iteration returning an [Event](#Event)

### Event

- It _MUST_ contain an [EventType](#EventType)
- It _MUST_ contain [EventData](#EventData)
- It _MAY_ contain [Tags](#Tags)
- It _MAY_ contain further fields, like metadata

#### Potential serialization format

```json
{
  "type": "SomeEventType",
  "data": "{\"some\":\"data\"}",
  "tags": ["tag1", "tag2"]
}
```

### EventType

String based type of the event

- It _MUST_ satisfy the regular expression `^[\w\.\:\-]{1,200}$`

### EventData

String based, opaque payload of an [Event](#Event)

- It _SHOULD_ have a reasonable large enough maximum length (depending on language and environment)
- It _MAY_ contain [JSON](https://www.json.org/)
- It _MAY_ be serialized into an empty string

### Tags

A set of [Tag](#Tag) instances.

- It _MUST_ contain at least one [Tag](#Tag)
- It _SHOULD_ not contain multiple [Tag](#Tag)s with the same value

### Tag

A `Tag` can add domain specific metadata to an event allowing for custom partitioning

!!! info
    Usually a tag represents a concept of the domain, e.g. the type and id of an entity like `product:p123`

- It _MUST_ satisfy the regular expression `/^[[:alnum:]\-\_\:]{1,150}`
- It _CAN_ represent a key/value pair such as `product:123` but that is irrelevant to the Event Store

### AppendCondition

- It _MUST_ contain a [StreamQuery](#StreamQuery)
- It _MUST_ be _either_ a
  - [SequenceNumber](#SequenceNumber) - representing the highest sequence number that the client was aware of while building the decision model. *Note:* This number can be _higher_ than the sequence number of the last event matching the StreamQuery.
  - `NONE` - no event must match the specified [StreamQuery](#StreamQuery)

#### 

```
AppendCondition {
  query: StreamQuery
  highestSequenceNumber: SequenceNumber | NONE
}
```