Creating a monotonic sequence without gaps is another common requirement DCB can help with

## Challenge

Create invoices with unique numbers that form an unbroken sequence

## Traditional approaches

As this challenge is similar to the [Unique username example](unique-username.md), the traditional approaches are the same.

## DCB approach

This requirement could be solved with an in-memory [Projection](../topics/projections.md) that calculates the `nextInvoiceNumber`:

<script type="application/dcb+json">
{
  "meta": {
    "version": "1.0",
    "id": "invoice_number_01"
  },
  "eventDefinitions": [
    {
      "name": "InvoiceCreated",
      "schema": {
        "type": "object",
        "properties": {
          "invoiceNumber": {
            "type": "number"
          },
          "invoiceData": {
            "type": "object"
          }
        }
      },
      "tagResolvers": [
        "invoice:{data.invoiceNumber}"
      ]
    }
  ],
  "commandDefinitions": [
    {
      "name": "createInvoice",
      "schema": {
        "type": "object",
        "properties": {
          "invoiceData": {
            "type": "object"
          }
        }
      }
    }
  ],
  "projections": [
    {
      "name": "nextInvoiceNumber",
      "parameterSchema": null,
      "stateSchema": {
        "type": "number",
        "default": 1
      },
      "handlers": {
        "InvoiceCreated": "event.data.invoiceNumber + 1"
      }
    }
  ],
  "commandHandlerDefinitions": [
    {
      "commandName": "createInvoice",
      "decisionModels": [
        {
          "name": "nextInvoiceNumber",
          "parameters": []
        }
      ],
      "constraintChecks": [],
      "successEvent": {
        "type": "InvoiceCreated",
        "data": {
          "invoiceNumber": "{state.nextInvoiceNumber}",
          "invoiceData": "{command.invoiceData}"
        }
      }
    }
  ],
  "testCases": [
    {
      "description": "Create first invoice",
      "givenEvents": null,
      "whenCommand": {
        "type": "createInvoice",
        "data": {
          "invoiceData": {
            "foo": "bar"
          }
        }
      },
      "thenExpectedEvent": {
        "type": "InvoiceCreated",
        "data": {
          "invoiceNumber": 1,
          "invoiceData": {
            "foo": "bar"
          }
        }
      }
    },
    {
      "description": "Create second invoice",
      "givenEvents": [
        {
          "type": "InvoiceCreated",
          "data": {
            "invoiceNumber": 1,
            "invoiceData": {
              "foo": "bar"
            }
          }
        }
      ],
      "whenCommand": {
        "type": "createInvoice",
        "data": {
          "invoiceData": {
            "bar": "baz"
          }
        }
      },
      "thenExpectedEvent": {
        "type": "InvoiceCreated",
        "data": {
          "invoiceNumber": 2,
          "invoiceData": {
            "bar": "baz"
          }
        }
      }
    }
  ]
}
</script>

### Better performance

With this approach, **every past `InvoiceCreated` event must be loaded** just to determine the next invoice number. And although this may not introduce significant performance concerns with hundreds or even thousands of invoices — depending on how fast the underlying Event Store is — it remains a suboptimal and inefficient design choice.

#### Snapshots

One workaround would be to use a <dfn title="Periodic point-in-time representations of an Aggregate’s state, used to optimize performance by avoiding the need to replay all past events from the beginning">Snapshot</dfn> to reduce the number of Events to load but this increases complexity and adds new infrastructure requirements. 

#### Only load a single Event

Some DCB compliant Event Stores support returning only the **last matching Event** for a given `QueryItem`, such that the projection could be rewritten like this:


```js hl_lines="7"
function NextInvoiceNumberProjection(value) {
  return createProjection({
    initialState: 1,
    handlers: {
      InvoiceCreated: (state, event) => event.data.invoiceNumber + 1,
    },
    onlyLastEvent: true,
  })
}
```

Alternatively, for this specific scenario, the last `InvoiceCreated` Event can be loaded "manually":

```{.js .partial hl_lines="31-49"}
// event type definitions:

function InvoiceCreated({ invoiceNumber, invoiceData }) {
  return {
    type: "InvoiceCreated",
    data: { invoiceNumber, invoiceData },
    tags: [`invoice:${invoiceNumber}`],
  }
}

// projections for decision models:

function NextInvoiceNumberProjection(value) {
  return createProjection({
    initialState: 1,
    handlers: {
      InvoiceCreated: (state, event) => event.data.invoiceNumber + 1,
    },
  })
}

// command handlers:

class Api {
  eventStore
  constructor(eventStore) {
    this.eventStore = eventStore
  }

  createInvoice(command) {
    const projection = NextInvoiceNumberProjection()
    const lastInvoiceCreatedEvent = this.eventStore
      .read(projection.query, {
        backwards: true,
        limit: 1,
      })
      .first()

    const nextInvoiceNumber = lastInvoiceCreatedEvent
      ? projection.apply(
          projection.initialState,
          lastInvoiceCreatedEvent
        )
      : projection.initialState

    const appendCondition = {
      failIfEventsMatch: projection.query,
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
console.log(eventStore.read(queryAll()).first())
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/dcb.js"></codapi-snippet>

## Conclusion

This example demonstrates how a DCB compliant Event Store can simplify the creation of monotonic sequences