# Tags: The Key to Flexible Event Correlation

The concept of Dynamic Consistency Boundaries resonated with developers who had struggled with the rigid limitations of traditional Aggregate patterns. One area that deserves some additional clarification is the notion of **tags**.

This article aims to shed light on why tags are not just a technical detail, but a core concept for implementing a DCB-compliant Event Store.

## TL;DR

- Tags are explicit references to domain concepts involved in consistency rules
- They enable precise, performant event selection without relying on deep payload inspection
- While tags introduce a conceptual layer, we believe their benefits for scalability and correctness outweigh the added complexity

## Understanding the Role of Tags

To understand why tags are essential, we need to distinguish between two different aspects of events:

- **Event types** represent the *kind* of state change that occurred (e.g., `order placed`, `inventory reserved`, `payment processed`)
- **Tags** help correlate events with specific *instances* in the domain (e.g., `product:laptop-x1`, `customer:alice-smith`, `warehouse:eu-west`)

While an event type tells us *what happened*, tags tell us *to whom* or *to what* it happened. This distinction becomes crucial when we need to enforce business invariants.

In short: A **tag** is a **reference** to a **unique instance** of a **concept** involved in a **domain integrity rule**.

## The Problem: Precise Event Selection for Invariant Enforcement

Consider an e-commerce system with a critical business rule:

- A product's available inventory cannot go below zero

To enforce this invariant when processing a new `inventory reserved` event, we need to make decisions based on previously committed events. But which events exactly?

To check if we can fulfill a reservation request, we need to examine all previous events that affected the specific product's stock levels: previous reservations, releases, restocks, and adjustments.

The precision of this selection is critical:

### Missing Events = Broken Invariants

If we fail to include relevant events in our decision-making process, we risk violating business rules. Imagine checking product inventory but missing some reservation events – we might oversell products and create backorders.

### Too Many Events = Scalability Problems

Conversely, if we include too many events in our consistency boundary, we create unnecessarily broad constraints that block parallel, unrelated decisions. This might be acceptable in some scenarios, but it severely limits scalability.

For instance, if enforcing inventory constraints required locking all events for all products, then no two orders could be processed simultaneously anywhere in the system – even for completely different product categories.

## Traditional Event Store Limitations

