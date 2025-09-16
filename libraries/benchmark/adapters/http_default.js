const http = require("k6/http");

const baseUri = __ENV.BASE_URI || "http://localhost:3000";

const api = {
  read(query, options) {
    let url = `${baseUri}/read?query=${encodeURIComponent(JSON.stringify(query))}`;
    if (options !== undefined) {
      url += `&options=${encodeURIComponent(JSON.stringify(options))}`;
    }

    const response = http.get(url);
    if (response.status !== 200) {
      throw new Error(
        `Failed to read events: ${response.status} ${response.body}`,
      );
    }
    const responseData = response.json();
    // TODO verify response data structure
    if (
      !Array.isArray(responseData) ||
      !responseData.every(
        (event) =>
          typeof event === "object" &&
          typeof event.type === "string" &&
          Array.isArray(event.tags) &&
          typeof event.position === "number",
      )
    ) {
      throw new Error(`Invalid response data: ${JSON.stringify(responseData)}`);
    }
    return responseData;
  },
  readLastEvent(query) {
    const events = this.read(query, { backwards: true, limit: 1 });
    return events[0] ?? null;
  },
  append(events, condition) {
    const response = http.post(
      `${baseUri}/append`,
      JSON.stringify({ events, condition }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    if (response.status !== 200) {
      throw new Error(
        `Failed to append events: ${response.status} ${response.body}`,
      );
    }
    const responseData = response.json();
    if (
      !responseData ||
      typeof responseData !== "object" ||
      typeof responseData.durationInMicroseconds !== "number" ||
      typeof responseData.appendConditionFailed !== "boolean"
    ) {
      throw new Error(`Invalid response data: ${JSON.stringify(responseData)}`);
    }
    return responseData;
  },
};
module.exports = api;
