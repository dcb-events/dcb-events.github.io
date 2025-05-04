import { AppendCondition, EventStore } from "./EventStore"
import { composeProjections, Projection } from "./Projection"

/**
 * Builds a decision model using the provided projections
 *
 * Usage:
 * const { state, appendCondition } = buildDecisionModel(eventStore, {
 *   foo: SomeProjection(...),
 *   bar: SomeOtherProjection(...),
 * })
 * // form decisions based on `state.foo` and `state.bar`
 * this.eventStore.append(
 *   newEvent,
 *   appendCondition
 * )
 */
export function buildDecisionModel<T extends Record<string, Projection<any>>>(
  eventStore: EventStore,
  projections: T
): {
  state: {
    [K in keyof T]: T[K] extends Projection<infer S> ? S : never
  }
  appendCondition: AppendCondition
} {
  const compositeProjection = composeProjections(projections)
  const initialState = compositeProjection.initialState as {
    [K in keyof T]: T[K] extends Projection<infer S> ? S : never
  }
  let state = initialState
  let lastConsumedEventPosition = 0
  for (const event of eventStore.read(compositeProjection.query)) {
    state = compositeProjection.apply(state, event)
    lastConsumedEventPosition = event.position
  }
  const appendCondition: AppendCondition = {
    failIfEventsMatch: compositeProjection.query,
    after: lastConsumedEventPosition,
  }

  return { state, appendCondition }
}
