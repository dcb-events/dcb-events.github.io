# Dynamic product price validation

The following example showcases a simple application that allows to purchase products, with a twist

## Challenge

The goal is an application that allows customers to purchase products, ensuring that the displayed price is taken into account – if it is valid:

- The product prices that are shown to the customer must be used for processing the order
- If a displayed product price is not/no longer valid, the order must fail
- Product prices can be changed at any time
- If a product price was changed, the previous price(s) must be valid for a configurable grace period

## Traditional approaches

There are several potential strategies to solve this without DCB:

- For the single product use case an [Aggregate](../glossary.md#aggregate) could be used
    - That only works if product change and -purchase Events are stored in the same Event Stream, which is unlikely to be a good idea
- Use the [Read Model](../glossary.md#read-model) to verify the prices in the command handler
    - That works, but the last requirement (changing prices) forces the model to keep track of historic data even though there might be no (other) use case for it to be kept. A separate, dedicated, model could be created of course but that adds complexity

## DCB approach

With DCB the challenge can be solved without any specific [Tags](../specification.md#tag) (except for the `product:<id>` tag):

### 01: Single product

If only a single product with a fixed price can be purchased at a time, the implementation is pretty simple:

![dynamic product price example](img/dynamic-product-price-01.png)

```js
// event type definitions:

const eventTypes = {
  ProductDefined: {
    tagResolver: (data) => [`product:${data.productId}`],
  },
  ProductOrdered: {
    tagResolver: (data) => [`product:${data.productId}`],
  },
}

// decision models:

const decisionModels = {
  productPrice: (productId) => ({
    initialState: 0,
    handlers: {
      ProductDefined: (state, event) => event.data.price,
    },
    tagFilter: [`product:${productId}`],
  }),
}

// command handlers:

const commandHandlers = {
  orderProduct: (command) => {
    const { state, appendCondition } = buildDecisionModel({
      productPrice: decisionModels.productPrice(command.productId),
    })
    if (state.productPrice !== command.displayedPrice) {
      throw new Error(`invalid price for product "${command.productId}"`)
    }
    appendEvent(
      {
        type: "ProductOrdered",
        data: { productId: command.productId, price: command.displayedPrice },
      },
      appendCondition
    )
  },
}

// test cases:

test([
  {
    description: "Order product with invalid displayed price",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProduct",
        data: { productId: "p1", displayedPrice: 100 },
      },
    },
    then: {
      expectedError: 'invalid price for product "p1"',
    },
  },
  {
    description: "Order product with valid displayed price",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProduct",
        data: { productId: "p1", displayedPrice: 123 },
      },
    },
    then: {
      expectedEvent: {
        type: "ProductOrdered",
        data: { productId: "p1", price: 123 },
      },
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### 02: Changing product prices

Complexity increases if the product price can be changed and previous prices shall be valid for a specified amount of time:

![dynamic product price example 2](img/dynamic-product-price-02.png)

!!! note

    The `minutesAgo` property of the Event metadata is a simplification. Typically, a timestamp representing the Event's recording time is stored within the Event's payload or metadata. This timestamp can be compared to the current date to determine the Event's age in the decision model.

```js hl_lines="19-32 44-49"
// event type definitions:

const eventTypes = {
  ProductDefined: {
    tagResolver: (data) => [`product:${data.productId}`],
  },
  ProductPriceChanged: {
    tagResolver: (data) => [`product:${data.productId}`],
  },
  ProductOrdered: {
    tagResolver: (data) => [`product:${data.productId}`],
  },
}

// decision models:

const decisionModels = {
  productPrice: (productId) => ({
    initialState: { lastValidOldPrice: null, validNewPrices: [] },
    handlers: {
      ProductDefined: (state, event) =>
        event.metadata.minutesAgo <= 10
          ? { lastValidOldPrice: null, validNewPrices: [event.data.price] }
          : { lastValidOldPrice: event.data.price, validNewPrices: [] },
      ProductPriceChanged: (state, event) =>
        event.metadata.minutesAgo <= 10
          ? {
              lastValidOldPrice: state.lastValidOldPrice,
              validNewPrices: [...state.validNewPrices, event.data.newPrice],
            }
          : { lastValidOldPrice: event.data.newPrice, validNewPrices: state.validNewPrices },
    },
    tagFilter: [`product:${productId}`],
  }),
}

// command handlers:

const commandHandlers = {
  orderProduct: (command) => {
    const { state, appendCondition } = buildDecisionModel({
      productPrice: decisionModels.productPrice(command.productId),
    })
    if (
      state.productPrice.lastValidOldPrice !== command.displayedPrice &&
      !state.productPrice.validNewPrices.includes(command.displayedPrice)
    ) {
      throw new Error(`invalid price for product "${command.productId}"`)
    }
    appendEvent(
      {
        type: "ProductOrdered",
        data: { productId: command.productId, price: command.displayedPrice },
      },
      appendCondition
    )
  },
}

// test cases:

test([
  {
    description: "Order product with a displayed price that was never valid",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
          metadata: { minutesAgo: 20 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProduct",
        data: { productId: "p1", displayedPrice: 100 },
      },
    },
    then: {
      expectedError: 'invalid price for product "p1"',
    },
  },
  {
    description: "Order product with a price that was changed more than 10 minutes ago",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
          metadata: { minutesAgo: 20 },
        },
        {
          type: "ProductPriceChanged",
          data: { productId: "p1", newPrice: 134 },
          metadata: { minutesAgo: 20 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProduct",
        data: { productId: "p1", displayedPrice: 123 },
      },
    },
    then: {
      expectedError: 'invalid price for product "p1"',
    },
  },
  {
    description: "Order product with initial valid price",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
          metadata: { minutesAgo: 20 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProduct",
        data: { productId: "p1", displayedPrice: 123 },
      },
    },
    then: {
      expectedEvent: {
        type: "ProductOrdered",
        data: { productId: "p1", price: 123 },
      },
    },
  },
  {
    description: "Order product with a price that was changed less than 10 minutes ago",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
          metadata: { minutesAgo: 20 },
        },
        {
          type: "ProductPriceChanged",
          data: { productId: "p1", newPrice: 134 },
          metadata: { minutesAgo: 9 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProduct",
        data: { productId: "p1", displayedPrice: 123 },
      },
    },
    then: {
      expectedEvent: {
        type: "ProductOrdered",
        data: { productId: "p1", price: 123 },
      },
    },
  },
  {
    description: "Order product with valid new price",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
          metadata: { minutesAgo: 20 },
        },
        {
          type: "ProductPriceChanged",
          data: { productId: "p1", newPrice: 134 },
          metadata: { minutesAgo: 9 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProduct",
        data: { productId: "p1", displayedPrice: 134 },
      },
    },
    then: {
      expectedEvent: {
        type: "ProductOrdered",
        data: { productId: "p1", price: 134 },
      },
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### 03: Multiple products (shopping cart)

The previous stages could be implemented with a traditional Event-Sourced [Aggregate](../glossary.md#aggregate) in theory.
But with the requirement to be able to order *multiple products at once* with a dynamic price, the flexibility of DCB shines:

```js hl_lines="10-12 40-67"
// event type definitions:

const eventTypes = {
  ProductDefined: {
    tagResolver: (data) => [`product:${data.productId}`],
  },
  ProductPriceChanged: {
    tagResolver: (data) => [`product:${data.productId}`],
  },
  ProductsOrdered: {
    tagResolver: (data) => data.items.map((item) => `product:${item.productId}`),
  },
}

// decision models:

const decisionModels = {
  productPrice: (productId) => ({
    initialState: { lastValidOldPrice: null, validNewPrices: [] },
    handlers: {
      ProductDefined: (state, event) =>
        event.metadata.minutesAgo <= 10
          ? { lastValidOldPrice: null, validNewPrices: [event.data.price] }
          : { lastValidOldPrice: event.data.price, validNewPrices: [] },
      ProductPriceChanged: (state, event) =>
        event.metadata.minutesAgo <= 10
          ? {
              lastValidOldPrice: state.lastValidOldPrice,
              validNewPrices: [...state.validNewPrices, event.data.newPrice],
            }
          : { lastValidOldPrice: event.data.newPrice, validNewPrices: state.validNewPrices },
    },
    tagFilter: [`product:${productId}`],
  }),
}

// command handlers:

const commandHandlers = {
  orderProducts: (command) => {
    const { state, appendCondition } = buildDecisionModel(
      command.cart.reduce((models, cartItem) => {
        models[cartItem.productId] = decisionModels.productPrice(cartItem.productId)
        return models
      }, {})
    )
    for (const cartItem of command.cart) {
      if (
        state[cartItem.productId].lastValidOldPrice !== cartItem.displayedPrice &&
        !state[cartItem.productId].validNewPrices.includes(cartItem.displayedPrice)
      ) {
        throw new Error(`invalid price for product "${cartItem.productId}"`)
      }
    }
    appendEvent(
      {
        type: "ProductsOrdered",
        data: {
          items: command.cart.map((item) => ({
            productId: item.productId,
            price: item.displayedPrice,
          })),
        },
      },
      appendCondition
    )
  },
}

// test cases:

test([
  {
    description: "Order product with a displayed price that was never valid",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
          metadata: { minutesAgo: 20 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProducts",
        data: { cart: [{ productId: "p1", displayedPrice: 100 }] },
      },
    },
    then: {
      expectedError: 'invalid price for product "p1"',
    },
  },
  {
    description: "Order product with a price that was changed more than 10 minutes ago",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
          metadata: { minutesAgo: 20 },
        },
        {
          type: "ProductPriceChanged",
          data: { productId: "p1", newPrice: 134 },
          metadata: { minutesAgo: 20 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProducts",
        data: { cart: [{ productId: "p1", displayedPrice: 123 }] },
      },
    },
    then: {
      expectedError: 'invalid price for product "p1"',
    },
  },
  {
    description: "Order product with initial valid price",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
          metadata: { minutesAgo: 20 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProducts",
        data: { cart: [{ productId: "p1", displayedPrice: 123 }] },
      },
    },
    then: {
      expectedEvent: {
        type: "ProductsOrdered",
        data: { items: [{ productId: "p1", price: 123 }] },
      },
    },
  },
  {
    description: "Order product with a price that was changed less than 10 minutes ago",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
          metadata: { minutesAgo: 20 },
        },
        {
          type: "ProductPriceChanged",
          data: { productId: "p1", newPrice: 134 },
          metadata: { minutesAgo: 9 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProducts",
        data: { cart: [{ productId: "p1", displayedPrice: 123 }] },
      },
    },
    then: {
      expectedEvent: {
        type: "ProductsOrdered",
        data: { items: [{ productId: "p1", price: 123 }] },
      },
    },
  },
  {
    description: "Order multiple products with valid prices",
    given: {
      events: [
        {
          type: "ProductDefined",
          data: { productId: "p1", price: 123 },
          metadata: { minutesAgo: 20 },
        },
        {
          type: "ProductPriceChanged",
          data: { productId: "p1", newPrice: 134 },
          metadata: { minutesAgo: 9 },
        },
        {
          type: "ProductDefined",
          data: { productId: "p2", price: 321 },
          metadata: { minutesAgo: 8 },
        },
      ],
    },
    when: {
      command: {
        type: "orderProducts",
        data: {
          cart: [
            { productId: "p1", displayedPrice: 123 },
            { productId: "p2", displayedPrice: 321 },
          ],
        },
      },
    },
    then: {
      expectedEvent: {
        type: "ProductsOrdered",
        data: {
          items: [
            { productId: "p1", price: 123 },
            { productId: "p2", price: 321 },
          ],
        },
      },
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

## Conclusion

This example demonstrates the possibility to enforce consistency for a very dynamic set of entities