# Tags: The Key to Flexible Event Correlation

When we published this website, the reception was largely positive. The concept of Dynamic Consistency Boundaries resonated with developers who had struggled with the rigid limitations of traditional Aggregate patterns. However, one aspect of the proposal sparked considerable debate and misunderstanding: the notion of **tags**.

This article aims to shed light on why tags are not just a technical detail, but a fundamental and necessary concept for implementing a DCB-compliant Event Store.

## Understanding the Role of Tags

To understand why tags are essential, we need to distinguish between two different aspects of events:

- **Event types** represent the *kind* of state change that occurred (e.g., `order placed`, `inventory reserved`, `payment processed`)
- **Tags** help correlate events with specific *instances* in the domain (e.g., `product:laptop-x1`, `customer:alice-smith`, `warehouse:eu-west`)

While an event type tells us *what happened*, tags tell us *to whom* or *to what* it happened. This distinction becomes crucial when we need to enforce business invariants.

## The Problem: Precise Event Selection for Invariant Enforcement

Consider an e-commerce system with a critical business rule:

- A product's available inventory cannot go below zero

To enforce this invariant when processing a new inventory reserved event, we need to make decisions based on previously committed events. But which events exactly?

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
This is certainly possible and some Event Stores already offer this possibility.

But it introduces some challenges:

### Opaque Event Payloads

The event payload should remain opaque to the Event Store. It could even be stored in binary format for efficiency or encrypted security/privacy reasons. Requiring the Event Store to parse and understand payload structure violates this principle.

### Complexity Overhead

A query language introduces substantial complexity on both the implementation and usage sides. Event Store implementations become more complex, and developers must learn and maintain knowledge of yet another query syntax.

### Performance Challenges

Dynamic queries against schema-less events make it extremely difficult to create performant implementations. Without predictable query patterns, the Event Store cannot optimize indexes or data structures effectively.

### Partitioning Impossibility

Dynamic payload-based queries make it nearly impossible to partition events across multiple nodes. While partitioning with multiple tags isn't trivial, it's certainly more achievable than with arbitrary query expressions.

### Feature Incompleteness

Any query language will inevitably have limitations. Comparing dates, working with sets or maps, handling null values... There will always be edge cases and missing operators that force workarounds or compromise.

### Code Inference vs. Query Complexity

Most importantly, the relevant event types and tags can be automatically inferred from high-level, domain-specific code. This inference becomes much more challenging – if not impossible – with complex, dynamic queries.

## Benefits of the Tag-Based Approach

### Precise Consistency Boundaries

Tags allow us to define exactly which events are relevant for a particular decision, creating precise consistency boundaries that include all necessary data while excluding irrelevant events.

### Performance Optimization

Since tags are explicitly declared and have predictable patterns, Event Stores can optimize storage and indexing strategies. This enables efficient querying even at scale.

### Automatic Inference

DCB libraries will be able to automatically infer required tags and event types from domain model definitions, reducing the burden on developers while ensuring correctness.

### Partitioning Possibilities

While challenging, it's possible to partition events across multiple nodes based on tag patterns, enabling horizontal scaling of the Event Store.

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