///// Enforce course and student subscription constraints with Dynamic
//// Consistency Boundaries.
////
//// This implements the example at
//// https://dcb.events/examples/course-subscriptions/ using Factos and
//// PostgreSQL.

import factos
import factos/factos_pog
import gleam/dynamic/decode
import gleam/json
import gleam/result
import pog

const student_course_limit = 5

pub type Event {
  CourseDefined(course_id: String, capacity: Int)
  CourseCapacityChanged(course_id: String, new_capacity: Int)
  StudentSubscribedToCourse(student_id: String, course_id: String)
}

pub type Command {
  DefineCourse(course_id: String, capacity: Int)
  ChangeCourseCapacity(course_id: String, new_capacity: Int)
  SubscribeStudentToCourse(student_id: String, course_id: String)
}

pub type Error {
  CourseAlreadyExists(course_id: String)
  CourseDoesNotExist(course_id: String)
  CapacityUnchanged(capacity: Int)
  CourseFullyBooked(course_id: String)
  StudentAlreadySubscribed
  StudentCourseLimitReached(limit: Int)
}

type DefinitionStatus {
  Undefined
  Defined
}

type CourseState {
  CourseMissing
  CoursePresent(capacity: Int)
}

type SubscriptionStatus {
  NotSubscribed
  Subscribed
}

type State {
  DefiningCourse(definition: DefinitionStatus)
  ChangingCourseCapacity(course: CourseState)
  SubscribingStudent(
    student_id: String,
    course_id: String,
    course: CourseState,
    course_subscription_count: Int,
    student_subscription_count: Int,
    subscription: SubscriptionStatus,
  )
}

fn initial(command: Command) -> State {
  case command {
    DefineCourse(course_id: _, capacity: _) ->
      DefiningCourse(definition: Undefined)
    ChangeCourseCapacity(course_id: _, new_capacity: _) ->
      ChangingCourseCapacity(course: CourseMissing)
    SubscribeStudentToCourse(student_id:, course_id:) ->
      SubscribingStudent(
        student_id:,
        course_id:,
        course: CourseMissing,
        course_subscription_count: 0,
        student_subscription_count: 0,
        subscription: NotSubscribed,
      )
  }
}

fn decide(state: State, command: Command) -> Result(List(Event), Error) {
  case state, command {
    DefiningCourse(definition: Undefined), DefineCourse(course_id:, capacity:)
    -> Ok([CourseDefined(course_id:, capacity:)])

    DefiningCourse(definition: Defined), DefineCourse(course_id:, capacity: _)
    -> Error(CourseAlreadyExists(course_id:))

    ChangingCourseCapacity(course: CoursePresent(capacity:)),
      ChangeCourseCapacity(course_id: _, new_capacity:)
      if capacity == new_capacity
    -> Error(CapacityUnchanged(capacity:))

    ChangingCourseCapacity(course: CoursePresent(capacity: _)),
      ChangeCourseCapacity(course_id:, new_capacity:)
    -> Ok([CourseCapacityChanged(course_id:, new_capacity:)])

    ChangingCourseCapacity(course: CourseMissing),
      ChangeCourseCapacity(course_id:, new_capacity: _)
    | SubscribingStudent(course: CourseMissing, ..),
      SubscribeStudentToCourse(student_id: _, course_id:)
    -> Error(CourseDoesNotExist(course_id:))

    SubscribingStudent(
      course: CoursePresent(capacity:),
      course_subscription_count:,
      ..,
    ),
      SubscribeStudentToCourse(student_id: _, course_id:)
      if course_subscription_count >= capacity
    -> Error(CourseFullyBooked(course_id:))

    SubscribingStudent(
      course: CoursePresent(capacity: _),
      subscription: Subscribed,
      ..,
    ),
      SubscribeStudentToCourse(student_id: _, course_id: _)
    -> Error(StudentAlreadySubscribed)

    SubscribingStudent(
      course: CoursePresent(capacity: _),
      student_subscription_count:,
      subscription: NotSubscribed,
      ..,
    ),
      SubscribeStudentToCourse(student_id: _, course_id: _)
      if student_subscription_count >= student_course_limit
    -> Error(StudentCourseLimitReached(limit: student_course_limit))

    SubscribingStudent(
      course: CoursePresent(capacity: _),
      subscription: NotSubscribed,
      ..,
    ),
      SubscribeStudentToCourse(student_id:, course_id:)
    -> Ok([StudentSubscribedToCourse(student_id:, course_id:)])

    _, _ -> panic as "Command executed for wrong state"
  }
}

