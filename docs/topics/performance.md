Performance can mean different things

## Throughput

*tbd:* highly dependant on implementation/hardware but in general comparable to traditional Event Stores, early "benchmarks" with PostgreSQL based implementation show 0,001s/Event (=1000 Events/second) after 1mio Events

## Resource utilization

- **CPU/RAM Usage:** Although [Queries](../specification.md#query) add complexity to the data store mechanism, a well-implemented Event Store should not significantly impact CPU or memory usage
- **Storage Space:** Primarily depends on the domain-specific payload, while the Event metadata (e.g., `Sequence Position`, `Event Type`, `Tags`, etc.) should only occupy a few bytes per Event
- **Network Usage:** Will be slightly higher compared to traditional Event Stores because the [Query](../specification.md#query) has to be transferred for *read* and conditional *write* operations. We consider this overhead to be negligible in practice in most cases

## Scalability

*tbd*

## Concurrency & Parallelism

*tbd*

## Reliability & Stability

*tbd*