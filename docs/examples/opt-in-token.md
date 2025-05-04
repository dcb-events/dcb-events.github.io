---
icon: material/email-check
---
This example demonstrates how DCB can be leveraged to replace a <dfn title="Representation of data tailored for specific read operations, often denormalized for performance">Read Model</dfn> when implementing a Double opt-in

## Challenge

A Double opt-in process that requires users to confirm their email address before an account is created

## Traditional approaches

- **Stateless:** Store required data and expiration timestamp in an encrypted/signed token

    > :material-forward: This works, but it can lead to very long tokens

- **Persisted token:** The server generates and stores a unique token, tied to the specified email address. When the email address is confirmed, the token is verified and invalidated (e.g., deleted).

    > :material-forward: This method allows the tokens to be short but adds infrastructure overhead and complexity, and may result in stale or unused tokens accumulating over time

## DCB approach

With DCB, a short token (i.e. <dfn title="One-Time Password">OTP</dfn>) can be generated on the server and stored with the data of the initial Event (`SignUpInitiated`).

With that, a dedicated Decision Model can be created that verifies the token. The token is invalidated as soon as the sign up was finalized (`SignUpConfirmed` Event)

### Feature 1: Simple One-Time Password (OTP)

<script type="application/dcb+json">
{
    "meta": {
        "version": "1.0",
        "id": "opt_in_token_01"
    },
    "eventDefinitions": [
        {
            "name": "SignUpInitiated",
            "schema": {
                "type": "object",
                "properties": {
                    "emailAddress": {
                        "type": "string"
                    },
                    "otp": {
                        "type": "string"
                    },
                    "name": {
                        "type": "string"
                    }
                }
            },
            "tagResolvers": [
                "email:{data.emailAddress}",
                "otp:{data.otp}"
            ]
        },
        {
            "name": "SignUpConfirmed",
            "schema": {
                "type": "object",
                "properties": {
                    "emailAddress": {
                        "type": "string"
                    },
                    "otp": {
                        "type": "string"
                    },
                    "name": {
                        "type": "string"
                    }
                }
            },
            "tagResolvers": [
                "email:{data.emailAddress}",
                "otp:{data.otp}"
            ]
        }
    ],
    "commandDefinitions": [
        {
            "name": "confirmSignUp",
            "schema": {
                "type": "object",
                "properties": {
                    "emailAddress": {
                        "type": "string"
                    },
                    "otp": {
                        "type": "string"
                    }
                }
            }
        }
    ],
    "projections": [
        {
            "name": "pendingSignUp",
            "parameterSchema": {
                "type": "object",
                "properties": {
                    "emailAddress": {
                        "type": "string"
                    },
                    "otp": {
                        "type": "string"
                    }
                }
            },
            "stateSchema": {
                "type": "object",
                "properties": {
                    "data": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string"
                            }
                        }
                    },
                    "otpUsed": {
                        "type": "boolean"
                    }
                }
            },
            "handlers": {
                "SignUpInitiated": "({data: event.data, otpUsed: false})",
                "SignUpConfirmed": "({...state, otpUsed: true})"
            },
            "tagFilters": [
                "email:{emailAddress}",
                "otp:{otp}"
            ]
        }
    ],
    "commandHandlerDefinitions": [
        {
            "commandName": "confirmSignUp",
            "decisionModels": [
                {
                    "name": "pendingSignUp",
                    "parameters": [
                        "command.emailAddress",
                        "command.otp"
                    ]
                }
            ],
            "constraintChecks": [
                {
                    "condition": "!state.pendingSignUp",
                    "errorMessage": "No pending sign-up for this OTP / email address"
                },
                {
                    "condition": "state.pendingSignUp.otpUsed",
                    "errorMessage": "OTP was already used"
                }
            ],
            "successEvent": {
                "type": "SignUpConfirmed",
                "data": {
                    "emailAddress": "{command.emailAddress}",
                    "otp": "{command.otp}",
                    "name": "{state.pendingSignUp.data.name}"
                }
            }
        }
    ],
    "testCases": [
        {
            "description": "Confirm SignUp for non-existing OTP",
            "givenEvents": null,
            "whenCommand": {
                "type": "confirmSignUp",
                "data": {
                    "emailAddress": "john.doe@example.com",
                    "otp": "000000"
                }
            },
            "thenExpectedError": "No pending sign-up for this OTP / email address"
        },
        {
            "description": "Confirm SignUp for OTP assigned to different email address",
            "givenEvents": [
                {
                    "type": "SignUpInitiated",
                    "data": {
                        "emailAddress": "john.doe@example.com",
                        "otp": "111111",
                        "name": "John Doe"
                    }
                }
            ],
            "whenCommand": {
                "type": "confirmSignUp",
                "data": {
                    "emailAddress": "jane.doe@example.com",
                    "otp": "111111"
                }
            },
            "thenExpectedError": "No pending sign-up for this OTP / email address"
        },
        {
            "description": "Confirm SignUp for already used OTP",
            "givenEvents": [
                {
                    "type": "SignUpInitiated",
                    "data": {
                        "emailAddress": "john.doe@example.com",
                        "otp": "222222",
                        "name": "John Doe"
                    }
                },
                {
                    "type": "SignUpConfirmed",
                    "data": {
                        "emailAddress": "john.doe@example.com",
                        "otp": "222222",
                        "name": "John Doe"
                    }
                }
            ],
            "whenCommand": {
                "type": "confirmSignUp",
                "data": {
                    "emailAddress": "john.doe@example.com",
                    "otp": "222222"
                }
            },
            "thenExpectedError": "OTP was already used"
        },
        {
            "description": "Confirm SignUp for valid OTP",
            "givenEvents": [
                {
                    "type": "SignUpInitiated",
                    "data": {
                        "emailAddress": "john.doe@example.com",
                        "otp": "444444",
                        "name": "John Doe"
                    }
                }
            ],
            "whenCommand": {
                "type": "confirmSignUp",
                "data": {
                    "emailAddress": "john.doe@example.com",
                    "otp": "444444"
                }
            },
            "thenExpectedEvent": {
                "type": "SignUpConfirmed",
                "data": {
                    "emailAddress": "john.doe@example.com",
                    "otp": "444444",
                    "name": "John Doe"
                }
            }
        }
    ]
}
</script>

