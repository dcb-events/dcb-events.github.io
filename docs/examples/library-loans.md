---
icon: material/book-open-variant
---

# Library loans example

Sometimes a command doesn't know up front everything it has to check, because part of it only follows from the state it reads.
This example shows how a decision can read state that depends on other state it read, and still be a single consistency boundary.

## Challenge

The goal is an application for a library, with the following hard constraints:

- A copy of a book can only be lent while it is available, and a member can borrow at most three copies at a time
- A loan can be renewed at most twice, and only while the borrower is not suspended
- A loan can't be renewed while a member has reserved the book

A loan is renewed by scanning the copy, so the renewal only knows the copy. The borrower and the book have to be looked up from the copy before their constraints can be checked.

## Traditional approaches

The renewal affects the copy, but depends on the borrower and the book, which live elsewhere:

- **Copy Aggregate:** Let the copy enforce its loans and check the borrower and the reservations against a <dfn title="Representation of data tailored for specific read operations, often denormalized for performance">Read Model</dfn>

    > :material-forward: A member suspended, or a book reserved, while the loan is renewed doesn't prevent the renewal

- **Larger Aggregate:** Make the copy part of a book Aggregate that also holds the reservations

    > :material-forward: Every loan, return and reservation of a popular book competes for the same stream, and the borrower's suspension is still outside of it

- **Eventual consistency:** Renew the loan and revoke the renewal after the fact if the member was suspended

    > :material-forward: This is of course a potential solution, with or without DCB, but it falls outside the scope of these examples

## DCB approach

The `CopyLent` Event is tagged with the copy _and_ the member, so a projection of the copy can tell its borrower. A command can read that projection first and then use its value as the Tag of another read.

### Feature 1: Lending copies

This example covers lending and returning copies. Both commands read the copy and the member by the command's properties, nothing is chained yet. The `CopyBorrowerId` projection records who borrowed a copy, so that only the borrower can return it.

```dcb id="library_loans_01"
model "Library loans"

tag type CopyId = string
tag type BookId = string
tag type MemberId = string

event CopyAddedToCatalog { tag copyId: CopyId, tag bookId: BookId }
event CopyLent { tag copyId: CopyId, tag memberId: MemberId }
event CopyReturned { tag copyId: CopyId, tag memberId: MemberId }

projection CopyInCatalog (tag copyId: CopyId): boolean = false {
  on CopyAddedToCatalog => set true
}

projection CopyBorrowerId (tag copyId: CopyId): MemberId = null {
  on CopyLent => set event.data.memberId
  on CopyReturned => set null
}

projection MemberLoanCount (tag memberId: MemberId): integer = 0 {
  on CopyLent => increment 1
  on CopyReturned => decrement 1
}

@feature("Catalog")
command AddCopyToCatalog(copyId: CopyId, bookId: BookId) {
  require CopyInCatalog(copyId) is false
    else reject "Copy is already in the catalog"

  emit CopyAddedToCatalog { copyId, bookId }
}

@feature("Loans")
command LendCopy(copyId: CopyId, memberId: MemberId) {
  require CopyInCatalog(copyId) is true
    else reject "Copy is not in the catalog"
  require CopyBorrowerId(copyId) is empty
    else reject "Copy is not available"
  require MemberLoanCount(memberId) < 3
    else reject "Member already borrows three copies"

  emit CopyLent { copyId, memberId }

  scenarios {
    scenario "Lend an available copy" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      when LendCopy { copyId: "c1", memberId: "m1" }
      then CopyLent { copyId: "c1", memberId: "m1" }
    }

    scenario "Lend a copy that is not in the catalog" {
      when LendCopy { copyId: "c1", memberId: "m1" }
      then rejected "Copy is not in the catalog"
    }

    scenario "Lend a copy that is lent" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m2" }
      when LendCopy { copyId: "c1", memberId: "m1" }
      then rejected "Copy is not available"
    }

    scenario "Lend a returned copy" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m2" }
      and CopyReturned { copyId: "c1", memberId: "m2" }
      when LendCopy { copyId: "c1", memberId: "m1" }
      then CopyLent { copyId: "c1", memberId: "m1" }
    }

    scenario "Lend a fourth copy" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyAddedToCatalog { copyId: "c2", bookId: "b2" }
      and CopyAddedToCatalog { copyId: "c3", bookId: "b3" }
      and CopyAddedToCatalog { copyId: "c4", bookId: "b4" }
      and CopyLent { copyId: "c1", memberId: "m1" }
      and CopyLent { copyId: "c2", memberId: "m1" }
      and CopyLent { copyId: "c3", memberId: "m1" }
      when LendCopy { copyId: "c4", memberId: "m1" }
      then rejected "Member already borrows three copies"
    }
  }
}

@feature("Loans")
command ReturnCopy(copyId: CopyId, memberId: MemberId) {
  require CopyBorrowerId(copyId) is not empty
    else reject "Copy is not lent"
  require CopyBorrowerId(copyId) == memberId
    else reject "Copy is lent to another member"

  emit CopyReturned { copyId, memberId }

  scenarios {
    scenario "Return a lent copy" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m1" }
      when ReturnCopy { copyId: "c1", memberId: "m1" }
      then CopyReturned { copyId: "c1", memberId: "m1" }
    }

    scenario "Return a copy that is not lent" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      when ReturnCopy { copyId: "c1", memberId: "m1" }
      then rejected "Copy is not lent"
    }

    scenario "Return a copy lent to another member" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m2" }
      when ReturnCopy { copyId: "c1", memberId: "m1" }
      then rejected "Copy is lent to another member"
    }
  }
}
```

