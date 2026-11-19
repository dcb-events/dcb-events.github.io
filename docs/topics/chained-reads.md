Usually, a command knows up front which Events it has to read: the identifiers in its properties are the Tags of its Query. Sometimes, however, part of the decision depends on state that is only known after reading other state.

This article explains how such a **chained read** works with a DCB-capable Event Store, and why it needs one additional request to the Event Store to stay consistent.

## What is a chained read

In the [library loans example](../examples/library-loans.md), a loan is renewed by scanning a copy of a book. The `RenewLoan` command only knows the copy, but it has to check constraints of the borrower and of the book, too:

- A loan can be renewed at most twice
- A loan can't be renewed while the borrower is suspended
- A loan can't be renewed while a member has reserved the book

Who borrowed the copy, and which book it is a copy of, follows from the Events of the copy. So the command reads in two steps:

1. Read the Events of the copy, to learn its borrower, its book and the number of renewals
2. Read the Events of _that_ borrower and of _that_ book

The second read takes its Tags from the result of the first one, hence the name chained read.

## One consistency boundary

The chain does not split the decision into two boundaries. The Append Condition contains the Query Items of _all_ reads, so the append fails if any Event matching one of them was appended in the meantime.

This also covers changes that affect the chain itself: if the copy is returned and lent to another member while the loan is renewed, the borrower that was read is no longer the right one. But the `CopyReturned` and `CopyLent` Events match the Query Items of the first read, so the append fails and the command can be retried with the new borrower.

## The high watermark

An [Append Condition](../specification.md#append-condition) contains one Query and one `after` position, but a chained read consists of multiple reads, each of which ends at a different position. None of these positions is a suitable `after`:

- **Position of the first read:** The last Event of the copy might be older than the last Event of the borrower. If the member was suspended and reinstated after the copy was lent, the `MemberReinstated` Event lies after that position and makes _every_ renewal fail, even without any concurrent change
- **Position of the last read:** Events of the copy that were appended between the two reads are ignored by the condition. If another renewal of the same loan is appended in that moment, the loan can be renewed a third time

Instead, `after` has to be the position of yet another request to the Event Store: the **high watermark**, i.e. the position of the last Event in the Event Store, regardless of its type and Tags. It has to be determined _before_ the first read, so that every Event appended after it, during or after the reads, is checked by the Append Condition.

Some Event Stores provide a dedicated function for this. Otherwise it can be determined by reading a single Event backwards (pseudo-code):

```{.haskell .no-copy}
highWatermark = eventStore.head()
// or
highWatermark = eventStore.read(Query.all(), { backwards: true, limit: 1 }).first()?.position
```

If the Event Store doesn't contain any Events yet, the high watermark is `0`, or absent, depending on how the implementation represents [Sequence Positions](../specification.md#sequence-position). In the latter case, `after` is omitted and the condition checks all Events.

!!! note

    The reads are not limited to the high watermark. If a read already returns an Event that was appended after it, the Event is part of the Decision Model _and_ matches the Append Condition. The append fails even though the Decision Model was up to date. This is safe, and rare, because it requires an Event to be appended between determining the high watermark and reading – a retry resolves it.

    As an optimization, the client can fail (or retry) as soon as a read returns an Event with a position greater than the high watermark: that Event matches the Append Condition, so the append is bound to fail anyway, and the remaining reads can be skipped.

The additional request is only required when the Decision Model is built from more than one read, as a chained read always is. If all Query Items are known up front, a single read suffices, and its last position can be used as `after` directly.

## Walkthrough

The following steps show the requests of the `RenewLoan` command for copy `c1`, with Tags in the form `<type>:<id>`. Initially, the Event Store contains the following Events:

| Position | Type                 | Tags                   |
|----------|----------------------|------------------------|
| 1        | `CopyAddedToCatalog` | `copy:c1`, `book:b1`   |
| 2        | `MemberSuspended`    | `member:m1`            |
| 3        | `CopyLent`           | `copy:c1`, `member:m1` |
| 4        | `MemberReinstated`   | `member:m1`            |
| 5        | `BookReserved`       | `book:b2`, `member:m2` |

**1. Determine the high watermark:** `5`

**2. Read the copy:**

```{.haskell .no-copy}
read(Query {
  items: [
    { types: ["CopyAddedToCatalog", "CopyLent", "CopyReturned", "LoanRenewed"], tags: ["copy:c1"] }
  ]
})
```

This returns the Events at positions 1 and 3: the copy `c1` is a copy of book `b1`, lent to member `m1`, and was not renewed yet.

**3. Read the borrower and the book:**

```{.haskell .no-copy}
read(Query {
  items: [
    { types: ["MemberSuspended", "MemberReinstated"], tags: ["member:m1"] },
    { types: ["BookReserved", "ReservationCancelled"], tags: ["book:b1"] }
  ]
})
```

This returns the Events at positions 2 and 4: member `m1` is not suspended, and book `b1` is not reserved.

**4. Append with the Query Items of both reads:**

```{.haskell .no-copy}
append(
  Event { type: "LoanRenewed", tags: ["copy:c1"] },
  AppendCondition {
    failIfEventsMatch: Query {
      items: [
        { types: ["CopyAddedToCatalog", "CopyLent", "CopyReturned", "LoanRenewed"], tags: ["copy:c1"] },
        { types: ["MemberSuspended", "MemberReinstated"], tags: ["member:m1"] },
        { types: ["BookReserved", "ReservationCancelled"], tags: ["book:b1"] }
      ]
    },
    after: 5
  }
)
```

Note that the position of the first read (`3`) would have made the append fail because of the `MemberReinstated` Event at position 4.

### Concurrent changes

If one of the following Events is appended after the high watermark was determined, it has this effect on the append:

| Concurrent Event                         | Matching Query Item | Append    |
|------------------------------------------|---------------------|-----------|
| `MemberSuspended` for `m1`               | borrower            | fails     |
| `CopyReturned` and `CopyLent` for `c1`   | copy                | fails     |
| `LoanRenewed` for `c1`                   | copy                | fails     |
| `BookReserved` for `b1`                  | book                | fails     |
| `MemberSuspended` for `m2`               | –                   | succeeds  |
| `BookReserved` for `b2`                  | –                   | succeeds  |

## Fanned-out chains

A read in a chain can also return a _list_ of identifiers, e.g. all students subscribed to a course. The next read then contains one Query Item per identifier, so the size of the Query depends on the state that was read. The high watermark works just the same. See [chained reads](../notation/index.md#chained-reads) in the DCB notation guide for an example.

## Conclusion

Chained reads allow a command to enforce constraints of entities it only learns about while deciding, without a denormalized <dfn title="Representation of data tailored for specific read operations, often denormalized for performance">Read Model</dfn> and without an Aggregate that holds them together. The Query is as deep as the chain of reads, but only as wide as the constraints it checks. The only requirement for the Event Store client is to determine the high watermark before the first read and to use it as the `after` position of the Append Condition.
