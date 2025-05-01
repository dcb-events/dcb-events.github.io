# Unique username example

Enforcing globally unique values is simple with strong consistency (thanks to tools like unique constraint indexes), but it becomes significantly more challenging with <dfn title="Consistency model that prioritizes availability and partition tolerance over immediate consistency">eventual consistency</dfn>.

## Challenge

The goal is an application that allows users to subscribe with a username that uniquely identifies them.

As a bonus, this example is extended by adding the following features:

- Allow usernames to be re-claimed when the account was suspended
- Allow users to change their username
- Only release unused usernames after a configurable delay

## Traditional approaches

There are a couple of common strategies to achieve global uniqueness in event-driven systems:

- **Eventual consistency**: Use a <dfn title="Representation of data tailored for specific read operations, often denormalized for performance">Read Model</dfn> to check for uniqueness and handle a duplication due to race conditions after the fact (e.g. by deactivating the account or changing the username)

     > :material-forward: This is of course a potential solution, with or without DCB, but it falls outside the scope of these examples

- **Dedicated storage**: Create a dedicated storage for allocated usernames and make the write side insert a record when the corresponding Event is recorded
    
      > :material-forward: This adds a source of error and potentially locked usernames unless Event and storage update can be done in a single transaction

- **Reservation Pattern:** Use the <dfn title="Design pattern used to temporarily hold or reserve a resource or state until the process is completed">Reservation Pattern</dfn> to lock a username and only continue if the locking succeeded

      > :material-forward: This works but adds quite a lot of complexity and additional Events and the need for <dfn title="Coordinates a sequence of local transactions across multiple services, ensuring data consistency through compensating actions in case of failure">Sagas</dfn> or multiple writes in a single request

## DCB approach

With DCB all Events that affect the unique constraint (the username in this example) can be tagged with the corresponding value (or a hash of it):

![unique username example](img/unique-username-01.png)

### 01: Globally unique username

This example is the most simple one just checking whether a given username is claimed

```js
// event type definitions:

class AccountRegistered {
  type = "AccountRegistered"
  data
  tags
  constructor({ username }) {
    this.data = { username }
    this.tags = [`username:${username}`]
  }
}

// projections for decision models:

class IsUsernameClaimedProjection {
  static for(username) {
    return createProjection({
      initialState: false,
      handlers: {
        AccountRegistered: (state, event) => true,
      },
      tags: [`username:${username}`],
    })
  }
}

// command handlers:

class Api {
  eventStore
  constructor(eventStore) {
    this.eventStore = eventStore
  }

  registerAccount(command) {
    const { state, appendCondition } = buildDecisionModel(this.eventStore, {
      isUsernameClaimed: IsUsernameClaimedProjection.for(command.username),
    })
    if (state.isUsernameClaimed) {
      throw new Error(`Username "${command.username}" is claimed`)
    }
    this.eventStore.append(
      new AccountRegistered({
        username: command.username,
      }),
      appendCondition
    )
  }
}

// test cases:

const eventStore = new InMemoryDcbEventStore()
const api = new Api(eventStore)
runTests(api, eventStore, [
  {
    description: "Register account with claimed username",
    given: {
      events: [new AccountRegistered({ username: "u1" })],
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
      expectedEvent: new AccountRegistered({ username: "u1" }),
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib2.js"></codapi-snippet>

### 02: Release usernames

This example extends the previous one to show how a previously claimed username could be released when the corresponding account is suspended

```js hl_lines="13-21 31"
// event type definitions:

class AccountRegistered {
  type = "AccountRegistered"
  data
  tags
  constructor({ username }) {
    this.data = { username }
    this.tags = [`username:${username}`]
  }
}

class AccountSuspended {
  type = "AccountSuspended"
  data
  tags
  constructor({ username }) {
    this.data = { username }
    this.tags = [`username:${username}`]
  }
}

// projections for decision models:

class IsUsernameClaimedProjection {
  static for(username) {
    return createProjection({
      initialState: false,
      handlers: {
        AccountRegistered: (state, event) => true,
        AccountSuspended: (state, event) => false,
      },
      tags: [`username:${username}`],
    })
  }
}

// command handlers:

class Api {
  eventStore
  constructor(eventStore) {
    this.eventStore = eventStore
  }

  registerAccount(command) {
    const { state, appendCondition } = buildDecisionModel(this.eventStore, {
      isUsernameClaimed: IsUsernameClaimedProjection.for(command.username),
    })
    if (state.isUsernameClaimed) {
      throw new Error(`Username "${command.username}" is claimed`)
    }
    this.eventStore.append(
      new AccountRegistered({
        username: command.username,
      }),
      appendCondition
    )
  }
}

