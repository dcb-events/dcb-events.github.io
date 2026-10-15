---
icon: material/star-half-full
---

# Product reviews example

Many constraints are not about a single entity, but about the _relation_ between two of them: a customer may review a product once, a member may vote once per poll, an employee may be assigned to a project once.
With DCB, such a relation needs no entity, Aggregate or lookup table of its own, because a Query can combine Tags.

## Challenge

The goal is an application that allows customers to review products, with the following hard constraints:

- A customer can review a product only once
- Only customers who bought the product can review it ("verified purchases")
- A product that was delisted can no longer be reviewed

## Traditional approaches

The review belongs to a product _and_ a customer, and whether the customer bought the product is recorded in yet another place, the order.

- **Product Aggregate:** Record reviews in the product's Event stream and check for previous reviews of the customer there

    > :material-forward: Every review of a popular product competes for the same stream, and the product has to find out about the customer's orders somehow

- **Review Aggregate:** Create an Aggregate per product and customer, e.g. with an identifier like `review-p1-c1`

    > :material-forward: This handles the first constraint, but the order and the product's state still live in other streams, so the other two constraints have to be checked against a <dfn title="Representation of data tailored for specific read operations, often denormalized for performance">Read Model</dfn>

- **Eventual consistency:** Check the constraints against a Read Model and remove invalid reviews after the fact

    > :material-forward: This is of course a potential solution, with or without DCB, but it falls outside the scope of these examples

## DCB approach

The `ProductReviewed` Event is tagged with the product _and_ the customer. A projection that declares both Tags only sees Events that carry both of them, so its Query matches the reviews of this customer for this product, and nothing else.

### Feature 1: One review per customer and product

```dcb id="product_reviews_01"
model "Product reviews"

tag type ProductId = string
tag type CustomerId = string
type Rating = integer { minimum: 1, maximum: 5 }

event ProductReviewed { tag productId: ProductId, tag customerId: CustomerId, rating: Rating }

projection ProductReviewedByCustomer (tag productId: ProductId, tag customerId: CustomerId): boolean = false {
  on ProductReviewed => set true
}

command ReviewProduct(productId: ProductId, customerId: CustomerId, rating: Rating) {
  require ProductReviewedByCustomer(productId, customerId) is false
    else reject "Customer already reviewed this product"

  emit ProductReviewed { productId, customerId, rating }

  scenarios {
    scenario "Review a product twice" {
      given ProductReviewed { productId: "p1", customerId: "c1", rating: 4 }
      when ReviewProduct { productId: "p1", customerId: "c1", rating: 5 }
      then rejected "Customer already reviewed this product"
    }

    scenario "Review a product another customer has reviewed" {
      given ProductReviewed { productId: "p1", customerId: "c2", rating: 4 }
      when ReviewProduct { productId: "p1", customerId: "c1", rating: 5 }
      then ProductReviewed { productId: "p1", customerId: "c1", rating: 5 }
    }

    scenario "Review another product" {
      given ProductReviewed { productId: "p2", customerId: "c1", rating: 4 }
      when ReviewProduct { productId: "p1", customerId: "c1", rating: 5 }
      then ProductReviewed { productId: "p1", customerId: "c1", rating: 5 }
    }
  }
}
```

The "Consistency boundary" tab shows a single Query Item with the Tags `ProductId:p1` _and_ `CustomerId:c1`. The Tags of a Query Item are combined with AND, so other customers reviewing the same product, or the same customer reviewing other products, do not affect the decision and can be appended in parallel.

### Feature 2: Verified purchases only

This example extends the previous one, so that only customers who ordered the product can review it.

An order contains several products. The `OrderPlaced` Event is tagged with the customer and, with `tag each`, with every product it contains. The `ProductBoughtByCustomer` projection reads it by both Tags, exactly like the reviews:

