Some common questions and misconceptions about DCB:

## Who are you and what is this website all about?

See [about](about.md)

## Does it promote lack of modeling?

*tbd:* no :)

## Is it about less strict consistency boundaries?

*tbd:* name might suggest that, but no :)

## Does it promote using strong consistency everywhere?

*tbd:* strong consistency _can_ be used in more places but DCB is not a replacement for [eventual consistency](glossary.md#eventual-consistency) 

## How does it improve performance?

*tbd:* performance is not the intention of DCB, for large scale & high performance [eventual consistency](glossary.md#eventual-consistency) is even required. Link to [performance](topics/performance.md)

## How does it scale?

*tbd:* considerations, link to [performance](topics/performance.md)

## Does it increase chances of lock collisions?

*tbd:* no, chances for collisions are _smaller_ because optimistic lock only around required Event Types / Tags

## How can it be used with a "traditional" Event Store?

*tbd:* link to "DCB with a traditional Event Store" article

## Why do you want to kill aggregates?

*tbd:* link to example / article about "Aggregate with DCB"

## Nothing comes for free. What are limitations/drawbacks of DCB?

DCB guarantees consistency only inside the scope of the global [Sequence Position](specification.md#sequence-position). Thus, Events must be ordered to allow the conditional appending.
As a result, it's not (easily) possible to delete or partition Events.
Furthermore, DCB leads to some additional complexity in the Event Store implementation (see [Specification](specification.md) and [Performance considerations](topics/performance.md))