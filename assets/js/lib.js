const events = []

const appendEvents = (eventsToAppend) => {
  for (const eventToAppend of eventsToAppend) {
    appendEvent(eventToAppend, null)
  }
}

const appendEvent = (eventToAppend, appendCondition) => {
  if (!(eventToAppend.type in eventTypes)) {
    throw new Error(`Failed to append event of unknown type "${eventToAppend.type}"`)
  }
  events.push({
    ...eventToAppend,
    tags: eventTypes[eventToAppend.type].tagResolver(eventToAppend.data),
  })
}

const compositeProjection = (projections) => ({
  initialState: () =>
    Object.fromEntries(
      Object.entries(projections).map(([key, projection]) => [key, projection.initialState])
    ),
  apply: (state, event) => {
    for (const projectionName in projections) {
      const projection = projections[projectionName]
      if (!projection.handlers.hasOwnProperty(event.type)) {
        continue
      }
      if (projection.tagFilter && !projection.tagFilter.every((tag) => event.tags.includes(tag))) {
        continue
      }
      state[projectionName] = projection.handlers[event.type](state[projectionName] ?? null, event)
    }
    return state
  },
})

const buildDecisionModel = (projections) => {
  const projection = compositeProjection(projections)
  const state = events.reduce(
    (state, event) => projection.apply(state, event),
    projection.initialState()
  )
  let appendCondition = null
  return { state, appendCondition }
}

const test = (testCases) => {
  for (const testCase of testCases) {
    events.splice(0)
    appendEvents(testCase.given?.events ?? [])
    const eventsPosition = events.length
    try {
      commandHandlers[testCase.when.command.type](testCase.when.command.data)
      if (
        testCase.then.expectedEvent &&
        !partialDeepEqual([testCase.then.expectedEvent], events.slice(eventsPosition))
      ) {
        console.log(
          `✖ ${testCase.description} – expected event ${JSON.stringify(
            testCase.then.expectedEvent
          )}' but got ${JSON.stringify(events.slice(eventsPosition)[0] ?? null)}`
        )
        continue
      }
      if (!testCase.then.expectedError) {
        console.log(`✔ ${testCase.description}`)
        continue
      }
      console.log(
        `✖ ${testCase.description} – expected error '${testCase.then.expectedError}' but none was thrown`
      )
    } catch (error) {
      if (!testCase.then.expectedError) {
        console.log(`✖ ${testCase.description} – expected no error, but got '${error.message}'`)
        continue
      }
      if (testCase.then.expectedError !== error.message) {
        console.log(
          `✖ ${testCase.description} – expected error '${testCase.then.expectedError}' but got '${error.message}'`
        )
        continue
      }
      console.log(`✔ ${testCase.description}`)
    }
  }
}

const partialDeepEqual = (value1, value2) => {
  if (typeof value1 !== "object" || value1 === null) {
    return value1 === value2
  }
  if (typeof value2 !== "object" || value2 === null) {
    return false
  }

  return Object.keys(value1).every(
    (key) => key in value2 && partialDeepEqual(value1[key], value2[key])
  )
}

##CODE##