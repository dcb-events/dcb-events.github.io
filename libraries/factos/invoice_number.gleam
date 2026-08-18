//// Create a monotonic, gapless invoice-number sequence with Dynamic
//// Consistency Boundaries.
////
//// This implements the example at
//// https://dcb.events/examples/invoice-number/ using Factos and PostgreSQL.

import factos
import factos/factos_pog
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/result
import pog

pub type InvoiceData {
  InvoiceData(reference: String)
}

pub type Event {
  InvoiceCreated(invoice_number: Int, invoice_data: InvoiceData)
}

pub type Command {
  CreateInvoice(invoice_id: String, invoice_data: InvoiceData)
}

type State {
  CreatingInvoice(next_invoice_number: Int)
}

fn initial(command: Command) -> State {
  case command {
    CreateInvoice(invoice_id: _, invoice_data: _) ->
      CreatingInvoice(next_invoice_number: 1)
  }
}

fn decide(state: State, command: Command) -> Result(List(Event), Nil) {
  case state, command {
    CreatingInvoice(next_invoice_number:),
      CreateInvoice(invoice_id: _, invoice_data:)
    -> Ok([InvoiceCreated(invoice_number: next_invoice_number, invoice_data:)])
  }
}

fn evolve(state: State, event: Event) -> State {
  case state, event {
    CreatingInvoice(next_invoice_number: _),
      InvoiceCreated(invoice_number:, invoice_data: _)
    -> CreatingInvoice(next_invoice_number: invoice_number + 1)
  }
}

pub fn codec() -> factos.EventCodec(Event, String) {
  factos.codec(encode: encode_event, decode: decode_event)
}

fn encode_event(event: Event) -> factos.Event(String) {
  let InvoiceCreated(invoice_number:, invoice_data:) = event
  let InvoiceData(reference:) = invoice_data
  let data =
    json.object([
      #("invoice_number", json.int(invoice_number)),
      #("invoice_data", json.object([#("reference", json.string(reference))])),
    ])
    |> json.to_string

  factos.new_event(
    type_: factos.event_type("InvoiceCreated"),
    version: 1,
    data:,
  )
  |> factos.with_tags(tags: [
    factos.tag("invoice:" <> int.to_string(invoice_number)),
  ])
}

fn decode_event(
  stored: factos.Recorded(String),
) -> Result(Event, factos.DecodeError) {
  case
    factos.event_type_name(stored.descriptor.type_),
    stored.descriptor.version
  {
    "InvoiceCreated", 1 ->
      json.parse(stored.event, using: event_decoder())
      |> result.map_error(fn(_) { factos.InvalidData })
    _, _ -> Error(factos.UnknownEvent)
  }
}

fn event_decoder() -> decode.Decoder(Event) {
  use invoice_number <- decode.field("invoice_number", decode.int)
  use invoice_data <- decode.field("invoice_data", invoice_data_decoder())
  decode.success(InvoiceCreated(invoice_number:, invoice_data:))
}

fn invoice_data_decoder() -> decode.Decoder(InvoiceData) {
  use reference <- decode.field("reference", decode.string)
  decode.success(InvoiceData(reference:))
}

pub fn dispatch(
  connection: pog.Connection,
  command: Command,
  event_id: fn() -> String,
) -> Result(factos.Dispatch(Event), factos.Error(Nil, Nil, pog.QueryError)) {
  factos.new_dispatch(
    connection:,
    decider: factos.decider(initial: initial(command), decide:, evolve:),
    codec: codec(),
    decision_context: decision_context(command),
  )
  |> factos_pog.dispatch(command, event_id:)
}

fn decision_context(_command: Command) -> factos.DecisionContext {
  factos.Matching(items: [
    factos.item(types: [factos.event_type("InvoiceCreated")], tags: []),
  ])
}