fn evolve(state: State, event: Event) -> State {
  case state, event {
    DefiningCourse(definition: _), CourseDefined(course_id: _, capacity: _) ->
      DefiningCourse(definition: Defined)

    ChangingCourseCapacity(course: _), CourseDefined(course_id: _, capacity:) ->
      ChangingCourseCapacity(course: CoursePresent(capacity:))

    ChangingCourseCapacity(course: _),
      CourseCapacityChanged(course_id: _, new_capacity:)
    -> ChangingCourseCapacity(course: CoursePresent(capacity: new_capacity))

    SubscribingStudent(course_id:, course:, ..),
      CourseDefined(course_id: event_course_id, capacity:)
    ->
      SubscribingStudent(..state, course: case event_course_id == course_id {
        True -> CoursePresent(capacity:)
        False -> course
      })

    SubscribingStudent(course_id:, course:, ..),
      CourseCapacityChanged(course_id: event_course_id, new_capacity:)
    ->
      SubscribingStudent(..state, course: case event_course_id == course_id {
        True -> CoursePresent(capacity: new_capacity)
        False -> course
      })

    SubscribingStudent(
      student_id:,
      course_id:,
      course_subscription_count:,
      student_subscription_count:,
      subscription:,
      ..,
    ),
      StudentSubscribedToCourse(
        student_id: event_student_id,
        course_id: event_course_id,
      )
    -> {
      let targets_student = event_student_id == student_id
      let targets_course = event_course_id == course_id
      SubscribingStudent(
        ..state,
        course_subscription_count: case targets_course {
          True -> course_subscription_count + 1
          False -> course_subscription_count
        },
        student_subscription_count: case targets_student {
          True -> student_subscription_count + 1
          False -> student_subscription_count
        },
        subscription: case targets_student && targets_course {
          True -> Subscribed
          False -> subscription
        },
      )
    }

    _, _ -> panic as "Event not belonging to command state"
  }
}

pub fn codec() -> factos.EventCodec(Event, String) {
  factos.codec(encode:, decode:)
}

fn encode(event: Event) -> factos.Event(String) {
  case event {
    CourseDefined(course_id:, capacity:) ->
      factos.new_event(
        type_: factos.event_type("CourseDefined"),
        version: 1,
        data: json.object([
          #("course_id", json.string(course_id)),
          #("capacity", json.int(capacity)),
        ])
          |> json.to_string,
      )
      |> factos.with_tags(tags: [
        factos.tag("course:" <> course_id),
      ])
    CourseCapacityChanged(course_id:, new_capacity:) ->
      factos.new_event(
        type_: factos.event_type("CourseCapacityChanged"),
        version: 1,
        data: json.object([
          #("course_id", json.string(course_id)),
          #("new_capacity", json.int(new_capacity)),
        ])
          |> json.to_string,
      )
      |> factos.with_tags(tags: [
        factos.tag("course:" <> course_id),
      ])
    StudentSubscribedToCourse(student_id:, course_id:) ->
      factos.new_event(
        type_: factos.event_type("StudentSubscribedToCourse"),
        version: 1,
        data: json.object([
          #("student_id", json.string(student_id)),
          #("course_id", json.string(course_id)),
        ])
          |> json.to_string,
      )
      |> factos.with_tags(tags: [
        factos.tag("student:" <> student_id),
        factos.tag("course:" <> course_id),
      ])
  }
}

fn decode(
  stored: factos.Recorded(String),
) -> Result(Event, factos.DecodeError) {
  case
    factos.event_type_name(stored.descriptor.type_),
    stored.descriptor.version
  {
    "CourseDefined", 1 ->
      json.parse(stored.event, using: course_defined_decoder())
      |> result.replace_error(factos.InvalidData)
    "CourseCapacityChanged", 1 ->
      json.parse(stored.event, using: course_capacity_changed_decoder())
      |> result.replace_error(factos.InvalidData)
    "StudentSubscribedToCourse", 1 ->
      json.parse(stored.event, using: student_subscribed_decoder())
      |> result.replace_error(factos.InvalidData)
    _, _ -> Error(factos.UnknownEvent)
  }
}

fn course_defined_decoder() -> decode.Decoder(Event) {
  use course_id <- decode.field("course_id", decode.string)
  use capacity <- decode.field("capacity", decode.int)
  decode.success(CourseDefined(course_id:, capacity:))
}

fn course_capacity_changed_decoder() -> decode.Decoder(Event) {
  use course_id <- decode.field("course_id", decode.string)
  use new_capacity <- decode.field("new_capacity", decode.int)
  decode.success(CourseCapacityChanged(course_id:, new_capacity:))
}

fn student_subscribed_decoder() -> decode.Decoder(Event) {
  use student_id <- decode.field("student_id", decode.string)
  use course_id <- decode.field("course_id", decode.string)
  decode.success(StudentSubscribedToCourse(student_id:, course_id:))
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
    DefineCourse(course_id:, capacity: _) ->
      factos.Matching([
        factos.item(types: [factos.event_type("CourseDefined")], tags: [
          factos.tag("course:" <> course_id),
        ]),
      ])
    ChangeCourseCapacity(course_id:, new_capacity: _) ->
      factos.Matching([
        factos.item(
          types: [
            factos.event_type("CourseDefined"),
            factos.event_type("CourseCapacityChanged"),
          ],
          tags: [factos.tag("course:" <> course_id)],
        ),
      ])
    SubscribeStudentToCourse(student_id:, course_id:) ->
      factos.Matching([
        factos.item(
          types: [
            factos.event_type("CourseDefined"),
            factos.event_type("CourseCapacityChanged"),
            factos.event_type("StudentSubscribedToCourse"),
          ],
          tags: [factos.tag("course:" <> course_id)],
        ),
        factos.item(
          types: [factos.event_type("StudentSubscribedToCourse")],
          tags: [factos.tag("student:" <> student_id)],
        ),
      ])
  }
}
