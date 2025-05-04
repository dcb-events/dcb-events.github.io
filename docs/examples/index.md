# Examples

The following sections demonstrate several of the numerous scenarios that can be simplified with DCB:

??? note

    Most of the examples don't interact with the Event Store directly, but use higher level abstractions that allow for focusing on the business logic while demonstrating the potential of DCB. See article about [Projections](../topics/projections.md) for more details

## Constraints affecting multiple entities

The most popular use case for DCB is to enforce hard constraints that affect multiple domain entities/concepts since it was covered in the "Killing the Aggregate" blog post by Sara Pellegrini [:octicons-link-external-16:](https://sara.event-thinking.io/2023/04/kill-aggregate-chapter-1-I-am-here-to-kill-the-aggregate.html){:target="_blank" .small}.
The [course subscriptions](course-subscriptions.md) example illustrates that scenario.

## Enforcing global uniqueness

Enforcing globally unique values is one of the evergreen-topics of eventual consistent applications. The [unique username](unique-username.md) example demonstrates how easy this is with DCB.

## Consecutive sequence

Creating a monotonic sequence without gaps is a common requirement, for example in [invoice numbering](invoice-number.md).

## Replacing Read Models

Due to the flexibility of DCB, it can sometimes replace entire Read Models, for example to validate [Opt-In tokens](opt-in-token.md) or to guarantee that a product can be purchased for the [displayed price](dynamic-product-price.md).

## Idempotency

Double submission is a common problem. It can usually be worked around by creating IDs on the client side, but sometimes that's not an option.
DCB allows to use a dedicated idempotency id in order to [prevent record duplication](prevent-record-duplication.md).

---

!!! tip
    We will add more examples over time, make sure to watch the Github Repository[:octicons-link-external-16:](https://github.com/dcb-events/dcb-events.github.io){:target="_blank" .small} of this website to get notified about changes