import {
  Query,
  QueryItem,
  SequencedEvent,
  Event,
  queryAll,
  createQuery,
} from "./EventStore"

/**
 * Projection interface defines the structure of a projection.
 * It includes the initial state, a method to apply events to the state,
 * and a query to filter events.
 * The initial state is of type S, which is inferred from the projection's configuration.
 * The apply method takes the current state and an event, and returns a new state.
 */
type Projection<S> = {
  get initialState(): S
  apply(state: S, event: SequencedEvent): S
  get query(): Query
}

type Handlers<AllEventTypes extends Event, S> = {
  // Use the 'type' property of the union members as keys
  [K in AllEventTypes["type"]]?: (
    state: S,
    event: SequencedEvent & Extract<AllEventTypes, { type: K }>
  ) => S
}

/**
 * ProjectionConfig defines the configuration for a projection.
 * It includes the initial state, handlers for different event types,
 * and optional tagFilter to filter events by tags.
 */
interface ProjectionConfig<AllEventTypes extends Event, S> {
  /** The starting state for the projection. The type S will be inferred from this. */
  initialState: S
  /** The actual projection logic. The key of each handler is the event type and the value is a function that accepts the current state and an instance of that event and returns a new state */
  handlers: Handlers<AllEventTypes, S>
  /** Optional tags to filter events. If provided, only events matching ALL tags are considered. */
  tagFilter?: [string, ...string[]]
}

/**
 * Creates a projection based on the provided configuration.
 *
 * @param {ProjectionConfig} config The configuration object for the projection, including initial state, handlers, and optional tags.
 * @returns {Projection<S>} A projection object that can be used to apply events and retrieve the current state.
 */
export function createProjection<AllEventTypes extends Event, S>(
  // config now contains initialState, handlers, and tagFilter
  config: ProjectionConfig<AllEventTypes, S>
): Projection<S> {
  // Extract event types handled by this specific projection
  // Ensure handlers is not null/undefined before getting keys
  const handlers = config.handlers ?? ({} as Handlers<AllEventTypes, S>)
  const types = Object.keys(handlers) as [string, ...string[]]

  // Build the query item based on handled types and optional tags
  // Handle case where types might be empty if no handlers are provided
  const qi: QueryItem = types.length > 0 ? { types } : { types: [] as any } // Or handle empty handlers differently if needed
  if (config.tagFilter) qi.tags = config.tagFilter
  const query = createQuery([qi]) // Assuming Query.fromItems exists and handles empty types array if necessary

  return {
    // Access initialState from the config object
    get initialState(): S {
      return config.initialState
    },

    apply(state: S, event: SequencedEvent): S {
      // Ignore events not matching the projection's query
      if (!query.matchesEvent(event)) return state // Assuming query.matchesEvent exists

      // Use the specific event type union for safer lookup
      const eventType = event.type as AllEventTypes["type"]
      const handler = handlers[eventType] // Direct lookup using the constrained key type

      // If no handler for this event type, return state unchanged
      if (!handler) return state

      // Apply the handler and return the new state
      return handler(
        state,
        event as SequencedEvent &
          Extract<AllEventTypes, { type: typeof eventType }>
      )
    },

    get query(): Query {
      return query
    },
  }
}
/**
 * Composes multiple projections into a single projection.
 * The resulting projection's state is an object where keys are the names
 * provided in the input `projections` object, and values are the states
 * of the corresponding individual projections.
 */
export function composeProjections<T extends Record<string, Projection<any>>>(
  projections: T
): Projection<{
  [K in keyof T]: T[K] extends Projection<infer S> ? S : never
}> {
  type ComposedState = {
    [K in keyof T]: T[K] extends Projection<infer S> ? S : never
  }

  const initialState: ComposedState = Object.fromEntries(
    Object.entries(projections).map(([key, projection]) => [
      key,
      projection.initialState,
    ])
  ) as ComposedState

  const combinedQuery =
    Object.values(projections)
      .map((projection) => projection.query)
      .reduce(
        (mergedQuery: Query | null, query: Query) =>
          mergedQuery ? mergedQuery.merge(query) : query,
        null
      ) || queryAll()

  return {
    initialState,
    apply: (state: ComposedState, event: SequencedEvent): ComposedState => {
      // Optimization: check if the event matches the combined query first
      if (!combinedQuery.matchesEvent(event)) {
        return state
      }

      let hasChanged = false
      const newState = { ...state } // Create a shallow copy

      for (const projectionName in projections) {
        const projection = projections[projectionName]
        // Apply individual projection
        // Ensure we handle cases where a sub-state might not exist yet (though initialState should cover this)
        const oldSubState = state[projectionName] ?? projection.initialState
        const newSubState = projection.apply(oldSubState, event)
        if (oldSubState !== newSubState) {
          newState[projectionName] = newSubState
          hasChanged = true
        }
      }
      // Return the original state object if no sub-projection changed anything
      return hasChanged ? newState : state
    },
    get query(): Query {
      // Return the pre-calculated combined query
      return combinedQuery
    },
  }
}
