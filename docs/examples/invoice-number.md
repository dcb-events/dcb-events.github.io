
Creating a monotonic sequence without gaps is another common requirement DCB can help with

## Challenge

Create invoices with unique numbers that form an unbroken sequence

## Traditional approaches

As this challenge is similar to the [Unique username example](unique-username.md), the traditional approaches are the same.

## DCB approach

This requirement could be solved with an in-memory [Projection](../topics/projections.md) that calculates the `nextInvoiceNumber`:

```js
// event type definitions:

const eventTypes = {
  InvoiceCreated: {
    tagResolver: (data) => [`invoice:${data.invoiceNumber}`],
  },
}

// decision models:

const decisionModels = {
  nextInvoiceNumber: () => ({
    initialState: 1,
    handlers: {
      InvoiceCreated: (state, event) => event.data.invoiceNumber + 1,
    },
  }),
}

// command handlers:

const commandHandlers = {
  createInvoice: (command) => {
    const { state, appendCondition } = buildDecisionModel({
      nextInvoiceNumber: decisionModels.nextInvoiceNumber(),
    })
    appendEvent(
      {
        type: "InvoiceCreated",
        data: { invoiceNumber: state.nextInvoiceNumber },
      },
      appendCondition
    )
  },
}

// test cases:

test([
  {
    description: "Create first invoice",
    when: {
      command: {
        type: "createInvoice",
      },
    },
    then: {
      expectedEvent: {
        type: "InvoiceCreated",
        data: { invoiceNumber: 1 },
      },
    },
  },
  {
    description: "Create second invoice",
    given: {
      events: [
        {
          type: "InvoiceCreated",
          data: { invoiceNumber: 1 },
        }
      ],
    },
    when: {
      command: {
        type: "createInvoice",
      },
    },
    then: {
      expectedEvent: {
        type: "InvoiceCreated",
        data: { invoiceNumber: 2 },
      },
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### Better performance

With this approach, **every past `InvoiceCreated` event must be loaded** just to determine the next invoice number. And although this may not introduce significant performance concerns with hundreds or even thousands of invoices — depending on how fast the underlying Event Store is — it remains a suboptimal and inefficient design choice.

#### Snapshots

One workaround would be to use a [Snapshot](../glossary.md#snapshot) to reduce the number of Events to load but this increases complexity and adds new infrastructure requirements. 

#### Only load a single Event

Some DCB compliant Event Stores support returning only the **last matching Event** for a given `QueryItem`, such that the projection could be rewritten like this:


```js hl_lines="7"
const decisionModels = {
  nextInvoiceNumber: () => ({
    initialState: 1,
    handlers: {
      InvoiceCreated: (state, event) => event.data.invoiceNumber + 1,
    },
    onlyLastEvent: true,
  }),
}
```

Alternatively, for this specific scenario, the last `InvoiceCreated` Event can be loaded "manually":

```js
const query = [{ eventTypes: ["InvoiceCreated"] }]
const lastInvoiceCreatedEvent = dcbEventStore.read(query, {
  backwards: true,
  limit: 1,
})[0]
const nextInvoiceNumber = lastInvoiceCreatedEvent
  ? lastInvoiceCreatedEvent.data.invoiceNumber + 1
  : 1

dcbEventStore.append(
  {
    type: "InvoiceCreated",
    data: { invoiceNumber: nextInvoiceNumber },
    tags: [`invoice:${nextInvoiceNumber}`],
  },
  { failIfEventsMatch: query, after: lastInvoiceCreatedEvent?.position }
)

console.log(dcbEventStore.read([]).map((e) => e.data))
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/InMemoryDcbEventStoreTemplate.js"></codapi-snippet>

## Conclusion

This example demonstrates how a DCB compliant Event Store can simplify the creation of monotonic sequences