### Feature 2: Renewing loans

This example extends the previous one, so that a loan can be renewed at most twice, and not by a suspended member.

`RenewLoan` only knows the copy. It reads the copy's borrower, and then whether _that_ member is suspended:

```dcb-fragment
alias borrowerId = CopyBorrowerId(copyId)

require MemberIsSuspended(borrowerId) is false
```

The "Consistency boundary" tab shows the Query Items for the copy and for the borrower: if the member is suspended in the meantime, the renewal fails. Other members are not part of the Query, although the command couldn't know up front which member it would read.

```dcb id="library_loans_02" extends="library_loans_01"
event LoanRenewed { tag copyId: CopyId }
event MemberSuspended { tag memberId: MemberId }
event MemberReinstated { tag memberId: MemberId }

projection CopyRenewals (tag copyId: CopyId): integer = 0 {
  on CopyLent => set 0
  on LoanRenewed => increment 1
}

projection MemberIsSuspended (tag memberId: MemberId): boolean = false {
  on MemberSuspended => set true
  on MemberReinstated => set false
}

@feature("Loans")
command RenewLoan(copyId: CopyId) {
  alias borrowerId = CopyBorrowerId(copyId)

  require borrowerId is not empty
    else reject "Copy is not lent"
  require CopyRenewals(copyId) < 2
    else reject "Loan was already renewed twice"
  require MemberIsSuspended(borrowerId) is false
    else reject "Borrower is suspended"

  emit LoanRenewed { copyId }

  scenarios {
    scenario "Renew a loan" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m1" }
      when RenewLoan { copyId: "c1" }
      then LoanRenewed { copyId: "c1" }
    }

    scenario "Renew a copy that is not lent" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      when RenewLoan { copyId: "c1" }
      then rejected "Copy is not lent"
    }

    scenario "Renew a loan a third time" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m1" }
      and LoanRenewed { copyId: "c1" }
      and LoanRenewed { copyId: "c1" }
      when RenewLoan { copyId: "c1" }
      then rejected "Loan was already renewed twice"
    }

    scenario "Renew a loan of a suspended member" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m1" }
      and MemberSuspended { memberId: "m1" }
      when RenewLoan { copyId: "c1" }
      then rejected "Borrower is suspended"
    }

    scenario "Renew a loan while another member is suspended" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m1" }
      and MemberSuspended { memberId: "m2" }
      when RenewLoan { copyId: "c1" }
      then LoanRenewed { copyId: "c1" }
    }

    scenario "Renew a copy that was lent again" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m1" }
      and LoanRenewed { copyId: "c1" }
      and LoanRenewed { copyId: "c1" }
      and CopyReturned { copyId: "c1", memberId: "m1" }
      and CopyLent { copyId: "c1", memberId: "m2" }
      when RenewLoan { copyId: "c1" }
      then LoanRenewed { copyId: "c1" }
    }
  }
}

@feature("Members")
command SuspendMember(memberId: MemberId) {
  require MemberIsSuspended(memberId) is false
    else reject "Member is already suspended"

  emit MemberSuspended { memberId }
}

@feature("Members")
command ReinstateMember(memberId: MemberId) {
  require MemberIsSuspended(memberId) is true
    else reject "Member is not suspended"

  emit MemberReinstated { memberId }
}
```

