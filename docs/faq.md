Some common questions and misconceptions about DCB:

## Who are you and what is this website all about?

See [about](about.md).

## What's the new idea about DCB?

The core idea of DBC is simple: Allowing Events to be assigned to _multiple_ domain concepts and to dynamically enforce consistency amongst them. The consequences, however, are broad because DCB can greatly improve the way you design your applications.

## Does DCB promote lack of modeling?

Definitely not, on the contrary: It aims to reduce technical friction so that one can focus on the domain and be more flexible as the model evolves.

## Is it about less strict consistency?

No: while DCB allows to define very specific consistency boundaries, those are always enforced immediately.

## Does it promote using strong consistency everywhere?

No. DCB makes it easier to switch between the consistency models, but it is still important to think about strong vs eventual consistency and their implications to the behavior of the system.

## Why do you want to kill Aggregates?

The idea of DCB started with the goal of killing the Aggregate [:octicons-link-external-16:](https://sara.event-thinking.io/2023/04/kill-aggregate-chapter-1-I-am-here-to-kill-the-aggregate.html){:target="_blank" .small}.

However, DCB does not actually attack the Aggregate pattern itself. Instead, it offers an alternative approach to achieving consistency in event-driven architectures — one that doesn't rely on Aggregates as the primary mechanism.

For more on this, see our article on [Aggregates](topics/aggregates.md).

## Does DCB force me to scatter business logic?

DCB enables you to structure code around use cases in order to focus on the behavior rather than the data models.

However, DCB does not dictate how you design your application. You're free to organize logic around entities if that better suits your workflow.

## Can I still use Aggregates with DCB?

Yes, that’s possible; the [Event-Sourced Aggregate](examples/event-sourced-aggregate.md) example demonstrates that.

## Isn't a Tag just an index?

It may appear that way because, like an index, Tags can be used to look up Events.

However, this view is misleading. Tags in DCB are not merely technical lookup aids. They identify the subjects involved in an occurred fact.

The essence of DCB is its consistency guarantee: decisions are made on the basis of a surgically and dynamically selected set of Events.
This "surgical" selection is defined by two orthogonal parameters:
- the *Event Type*, which describes what happened, and
- the *Tags*, which describe the subjects involved in what happened.

Tags are therefore part of the semantic model, not just an optimization mechanism.

Read more about it in our article on [Tags](topics/tags.md).

## Can Tags be changed after the fact?

In short: this is not considered a common requirement and is therefore not part of the [DCB specification](specification.md).

That said, it can be done – even if the Event Store does not provide a dedicated API for it. However, it must be handled with care. Changing Tags, especially removing or replacing them, can alter the set of Events considered for a decision and therefore change its outcome.

Read more about re-tagging [here](topics/tags.md#re-tagging)

## Is it really common to require events with multile Tags?

In many applications, most Events can be associated with a single subject and therefore require only one Tag.

However, there are typically neuralgic Events where processes interleave or hand over responsibility. For example, a `SignUpConfirmed` Event may both conclude a sign-up process and establish a customer record.

Another common scenario is hierarchical structures with overlapping consistency boundaries. In such cases, multiple Tags are necessary to express the involved subjects precisely and to preserve correct decision semantics.

## Isn't "noun-thinking" the actual problem?

There are claims that DCB is unnecessary as long as Events focus on processes rather than entities.

While a strong process focus can indeed help, it does not eliminate aggregate-related consistency issues. Avoiding these issues typically requires orchestration mechanisms, which introduce additional complexity.

DCB addresses consistency concerns directly – independent of whether modeling emphasizes nouns or processes.

## Is DCB increasing complexity?

On the contrary. While DCB may challenge certain assumptions and require some adaptation, we believe it simplifies the overall mental model by allowing you to decide between strong and eventual consistency on a case-by-case basis.

## How does it improve performance?

The primary goal of DCB is not to improve performance, but to provide a way to selectively enforce consistency where it’s actually needed. That said, in large-scale applications, enforcing strict consistency everywhere can become a performance bottleneck. By making it easier to apply eventual consistency where appropriate, DCB can help systems scale more effectively and potentially improve performance as a side effect—though that’s not its core purpose.

## How does it scale?

DCB is still a relatively young concept, and its scalability characteristics are being actively explored. That said, early benchmarks using a PostgreSQL-based implementation indicate promising performance: even after processing 1 million Events, the system maintained a throughput of approximately 0.001 seconds per Event — equivalent to around 1,000 events per second. While these results are preliminary and implementation-dependent, they suggest that DCB can scale effectively in practice, especially when paired with well-optimized persistence layers and infrastructure.

## Does it increase chances of lock collisions?

A collision occurs when multiple processes attempt to modify the same data at nearly the same time, leading to contention over access. DCB actually _reduces_ the risk of such collisions by narrowing the scope of consistency enforcement. Instead of locking entire entities or aggregates, DCB allows fine-grained boundaries that isolate only the parts of the system where consistency constraints must be enforced. As a result, multiple processes can safely modify the same entity – so long as their changes don’t violate each other’s consistency requirements — thereby reducing contention and improving concurrency.

## How can it be used with a "traditional" Event Store?

A DCB-compliant Event Store offers features that are not typically found in traditional Event Stores (see [specification](specification.md)). As a result, a traditional Event Store can't be used with DCB directly out of the box.

However, we’re experimenting with an adapter layer that allows traditional Event Stores to support DCB features by incorporating strategies like pessimistic locking to enforce consistency where needed. Stay tuned.

## Nothing comes for free. What are limitations/drawbacks of DCB?

DCB guarantees consistency only inside the scope of the global [Sequence Position](specification.md#sequence-position). Thus, Events must be ordered to allow the conditional appending.
As a result, it’s not (easily) possible to partition Events.
Furthermore, DCB leads to some additional complexity in the Event Store implementation (see [Specification](specification.md)).

## What are the next steps?

The future of DCB is still unfolding. There’s a lot more to discover, both conceptually and in practice and your feedback will play a key role in shaping its evolution — sparking new ideas, use cases, and conversations.

We plan to continuously extend this website with more [examples](examples/index.md), [articles](topics/index.md), and [resources](resources/index.md) to help others explore and apply DCB in real-world systems. Make sure to watch the Github Repository[:octicons-link-external-16:](https://github.com/dcb-events/dcb-events.github.io){:target="_blank" .small} of this website to get notified about changes.
