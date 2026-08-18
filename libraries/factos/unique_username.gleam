//// Enforce globally unique usernames with Dynamic Consistency Boundaries.
////
//// This implements the example at
//// https://dcb.events/examples/unique-username/ using Factos and PostgreSQL.
//// The source's relative `daysAgo` metadata is represented by an absolute
//// `recorded_day`, keeping retrying decisions deterministic.

import factos
import factos/factos_pog
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/result
import pog

const username_retention_days = 3

const recorded_day_key = "recorded_day"

pub type Event {
  AccountRegistered(username: String)
  AccountClosed(username: String, recorded_day: Int)
  UsernameChanged(old_username: String, new_username: String, recorded_day: Int)
}

pub type Command {
  RegisterAccount(account_id: String, username: String, current_day: Int)
  RecordAccountClosed(account_id: String, username: String, recorded_day: Int)
  RecordUsernameChanged(
    account_id: String,
    old_username: String,
    new_username: String,
    recorded_day: Int,
  )
}

pub type Error {
  UsernameClaimed(username: String)
}

type ClaimState {
  Available
  Claimed
  RetainedUntil(day: Int)
}

type State {
  RegisteringAccount(username: String, claim: ClaimState)
  RecordingFact
}

fn initial(command: Command) -> State {
  case command {
    RegisterAccount(account_id: _, username:, current_day: _) ->
      RegisteringAccount(username:, claim: Available)
    RecordAccountClosed(account_id: _, username: _, recorded_day: _)
    | RecordUsernameChanged(
        account_id: _,
        old_username: _,
        new_username: _,
        recorded_day: _,
      ) -> RecordingFact
  }
}

fn decide(state: State, command: Command) -> Result(List(Event), Error) {
  case state, command {
    RegisteringAccount(username: _, claim: Available),
      RegisterAccount(account_id: _, username:, current_day: _)
    -> Ok([AccountRegistered(username:)])
    RegisteringAccount(username: _, claim: Claimed),
      RegisterAccount(account_id: _, username:, current_day: _)
    -> Error(UsernameClaimed(username:))
    RegisteringAccount(username: _, claim: RetainedUntil(day:)),
      RegisterAccount(account_id: _, username:, current_day:)
      if current_day <= day
    -> Error(UsernameClaimed(username:))
    RegisteringAccount(username: _, claim: RetainedUntil(day: _)),
      RegisterAccount(account_id: _, username:, current_day: _)
    -> Ok([AccountRegistered(username:)])
    RecordingFact, RecordAccountClosed(account_id: _, username:, recorded_day:)
    -> Ok([AccountClosed(username:, recorded_day:)])
    RecordingFact,
      RecordUsernameChanged(
        account_id: _,
        old_username:,
        new_username:,
        recorded_day:,
      )
    -> Ok([UsernameChanged(old_username:, new_username:, recorded_day:)])
    _, _ -> panic as "Command executed for wrong state"
  }
}

fn evolve(state: State, event: Event) -> State {
  case state, event {
    RegisteringAccount(username:, claim: _),
      AccountRegistered(username: event_username)
    ->
      case event_username == username {
        True -> RegisteringAccount(username:, claim: Claimed)
        False -> state
      }
    RegisteringAccount(username:, claim: _),
      AccountClosed(username: event_username, recorded_day:)
    ->
      case event_username == username {
        True ->
          RegisteringAccount(
            username:,
            claim: RetainedUntil(day: recorded_day + username_retention_days),
          )
        False -> state
      }
    RegisteringAccount(username:, claim:),
      UsernameChanged(old_username:, new_username:, recorded_day:)
    ->
      case new_username == username, old_username == username {
        True, _ -> RegisteringAccount(username:, claim: Claimed)
        False, True ->
          RegisteringAccount(
            username:,
            claim: RetainedUntil(day: recorded_day + username_retention_days),
          )
        False, False -> RegisteringAccount(username:, claim:)
      }
    RecordingFact, AccountRegistered(username: _)
    | RecordingFact, AccountClosed(username: _, recorded_day: _)
    | RecordingFact,
      UsernameChanged(old_username: _, new_username: _, recorded_day: _)
    -> RecordingFact
  }
}

pub fn codec() -> factos.EventCodec(Event, String) {
  factos.codec(encode: encode_event, decode: decode_event)
}

