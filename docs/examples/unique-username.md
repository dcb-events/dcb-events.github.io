# Unique username example

Enforcing globally unique values is simple with strong consistency (thanks to tools like unique constraint indexes), but it becomes significantly more challenging with [eventual consistency](../glossary.md#eventual-consistency).

## Challenge

The goal is an application that allows users to subscribe with a username that uniquely identifies them.

As a bonus, this example is extended by adding the following features:

- Allow usernames to be re-claimed when the account was suspended
- Allow users to change their username
- Only release unused usernames after a configurable delay

## Traditional approaches

There are a couple of common strategies to achieve global uniqueness in event-driven systems:

- Use a [Read Model](../glossary.md#read-model) to check for uniqueness and handle a duplication due to race conditions after the fact (e.g. by deactivating the account or changing the username)
    - This is of course a potential solution, with or without DCB, but it falls outside the scope of these examples
- Create a dedicated storage for allocated usernames and make the write side insert a record when the corresponding Event is recorded
    - This adds a source of error and potentially locked usernames unless Event and storage update can be done in a single transaction
- Use the [Reservation Pattern](../glossary.md#reservation-pattern) to lock a username and only continue if the locking succeeded
    - This works but adds quite a lot of complexity and additional Events and the need for Sagas/[Process Managers](../glossary.md#process-manager) or multiple writes in a single request

## DCB approach

With DCB all Events that affect the unique constraint (the username in this example) can be tagged with the corresponding value (or a hash of it):

![unique username example](img/unique-username-01.png)

### 01: Globally unique username

This example is the most simple one just checking whether a given username is claimed

```js
// event type definitions:

const eventTypes = {
  AccountRegistered: {
    tagResolver: (data) => [`username:${data.username}`],
  },
}

// decision models:

const decisionModels = {
  isUsernameClaimed: (username) => ({
    initialState: false,
    handlers: {
      AccountRegistered: (state, event) => true,
    },
    tagFilter: [`username:${username}`],
  }),
}

// command handlers:

const commandHandlers = {
  registerAccount: (command) => {
    const { state, appendCondition } = buildDecisionModel({
      isUsernameClaimed: decisionModels.isUsernameClaimed(command.username),
    })
    if (state.isUsernameClaimed) {
      throw new Error(`Username "${command.username}" is claimed`)
    }
    appendEvent(
      {
        type: "AccountRegistered",
        data: { username: command.username },
      },
      appendCondition
    )
  },
}

// test cases:

test([
  {
    description: "Register account with claimed username",
    given: {
      events: [
        {
          type: "AccountRegistered",
          data: { username: "u1" },
        },
      ],
    },
    when: {
      command: {
        type: "registerAccount",
        data: { username: "u1" },
      },
    },
    then: {
      expectedError: 'Username "u1" is claimed',
    },
  },
  {
    description: "Register account with unused username",
    when: {
      command: {
        type: "registerAccount",
        data: { username: "u1" },
      },
    },
    then: {
      expectedEvent: {
        type: "AccountRegistered",
        data: { username: "u1" },
      },
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### 02: Release usernames

This example extends the previous one to show how a previously claimed username could be released when the corresponding account is suspended

```js hl_lines="7-9 19"
// event type definitions:

const eventTypes = {
  AccountRegistered: {
    tagResolver: (data) => [`username:${data.username}`],
  },
  AccountSuspended: {
    tagResolver: (data) => [`username:${data.username}`],
  },
}

// decision models:

const decisionModels = {
  isUsernameClaimed: (username) => ({
    initialState: false,
    handlers: {
      AccountRegistered: (state, event) => true,
      AccountSuspended: (state, event) => false,
    },
    tagFilter: [`username:${username}`],
  }),
}

// command handlers:

const commandHandlers = {
  registerAccount: (command) => {
    const { state, appendCondition } = buildDecisionModel({
      isUsernameClaimed: decisionModels.isUsernameClaimed(command.username),
    })
    if (state.isUsernameClaimed) {
      throw new Error(`Username "${command.username}" is claimed`)
    }
    appendEvent(
      {
        type: "AccountRegistered",
        data: { username: command.username },
      },
      appendCondition
    )
  },
}

// test cases:

test([
  // ...
  {
    description: "Register account with username of suspended account",
    given: {
      events: [
        {
          type: "AccountRegistered",
          data: { username: "u1" },
        },
        {
          type: "AccountSuspended",
          data: { username: "u1" },
        },
      ],
    },
    when: {
      command: {
        type: "registerAccount",
        data: { username: "u1" },
      },
    },
    then: {
      expectedEvent: {
        type: "AccountRegistered",
        data: { username: "u1" },
      },
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### 03: Allow changing of usernames

This example extends the previous one to show how the username of an active account could be changed

```js hl_lines="10-15 26"
// event type definitions:

const eventTypes = {
  AccountRegistered: {
    tagResolver: (data) => [`username:${data.username}`],
  },
  AccountSuspended: {
    tagResolver: (data) => [`username:${data.username}`],
  },
  UsernameChanged: {
    tagResolver: (data) => [
      `username:${data.oldUsername}`,
      `username:${data.newUsername}`
    ],
  },
}

// decision models:

const decisionModels = {
  isUsernameClaimed: (username) => ({
    initialState: false,
    handlers: {
      AccountRegistered: (state, event) => true,
      AccountSuspended: (state, event) => false,
      UsernameChanged: (state, event) => event.data.newUsername === username,
    },
    tagFilter: [`username:${username}`],
  }),
}

// command handlers:

const commandHandlers = {
  registerAccount: (command) => {
    const { state, appendCondition } = buildDecisionModel({
      isUsernameClaimed: decisionModels.isUsernameClaimed(command.username),
    })
    if (state.isUsernameClaimed) {
      throw new Error(`Username "${command.username}" is claimed`)
    }
    appendEvent(
      {
        type: "AccountRegistered",
        data: { username: command.username },
      },
      appendCondition
    )
  },
}

// test cases:

test([
  // ...
  {
    description: "Register changed username",
    given: {
      events: [
        {
          type: "AccountRegistered",
          data: { username: "u1" },
        },
        {
          type: "UsernameChanged",
          data: { oldUsername: "u1", newUsername: "u1changed" },
        },
      ],
    },
    when: {
      command: {
        type: "registerAccount",
        data: { username: "u1" },
      },
    },
    then: {
      expectedEvent: {
        type: "AccountRegistered",
        data: { username: "u1" },
      },
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

### 04: Release unused usernames with a configurable delay

This example extends the previous one to show how the release of a username could be postponed by X days

!!! note

    The `daysAgo` property of the `event` is a simplification. Typically, a timestamp representing the event's recording time is stored within the event's payload or metadata. This timestamp can be compared to the current date to determine the Event's age in the decision model.

```js hl_lines="25-27"
// event type definitions:

const eventTypes = {
  AccountRegistered: {
    tagResolver: (data) => [`username:${data.username}`],
  },
  AccountSuspended: {
    tagResolver: (data) => [`username:${data.username}`],
  },
  UsernameChanged: {
    tagResolver: (data) => [
      `username:${data.oldUsername}`,
      `username:${data.newUsername}`
    ],
  },
}

// decision models:

const decisionModels = {
  isUsernameClaimed: (username) => ({
    initialState: false,
    handlers: {
      AccountRegistered: (state, event) => true,
      AccountSuspended: (state, event) => event.metadata.daysAgo <= 3,
      UsernameChanged: (state, event) =>
        event.data.newUsername === username || event.metadata.daysAgo <= 3,
    },
    tagFilter: [`username:${username}`],
  }),
}

// command handlers:

const commandHandlers = {
  registerAccount: (command) => {
    const { state, appendCondition } = buildDecisionModel({
      isUsernameClaimed: decisionModels.isUsernameClaimed(command.username),
    })
    if (state.isUsernameClaimed) {
      throw new Error(`Username "${command.username}" is claimed`)
    }
    appendEvent(
      {
        type: "AccountRegistered",
        data: { username: command.username },
      },
      appendCondition
    )
  },
}

// test cases:

test([
  // ...
  {
    description: "Register username of suspended account before grace period",
    given: {
      events: [
        {
          type: "AccountRegistered",
          data: { username: "u1" },
          metadata: { daysAgo: 4 },
        },
        {
          type: "AccountSuspended",
          data: { username: "u1" },
          metadata: { daysAgo: 3 },
        },
      ],
    },
    when: {
      command: {
        type: "registerAccount",
        data: { username: "u1" },
      },
    },
    then: {
      expectedError: 'Username "u1" is claimed',
    },
  },
  {
    description: "Register changed username before grace period",
    given: {
      events: [
        {
          type: "AccountRegistered",
          data: { username: "u1" },
          metadata: { daysAgo: 4 },
        },
        {
          type: "UsernameChanged",
          data: { oldUsername: "u1", newUsername: "u1changed" },
          metadata: { daysAgo: 3 },
        },
      ],
    },
    when: {
      command: {
        type: "registerAccount",
        data: { username: "u1" },
      },
    },
    then: {
      expectedError: 'Username "u1" is claimed',
    },
  },
  {
    description: "Register username of suspended account after grace period",
    given: {
      events: [
        {
          type: "AccountRegistered",
          data: { username: "u1" },
          metadata: { daysAgo: 4 },
        },
        {
          type: "AccountSuspended",
          data: { username: "u1" },
          metadata: { daysAgo: 4 },
        },
      ],
    },
    when: {
      command: {
        type: "registerAccount",
        data: { username: "u1" },
      },
    },
    then: {
      expectedEvent: {
        type: "AccountRegistered",
        data: { username: "u1" },
      },
    },
  },
  {
    description: "Register changed username after grace period",
    given: {
      events: [
        {
          type: "AccountRegistered",
          data: { username: "u1" },
          metadata: { daysAgo: 4 },
        },
        {
          type: "UsernameChanged",
          data: { oldUsername: "u1", newUsername: "u1changed" },
          metadata: { daysAgo: 4 },
        },
      ],
    },
    when: {
      command: {
        type: "registerAccount",
        data: { username: "u1" },
      },
    },
    then: {
      expectedEvent: {
        type: "AccountRegistered",
        data: { username: "u1" },
      },
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib.js"></codapi-snippet>

## Conclusion

This example demonstrates how to solve one of the Event Sourcing evergreens: Enforcing unique usernames. But it can be applied to any scenario that requires global uniqueness of some sort.