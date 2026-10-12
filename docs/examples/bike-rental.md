---
icon: material/bicycle
---

# Bike rental example

Many domain objects move through a fixed set of states, and the allowed transitions depend not only on the object itself but on other parts of the system.
This example shows how such a lifecycle is modelled with DCB, and how a transition can be guarded by constraints of _another_ entity without merging the two.

## Challenge

The goal is an application for a bike rental service, with the following hard constraints:

- A bike can only be rented while it is available, not while it is rented or in repair
- A member can rent at most two bikes at a time, and only return bikes they rented
- A bike that is returned damaged goes to repair immediately and cannot be rented again until it was repaired

## Traditional approaches

The bike's state is a classic candidate for an Aggregate. The difficulty is the second constraint, because the `bike rented` Event affects the bike _and_ the member:

- **Bike Aggregate:** Let the bike enforce its lifecycle and check the member's limit against a <dfn title="Representation of data tailored for specific read operations, often denormalized for performance">Read Model</dfn>

    > :material-forward: A member renting two bikes at the same time from different stations can exceed the limit

- **Member Aggregate:** Record rentals in the member's stream

    > :material-forward: Now two members can rent the same bike at the same time, unless the bike's state is duplicated into every member

- **Reservation Pattern:** Reserve the bike, then try to increase the member's rentals, and release the bike again if that fails

    > :material-forward: This works, but requires a <dfn title="Coordinates a sequence of local transactions across multiple services, ensuring data consistency through compensating actions in case of failure">Saga</dfn> and additional Events, and a bike can appear unavailable without being rented

## DCB approach

The bike's lifecycle is one projection over the Events tagged with the bike. The `BikeRented` and `BikeReturned` Events are tagged with the bike _and_ the member, so they also count towards the member's rentals.

### Feature 1: Bike lifecycle

This example only models the bike's lifecycle. The `Bike` entity marks its `status` as the [lifecycle](../notation/index.md#lifecycles), so the DCB Playground draws the state machine: which Event moves a bike to which state, and which conditions guard each move.

```dcb id="bike_rental_01"
model "Bike rental"

tag type BikeId = string
tag type MemberId = string
enum BikeStatus { Unknown, Available, Rented, InRepair }

event BikeAddedToFleet { tag bikeId: BikeId }
event BikeRented { tag bikeId: BikeId, tag memberId: MemberId }
event BikeReturned { tag bikeId: BikeId, tag memberId: MemberId }
event BikeSentToRepair { tag bikeId: BikeId }
event BikeRepaired { tag bikeId: BikeId }

@icon("🚲")
entity Bike (tag bikeId: BikeId) {
  lifecycle status
  status = BikeStatus
}

projection BikeStatus (tag bikeId: BikeId): BikeStatus = Unknown {
  on BikeAddedToFleet => set Available
  on BikeRented => set Rented
  on BikeReturned => set Available
  on BikeSentToRepair => set InRepair
  on BikeRepaired => set Available
}

@feature("Fleet")
command AddBikeToFleet(bikeId: BikeId) {
  alias bike = Bike(bikeId)

  require bike.status == Unknown
    else reject "Bike is already part of the fleet"

  emit BikeAddedToFleet { bikeId }
}

@feature("Fleet")
command SendBikeToRepair(bikeId: BikeId) {
  alias bike = Bike(bikeId)

  require bike.status == Available
    else reject "Bike is not available"

  emit BikeSentToRepair { bikeId }

  scenarios {
    scenario "Send a rented bike to repair" {
      given BikeAddedToFleet { bikeId: "b1" }
      and BikeRented { bikeId: "b1", memberId: "m1" }
      when SendBikeToRepair { bikeId: "b1" }
      then rejected "Bike is not available"
    }
  }
}

@feature("Fleet")
command RepairBike(bikeId: BikeId) {
  alias bike = Bike(bikeId)

  require bike.status == InRepair
    else reject "Bike is not in repair"

  emit BikeRepaired { bikeId }
}

@feature("Rentals")
command RentBike(bikeId: BikeId, memberId: MemberId) {
  alias bike = Bike(bikeId)

  require bike.status == Available
    else reject "Bike is not available"

  emit BikeRented { bikeId, memberId }

  scenarios {
    scenario "Rent an available bike" {
      given BikeAddedToFleet { bikeId: "b1" }
      when RentBike { bikeId: "b1", memberId: "m1" }
      then BikeRented { bikeId: "b1", memberId: "m1" }
    }

    scenario "Rent a bike that is rented" {
      given BikeAddedToFleet { bikeId: "b1" }
      and BikeRented { bikeId: "b1", memberId: "m2" }
      when RentBike { bikeId: "b1", memberId: "m1" }
      then rejected "Bike is not available"
    }

    scenario "Rent a bike that is in repair" {
      given BikeAddedToFleet { bikeId: "b1" }
      and BikeSentToRepair { bikeId: "b1" }
      when RentBike { bikeId: "b1", memberId: "m1" }
      then rejected "Bike is not available"
    }

    scenario "Rent a repaired bike" {
      given BikeAddedToFleet { bikeId: "b1" }
      and BikeSentToRepair { bikeId: "b1" }
      and BikeRepaired { bikeId: "b1" }
      when RentBike { bikeId: "b1", memberId: "m1" }
      then BikeRented { bikeId: "b1", memberId: "m1" }
    }
  }
}

@feature("Rentals")
command ReturnBike(bikeId: BikeId, memberId: MemberId) {
  alias bike = Bike(bikeId)

  require bike.status == Rented
    else reject "Bike is not rented"

  emit BikeReturned { bikeId, memberId }
}
```

