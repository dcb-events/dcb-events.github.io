//// Validate a shopping cart's displayed prices with Dynamic Consistency
//// Boundaries.
////
//// This implements the example at
//// https://dcb.events/examples/dynamic-product-price/ using Factos and
//// PostgreSQL. The source's relative `minutesAgo` metadata is represented by
//// absolute recorded and current minutes, keeping retrying decisions pure.

import factos
import factos/factos_pog
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/result
import pog

const price_grace_period_minutes = 10

const recorded_minute_key = "recorded_minute"

pub type OrderItem {
  OrderItem(product_id: String, displayed_price: Int)
}

pub type OrderedItem {
  OrderedItem(product_id: String, price: Int)
}

pub type Event {
  ProductDefined(product_id: String, price: Int, recorded_minute: Int)
  ProductPriceChanged(product_id: String, new_price: Int, recorded_minute: Int)
  ProductsOrdered(items: List(OrderedItem))
}

pub type Command {
  DefineProduct(product_id: String, price: Int, recorded_minute: Int)
  ChangeProductPrice(product_id: String, new_price: Int, recorded_minute: Int)
  OrderProducts(order_id: String, items: List(OrderItem), current_minute: Int)
}

pub type Error {
  InvalidPrice(product_id: String)
}

type StablePrice {
  NoStablePrice
  StablePrice(price: Int)
}

type ProductPrice {
  ProductPrice(
    product_id: String,
    stable_price: StablePrice,
    recent_prices: List(Int),
  )
}

type State {
  RecordingPriceFact
  OrderingProducts(current_minute: Int, products: List(ProductPrice))
}

type PriceAge {
  WithinGracePeriod
  OutsideGracePeriod
}

fn initial(command: Command) -> State {
  case command {
    DefineProduct(product_id: _, price: _, recorded_minute: _)
    | ChangeProductPrice(product_id: _, new_price: _, recorded_minute: _) ->
      RecordingPriceFact
    OrderProducts(order_id: _, items:, current_minute:) ->
      OrderingProducts(
        current_minute:,
        products: list.map(items, fn(item) {
          let OrderItem(product_id:, displayed_price: _) = item
          ProductPrice(
            product_id:,
            stable_price: NoStablePrice,
            recent_prices: [],
          )
        }),
      )
  }
}

fn decide(state: State, command: Command) -> Result(List(Event), Error) {
  case state, command {
    RecordingPriceFact, DefineProduct(product_id:, price:, recorded_minute:) ->
      Ok([ProductDefined(product_id:, price:, recorded_minute:)])
    RecordingPriceFact,
      ChangeProductPrice(product_id:, new_price:, recorded_minute:)
    -> Ok([ProductPriceChanged(product_id:, new_price:, recorded_minute:)])
    OrderingProducts(current_minute: _, products:),
      OrderProducts(order_id: _, items:, current_minute: _)
    -> {
      use _ <- result.try(validate_prices(items, products))
      Ok([ProductsOrdered(items: list.map(items, ordered_item))])
    }
    _, _ -> panic as "Command executed for wrong state"
  }
}

fn ordered_item(item: OrderItem) -> OrderedItem {
  let OrderItem(product_id:, displayed_price:) = item
  OrderedItem(product_id:, price: displayed_price)
}

fn validate_prices(
  items: List(OrderItem),
  prices: List(ProductPrice),
) -> Result(Nil, Error) {
  case items {
    [] -> Ok(Nil)
    [OrderItem(product_id:, displayed_price:), ..remaining] -> {
      use price <- result.try(
        list.find(prices, fn(price) {
          let ProductPrice(product_id: price_product_id, ..) = price
          price_product_id == product_id
        })
        |> result.map_error(fn(_) { InvalidPrice(product_id:) }),
      )
      let ProductPrice(stable_price:, recent_prices:, ..) = price
      case
        matches_stable_price(stable_price, displayed_price)
        || list.contains(recent_prices, displayed_price)
      {
        True -> validate_prices(remaining, prices)
        False -> Error(InvalidPrice(product_id:))
      }
    }
  }
}

fn matches_stable_price(
  stable_price: StablePrice,
  displayed_price: Int,
) -> Bool {
  case stable_price {
    NoStablePrice -> False
    StablePrice(price:) -> price == displayed_price
  }
}

