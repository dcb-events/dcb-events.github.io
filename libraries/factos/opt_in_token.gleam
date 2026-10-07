//// Confirm expiring one-time sign-up tokens with Dynamic Consistency
//// Boundaries.
////
//// This implements the example at
//// https://dcb.events/examples/opt-in-token/ using Factos and PostgreSQL.
//// The source's relative `minutesAgo` metadata is represented by an absolute
//// `initiated_minute`, keeping retrying decisions deterministic.

import factos
import factos/factos_pog
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/result
import pog

const otp_validity_minutes = 60

const initiated_minute_key = "initiated_minute"

pub type Event {
  SignUpInitiated(
    email_address: String,
    otp: String,
    name: String,
    initiated_minute: Int,
  )
  SignUpConfirmed(email_address: String, otp: String, name: String)
}

pub type Command {
  InitiateSignUp(
    sign_up_id: String,
    email_address: String,
    otp: String,
    name: String,
    initiated_minute: Int,
  )
  ConfirmSignUp(
    confirmation_id: String,
    email_address: String,
    otp: String,
    current_minute: Int,
  )
}

pub type Error {
  NoPendingSignUp
  OtpAlreadyUsed
  OtpExpired
}

type OtpStatus {
  OtpUnused
  OtpUsed
}

type ConfirmationState {
  NoPending
  PendingSignUp(name: String, initiated_minute: Int, status: OtpStatus)
}

type State {
  InitiatingSignUp
  ConfirmingSignUp(confirmation: ConfirmationState)
}

fn initial(command: Command) -> State {
  case command {
    InitiateSignUp(
      sign_up_id: _,
      email_address: _,
      otp: _,
      name: _,
      initiated_minute: _,
    ) -> InitiatingSignUp
    ConfirmSignUp(
      confirmation_id: _,
      email_address: _,
      otp: _,
      current_minute: _,
    ) -> ConfirmingSignUp(confirmation: NoPending)
  }
}

fn decide(state: State, command: Command) -> Result(List(Event), Error) {
  case state, command {
    InitiatingSignUp,
      InitiateSignUp(
        sign_up_id: _,
        email_address:,
        otp:,
        name:,
        initiated_minute:,
      )
    -> Ok([SignUpInitiated(email_address:, otp:, name:, initiated_minute:)])
    ConfirmingSignUp(confirmation: NoPending),
      ConfirmSignUp(
        confirmation_id: _,
        email_address: _,
        otp: _,
        current_minute: _,
      )
    -> Error(NoPendingSignUp)
    ConfirmingSignUp(confirmation: PendingSignUp(
      name: _,
      initiated_minute: _,
      status: OtpUsed,
    )),
      ConfirmSignUp(
        confirmation_id: _,
        email_address: _,
        otp: _,
        current_minute: _,
      )
    -> Error(OtpAlreadyUsed)
    ConfirmingSignUp(confirmation: PendingSignUp(
      name: _,
      initiated_minute:,
      status: OtpUnused,
    )),
      ConfirmSignUp(
        confirmation_id: _,
        email_address: _,
        otp: _,
        current_minute:,
      )
      if current_minute - initiated_minute > otp_validity_minutes
    -> Error(OtpExpired)
    ConfirmingSignUp(confirmation: PendingSignUp(
      name:,
      initiated_minute: _,
      status: OtpUnused,
    )),
      ConfirmSignUp(confirmation_id: _, email_address:, otp:, current_minute: _)
    -> Ok([SignUpConfirmed(email_address:, otp:, name:)])
    _, _ -> panic as "Command executed for wrong state"
  }
}

