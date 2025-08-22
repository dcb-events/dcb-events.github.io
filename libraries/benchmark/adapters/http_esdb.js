const http = require("k6/http");

const baseUri = __ENV.BASE_URI || "http://localhost:3000";
const apiToken = __ENV.API_KEY || "secret";

const convertQueryToEventQLConditions = (query) => {
  if (query.items.length === 0) {
    return [];
  }
  const eventQLParts = query.items.map((item) => {
    const subParts = [];
    if (item.types) {
      subParts.push(
        `["${item.types.map((type) => `events.dcb.${type}`).join('","')}"] CONTAINS e.type`,
      );
    }
    if (item.tags) {
      subParts.push(
        item.tags.map((tag) => `e.data.tags CONTAINS "${tag}"`).join(" AND "),
      );
    }
    return subParts.join(" AND ");
  });
  return [`(${eventQLParts.join(")\nOR\n(")})`];
};
const api = {
  read(query, options) {
    const eventQLParts = ["FROM e IN events"];
    const eventQLConditions = convertQueryToEventQLConditions(query);
    if (options?.from) {
      eventQLConditions.push(
        options?.backwards
          ? `e.id AS INT <= ${options.from}`
          : `e.id AS INT >= ${options.from}`,
      );
    }
    if (eventQLConditions.length > 0) {
      eventQLParts.push(`WHERE (${eventQLConditions.join(") AND (")})`);
    }
    if (options?.backwards) {
      eventQLParts.push("ORDER BY e.id DESC");
    }
    if (options?.limit) {
      eventQLParts.push(`TOP ${options.limit}`);
    }
    eventQLParts.push(
      "PROJECT INTO { type: SUBSTRING(e.type, 11), tags: e.data.tags, data: e.data.payload, position: e.id AS INT }",
    );

    const response = http.post(
      `${baseUri}/api/v1/run-eventql-query`,
      JSON.stringify({ query: eventQLParts.join(" ") }),
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
      },
    );
    if (response.status !== 200) {
      throw new Error(
        `Failed to read events: ${response.status} ${response.body}`,
      );
    }
    if (typeof response.body !== "string") {
      throw new Error(`Failed to read events: response body is no string`);
    }
    const jsonLines = response.body.trim().split("\n");
    return jsonLines
      .filter((l) => l !== "")
      .map((line) => JSON.parse(line).payload);
  },
  readLastEvent(query) {
    const events = this.read(query, { backwards: true, limit: 1 });
    return events[0] ?? null;
  },
  append(events, condition) {
    let payload = {
      events: events.map((event) => ({
        source: "https://dcb.events",
        subject: "/",
        type: `events.dcb.${event.type}`,
        data: {
          tags: event.tags,
          payload: event.data,
        },
      })),
    };
    if (condition) {
      const eventQLParts = ["FROM e IN events"];
      const eventQLConditions = convertQueryToEventQLConditions(
        condition.failIfEventsMatch,
      );
      if (condition.after) {
        eventQLConditions.push(`e.id AS INT > ${condition.after}`);
      }
      if (eventQLConditions.length > 0) {
        eventQLParts.push(`WHERE (${eventQLConditions.join(") AND (")})`);
      }
      eventQLParts.push("PROJECT INTO COUNT() == 0");
      payload.preconditions = [
        {
          type: "isEventQlQueryTrue",
          payload: {
            query: eventQLParts.join(" "),
          },
        },
      ];
    }

    const response = http.post(
      `${baseUri}/api/v1/write-events`,
      JSON.stringify(payload),
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
      },
    );
    if (response.status === 409) {
      return {
        durationInMicroseconds: 0,
        appendConditionFailed: true,
      };
    }
    if (response.status !== 200) {
      throw new Error(
        `Failed to append events: ${response.status} ${response.body}`,
      );
    }
    return {
      durationInMicroseconds: 0,
      appendConditionFailed: false,
    };
  },
};
module.exports = api;
