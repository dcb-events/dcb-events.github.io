*tbd*

```js
// helper function to generate dates X minutes ago
const minutesAgo = (minutes) => new Date(new Date().getTime() - minutes * (1000 * 60))

// event fixture
const events = [
  {
    type: "SIGNUP_INITIATED",
    data: { username: "john.doe", otp: "111111" },
    tags: ["username:john.doe", "otp:111111"],
    recordedAt: minutesAgo(20),
  },
  {
    type: "SIGNUP_INITIATED",
    data: { username: "jane.doe", otp: "222222" },
    tags: ["username:jane.doe", "otp:222222"],
    recordedAt: minutesAgo(15),
  },
  {
    type: "SIGNUP_INITIATED",
    data: { username: "richard.roe", otp: "333333" },
    tags: ["username:richard.roe", "otp:333333"],
    recordedAt: minutesAgo(10),
  },
  {
    type: "SIGNUP_CONFIRMED",
    data: { username: "jane.doe", otp: "222222" },
    tags: ["username:jane.doe", "otp:222222"],
    recordedAt: minutesAgo(5),
  },
]

/**
 * the in-memory decision model (aka aggregate)
 *
 * @param {string} otp
 * @returns {Object{username: string, otpExpired: bool} | null}
 */
const pendingSignUp = (otp) => {
  const otpLifeTimeInMinutes = 15
  const projection = {
    $init: () => null,
    SIGNUP_INITIATED: (state, event) => ({
      username: event.data.username,
      otpExpired: (new Date() - event.recordedAt) / (1000 * 60) > otpLifeTimeInMinutes,
    }),
    SIGNUP_CONFIRMED: (state, event) => ({ ...state, otpUsed: true }),
  }
  return events
    .filter((event) => event.tags.includes(`otp:${otp}`))
    .reduce(
      (state, event) => projection[event.type]?.(state, event) ?? state,
      projection.$init?.()
    )
}

/**
 * the "command handler"
 *
 * @param {string} otp
 */
const confirmSignUp = (otp) => {
  const decisionModel = pendingSignUp(otp)
  if (decisionModel === null) {
    throw new Error("no pending sign-up for this OTP")
  }
  if (decisionModel.otpExpired) {
    throw new Error("OTP expired")
  }
  if (decisionModel.otpUsed) {
    throw new Error("OTP was used already")
  }

  // success -> decisionModel.username contains username of pending sign-up...
}

// example commands
for (const otp of ["000000", "111111", "222222", "333333"]) {
  try {
    confirmSignUp(otp)
    console.log(`confirm signUp with OTP ${otp} succeeded`)
  } catch (e) {
    console.error(`confirm signUp with OTP ${otp} failed: ${e.message}`)
  }
}
```

<codapi-snippet engine="browser" sandbox="javascript" editor="basic"></codapi-snippet>