fn evolve(state: State, event: Event) -> State {
  case state, event {
    InitiatingSignUp,
      SignUpInitiated(email_address: _, otp: _, name: _, initiated_minute: _)
    | InitiatingSignUp, SignUpConfirmed(email_address: _, otp: _, name: _)
    -> InitiatingSignUp
    ConfirmingSignUp(confirmation: _),
      SignUpInitiated(email_address: _, otp: _, name:, initiated_minute:)
    ->
      ConfirmingSignUp(confirmation: PendingSignUp(
        name:,
        initiated_minute:,
        status: OtpUnused,
      ))
    ConfirmingSignUp(confirmation: NoPending),
      SignUpConfirmed(email_address: _, otp: _, name: _)
    -> ConfirmingSignUp(confirmation: NoPending)
    ConfirmingSignUp(confirmation: PendingSignUp(
      name:,
      initiated_minute:,
      status: _,
    )),
      SignUpConfirmed(email_address: _, otp: _, name: _)
    ->
      ConfirmingSignUp(confirmation: PendingSignUp(
        name:,
        initiated_minute:,
        status: OtpUsed,
      ))
  }
}

pub fn codec() -> factos.EventCodec(Event, String) {
  factos.codec(encode: encode_event, decode: decode_event)
}

fn encode_event(event: Event) -> factos.Event(String) {
  case event {
    SignUpInitiated(email_address:, otp:, name:, initiated_minute:) ->
      proposed_event(
        type_: "SignUpInitiated",
        data: sign_up_data(email_address, otp, name),
        tags: sign_up_tags(email_address, otp),
      )
      |> factos.with_metadata(
        metadata: factos.metadata([
          #(initiated_minute_key, int.to_string(initiated_minute)),
        ]),
      )
    SignUpConfirmed(email_address:, otp:, name:) ->
      proposed_event(
        type_: "SignUpConfirmed",
        data: sign_up_data(email_address, otp, name),
        tags: sign_up_tags(email_address, otp),
      )
  }
}

fn sign_up_data(email_address: String, otp: String, name: String) -> json.Json {
  json.object([
    #("email_address", json.string(email_address)),
    #("otp", json.string(otp)),
    #("name", json.string(name)),
  ])
}

fn sign_up_tags(email_address: String, otp: String) -> List(factos.Tag) {
  [
    factos.tag("email:" <> email_address),
    factos.tag("otp:" <> otp),
  ]
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

fn decode_event(
  stored: factos.Recorded(String),
) -> Result(Event, factos.DecodeError) {
  case
    factos.event_type_name(stored.descriptor.type_),
    stored.descriptor.version
  {
    "SignUpInitiated", 1 -> {
      use initiated_minute <- result.try(decode_initiated_minute(
        stored.descriptor.metadata,
      ))
      json.parse(
        stored.event,
        using: sign_up_decoder()
          |> decode.map(fn(data) {
            SignUpInitiated(
              email_address: data.0,
              otp: data.1,
              name: data.2,
              initiated_minute:,
            )
          }),
      )
      |> result.map_error(fn(_) { factos.InvalidData })
    }
    "SignUpConfirmed", 1 ->
      json.parse(
        stored.event,
        using: sign_up_decoder()
          |> decode.map(fn(data) {
            SignUpConfirmed(email_address: data.0, otp: data.1, name: data.2)
          }),
      )
      |> result.map_error(fn(_) { factos.InvalidData })
    _, _ -> Error(factos.UnknownEvent)
  }
}

fn decode_initiated_minute(
  metadata: factos.Metadata,
) -> Result(Int, factos.DecodeError) {
  use value <- result.try(
    factos.metadata_get(metadata, initiated_minute_key)
    |> result.replace_error(factos.InvalidData),
  )
  int.parse(value) |> result.replace_error(factos.InvalidData)
}

fn sign_up_decoder() -> decode.Decoder(#(String, String, String)) {
  use email_address <- decode.field("email_address", decode.string)
  use otp <- decode.field("otp", decode.string)
  use name <- decode.field("name", decode.string)
  decode.success(#(email_address, otp, name))
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
  let #(email_address, otp) = case command {
    InitiateSignUp(
      sign_up_id: _,
      email_address:,
      otp:,
      name: _,
      initiated_minute: _,
    )
    | ConfirmSignUp(confirmation_id: _, email_address:, otp:, current_minute: _) -> #(
      email_address,
      otp,
    )
  }
  factos.Matching(items: [
    factos.item(
      types: [
        factos.event_type("SignUpInitiated"),
        factos.event_type("SignUpConfirmed"),
      ],
      tags: [
        factos.tag("email:" <> email_address),
        factos.tag("otp:" <> otp),
      ],
    ),
  ])
}