!!! note

    The entity is optional, the commands could read the `BikeStatus` projection directly. It is used here because it makes the playground draw the state machine. Entities and lifecycles are [experimental](../notation/index.md#experimental-features) features of the notation.

### Feature 2: Rentals per member

This example extends the previous one, so that a member can rent at most two bikes at a time and only return bikes they rented.

The `MemberActiveRentals` projection counts the rentals of a member: `BikeRented` increments it, `BikeReturned` decrements it. Because both Events carry the member's Tag, the projection reads them across all bikes. `RentBike` now reads the bike _and_ the member, so its consistency boundary covers both, but nothing else: two members renting two different bikes don't affect each other.

```dcb id="bike_rental_02" extends="bike_rental_01"
@icon("🧑")
entity Member (tag memberId: MemberId) {
  activeRentals = MemberActiveRentals
}

projection MemberActiveRentals (tag memberId: MemberId): integer = 0 {
  on BikeRented => increment 1
  on BikeReturned => decrement 1
}

projection BikeRentedByMember (tag bikeId: BikeId, tag memberId: MemberId): boolean = false {
  on BikeRented => set true
  on BikeReturned => set false
}

@feature("Rentals")
command RentBike(bikeId: BikeId, memberId: MemberId) {
  alias bike = Bike(bikeId)
  alias member = Member(memberId)

  require bike.status == Available
    else reject "Bike is not available"
  require member.activeRentals < 2
    else reject "Member already rents two bikes"

  emit BikeRented { bikeId, memberId }

  scenarios {
    scenario "Rent a third bike" {
      given BikeAddedToFleet { bikeId: "b1" }
      and BikeAddedToFleet { bikeId: "b2" }
      and BikeAddedToFleet { bikeId: "b3" }
      and BikeRented { bikeId: "b1", memberId: "m1" }
      and BikeRented { bikeId: "b2", memberId: "m1" }
      when RentBike { bikeId: "b3", memberId: "m1" }
      then rejected "Member already rents two bikes"
    }

    scenario "Rent a bike after returning one" {
      given BikeAddedToFleet { bikeId: "b1" }
      and BikeAddedToFleet { bikeId: "b2" }
      and BikeAddedToFleet { bikeId: "b3" }
      and BikeRented { bikeId: "b1", memberId: "m1" }
      and BikeRented { bikeId: "b2", memberId: "m1" }
      and BikeReturned { bikeId: "b1", memberId: "m1" }
      when RentBike { bikeId: "b3", memberId: "m1" }
      then BikeRented { bikeId: "b3", memberId: "m1" }
    }
  }
}

@feature("Rentals")
command ReturnBike(bikeId: BikeId, memberId: MemberId) {
  alias bike = Bike(bikeId)

  require bike.status == Rented
    else reject "Bike is not rented"
  require BikeRentedByMember(bikeId, memberId) is true
    else reject "Bike is rented by another member"

  emit BikeReturned { bikeId, memberId }

  scenarios {
    scenario "Return a bike rented by another member" {
      given BikeAddedToFleet { bikeId: "b1" }
      and BikeRented { bikeId: "b1", memberId: "m2" }
      when ReturnBike { bikeId: "b1", memberId: "m1" }
      then rejected "Bike is rented by another member"
    }

    scenario "Return a rented bike" {
      given BikeAddedToFleet { bikeId: "b1" }
      and BikeRented { bikeId: "b1", memberId: "m1" }
      when ReturnBike { bikeId: "b1", memberId: "m1" }
      then BikeReturned { bikeId: "b1", memberId: "m1" }
    }
  }
}
```

### Feature 3: Damaged returns

This example extends the previous one, so that a member can report damage when returning a bike. The bike then goes to repair in the same decision.

Instead of a separate command, `ReturnBike` appends a second Event with a [conditional emit](../notation/index.md#conditional-emits): `BikeSentToRepair` is only appended if the bike was reported damaged. Both Events are appended atomically, so there is no moment in which the damaged bike is available for rent.

```dcb id="bike_rental_03" extends="bike_rental_02"
@feature("Rentals")
command ReturnBike(bikeId: BikeId, memberId: MemberId, damaged: boolean) {
  alias bike = Bike(bikeId)

  require bike.status == Rented
    else reject "Bike is not rented"
  require BikeRentedByMember(bikeId, memberId) is true
    else reject "Bike is rented by another member"

  emit BikeReturned { bikeId, memberId }
  emit BikeSentToRepair { bikeId }
    when damaged is true

  scenarios {
    scenario "Return a bike rented by another member" {
      given BikeAddedToFleet { bikeId: "b1" }
      and BikeRented { bikeId: "b1", memberId: "m2" }
      when ReturnBike { bikeId: "b1", memberId: "m1", damaged: false }
      then rejected "Bike is rented by another member"
    }

    scenario "Return a rented bike" {
      given BikeAddedToFleet { bikeId: "b1" }
      and BikeRented { bikeId: "b1", memberId: "m1" }
      when ReturnBike { bikeId: "b1", memberId: "m1", damaged: false }
      then BikeReturned { bikeId: "b1", memberId: "m1" }
    }

    scenario "Return a damaged bike" {
      given BikeAddedToFleet { bikeId: "b1" }
      and BikeRented { bikeId: "b1", memberId: "m1" }
      when ReturnBike { bikeId: "b1", memberId: "m1", damaged: true }
      then BikeReturned { bikeId: "b1", memberId: "m1" }
      and BikeSentToRepair { bikeId: "b1" }
    }
  }
}
```

## Conclusion

This example demonstrates how a lifecycle is modelled as an ordinary projection, and how one Event can take part in the lifecycle of one entity and a constraint of another. The consistency boundary of each command is exactly as wide as the constraints it checks.
