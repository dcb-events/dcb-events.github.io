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

```dcb id="opt_in_token_01"
model "Opt-in token"

tag type EmailAddress = string
tag type Otp = string

event SignUpInitiated { tag emailAddress: EmailAddress, tag otp: Otp, name: string }
event SignUpConfirmed { tag emailAddress: EmailAddress, tag otp: Otp, name: string }

projection SignUpPending (tag emailAddress: EmailAddress, tag otp: Otp): boolean = false {
  on SignUpInitiated => set true
}

projection SignUpName (tag emailAddress: EmailAddress, tag otp: Otp): string = null {
  on SignUpInitiated => set event.data.name
}

projection OtpUsed (tag emailAddress: EmailAddress, tag otp: Otp): boolean = false {
  on SignUpConfirmed => set true
}

handler ConfirmSignUp(emailAddress: EmailAddress, otp: Otp) {
  alias pending = SignUpPending(emailAddress, otp)
  alias used = OtpUsed(emailAddress, otp)
  alias name = SignUpName(emailAddress, otp)

  require pending is true
    else reject "No sign-up is pending for this code"
  require used is false
    else reject "Code was already used"

  emit SignUpConfirmed { emailAddress, otp, name }

  scenarios {
    scenario "Confirm SignUp for non-existing OTP" {
      when ConfirmSignUp { emailAddress: "john.doe@example.com", otp: "000000" }
      then rejected "No sign-up is pending for this code"
    }

    scenario "Confirm SignUp for OTP assigned to different email address" {
      given SignUpInitiated { emailAddress: "john.doe@example.com", otp: "111111", name: "John Doe" }
      when ConfirmSignUp { emailAddress: "jane.doe@example.com", otp: "111111" }
      then rejected "No sign-up is pending for this code"
    }

    scenario "Confirm SignUp for already used OTP" {
      given SignUpInitiated { emailAddress: "john.doe@example.com", otp: "222222", name: "John Doe" }
      given SignUpConfirmed { emailAddress: "john.doe@example.com", otp: "222222", name: "John Doe" }
      when ConfirmSignUp { emailAddress: "john.doe@example.com", otp: "222222" }
      then rejected "Code was already used"
    }

    scenario "Confirm SignUp for valid OTP" {
      given SignUpInitiated { emailAddress: "john.doe@example.com", otp: "444444", name: "John Doe" }
      when ConfirmSignUp { emailAddress: "john.doe@example.com", otp: "444444" }
      then SignUpConfirmed { emailAddress: "john.doe@example.com", otp: "444444", name: "John Doe" }
    }
  }
}
```

### Feature 2: Expiring OTP

A requirement might be to _expire_ tokens after a given time (for example: 60 minutes). The example can be easily adjusted to implement that feature:

!!! note

    The notation has no clock, so time is data: `SignUpInitiated` stores when the OTP expires (`expiresAt`), and the current time is passed to `ConfirmSignUp` as `now`. For simplicity, both are plain numbers of minutes. Typically, they are timestamps, with `expiresAt` calculated from the time the sign-up was initiated.

```dcb id="opt_in_token_02" extends="opt_in_token_01"
model "Opt-in token (expiring)"

type Minute = integer

event SignUpInitiated { tag emailAddress: EmailAddress, tag otp: Otp, name: string, expiresAt: Minute }

projection OtpExpiresAt (tag emailAddress: EmailAddress, tag otp: Otp): Minute = 0 {
  on SignUpInitiated => set event.data.expiresAt
}

handler ConfirmSignUp(emailAddress: EmailAddress, otp: Otp, now: Minute) {
  alias pending = SignUpPending(emailAddress, otp)
  alias used = OtpUsed(emailAddress, otp)
  alias expiresAt = OtpExpiresAt(emailAddress, otp)
  alias name = SignUpName(emailAddress, otp)

  require pending is true
    else reject "No sign-up is pending for this code"
  require used is false
    else reject "Code was already used"
  require expiresAt > now
    else reject "Code has expired"

  emit SignUpConfirmed { emailAddress, otp, name }

  scenarios {
    scenario "Confirm SignUp for non-existing OTP" {
      when ConfirmSignUp { emailAddress: "john.doe@example.com", otp: "000000", now: 100 }
      then rejected "No sign-up is pending for this code"
    }

    scenario "Confirm SignUp for OTP assigned to different email address" {
      given SignUpInitiated { emailAddress: "john.doe@example.com", otp: "111111", name: "John Doe", expiresAt: 160 }
      when ConfirmSignUp { emailAddress: "jane.doe@example.com", otp: "111111", now: 100 }
      then rejected "No sign-up is pending for this code"
    }

    scenario "Confirm SignUp for already used OTP" {
      given SignUpInitiated { emailAddress: "john.doe@example.com", otp: "222222", name: "John Doe", expiresAt: 160 }
      given SignUpConfirmed { emailAddress: "john.doe@example.com", otp: "222222", name: "John Doe" }
      when ConfirmSignUp { emailAddress: "john.doe@example.com", otp: "222222", now: 100 }
      then rejected "Code was already used"
    }

    scenario "Confirm SignUp for expired OTP" {
      given SignUpInitiated { emailAddress: "john.doe@example.com", otp: "333333", name: "John Doe", expiresAt: 99 }
      when ConfirmSignUp { emailAddress: "john.doe@example.com", otp: "333333", now: 100 }
      then rejected "Code has expired"
    }

    scenario "Confirm SignUp for valid OTP" {
      given SignUpInitiated { emailAddress: "john.doe@example.com", otp: "444444", name: "John Doe", expiresAt: 160 }
      when ConfirmSignUp { emailAddress: "john.doe@example.com", otp: "444444", now: 100 }
      then SignUpConfirmed { emailAddress: "john.doe@example.com", otp: "444444", name: "John Doe" }
    }
  }
}
```

## Conclusion

This example demonstrates, how DCB can be used to implement a simple double opt-in functionality without the need for additional Read Models or Cryptography