let events = []

const appendEvents = (eventsToAppend) => {
  events = eventsToAppend
}

const appendEvent = (eventToAppend, appendCondition) => {}

const minutesAgo = (minutes) => new Date(new Date().getTime() - minutes * (1000 * 60))

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
      if (!projection.tagFilter.every((tag) => event.tags.includes(tag))) {
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
    try {
      testCase.test()
      if (!testCase.expectedError) {
        console.log(`${testCase.description}: ✔`)
        continue
      }
      console.log(
        `${testCase.description}: ✖ – expected error '${testCase.expectedError}' but none was thrown`
      )
    } catch (error) {
      if (!testCase.expectedError) {
        console.log(`${testCase.description}: ✖ – expected no error, but got '${error.message}'`)
        continue
      }
      if (testCase.expectedError !== error.message) {
        console.log(
          `${testCase.description}: ✖ – expected error '${testCase.expectedError}' but got '${error.message}'`
        )
        continue
      }
      console.log(`${testCase.description}: ✔ (error '${error.message}' as expected)`)
    }
  }
}

##CODE##