fn evolve(state: State, event: Event) -> State {
  case state, event {
    RecordingPriceFact,
      ProductDefined(product_id: _, price: _, recorded_minute: _)
    | RecordingPriceFact,
      ProductPriceChanged(product_id: _, new_price: _, recorded_minute: _)
    | RecordingPriceFact, ProductsOrdered(items: _)
    -> RecordingPriceFact
    OrderingProducts(current_minute:, products:),
      ProductDefined(product_id:, price:, recorded_minute:)
    ->
      OrderingProducts(
        ..state,
        products: list.map(products, fn(product) {
          update_defined_price(
            product,
            product_id,
            price,
            classify_age(current_minute, recorded_minute),
          )
        }),
      )
    OrderingProducts(current_minute:, products:),
      ProductPriceChanged(product_id:, new_price:, recorded_minute:)
    ->
      OrderingProducts(
        ..state,
        products: list.map(products, fn(product) {
          update_changed_price(
            product,
            product_id,
            new_price,
            classify_age(current_minute, recorded_minute),
          )
        }),
      )
    OrderingProducts(current_minute: _, products: _), ProductsOrdered(items: _)
    -> state
  }
}

fn update_defined_price(
  product: ProductPrice,
  product_id: String,
  price: Int,
  age: PriceAge,
) -> ProductPrice {
  let ProductPrice(product_id: target_product_id, ..) = product
  case target_product_id == product_id, age {
    False, _ -> product
    True, WithinGracePeriod ->
      ProductPrice(..product, stable_price: NoStablePrice, recent_prices: [
        price,
      ])
    True, OutsideGracePeriod ->
      ProductPrice(
        ..product,
        stable_price: StablePrice(price:),
        recent_prices: [],
      )
  }
}

fn update_changed_price(
  product: ProductPrice,
  product_id: String,
  new_price: Int,
  age: PriceAge,
) -> ProductPrice {
  let ProductPrice(product_id: target_product_id, recent_prices:, ..) = product
  case target_product_id == product_id, age {
    False, _ -> product
    True, WithinGracePeriod ->
      ProductPrice(
        ..product,
        recent_prices: list.append(recent_prices, [new_price]),
      )
    True, OutsideGracePeriod ->
      ProductPrice(..product, stable_price: StablePrice(price: new_price))
  }
}

fn classify_age(current_minute: Int, recorded_minute: Int) -> PriceAge {
  case current_minute - recorded_minute <= price_grace_period_minutes {
    True -> WithinGracePeriod
    False -> OutsideGracePeriod
  }
}

pub fn codec() -> factos.EventCodec(Event, String) {
  factos.codec(encode: encode_event, decode: decode_event)
}

fn encode_event(event: Event) -> factos.Event(String) {
  case event {
    ProductDefined(product_id:, price:, recorded_minute:) ->
      proposed_event(
        type_: "ProductDefined",
        data: json.object([
          #("product_id", json.string(product_id)),
          #("price", json.int(price)),
        ]),
        tags: [factos.tag("product:" <> product_id)],
      )
      |> with_recorded_minute(recorded_minute)
    ProductPriceChanged(product_id:, new_price:, recorded_minute:) ->
      proposed_event(
        type_: "ProductPriceChanged",
        data: json.object([
          #("product_id", json.string(product_id)),
          #("new_price", json.int(new_price)),
        ]),
        tags: [factos.tag("product:" <> product_id)],
      )
      |> with_recorded_minute(recorded_minute)
    ProductsOrdered(items:) ->
      proposed_event(
        type_: "ProductsOrdered",
        data: json.object([
          #("items", json.array(from: items, of: encode_ordered_item)),
        ]),
        tags: list.map(items, fn(item) {
          let OrderedItem(product_id:, price: _) = item
          factos.tag("product:" <> product_id)
        }),
      )
  }
}

fn encode_ordered_item(item: OrderedItem) -> json.Json {
  let OrderedItem(product_id:, price:) = item
  json.object([
    #("product_id", json.string(product_id)),
    #("price", json.int(price)),
  ])
}

fn proposed_event(
  type_ type_name: String,
  data data: json.Json,
  tags tags: List(factos.Tag),
) -> factos.Event(String) {
  factos.new_event(
    type_: factos.event_type(type_name),
    version: 1,
    data: json.to_string(data),
  )
  |> factos.with_tags(tags:)
}

