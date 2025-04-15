

## Challenge




## Traditional approaches



## DCB approach

<script type="application/dcb+json">
{
  "eventDefinitions": [
    {
      "name": "OrderPlaced",
      "schema": {
        "type": "object",
        "properties": {
          "orderId": {
            "type": "string"
          },
          "idempotencyKey": {
            "type": "string"
          }
        }
      },
      "tagResolvers": [
        "order:{data.orderId}",
        "idempotency:{data.idempotencyKey}"
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
          "idempotencyKey": {
            "type": "string"
          }
        }
      }
    }
  ],
  "projections": [
    {
      "name": "idempotencyKeyWasUsed",
      "parameterSchema": {
        "type": "object",
        "properties": {
          "idempotencyKey": {
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
        "idempotency:{idempotencyKey}"
      ]
    }
  ],
  "commandHandlerDefinitions": [
    {
      "commandName": "placeOrder",
      "decisionModels": [
        {
          "name": "idempotencyKeyWasUsed",
          "parameters": [
            "command.idempotencyKey"
          ]
        }
      ],
      "constraintChecks": [
        {
          "condition": "state.idempotencyKeyWasUsed",
          "errorMessage": "Re-submission"
        }
      ],
      "successEvent": {
        "type": "OrderPlaced",
        "data": {
          "orderId": "{command.orderId}",
          "idempotencyKey": "{command.idempotencyKey}"
        }
      }
    }
  ],
  "testCases": [
    {
      "description": "Place order with previously used idempotency key",
      "givenEvents": [
        {
          "type": "OrderPlaced",
          "data": {
            "orderId": "o12345",
            "idempotencyKey": "11111"
          }
        }
      ],
      "whenCommand": {
        "type": "placeOrder",
        "data": {
          "orderId": "o54321",
          "idempotencyKey": "11111"
        }
      },
      "thenExpectedError": "Re-submission"
    },
    {
      "description": "Place order with new idempotency key",
      "givenEvents": [
        {
          "type": "OrderPlaced",
          "data": {
            "orderId": "o12345",
            "idempotencyKey": "11111"
          }
        }
      ],
      "whenCommand": {
        "type": "placeOrder",
        "data": {
          "orderId": "o54321",
          "idempotencyKey": "22222"
        }
      },
      "thenExpectedEvent": {
        "type": "OrderPlaced",
        "data": {
          "orderId": "o54321",
          "idempotencyKey": "22222"
        }
      }
    }
  ]
}
</script>

## Conclusion