fn encode_event(event: Event) -> factos.Event(String) {
  case event {
    AccountRegistered(username:) ->
      proposed_event(
        type_: "AccountRegistered",
        data: json.object([#("username", json.string(username))]),
        tags: [factos.tag("username:" <> username)],
      )
    AccountClosed(username:, recorded_day:) ->
      proposed_event(
        type_: "AccountClosed",
        data: json.object([#("username", json.string(username))]),
        tags: [factos.tag("username:" <> username)],
      )
      |> factos.with_metadata(metadata: recorded_day_metadata(recorded_day))
    UsernameChanged(old_username:, new_username:, recorded_day:) ->
      proposed_event(
        type_: "UsernameChanged",
        data: json.object([
          #("old_username", json.string(old_username)),
          #("new_username", json.string(new_username)),
        ]),
        tags: [
          factos.tag("username:" <> old_username),
          factos.tag("username:" <> new_username),
        ],
      )
      |> factos.with_metadata(metadata: recorded_day_metadata(recorded_day))
  }
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

fn recorded_day_metadata(recorded_day: Int) -> factos.Metadata {
  factos.metadata([#(recorded_day_key, int.to_string(recorded_day))])
}

fn decode_event(
  stored: factos.Recorded(String),
) -> Result(Event, factos.DecodeError) {
  case
    factos.event_type_name(stored.descriptor.type_),
    stored.descriptor.version
  {
    "AccountRegistered", 1 ->
      json.parse(
        stored.event,
        using: username_decoder()
          |> decode.map(fn(username) { AccountRegistered(username:) }),
      )
      |> result.map_error(fn(_) { factos.InvalidData })
    "AccountClosed", 1 -> {
      use recorded_day <- result.try(decode_recorded_day(
        stored.descriptor.metadata,
      ))
      json.parse(
        stored.event,
        using: username_decoder()
          |> decode.map(fn(username) { AccountClosed(username:, recorded_day:) }),
      )
      |> result.map_error(fn(_) { factos.InvalidData })
    }
    "UsernameChanged", 1 -> {
      use recorded_day <- result.try(decode_recorded_day(
        stored.descriptor.metadata,
      ))
      json.parse(
        stored.event,
        using: changed_names_decoder()
          |> decode.map(fn(names) {
            UsernameChanged(
              old_username: names.0,
              new_username: names.1,
              recorded_day:,
            )
          }),
      )
      |> result.map_error(fn(_) { factos.InvalidData })
    }
    _, _ -> Error(factos.UnknownEvent)
  }
}

fn decode_recorded_day(
  metadata: factos.Metadata,
) -> Result(Int, factos.DecodeError) {
  use value <- result.try(
    factos.metadata_get(metadata, recorded_day_key)
    |> result.replace_error(factos.InvalidData),
  )
  int.parse(value) |> result.replace_error(factos.InvalidData)
}

fn username_decoder() -> decode.Decoder(String) {
  use username <- decode.field("username", decode.string)
  decode.success(username)
}

fn changed_names_decoder() -> decode.Decoder(#(String, String)) {
  use old_username <- decode.field("old_username", decode.string)
  use new_username <- decode.field("new_username", decode.string)
  decode.success(#(old_username, new_username))
}

pub fn dispatch(
  connection: pog.Connection,
  command: Command,
  event_id: fn() -> String,
) -> Result(factos.Dispatch(Event), factos.Error(Error, Nil, pog.QueryError)) {
  factos.new_dispatch(
    connection:,
    decider: factos.decider(initial: initial(command), decide:, evolve:),
    decision_context: query(command),
    codec: codec(),
  )
  |> factos_pog.dispatch(command, event_id:)
}

fn query(command: Command) -> factos.DecisionContext {
  case command {
    RegisterAccount(account_id: _, username:, current_day: _)
    | RecordAccountClosed(account_id: _, username:, recorded_day: _) ->
      factos.Matching(items: [
        factos.item(
          types: [
            factos.event_type("AccountRegistered"),
            factos.event_type("AccountClosed"),
            factos.event_type("UsernameChanged"),
          ],
          tags: [factos.tag("username:" <> username)],
        ),
      ])
    RecordUsernameChanged(
      account_id: _,
      old_username:,
      new_username:,
      recorded_day: _,
    ) ->
      factos.Matching(items: [
        factos.item(
          types: [
            factos.event_type("AccountRegistered"),
            factos.event_type("AccountClosed"),
            factos.event_type("UsernameChanged"),
          ],
          tags: [factos.tag("username:" <> old_username)],
        ),
        factos.item(
          types: [
            factos.event_type("AccountRegistered"),
            factos.event_type("AccountClosed"),
            factos.event_type("UsernameChanged"),
          ],
          tags: [factos.tag("username:" <> new_username)],
        ),
      ])
  }
}
