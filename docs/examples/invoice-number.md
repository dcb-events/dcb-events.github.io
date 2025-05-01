
Creating a monotonic sequence without gaps is another common requirement DCB can help with

## Challenge

Create invoices with unique numbers that form an unbroken sequence

## Traditional approaches

As this challenge is similar to the [Unique username example](unique-username.md), the traditional approaches are the same.

## DCB approach

This requirement could be solved with an in-memory [Projection](../topics/projections.md) that calculates the `nextInvoiceNumber`:

```js
// event type definitions:

class InvoiceCreated {
  type = "InvoiceCreated"
  data
  tags
  constructor({ invoiceNumber, invoiceData }) {
    this.data = { invoiceNumber, invoiceData }
    this.tags = [`invoice:${invoiceNumber}`]
  }
}

// projections for decision models:

class NextInvoiceNumberProjection {
  static create() {
    return createProjection({
      initialState: 1,
      handlers: {
        InvoiceCreated: (state, event) => event.data.invoiceNumber + 1,
      },
      onlyLastEvent: true,
    })
  }
}

// command handlers:

class Api {
  eventStore
  constructor(eventStore) {
    this.eventStore = eventStore
  }

  createInvoice(command) {
    const { state, appendCondition } = buildDecisionModel(this.eventStore, {
      nextInvoiceNumber: NextInvoiceNumberProjection.create(),
    })
    this.eventStore.append(
      new InvoiceCreated({
        invoiceNumber: state.nextInvoiceNumber,
        invoiceData: command.invoiceData,
      }),
      appendCondition
    )
  }
}

// test cases:

const eventStore = new InMemoryDcbEventStore()
const api = new Api(eventStore)

runTests(api, eventStore, [
  {
    description: "Create first invoice",
    when: {
      command: {
        type: "createInvoice",
        data: {
          invoiceData: { foo: "bar" },
        },
      },
    },
    then: {
      expectedEvent: new InvoiceCreated({
        invoiceNumber: 1,
        invoiceData: { foo: "bar" },
      }),
    },
  },
  {
    description: "Create second invoice",
    given: {
      events: [
        new InvoiceCreated({
          invoiceNumber: 1,
          invoiceData: { foo: "bar" },
        }),
      ],
    },
    when: {
      command: {
        type: "createInvoice",
        data: {
          invoiceData: { bar: "baz" },
        },
      },
    },
    then: {
      expectedEvent: new InvoiceCreated({
        invoiceNumber: 2,
        invoiceData: { bar: "baz" },
      }),
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib2.js"></codapi-snippet>

### Better performance

With this approach, **every past `InvoiceCreated` event must be loaded** just to determine the next invoice number. And although this may not introduce significant performance concerns with hundreds or even thousands of invoices — depending on how fast the underlying Event Store is — it remains a suboptimal and inefficient design choice.

#### Snapshots

One workaround would be to use a <dfn title="Periodic point-in-time representations of an Aggregate’s state, used to optimize performance by avoiding the need to replay all past events from the beginning">Snapshot</dfn> to reduce the number of Events to load but this increases complexity and adds new infrastructure requirements. 

#### Only load a single Event

Some DCB compliant Event Stores support returning only the **last matching Event** for a given `QueryItem`, such that the projection could be rewritten like this:


```js hl_lines="8"
class NextInvoiceNumberProjection {
  static create() {
    return createProjection({
      initialState: 1,
      handlers: {
        InvoiceCreated: (state, event) => event.data.invoiceNumber + 1,
      },
      onlyLastEvent: true,
    })
  }
}
```

Alternatively, for this specific scenario, the last `InvoiceCreated` Event can be loaded "manually":

```js hl_lines="36-54"
// event type definitions:

class InvoiceCreated {
  type = "InvoiceCreated"
  data
  tags
  constructor({ invoiceNumber, invoiceData }) {
    this.data = { invoiceNumber, invoiceData }
    this.tags = [`invoice:${invoiceNumber}`]
  }
}

// projections for decision models:

class NextInvoiceNumberProjection {
  static create() {
    return createProjection({
      initialState: 1,
      handlers: {
        InvoiceCreated: (state, event) => event.data.invoiceNumber + 1,
      },
      onlyLastEvent: true,
    })
  }
}

// command handlers:

class Api {
  eventStore
  constructor(eventStore) {
    this.eventStore = eventStore
  }

  createInvoice(command) {
    const nextInvoiceNumberProjection = NextInvoiceNumberProjection.create()
    const lastInvoiceCreatedEvent = this.eventStore
      .read(nextInvoiceNumberProjection.query, {
        backwards: true,
        limit: 1,
      })
      .first()

    const nextInvoiceNumber = lastInvoiceCreatedEvent
      ? nextInvoiceNumberProjection.apply(
          nextInvoiceNumberProjection.initialState,
          lastInvoiceCreatedEvent
        )
      : nextInvoiceNumberProjection.initialState

    const appendCondition = {
      failIfEventsMatch: nextInvoiceNumberProjection.query,
      after: lastInvoiceCreatedEvent?.position,
    }

    this.eventStore.append(
      new InvoiceCreated({
        invoiceNumber: nextInvoiceNumber,
        invoiceData: command.invoiceData,
      }),
      appendCondition
    )
  }
}

const eventStore = new InMemoryDcbEventStore()
const api = new Api(eventStore)
api.createInvoice({invoiceData: {foo: "bar"}})
console.log(eventStore.read(Query.all()).first())
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib2.js"></codapi-snippet>

## Conclusion

This example demonstrates how a DCB compliant Event Store can simplify the creation of monotonic sequences