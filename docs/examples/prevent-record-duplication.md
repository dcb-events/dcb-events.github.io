---
icon: material/cards-playing-club-multiple-outline
---
In distributed systems, especially in web APIs handling financial or state-changing operations, ensuring idempotency is essential. Clients may retry requests due to network issues or timeouts, and without proper safeguards, this can result in duplicate processing.

## Challenge

We want to guarantee that a particular operation (e.g., a payment request or form submission) is only processed **once**, even if the request is **repeated**. This requires that the backend detects duplicates and ignores repeated executions.

Key difficulties include:

- Generating a unique key reliably on the frontend
- Storing and enforcing uniqueness constraints server-side
- Ensuring statelessness in APIs while maintaining safety

## Traditional approaches

Traditionally, the frontend prevents accidental re-submissions, e.g. by disabling a form upon submit.
This makes a lot of sense of course. But it is not waterproof and sometimes not an option (for HTTP APIs for example).

To prevent double submissions on the server-side, several strategies can be used:

- **Client-generated identifier:** The frontend generates some UUID (or another unique key) to serve as the identifier for the entity being created. The backend then rejects the request if the corresponding Event stream already contains Events

    > :material-forward: While effective, this approach gives the client control over domain entity identifiers, which can introduce potential security risks

- **Pre-issued server token:** The server generates and stores a unique token _before_ the form is rendered. When the form is submitted, the token is verified and invalidated (e.g., deleted).
    
    > :material-forward: This method is reliable but adds infrastructure overhead and complexity, and may result in stale or unused tokens accumulating over time

## DCB approach

With DCB, a random `idempotency token` can be safely generated on the client side and included in the command. When the corresponding Event is persisted, the token is stored alongside the server-generated entity identifier.

With that, a Decision Model can be created that is responsible for validating the uniqueness of the token within the context of that operation — ensuring that the same token cannot be used more than once. This allows the server to enforce idempotency without exposing domain identifiers to the client or requiring additional infrastructure for token tracking:

<script type="application/dcb+json">
{
    "meta": {
        "version": "1.0"
    },
    "eventDefinitions": [
        {
            "name": "OrderPlaced",
            "schema": {
                "type": "object",
                "properties": {
                    "orderId": {
                        "type": "string"
                    },
                    "idempotencyToken": {
                        "type": "string"
                    }
                }
            },
            "tagResolvers": [
                "order:{data.orderId}",
                "idempotency:{data.idempotencyToken}"
            ]
        }
    ],
    "commandDefinitions": [
        {
            "name": "placeOrder",
            "schema": {
                "type": "object",
                "properties": {
                    "orderId": {
                        "type": "string"
                    },
                    "idempotencyToken": {
                        "type": "string"
                    }
                }
            }
        }
    ],
    "projections": [
        {
            "name": "idempotencyTokenWasUsed",
            "parameterSchema": {
                "type": "object",
                "properties": {
                    "idempotencyToken": {
                        "type": "string"
                    }
                }
            },
            "stateSchema": {
                "type": "boolean",
                "default": false
            },
            "handlers": {
                "OrderPlaced": "true"
            },
            "tagFilters": [
                "idempotency:{idempotencyToken}"
            ]
        }
    ],
    "commandHandlerDefinitions": [
        {
            "commandName": "placeOrder",
            "decisionModels": [
                {
                    "name": "idempotencyTokenWasUsed",
                    "parameters": [
                        "command.idempotencyToken"
                    ]
                }
            ],
            "constraintChecks": [
                {
                    "condition": "state.idempotencyTokenWasUsed",
                    "errorMessage": "Re-submission"
                }
            ],
            "successEvent": {
                "type": "OrderPlaced",
                "data": {
                    "orderId": "{command.orderId}",
                    "idempotencyToken": "{command.idempotencyToken}"
                }
            }
        }
    ],
    "testCases": [
        {
            "description": "Place order with previously used idempotency token",
            "givenEvents": [
                {
                    "type": "OrderPlaced",
                    "data": {
                        "orderId": "o12345",
                        "idempotencyToken": "11111"
                    }
                }
            ],
            "whenCommand": {
                "type": "placeOrder",
                "data": {
                    "orderId": "o54321",
                    "idempotencyToken": "11111"
                }
            },
            "thenExpectedError": "Re-submission"
        },
        {
            "description": "Place order with new idempotency token",
            "givenEvents": [
                {
                    "type": "OrderPlaced",
                    "data": {
                        "orderId": "o12345",
                        "idempotencyToken": "11111"
                    }
                }
            ],
            "whenCommand": {
                "type": "placeOrder",
                "data": {
                    "orderId": "o54321",
                    "idempotencyToken": "22222"
                }
            },
            "thenExpectedEvent": {
                "type": "OrderPlaced",
                "data": {
                    "orderId": "o54321",
                    "idempotencyToken": "22222"
                }
            }
        }
    ]
}
</script>

Of course, the example can be extended to also ensure uniqueness of the  `orderId` and/or to allow a token to be reused once the order was placed.

## Conclusion

This example demonstrates, how DCB allows to enforce constraints that are not directly related to the domain.

**Note:** This example is about preventing _accidental_ re-submissions. The [Opt-In Token example](opt-in-token.md) demonstrates how to prevent _fraudulent_ manipulation.