// test cases:

const eventStore = new InMemoryDcbEventStore()
const api = new Api(eventStore)
runTests(api, eventStore, [
  // ...
  {
    description: "Register account with username of suspended account",
    given: {
      events: [
        new AccountRegistered({ username: "u1" }),
        new AccountSuspended({ username: "u1" }),
      ],
    },
    when: {
      command: {
        type: "registerAccount",
        data: { username: "u1" },
      },
    },
    then: {
      expectedEvent: new AccountRegistered({ username: "u1" }),
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib2.js"></codapi-snippet>

### 03: Allow changing of usernames

This example extends the previous one to show how the username of an active account could be changed

!!! note

    The `daysAgo` property of the Event metadata is a simplification. Typically, a timestamp representing the Event's recording time is stored within the Event's payload or metadata. This timestamp can be compared to the current date to determine the Event's age in the decision model.

```js hl_lines="41-43"
// event type definitions:

class AccountRegistered {
  type = "AccountRegistered"
  data
  tags
  constructor({ username }) {
    this.data = { username }
    this.tags = [`username:${username}`]
  }
}

class AccountSuspended {
  type = "AccountSuspended"
  data
  tags
  constructor({ username }) {
    this.data = { username }
    this.tags = [`username:${username}`]
  }
}

class UsernameChanged {
  type = "UsernameChanged"
  data
  tags
  constructor({ oldUsername, newUsername }) {
    this.data = { oldUsername, newUsername }
    this.tags = [`username:${oldUsername}`, `username:${newUsername}`]
  }
}

// projections for decision models:

class IsUsernameClaimedProjection {
  static for(username) {
    return createProjection({
      initialState: false,
      handlers: {
        AccountRegistered: (state, event) => true,
        AccountSuspended: (state, event) => event.metadata.daysAgo <= 3,
        UsernameChanged: (state, event) =>
          event.data.newUsername === username || event.metadata.daysAgo <= 3,
      },
      tags: [`username:${username}`],
    })
  }
}

// command handlers:

class Api {
  eventStore
  constructor(eventStore) {
    this.eventStore = eventStore
  }

  registerAccount(command) {
    const { state, appendCondition } = buildDecisionModel(this.eventStore, {
      isUsernameClaimed: IsUsernameClaimedProjection.for(command.username),
    })
    if (state.isUsernameClaimed) {
      throw new Error(`Username "${command.username}" is claimed`)
    }
    this.eventStore.append(
      new AccountRegistered({
        username: command.username,
      }),
      appendCondition
    )
  }
}

// test cases:

const eventStore = new InMemoryDcbEventStore()
const api = new Api(eventStore)

function addMetadata(event, metadata) {
  return Object.assign(event, {
    metadata,
  })
}

runTests(api, eventStore, [
  // ...
  {
    description: "Register username of suspended account before grace period",
    given: {
      events: [
        addMetadata(new AccountRegistered({ username: "u1" }), { daysAgo: 4 }),
        addMetadata(new AccountSuspended({ username: "u1" }), { daysAgo: 3 }),
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
        addMetadata(new AccountRegistered({ username: "u1" }), { daysAgo: 4 }),
        addMetadata(
          new UsernameChanged({ oldUsername: "u1", newUsername: "u1changed" }),
          { daysAgo: 3 }
        ),
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
        addMetadata(new AccountRegistered({ username: "u1" }), { daysAgo: 4 }),
        addMetadata(new AccountSuspended({ username: "u1" }), { daysAgo: 4 }),
      ],
    },
    when: {
      command: {
        type: "registerAccount",
        data: { username: "u1" },
      },
    },
    then: {
      expectedEvent: new AccountRegistered({
        username: "u1",
      }),
    },
  },
  {
    description: "Register changed username after grace period",
    given: {
      events: [
        addMetadata(new AccountRegistered({ username: "u1" }), { daysAgo: 4 }),
        addMetadata(
          new UsernameChanged({ oldUsername: "u1", newUsername: "u1changed" }),
          { daysAgo: 4 }
        ),
      ],
    },
    when: {
      command: {
        type: "registerAccount",
        data: { username: "u1" },
      },
    },
    then: {
      expectedEvent: new AccountRegistered({
        username: "u1",
      }),
    },
  },
])
```

<codapi-snippet engine="browser" sandbox="javascript" template="/assets/js/lib2.js"></codapi-snippet>

## Conclusion

This example demonstrates how to solve one of the Event Sourcing evergreens: Enforcing unique usernames. But it can be applied to any scenario that requires global uniqueness of some sort.