Traditional Event Stores typically allow querying events by their **stream** (and sometimes by **type** as well). This approach leads to the very issues that DCB aims to solve, as detailed in our [article about aggregates](https://dcb.events/topics/aggregates/).

## Alternative Approaches and Their Shortcomings

One might wonder: couldn't we solve this with a query language that filters events by their payload properties?
This is certainly possible and some Event Stores already offer this capability.

But it introduces some challenges:

### Opaque Event Payloads

The event payload should remain opaque to the Event Store. It could even be stored in binary format for efficiency or encrypted for security/privacy reasons. Requiring the Event Store to parse and understand payload structure violates this principle.

### Complexity Overhead

A query language introduces substantial complexity on both the implementation and usage sides. Event Store implementations become more complex, and developers must learn and maintain knowledge of yet another query syntax.

For example: A query to determine whether a username is claimed for the [Unique username example](../examples/unique-username.md) could look like this:

```
(
  (
    event.type IN ("AccountRegistered", "AccountClosed")
    AND
    event.data.username == "<username>"
  )
  OR (
    event.type == "UsernameChanged"
    AND
    event.data.newUsername == "<username>"
  )
)
```

while the corresponding DCB query would be:

```json
[{
  "event_types": ["AccountRegistered", "AccountClosed", "UsernameChanged"],
  "tags": ["<username-tag>"]
}]
```

### Performance Challenges

Dynamic queries against schemaless events make it extremely difficult to create performant implementations. Without predictable query patterns, the Event Store cannot optimize indexes or data structures effectively.

### Feature Incompleteness

Any query language will inevitably have limitations. Comparing dates, working with sets or maps, handling null values... There will always be edge cases and missing operators that force workarounds or compromise.

### Inference vs. Query Complexity

Importantly, tags and event types don't need to be hardcoded into domain-specific logic. Instead, they can be inferred automatically from the types for example by using interfaces or dedicated types for the tagged properties.

??? abstract "Examples: Inferring tags from events"

    ## Using interfaces

    The following C# example demonstrates how interfaces could be used to represent tagged events:

    ```csharp
    // interface definitions
    interface IDomainEvent { }

    interface ICourseEvent : IDomainEvent
    {
        string CourseId { get; }
    }

    interface IStudentEvent : IDomainEvent
    {
        string StudentId { get; }
    }

    // function to extract tags from an event instance:
    static List<string> ExtractTags(IDomainEvent domainEvent)
    {
        var tags = new List<string>();
        if (domainEvent is IStudentEvent studentEvent)
        {
            tags.Add($"student:{studentEvent.StudentId}");
        }
        if (domainEvent is ICourseEvent courseEvent)
        {
            tags.Add($"course:{courseEvent.CourseId}");
        }
        return tags;
    }

    // event definition
    sealed record StudentSubscribedToCourse(string StudentId, string CourseId) : IStudentEvent, ICourseEvent;

    // usage
    IDomainEvent domainEvent = new StudentSubscribedToCourse("s1", "c1");
    Console.WriteLine(String.Join(", ", ExtractTags(domainEvent))); // student:s1, course:c1
    ```

    ## Using custom types

    The following TypeScript example demonstrates how custom types can be used to represent tags within events:

    ```typescript
    // type definitions
    interface Tagged {
      readonly value: string
      readonly __tagPrefix: string
      toJSON(): string
    }

    interface CourseId extends Tagged {
      readonly __tagPrefix: "course"
    }

    interface StudentId extends Tagged {
      readonly __tagPrefix: "student"
    }

    function createCourseId(value: string): CourseId {
      return {
        value,
        __tagPrefix: "course" as const,
        toJSON() {
          return this.value
        },
      }
    }

    function createStudentId(value: string): StudentId {
      return {
        value,
        __tagPrefix: "student" as const,
        toJSON() {
          return this.value
        },
      }
    }

    // function to extract tags from an event instance:
    function extractTags(eventData: Record<string, unknown>): string[] {
      return Object.entries(eventData).reduce<string[]>(
        (tags, [_, property]) =>
          property && typeof property === "object" && "__tagPrefix" in property
            ? [
                ...tags,
                `${(property as Tagged).__tagPrefix}:${(property as Tagged).value}`,
              ]
            : tags,
        []
      )
    }

    // event definition
    function StudentSubscribedToCourse(studentId: StudentId, courseId: CourseId) {
      return {
        type: "StudentSubscribedToCourse" as const,
        data: { studentId, courseId },
      }
    }

    // usage
    const event = StudentSubscribedToCourse(
      createStudentId("s1"),
      createCourseId("c1")
    )
    console.log(extractTags(event.data)) // [ 'student:s1', 'course:c1' ]
    ```

This inference becomes much more challenging – if not impossible – with complex, dynamic queries.

## Guideline for Good Tags

In most cases, it's fairly obvious which tags to add to an event type. If an event affects one or more entities, their identifiers typically make appropriate tags.

In some cases, however, it's less straightforward – especially when constraints relate to more implicit concepts like email addresses, usernames, time slots or hierarchical relationships rather than concrete entities.
In those situations, identifying the aggregate root (in Domain-Driven Design terms) can help clarify which tags are relevant.

As a general rule, whenever a hard constraint depends on an event being included in a Decision Model, the necessary tags must be present. That said, it can be useful to proactively tag additional values that might become relevant for constraints in the future.

Good tags follow these principles:

- Tags must be derivable from the event payload
- Prefixes (e.g., `customer:c123`, `order-1234`) help disambiguate values and standardize tag structure
- Tags should avoid personal data – hash or anonymize sensitive values like usernames and email addresses

## Benefits of the Tag-Based Approach

### Precise Consistency Boundaries

Tags allow us to define exactly which events are relevant for a particular decision, creating precise consistency boundaries that include all necessary data while excluding irrelevant events.

### Performance Optimization

Since tags are explicitly declared and have predictable patterns, Event Stores can optimize storage and indexing strategies. This enables efficient querying even at scale.

### Automatic Inference

DCB libraries will be able to automatically infer required tags and event types from domain model definitions, reducing the burden on developers while ensuring correctness.

## Re-Tagging

Changing the tagging schema for new events is always possible. Future events can be written with different or additional tags at any time. However, such changes require care: Queries that span historical data will still return events written under previous tagging rules. Assuming that the new schema applies uniformly to all past events may therefore lead to unexpected results.

This chapter focuses on a different question: should it be possible to change the tags of events that have _already been written_?

### How Relevant Is Re-Tagging in Practice?

The topic is discussed controversially. At first glance, re-tagging existing events may appear to be an important capability – especially in a system that positions itself as more dynamic than traditional approaches. In practice, however, it is surprisingly difficult to identify compelling use cases that truly require modifying historical tags.

Tags in DCB primarily serve one purpose: enforcing strong consistency in concurrent processes. As such, they are most relevant for events that are about to be written. They protect append operations, not historical analysis.

In addition, the query used to build a decision model (aka "SourcingCriteria") does not have to match the query used to enforce append conditions (aka "AppendCriteria"). This separation opens up alternative solutions:

- A projected read model can be used to enforce constraints
- Such a read model can be partitioned by any suitable criteria
- Pessimistic locking remains an option where required
- Eventual consistency may be an acceptable trade-off in many scenarios

If new tags are required purely for reading or reporting purposes, introducing or adapting a dedicated read model is usually the more appropriate approach. Tags are a consistency mechanism and should not be treated as a general-purpose classification feature.

### When Re-Tagging Might Be Appropriate

Despite these considerations, there may be cases where re-tagging existing events is the most pragmatic solution.

It is important to note that an Event Store does not have to support re-tagging in order to comply with the [DCB specification](../specification.md). Implementations may choose to provide such functionality, but they are not required to do so.

If re-tagging is necessary, several approaches are possible:

- Using a built-in re-tagging feature of the Event Store (if available)
- Modifying stored events directly through the underlying storage mechanism (for example, via a database API)
- Streaming events into a new Event Store while transforming tags during migration, and switching to that new store afterwards

### Potential Side Effects

Changing tags of existing events may have unintended consequences:

- Event handlers might base their behavior on event tags. Affected projections may therefore need to be replayed
- Events might have been published to third parties (although exposing tags outside of the bounded context is generally discouraged)
- Historical reasoning may become misleading if past decisions were made under a different tagging scheme.

### A Pragmatic Perspective

Re-tagging should neither be dismissed categorically nor embraced uncritically.

Adding new tags to existing events will rarely cause problems, especially if those tags have not previously been used for consistency constraints. By contrast, removing or replacing tags is likely to be an uncommon requirement in most systems.

A pragmatic evaluation of the specific use case should guide the decision, rather than a dogmatic stance in either direction.

## Acknowledging the Limitations

While we've outlined the benefits of tags, it's important to acknowledge that this approach isn't without its drawbacks:

### The Name Itself

The term "tags" might not be optimal. It carries connotations from other domains (HTML tags, social media hashtags) that don't perfectly align with their role in event correlation. However, this is largely a semantic concern – DCB implementations are free to choose alternative terminology that better fits their context.

### A Technical Compromise

Despite all the mentioned benefits, we must recognize that tags stem primarily from a technical requirement rather than emerging naturally from domain modeling. They represent an additional layer of abstraction that developers must understand and maintain.

Tags are, fundamentally, our current best compromise for solving the event correlation problem in DCB systems. They balance the competing demands of:

- Precise event selection for invariant enforcement
- Performance and scalability requirements  
- Implementation complexity
- Domain model flexibility

We acknowledge that this solution adds conceptual overhead to Event Store design and usage. While we believe the benefits justify this complexity, we remain open to alternative approaches that might solve these problems more elegantly.

If you can think of alternative solutions that address the core challenges without requiring explicit tagging mechanisms, we'd be very interested to [hear from you](../about.md#contact-us).