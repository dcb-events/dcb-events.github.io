const grpc = require("k6/net/grpc");
const encoding = require("k6/encoding");

const baseUri = __ENV.BASE_URI || "127.0.0.1:50051";

// Create and load client in init context (required by k6)
const client = new grpc.Client();
client.load(["adapters/protos"], "umadb.proto");

// Track connection state manually
let connected = false;

function ensureConnected() {
  if (!connected) {
    client.connect(baseUri, { plaintext: true });
    connected = true;
  }
}

const api = {
  read(query, options = {}) {
    ensureConnected();

    const request = {
      query: query
        ? {
            items: query.items.map((item) => ({
              types: item.types || [],
              tags: item.tags || [],
            })),
          }
        : undefined,
      start: options.from || "0",
      backwards: options.backwards || false,
      limit: options.limit || 0,
      subscribe: false,
      batchSize: options.batchSize || 100,
    };

    // Use client.invoke() which handles server streaming synchronously
    const response = client.invoke("umadb.UmaDBService/Read", request);

    // Ignore code 2 (protocol violation) if we have valid data
    // This is a k6 quirk with server-streaming that doesn't prevent successful reads
    if (response.error && !(response.error.code === 2 && response.message)) {
      throw new Error(`Failed to read events: ${JSON.stringify(response.error)}`);
    }

    const events = [];

    // The response should contain the streamed events
    // Check if it's in response.message.events or response.message directly
    if (response.message && response.message.events) {
      for (const seqEvent of response.message.events) {
        events.push({
          type: seqEvent.event.eventType,
          tags: seqEvent.event.tags || [],
          data: seqEvent.event.data
            ? encoding.b64decode(seqEvent.event.data, "std", "s")
            : "",
          uuid: seqEvent.event.uuid || "",
          position: Number(seqEvent.position),
        });
      }
    }

    return events;
  },

  readLastEvent(query) {
    const events = this.read(query, { backwards: true, limit: 1 });
    return events.length > 0 ? events[0] : null;
  },

  append(events, condition) {
    ensureConnected();

    const startTime = Date.now();

    const request = {
      events: events.map((event) => ({
        eventType: event.type,
        tags: event.tags || [],
        data: event.data ? encoding.b64encode(event.data) : "",
        uuid: event.uuid || "",
      })),
      condition: condition
        ? {
            failIfEventsMatch: condition.failIfEventsMatch
              ? {
                  items: condition.failIfEventsMatch.items.map((item) => ({
                    types: item.types || [],
                    tags: item.tags || [],
                  })),
                }
              : undefined,
            after: condition.after,
          }
        : undefined,
    };

    const response = client.invoke("umadb.UmaDBService/Append", request);
    const durationInMicroseconds = (Date.now() - startTime) * 1000;

    if (response.error) {
      // Check if it's a condition failure (gRPC code 13 = FailedPrecondition)
      if (
        response.error.code === 13 ||
        (response.error.message && response.error.message.includes("Integrity"))
      ) {
        return {
          appendConditionFailed: true,
          durationInMicroseconds: durationInMicroseconds,
        };
      }
      const errorMsg = JSON.stringify(response.error);
      throw new Error(`Append failed: ${errorMsg}`);
    }

    return {
      position: Number(response.message.position),
      appendConditionFailed: false,
      durationInMicroseconds: durationInMicroseconds,
    };
  },

  close() {
    if (client.isConnected) {
      client.close();
    }
  },
};

module.exports = api;
