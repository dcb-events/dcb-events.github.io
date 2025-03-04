const minutesAgo = (minutes) =>
    new Date(new Date().getTime() - minutes * (1000 * 60));
  
const projection = (mapping, tag) => ({
    initialState: () => mapping.$init() ?? null,
    apply: (state, event) => 
        event.tags?.includes(tag) && event.type in mapping
            ? mapping[event.type](state, event)
            : state,
});

const compositeProjection = (projections) => ({
    initialState: () =>
        Object.fromEntries(
            Object.entries(projections).map(([key, projection]) => [
                key,
                projection.initialState(),
            ]),
        ),
    apply: (state, event) =>
        Object.entries(projections).reduce((state, [key, projection]) => {
            state[key] = projection.apply(state[key] ?? null, event);
            return state;
        }, state),
});

const buildDecisionModel = (projections) => {
    const projection = compositeProjection(projections);
    const state = events.reduce(
        (state, event) => projection.apply(state, event),
        projection.initialState(),
    );
    return state;
};

##CODE##