fn with_recorded_minute(
  proposed: factos.Event(String),
  recorded_minute: Int,
) -> factos.Event(String) {
  factos.with_metadata(
    proposed,
    metadata: factos.metadata([
      #(recorded_minute_key, int.to_string(recorded_minute)),
    ]),
  )
}

fn decode_event(
  stored: factos.Recorded(String),
) -> Result(Event, factos.DecodeError) {
  case
    factos.event_type_name(stored.descriptor.type_),
    stored.descriptor.version
  {
    "ProductDefined", 1 -> {
      use recorded_minute <- result.try(decode_recorded_minute(
        stored.descriptor.metadata,
      ))
      json.parse(
        stored.event,
        using: product_defined_decoder()
          |> decode.map(fn(data) {
            ProductDefined(product_id: data.0, price: data.1, recorded_minute:)
          }),
      )
      |> result.map_error(fn(_) { factos.InvalidData })
    }
    "ProductPriceChanged", 1 -> {
      use recorded_minute <- result.try(decode_recorded_minute(
        stored.descriptor.metadata,
      ))
      json.parse(
        stored.event,
        using: product_price_changed_decoder()
          |> decode.map(fn(data) {
            ProductPriceChanged(
              product_id: data.0,
              new_price: data.1,
              recorded_minute:,
            )
          }),
      )
      |> result.map_error(fn(_) { factos.InvalidData })
    }
    "ProductsOrdered", 1 ->
      json.parse(
        stored.event,
        using: ordered_items_decoder() |> decode.map(ProductsOrdered),
      )
      |> result.map_error(fn(_) { factos.InvalidData })
    _, _ -> Error(factos.UnknownEvent)
  }
}

fn decode_recorded_minute(
  metadata: factos.Metadata,
) -> Result(Int, factos.DecodeError) {
  use value <- result.try(
    factos.metadata_get(metadata, recorded_minute_key)
    |> result.replace_error(factos.InvalidData),
  )
  int.parse(value) |> result.replace_error(factos.InvalidData)
}

fn product_defined_decoder() -> decode.Decoder(#(String, Int)) {
  use product_id <- decode.field("product_id", decode.string)
  use price <- decode.field("price", decode.int)
  decode.success(#(product_id, price))
}

fn product_price_changed_decoder() -> decode.Decoder(#(String, Int)) {
  use product_id <- decode.field("product_id", decode.string)
  use new_price <- decode.field("new_price", decode.int)
  decode.success(#(product_id, new_price))
}

fn ordered_items_decoder() -> decode.Decoder(List(OrderedItem)) {
  use items <- decode.field("items", decode.list(ordered_item_decoder()))
  decode.success(items)
}

fn ordered_item_decoder() -> decode.Decoder(OrderedItem) {
  use product_id <- decode.field("product_id", decode.string)
  use price <- decode.field("price", decode.int)
  decode.success(OrderedItem(product_id:, price:))
}

pub fn dispatch(
  connection: pog.Connection,
  command: Command,
  event_id: fn() -> String,
) -> Result(factos.Dispatch(Event), factos.Error(Error, Nil, pog.QueryError)) {
  factos.new_dispatch(
    connection:,
    decider: factos.decider(initial: initial(command), decide:, evolve:),
    decision_context: decision_context(command),
    codec: codec(),
  )
  |> factos_pog.dispatch(command, event_id:)
}

fn decision_context(command: Command) -> factos.DecisionContext {
  case command {
    DefineProduct(product_id:, price: _, recorded_minute: _)
    | ChangeProductPrice(product_id:, new_price: _, recorded_minute: _) ->
      factos.Matching([
        factos.item(
          types: [
            factos.event_type("ProductDefined"),
            factos.event_type("ProductPriceChanged"),
          ],
          tags: [factos.tag("product:" <> product_id)],
        ),
      ])
    OrderProducts(order_id: _, items:, current_minute: _) ->
      items
      |> list.map(fn(item) {
        let OrderItem(product_id:, displayed_price: _) = item
        factos.item(
          types: [
            factos.event_type("ProductDefined"),
            factos.event_type("ProductPriceChanged"),
          ],
          tags: [factos.tag("product:" <> product_id)],
        )
      })
      |> factos.Matching
  }
}
