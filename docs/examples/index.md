# Examples

The following sections demonstrate several of the numerous scenarios that can be simplified with DCB:

## Constraints affecting multiple entities

The most popular use case for DCB is to enforce hard constraints that affect multiple domain entities/concepts since it was covered in the "[Killing the Aggregate](https://sara.event-thinking.io/2023/04/kill-aggregate-chapter-1-I-am-here-to-kill-the-aggregate.html){:target="_blank"}" blog post by Sara Pellegrini.
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