### Feature 2: Expiring OTP

A requirement might be to _expire_ tokens after a given time (for example: 60 minutes). The example can be easily adjusted to implement that feature:

!!! note

    The `minutesAgo` property of the Event metadata is a simplification. Typically, a timestamp representing the Event's recording time is stored within the Event's payload or metadata. This timestamp can be compared to the current date to determine the Event's age in the decision model.

<script type="application/dcb+json">
{
    "meta": {
        "version": "1.0",
        "id": "opt_in_token_02",
        "extends": "opt_in_token_01"
    },
    "projections": [
        {
            "name": "pendingSignUp",
            "parameterSchema": {
                "type": "object",
                "properties": {
                    "emailAddress": {
                        "type": "string"
                    },
                    "otp": {
                        "type": "string"
                    }
                }
            },
            "stateSchema": {
                "type": "object",
                "properties": {
                    "data": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string"
                            }
                        }
                    },
                    "otpUsed": {
                        "type": "boolean"
                    },
                    "otpExpired": {
                        "type": "boolean"
                    }
                }
            },
            "handlers": {
                "SignUpInitiated": "({data: event.data, otpUsed: false, otpExpired: event.metadata?.minutesAgo > 60})",
                "SignUpConfirmed": "({...state, otpUsed: true})"
            },
            "tagFilters": [
                "email:{emailAddress}",
                "otp:{otp}"
            ]
        }
    ],
    "commandHandlerDefinitions": [
        {
            "commandName": "confirmSignUp",
            "decisionModels": [
                {
                    "name": "pendingSignUp",
                    "parameters": [
                        "command.emailAddress",
                        "command.otp"
                    ]
                }
            ],
            "constraintChecks": [
                {
                    "condition": "!state.pendingSignUp",
                    "errorMessage": "No pending sign-up for this OTP / email address"
                },
                {
                    "condition": "state.pendingSignUp.otpUsed",
                    "errorMessage": "OTP was already used"
                },
                {
                    "condition": "state.pendingSignUp.otpExpired",
                    "errorMessage": "OTP expired"
                }
            ],
            "successEvent": {
                "type": "SignUpConfirmed",
                "data": {
                    "emailAddress": "{command.emailAddress}",
                    "otp": "{command.otp}",
                    "name": "{state.pendingSignUp.data.name}"
                }
            }
        }
    ],
    "testCases": [
        {
            "description": "Confirm SignUp for expired OTP",
            "givenEvents": [
                {
                    "type": "SignUpInitiated",
                    "data": {
                        "emailAddress": "john.doe@example.com",
                        "otp": "333333",
                        "name": "John Doe"
                    },
                    "metadata": {
                        "minutesAgo": "61"
                    }
                }
            ],
            "whenCommand": {
                "type": "confirmSignUp",
                "data": {
                    "emailAddress": "john.doe@example.com",
                    "otp": "000000"
                }
            },
            "thenExpectedError": "No pending sign-up for this OTP / email address"
        }
    ]
}
</script>

## Conclusion

This example demonstrates, how DCB can be used to implement a simple double opt-in functionality without the need for additional Read Models or Cryptography