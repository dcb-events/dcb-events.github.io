//// Prevent record duplication with Dynamic Consistency Boundaries.
////
//// This implements the DCB example at
//// https://dcb.events/examples/prevent-record-duplication/ using Factos and
//// PostgreSQL.

import factos
import factos/factos_pog
import gleam/dynamic/decode
import gleam/json
import gleam/result
import pog

pub type Command {
  PlaceOrder(order_id: String, idempotency_token: String)
}

pub type Event {
  OrderPlaced(order_id: String, idempotency_token: String)
}

type State {
  TokenUnused
  TokenUsed
}

pub type Error {
  Resubmission
}

fn initial(command: Command) -> State {
  case command {
    PlaceOrder(order_id: _, idempotency_token: _) -> TokenUnused
  }
}

fn decide(state: State, command: Command) -> Result(List(Event), Error) {
  case state, command {
    TokenUnused, PlaceOrder(order_id:, idempotency_token:) ->
      Ok([OrderPlaced(order_id:, idempotency_token:)])
    TokenUsed, PlaceOrder(order_id: _, idempotency_token: _) ->
      Error(Resubmission)
  }
}

fn evolve(state: State, event: Event) -> State {
  case state, event {
    TokenUnused, OrderPlaced(order_id: _, idempotency_token: _)
    | TokenUsed, OrderPlaced(order_id: _, idempotency_token: _)
    -> TokenUsed
  }
}

pub fn codec() -> factos.EventCodec(Event, String) {
  factos.codec(encode: encode_event, decode: decode_event)
}

fn encode_event(event: Event) -> factos.Event(String) {
  let OrderPlaced(order_id:, idempotency_token:) = event
  let data =
    json.object([
      #("order_id", json.string(order_id)),
      #("idempotency_token", json.string(idempotency_token)),
    ])
    |> json.to_string

  factos.new_event(type_: factos.event_type("OrderPlaced"), version: 1, data:)
  |> factos.with_tags(tags: [
    factos.tag("order:" <> order_id),
    factos.tag("idempotency:" <> idempotency_token),
  ])
}

fn decode_event(
  stored: factos.Recorded(String),
) -> Result(Event, factos.DecodeError) {
  case
    factos.event_type_name(stored.descriptor.type_),
    stored.descriptor.version
  {
    "OrderPlaced", 1 ->
      json.parse(stored.event, using: event_decoder())
      |> result.map_error(fn(_) { factos.InvalidData })
    _, _ -> Error(factos.UnknownEvent)
  }
}

fn event_decoder() -> decode.Decoder(Event) {
  use order_id <- decode.field("order_id", decode.string)
  use idempotency_token <- decode.field("idempotency_token", decode.string)
  decode.success(OrderPlaced(order_id:, idempotency_token:))
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
  let PlaceOrder(order_id: _, idempotency_token:) = command
  factos.Matching([
    factos.item(types: [factos.event_type("OrderPlaced")], tags: [
      factos.tag("idempotency:" <> idempotency_token),
    ]),
  ])
}
