!!! note

    This document defines what we consider the *minimal feature set* an Event Store must provide to be DCB compliant.
    
    While we introduce certain concepts and terminology, **implementations are not required to use the same terms** — as long as they offer equivalent functionality.

An Event Store that supports DCB provides a way to:

- **read** [Sequenced Event](#sequenced-event)s matching a [Query](#query), optionally starting from a specified [Sequence Position](#sequence-position)
- **append** [Event](#events)(s), optionally specifying an [Append Condition](#append-condition) to enforce consistency

## Reading Events

The Event Store...

- ... _MUST_ provide a way to filter Events based on their [Event Type](#event-type) and/or [Tag](#tags) (see [Query](#query))
- ... _MUST_ provide a way to read Events from a given starting [Sequence Position](#sequence-position)
- ... _CAN_ provide further filter options, e.g. for ordering or to limit the number of Events to load at once (see [Read Options](#read-options))

A typical interface for reading events (pseudo-code):

```{.haskell .no-copy}
EventStore {
  read(query: Query, options?: ReadOptions): SequencedEvent[]
  // ...
}
```

**Note:** The return type is usually not an array, but rather some form of iterable or reactive stream

## Writing Events

The Event Store...

- ... _MUST_ provide a way to atomically persist one or more [Event](#events)(s)
- ... _MUST_ fail if the Event Store contains at least one Event matching the [Append Condition](#append-condition), if specified

A typical interface for writing events (pseudo-code):

```{.haskell .no-copy}
EventStore {
  -- ...
  append(events: Events|Event, condition?: AppendCondition): void
}
```

## Concepts

### Query

The `Query` describes constraints that must be matched by [Event](#event)s in the Event Store.
It effectively allows for filtering Events by their [Type](#event-type) and/or [Tags](#tags).

- It _MUST_ contain a set of [Query Item](#query-item)s with at least one item or represent a query that matches all Events
- All Query Items are effectively combined with an **OR**, e.g. adding an extra Query Item will likely result in more Events being returned

To differentiate the two query variants, dedicated factory methods might be helpful:

```{.haskell .no-copy}
Query.fromItems(items)
Query.all()
```

#### Query Item

Each item of a [Query](#query) allows to target Events by their [Type](#event-type) and/or [Tags](#tags)

An event, to match a specific Query Item, needs to have the following characteristics:

- the [Type](#event-type) _MUST_ match **one** of the provided Types of the Query Item
- the [Tags](#tags) _MUST_ contain **all** of the Tags specified by the Query Item

##### Example

The following example query would match Events that are either...

- ...of type `EventType1` **OR** `EventType2`
- ...tagged `tag1` **AND** `tag2`
- ...of type `EventType2` **OR** `EventType3` **AND** tagged `tag1`**AND** `tag3`

```{.json .no-copy}
{
  "criteria": [
    {
      "eventTypes": ["EventType1", "EventType2"]
    },
    {
      "tags": ["tag1", "tag2"]
    },
    {
      "eventTypes": ["EventType2", "EventType3"],
      "tags": ["tag1", "tag3"]
    }
  ]
}
```

### Read Options

An optional parameter to `EventStore.read()` that allows for cursor-based pagination of Events.
It has two parameters:

- `from`: an optional [Sequence Position](#sequence-position) to start streaming Events from (depending on the `backwards` flag, this is either a _minimum_ or _maximum_ sequence number of the resulting stream)
- `backwards`: a flag that, if set to `true`, returns the Events in reverse order (default: `false`)
- `limit`: an optional number that, if set, limits the Event stream to a maximum number of Events. This can be useful for retrieving only the last Event, for example.

```{.haskell .no-copy}
ReadOptions {
  from?: SequencePosition
  backwards: boolean
  limit?: integer
}
```

### Sequenced Event

Contains or embeds all information of the original `Event` and its [Sequence Position](#sequence-position) that was added during the `append()` call.

- It _MUST_ contain the [Sequence Position](#sequence-position)
- It _MUST_ contain the [Event](#event)
- It _MAY_ contain further fields, like metadata defined by the Event Store


#### Example

The following example shows a *potential* JSON representation of a Sequenced Event:

```{.json .no-copy}
{
  "event": {
    ...
  },
  "sequence_position": 1234,
  ...
}
```

### Sequence Position

When an [Event](#event) is appended, the Event Store assigns a `Sequence Position` to it.

It...

- _MUST_ be unique in the Event Store
- _MUST_ be monotonic increasing 
- _MAY_ contain gaps 

### Events

A set of [Event](#event) instances that is passed to the `append()` method of the Event Store

It...

- _MUST_ not be empty
- _MUST_ be iterable, each iteration returning an [Event](#event)

### Event

- It _MUST_ contain an [Event Type](#event-type)
- It _MUST_ contain [Event Data](#event-data)
- It _MAY_ contain [Tags](#tags)
- It _MAY_ contain further fields, like metadata defined by the client

#### Example

A *potential* JSON representation of an Event:

```{.json .no-copy}
{
  "type": "SomeEventType",
  "data": "{\"some\":\"data\"}",
  "tags": ["tag1", "tag2"]
}
```

### Event Type

Type of the event used to filter Events in the [Query](#query).

### Event Data

Opaque payload of an [Event](#event)

### Tags

A set of [Tag](#tag)s.

- It _SHOULD_ not contain multiple [Tag](#tag)s with the same value

### Tag

A `Tag` can add domain-specific metadata to an event, allowing for custom partitioning.
Usually, a Tag represents a concept of the domain, e.g. the type and id of an entity like `product:p123`

- It _CAN_ represent a key/value pair such as `product:123` but that is irrelevant to the Event Store

### Append Condition

The Append Condition is used to enforce consistency, ensuring that between the time of building the Decision Model and appending the events no new events were stored by another client that match the same criteria.

- It _MUST_ contain a `failIfEventsMatch` [Query](#query)
  - this is typically the same Query that was used when building the Decision Model
- It _CAN_ contain an `after` [Sequence Position](#sequence-position)
    - this represents the highest position the client was aware of while building the Decision Model. The Event Store _MUST_ ignore the Events before the specified position while checking the condition for appending events. *Note:* This number can be _higher_ than the position of the last event matching the Query.
    - if omitted, no Events will be ignored, effectively failing if _any_ Event matches the specified Query

```{.haskell .no-copy}
AppendCondition {
  failIfEventsMatch: Query
  after?: SequencePosition
}
```
