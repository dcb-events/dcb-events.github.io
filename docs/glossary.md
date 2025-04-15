!!! info "Disclaimer"

    The definitions in this list merely reflect our personal take and are not meant to be authoritive!
    However, feel free to report any invalid/missing information in the [bugtracker of this website](https://github.com/dcb-events/dcb-events.github.io/issues){:target="_blank"}

## Aggregate

Cluster of associated objects that we treat as a unit for the purpose of data changes (see article about [Aggregates](topics/aggregates.md)

## Command

Instruction to perform a specific action or change in a system, typically resulting in a modification of the state of the system

## CQRS (Command Query Responsibility Segregation)

Pattern that separates the responsibilities of handling commands (write operations) and queries (read operations) to optimize and scale each independently

## Decision Model

Representation of the system's current state, used to enforce integrity constraints before moving the system to a new state

## Domain-Driven Design

Software design approach that focuses on modeling a system based on the core domain, using the language and concepts of domain experts

## Event

Record of a fact that has occurred in the past, capturing significant domain-relevant information

## Event Sourcing

Pattern where changes are stored as a sequence of [Events](#event) rather than overwriting the current state

!!! info

    DCB can be used without Event Sourcing, see "DCB without Event Sourcing" (tbd)

## Event Store

Specialized storage system for Events that ensures they are stored sequentially and can be retrieved efficiently

## Eventual Consistency

Consistency model that prioritizes availability and partition tolerance over immediate consistency

## Optimistic Locking

Concurrency control mechanism that prevents conflicts by allowing multiple transactions to read and update data but checking for changes before committing. If another transaction has modified the data in the meantime, the update is rejected

## Pessimistic Locking

Concurrency control mechanism that prevents conflicts by locking a resource for a transaction, blocking others from modifying it until the lock is released

## Process Manager

Component that orchestrates complex workflows by reacting to Events, maintaining state, and dispatching commands to coordinate

## Projection

Deriving state from a series of Events

!!! info

    Projections can be used to persist [read models](#read-model); however, since DCB primarily focuses on the write side, this website typically refers to projections used to construct an in-memory [decision model](#decision-model)

## Read Model

Representation of data tailored for specific read operations, often denormalized for performance

## Read Side

Part of a system responsible for querying and presenting data, typically optimized for read operations

## Repository

Abstraction over data storage, providing a collection-like interface to access and manipulate domain entities

## Reservation Pattern

Refers to a design pattern used to temporarily hold or reserve a resource or state until the process is completed

## Sequence

Ordered series of Events that represent changes over time

## Sequence Number

A unique, incremental identifier assigned to Events in the same context, ensuring their correct order within a stream

## Snapshot

Periodic point-in-time representations of an [Aggregate](#aggregate)’s state, used to optimize performance by avoiding the need to replay all past events from the beginning

## View Model

See [Read Model](#read-model)

## Write Side

Part of a system responsible for changing the state of the system