```dcb id="product_reviews_02" extends="product_reviews_01"
record OrderLine { productId: ProductId, quantity: integer }

event OrderPlaced { tag customerId: CustomerId, lines: OrderLine[] tag each productId }

projection ProductBoughtByCustomer (tag productId: ProductId, tag customerId: CustomerId): boolean = false {
  on OrderPlaced => set true
}

command ReviewProduct(productId: ProductId, customerId: CustomerId, rating: Rating) {
  require ProductBoughtByCustomer(productId, customerId) is true
    else reject "Only customers who bought the product can review it"
  require ProductReviewedByCustomer(productId, customerId) is false
    else reject "Customer already reviewed this product"

  emit ProductReviewed { productId, customerId, rating }

  scenarios {
    scenario "Review a product twice" {
      given OrderPlaced { customerId: "c1", lines: [{ productId: "p1", quantity: 1 }] }
      and ProductReviewed { productId: "p1", customerId: "c1", rating: 4 }
      when ReviewProduct { productId: "p1", customerId: "c1", rating: 5 }
      then rejected "Customer already reviewed this product"
    }

    scenario "Review a product another customer has reviewed" {
      given OrderPlaced { customerId: "c1", lines: [{ productId: "p1", quantity: 1 }] }
      and ProductReviewed { productId: "p1", customerId: "c2", rating: 4 }
      when ReviewProduct { productId: "p1", customerId: "c1", rating: 5 }
      then ProductReviewed { productId: "p1", customerId: "c1", rating: 5 }
    }

    scenario "Review another product" {
      given OrderPlaced { customerId: "c1", lines: [{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 2 }] }
      and ProductReviewed { productId: "p2", customerId: "c1", rating: 4 }
      when ReviewProduct { productId: "p1", customerId: "c1", rating: 5 }
      then ProductReviewed { productId: "p1", customerId: "c1", rating: 5 }
    }

    scenario "Review a product that was not bought" {
      when ReviewProduct { productId: "p1", customerId: "c1", rating: 5 }
      then rejected "Only customers who bought the product can review it"
    }

    scenario "Review a product only another customer bought" {
      given OrderPlaced { customerId: "c2", lines: [{ productId: "p1", quantity: 1 }] }
      when ReviewProduct { productId: "p1", customerId: "c1", rating: 5 }
      then rejected "Only customers who bought the product can review it"
    }

    scenario "Review a product the customer bought with other products" {
      given OrderPlaced { customerId: "c1", lines: [{ productId: "p2", quantity: 1 }, { productId: "p1", quantity: 3 }] }
      when ReviewProduct { productId: "p1", customerId: "c1", rating: 5 }
      then ProductReviewed { productId: "p1", customerId: "c1", rating: 5 }
    }
  }
}
```

!!! note

    The order does not need to know anything about reviews, and there is no "purchase" entity to keep in sync: the Event that records the order is all the review needs.

### Feature 3: Delisted products

This example extends the previous one, so that a product that was delisted can no longer be reviewed.

`ProductListed` is a projection with only one Tag, `ProductId`. The command now reads projections with different Tags, and the consistency boundary is the combination of both: Query Items for the orders and reviews of this customer and product, and one for the delisting of the product. A review is rejected if the product is delisted in the meantime, while reviews of other customers still don't affect it.

```dcb id="product_reviews_03" extends="product_reviews_02"
event ProductDelisted { tag productId: ProductId }

projection ProductListed (tag productId: ProductId): boolean = true {
  on ProductDelisted => set false
}

command ReviewProduct(productId: ProductId, customerId: CustomerId, rating: Rating) {
  require ProductListed(productId) is true
    else reject "Product was delisted"
  require ProductBoughtByCustomer(productId, customerId) is true
    else reject "Only customers who bought the product can review it"
  require ProductReviewedByCustomer(productId, customerId) is false
    else reject "Customer already reviewed this product"

  emit ProductReviewed { productId, customerId, rating }

  scenarios {
    scenario "Review a delisted product" {
      given OrderPlaced { customerId: "c1", lines: [{ productId: "p1", quantity: 1 }] }
      and ProductDelisted { productId: "p1" }
      when ReviewProduct { productId: "p1", customerId: "c1", rating: 5 }
      then rejected "Product was delisted"
    }
  }
}

command DelistProduct(productId: ProductId) {
  require ProductListed(productId) is true
    else reject "Product was delisted"

  emit ProductDelisted { productId }

  scenarios {
    scenario "Delist a product twice" {
      given ProductDelisted { productId: "p1" }
      when DelistProduct { productId: "p1" }
      then rejected "Product was delisted"
    }

    scenario "Delist a product that was reviewed" {
      given ProductReviewed { productId: "p1", customerId: "c1", rating: 4 }
      when DelistProduct { productId: "p1" }
      then ProductDelisted { productId: "p1" }
    }
  }
}
```

## Conclusion

This example demonstrates how DCB enforces constraints on the relation between two entities without modelling the relation as an entity of its own: Tags of different types combine to a Query that is as narrow as the constraint. The same pattern applies to votes per poll, assignments per project, or any other "once per A and B" rule.
