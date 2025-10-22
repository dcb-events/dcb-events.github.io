# Libraries and tools

DCB is merely a set of ideas and concepts.
But there are already a couple of libraries and libraries that prove those in practice:

## DCB Compliant Event Stores

### EventSourcing Database [:octicons-link-external-16:](https://www.thenativeweb.io/products/eventsourcingdb){:target="_blank" .small}

Commercial product with DCB support via EventQL by [the native web](https://www.thenativeweb.io/){:target="_blank"}

### UmaDB [:octicons-link-external-16:](https://github.com/pyeventsourcing/umadb){:target="_blank" .small}

Open Source Event Store specifically written to support DCB by John Bywater

## SDKs, Clients and Tools

#### C\#

- `Sekiban.Dcb`[:octicons-link-external-16:](https://github.com/J-Tech-Japan/Sekiban?tab=readme-ov-file#dcb-dynamic-consistency-boundary){:target="_blank" .small} (active dev, PostgreSQL support, [`Sekiban.Dcb Nuget Package`](https://www.nuget.org/packages/Sekiban.Dcb), using Orleans Actor Model)

#### Go

- `go-crablet`[:octicons-link-external-16:](https://github.com/rodolfodpk/go-crablet){:target="_blank" .small}

#### Java

- AxonIQ [:octicons-link-external-16:](https://www.axoniq.io){:target="_blank" .small} has announced to support DCB with version 5 of their Axon Framework (work in progress)

#### JavaScript/TypeScript

- `@dcb-es/event-store`[:octicons-link-external-16:](https://github.com/PaulGrimshaw/dcb-event-sourced){:target="_blank" .small} (work in progress)

#### PHP

- `wwwision/dcb-eventstore`[:octicons-link-external-16:](https://github.com/bwaidelich/dcb-eventstore){:target="_blank" .small} (work in progress)
- `gember/event-sourcing`[:octicons-link-external-16:](https://github.com/GemberPHP/event-sourcing){:target="_blank" .small} (work in progress)
- `backslashphp/backslash`[:octicons-link-external-16:](https://github.com/backslashphp/backslash){:target="_blank" .small} (fully documented, demo application available)

#### Python

- Event Sourcing in Python[:octicons-link-external-16:](https://eventsourcing.readthedocs.io/en/latest/topics/examples/coursebooking-dcb.html){:target="_blank" .small} (work in progress)

#### Ruby

- `ortegacmanuel/kroniko`[:octicons-link-external-16:](https://github.com/ortegacmanuel/kroniko){:target="_blank" .small} (work in progress)

#### Rust

- Disintegrate `disintegrate-es/disintegrate`[:octicons-link-external-16:](https://disintegrate-es.github.io/disintegrate/){:target="_blank" .small} (slightly different approach, inspired by the original ideas of DCB)
- `dcbdb`[:octicons-link-external-16:](https://github.com/johnbywater/dcbdb){:target="_blank" .small} (work in progress)

## Add your own

If you are working on a library related to DCB or on a compatible (see [specification](../specification.md)) Event Store, feel free to open a Pull request in the Github Repository[:octicons-link-external-16:](https://github.com/dcb-events/dcb-events.github.io/edit/main/docs/resources/libraries.md){:target="_blank" .small} of this website to add it to the list above