!!! note

    The Query is built in two steps: the copy's borrower is read first, and decides which member is read. Both end up in the same append condition. If the copy is returned and lent to another member in the meantime, the borrower that was read is no longer the right one, but the Query Item for the copy catches that, too.

### Feature 3: Reservations

This example extends the previous one, so that a loan can't be renewed while a member has reserved the book.

Reservations are made for a book, not for a copy. The copy knows its book from `CopyAddedToCatalog`, so `RenewLoan` reads the book's reservations through the copy, like the borrower:

```dcb id="library_loans_03" extends="library_loans_02"
event BookReserved { tag bookId: BookId, tag memberId: MemberId }
event ReservationCancelled { tag bookId: BookId, tag memberId: MemberId }

projection CopyBookId (tag copyId: CopyId): BookId = null {
  on CopyAddedToCatalog => set event.data.bookId
}

projection BookReservations (tag bookId: BookId): MemberId[] = [] {
  on BookReserved => append event.data.memberId
  on ReservationCancelled => remove event.data.memberId
}

@feature("Loans")
command RenewLoan(copyId: CopyId) {
  alias borrowerId = CopyBorrowerId(copyId)

  require borrowerId is not empty
    else reject "Copy is not lent"
  require CopyRenewals(copyId) < 2
    else reject "Loan was already renewed twice"
  require MemberIsSuspended(borrowerId) is false
    else reject "Borrower is suspended"
  require BookReservations(CopyBookId(copyId)) is empty
    else reject "Book is reserved"

  emit LoanRenewed { copyId }

  scenarios {
    scenario "Renew a loan of a reserved book" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m1" }
      and BookReserved { bookId: "b1", memberId: "m2" }
      when RenewLoan { copyId: "c1" }
      then rejected "Book is reserved"
    }

    scenario "Renew a loan after the reservation was cancelled" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m1" }
      and BookReserved { bookId: "b1", memberId: "m2" }
      and ReservationCancelled { bookId: "b1", memberId: "m2" }
      when RenewLoan { copyId: "c1" }
      then LoanRenewed { copyId: "c1" }
    }

    scenario "Renew a loan while another book is reserved" {
      given CopyAddedToCatalog { copyId: "c1", bookId: "b1" }
      and CopyLent { copyId: "c1", memberId: "m1" }
      and BookReserved { bookId: "b2", memberId: "m2" }
      when RenewLoan { copyId: "c1" }
      then LoanRenewed { copyId: "c1" }
    }
  }
}

@feature("Reservations")
command ReserveBook(bookId: BookId, memberId: MemberId) {
  require BookReservations(bookId) not contains memberId
    else reject "Member already reserved the book"

  emit BookReserved { bookId, memberId }
}

@feature("Reservations")
command CancelReservation(bookId: BookId, memberId: MemberId) {
  require BookReservations(bookId) contains memberId
    else reject "Member has not reserved the book"

  emit ReservationCancelled { bookId, memberId }
}
```

The renewal now reads state of three different things, two of them by a Tag it only learns while deciding: the copy by its own identifier, the borrower and the book by the copy's state. A reservation for another book, or the suspension of another member, does not affect it.

## Conclusion

This example demonstrates how a command can read state whose identifiers follow from other state it read. The Query is as deep as the chain of reads, but still only as wide as the constraints it checks, so the decision needs no denormalized Read Model and no Aggregate that holds the copy, the member and the book together.
