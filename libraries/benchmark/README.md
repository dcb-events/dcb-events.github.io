# DCB event store test suite

[k6.io](https://k6.io/) test suite for DCB compliant event stores

## Installation

Install k6 as [documented](https://grafana.com/docs/k6/latest/set-up/install-k6/).

## Tests

### Consistency

Verifies whether the append condition of an Event Store is enforced correctly event with parallel writes

#### Usage

```shell
k6 run dcb-consistency.ts -e BASE_URI=<BASE_URI>
```

> [!NOTE]  
> Replace `<BASE_URI>` with the URL of the event store (use `--insecure-skip-tls-verify` to skip TSL verification)
> To use a custom adapter, the `ADAPTER` environment variable can be set, see below

### Monotony of positions

Verifies whether the position of the read events is always monotonic increasing

> [!IMPORTANT]
> This tests requires a running [redis](https://redis.io/) server!

#### Usage

```shell
k6 run dcb-monotonic.ts -e -e BASE_URI=<BASE_URI> -e REDIS_DSN=<REDIS_ENDPOINT>
```

> [!NOTE]  
> Replace `<BASE_URI>` with the URL of the event store (see above), replace `<REDIS_ENDPOINT>` with the redis connection string (e.g. `redis://localhost:6379`)
> To use a custom adapter, the `ADAPTER` environment variable can be set, see below

## Custom adapters

By default the [http_default.js](adapters/http_default.js) is used to interact with the event store backend. This can be replaced with a `ADAPTER` environment variable, for example:

```shell
k6 run dcb-consistency.ts -e ADAPTER="./adapters/http_esdb.js" 
```