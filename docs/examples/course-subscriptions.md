# Course subscription example

The following example showcases the imagined application from Sara Pellegrini's blog post "Killing the Aggregate" [:octicons-link-external-16:](https://sara.event-thinking.io/2023/04/kill-aggregate-chapter-1-I-am-here-to-kill-the-aggregate.html){:target="_blank" .small}

## Challenge

The goal is an application that allows students to subscribe to courses, with the following hard constraints:

- A course cannot accept more than N students
- N, the course capacity, can change at any time to any positive integer different from the current one
- The course title can change at any time to any title different from the current one
- The student cannot join more than 10 courses

## Traditional approaches

The first and last constraints, in particular, make this example difficult to implement using traditional Event Sourcing, as they cause the `student subscribed to course` Event to impact two separate entities, each with its own constraints.

There are several potential strategies to solve this without DCB:

- **Eventual consistency:** Turn one of the invariants into a *soft constraint*, i.e. use the <dfn title="Representation of data tailored for specific read operations, often denormalized for performance">Read Model</dfn> for verification and accept the fact that there might be overbooked courses and/or students with more than 10 subscriptions

    > :material-forward: This is of course a potential solution, with or without DCB, but it falls outside the scope of these examples

- **Larger Aggregate:** Create an Aggregate that spans course and student subscriptions

    > :material-forward: This is not a viable solution because it leads to huge Aggregates and restricts parallel bookings

- **Reservation Pattern:** Create an Aggregate for each, courses and students, enforcing their constraints and use a <dfn title="Coordinates a sequence of local transactions across multiple services, ensuring data consistency through compensating actions in case of failure">Saga</dfn> to coordinate them

    > :material-forward: This works, but it leads to a lot of complexity and potentially invalid states for a period of time

## DCB approach

With DCB the challenge can be solved simply by adding a [Tag](../specification.md#tag) for each, the affected course *and* student to the `student subscribed to course`:

![course subscriptions example](img/course-subscriptions-01.png)

### Feature 1: Register courses

The first implementation just allows to specify new courses and make sure that they have a unique id:

<script type="application/dcb+json">
{
    "meta": {
        "version": "1.0",
        "id": "course_subscription_01"
    },
    "eventDefinitions": [
        {
            "name": "CourseDefined",
            "schema": {
                "type": "object",
                "properties": {
                    "courseId": {
                        "type": "string"
                    },
                    "capacity": {
                        "type": "number"
                    }
                }
            },
            "tagResolvers": [
                "course:{data.courseId}"
            ]
        }
    ],
    "commandDefinitions": [
        {
            "name": "defineCourse",
            "schema": {
                "type": "object",
                "properties": {
                    "courseId": {
                        "type": "string"
                    },
                    "capacity": {
                        "type": "number"
                    }
                }
            }
        }
    ],
    "projections": [
        {
            "name": "courseExists",
            "parameterSchema": {
                "type": "object",
                "properties": {
                    "courseId": {
                        "type": "string"
                    }
                }
            },
            "stateSchema": {
                "type": "boolean",
                "default": false
            },
            "handlers": {
                "CourseDefined": "true"
            },
            "tagFilters": [
                "course:{courseId}"
            ]
        }
    ],
    "commandHandlerDefinitions": [
        {
            "commandName": "defineCourse",
            "decisionModels": [
                {
                    "name": "courseExists",
                    "parameters": [
                        "command.courseId"
                    ]
                }
            ],
            "constraintChecks": [
                {
                    "condition": "state.courseExists",
                    "errorMessage": "Course with id \"{command.courseId}\" already exists"
                }
            ],
            "successEvent": {
                "type": "CourseDefined",
                "data": {
                    "courseId": "{command.courseId}",
                    "capacity": "{command.capacity}"
                }
            }
        }
    ],
    "testCases": [
        {
            "description": "Define course with existing id",
            "givenEvents": [
                {
                    "type": "CourseDefined",
                    "data": {
                        "courseId": "c1",
                        "capacity": 10
                    }
                }
            ],
            "whenCommand": {
                "type": "defineCourse",
                "data": {
                    "courseId": "c1",
                    "capacity": 15
                }
            },
            "thenExpectedError": "Course with id \"c1\" already exists"
        },
        {
            "description": "Define course with new id",
            "givenEvents": null,
            "whenCommand": {
                "type": "defineCourse",
                "data": {
                    "courseId": "c1",
                    "capacity": 15
                }
            },
            "thenExpectedEvent": {
                "type": "CourseDefined",
                "data": {
                    "courseId": "c1",
                    "capacity": 15
                }
            }
        }
    ]
}
</script>

### Feature 2: Change course capacity

The second implementation extends the first by a `changeCourseCapacity` command that allows to change the maximum number of seats for a given course:

<script type="application/dcb+json">
{
    "meta": {
        "version": "1.0",
        "id": "course_subscription_02",
        "extends": "course_subscription_01"
    },
    "eventDefinitions": [
        {
            "name": "CourseCapacityChanged",
            "schema": {
                "type": "object",
                "properties": {
                    "courseId": {
                        "type": "string"
                    },
                    "newCapacity": {
                        "type": "number"
                    }
                }
            },
            "tagResolvers": [
                "course:{data.courseId}"
            ]
        }
    ],
    "commandDefinitions": [
        {
            "name": "changeCourseCapacity",
            "schema": {
                "type": "object",
                "properties": {
                    "studentId": {
                        "type": "string"
                    },
                    "newCapacity": {
                        "type": "number"
                    }
                }
            }
        }
    ],
    "projections": [
        {
            "name": "courseCapacity",
            "parameterSchema": {
                "type": "object",
                "properties": {
                    "courseId": {
                        "type": "string"
                    }
                }
            },
            "stateSchema": {
                "type": "number",
                "default": 0
            },
            "handlers": {
                "CourseDefined": "event.data.capacity",
                "CourseCapacityChanged": "event.data.newCapacity"
            },
            "tagFilters": [
                "course:{courseId}"
            ]
        }
    ],
    "commandHandlerDefinitions": [
        {
            "commandName": "changeCourseCapacity",
            "decisionModels": [
                {
                    "name": "courseExists",
                    "parameters": [
                        "command.courseId"
                    ]
                },
                {
                    "name": "courseCapacity",
                    "parameters": [
                        "command.courseId"
                    ]
                }
            ],
            "constraintChecks": [
                {
                    "condition": "!state.courseExists",
                    "errorMessage": "Course \"{command.courseId}\" does not exist"
                },
                {
                    "condition": "state.courseCapacity === command.newCapacity",
                    "errorMessage": "New capacity {command.newCapacity} is the same as the current capacity"
                }
            ],
            "successEvent": {
                "type": "CourseCapacityChanged",
                "data": {
                    "courseId": "{command.courseId}",
                    "newCapacity": "{command.newCapacity}"
                }
            }
        }
    ],
    "testCases": [
        {
            "description": "Change capacity of a non-existing course",
            "givenEvents": null,
            "whenCommand": {
                "type": "changeCourseCapacity",
                "data": {
                    "courseId": "c0",
                    "newCapacity": 15
                }
            },
            "thenExpectedError": "Course \"c0\" does not exist"
        },
        {
            "description": "Change capacity of a course to a new value",
            "givenEvents": [
                {
                    "type": "CourseDefined",
                    "data": {
                        "courseId": "c1",
                        "capacity": 12
                    }
                }
            ],
            "whenCommand": {
                "type": "changeCourseCapacity",
                "data": {
                    "courseId": "c1",
                    "newCapacity": 15
                }
            },
            "thenExpectedEvent": {
                "type": "CourseCapacityChanged",
                "data": {
                    "courseId": "c1",
                    "newCapacity": 15
                }
            }
        }
    ]
}
</script>

### Feature 3: Subscribe student to course

The last implementation contains the core example that requires constraint checks across multiple entities, adding a `subscribeStudentToCourse` command with a corresponding handler that checks...

- ...whether the course with the specified id exists
- ...whether the specified course still has available seats
- ...whether the student with the specified id is not yet subscribed to given course
- ...whether the student is not subscribed to more than 5 courses already

<script type="application/dcb+json">
{
    "meta": {
        "version": "1.0",
        "id": "course_subscription_03",
        "extends": "course_subscription_02"
    },
    "eventDefinitions": [
        {
            "name": "StudentSubscribedToCourse",
            "schema": {
                "type": "object",
                "properties": {
                    "studentId": {
                        "type": "string"
                    },
                    "courseId": {
                        "type": "string"
                    }
                }
            },
            "tagResolvers": [
                "student:{data.studentId}",
                "course:{data.courseId}"
            ]
        }
    ],
    "commandDefinitions": [
        {
            "name": "subscribeStudentToCourse",
            "schema": {
                "type": "object",
                "properties": {
                    "studentId": {
                        "type": "string"
                    },
                    "courseId": {
                        "type": "string"
                    }
                }
            }
        }
    ],
    "projections": [
        {
            "name": "studentAlreadySubscribed",
            "parameterSchema": {
                "type": "object",
                "properties": {
                    "studentId": {
                        "type": "string"
                    },
                    "courseId": {
                        "type": "string"
                    }
                }
            },
            "stateSchema": {
                "type": "boolean",
                "default": false
            },
            "handlers": {
                "StudentSubscribedToCourse": "true"
            },
            "tagFilters": [
                "student:{studentId}",
                "course:{courseId}"
            ]
        },
        {
            "name": "numberOfCourseSubscriptions",
            "parameterSchema": {
                "type": "object",
                "properties": {
                    "courseId": {
                        "type": "string"
                    }
                }
            },
            "stateSchema": {
                "type": "number",
                "default": 0
            },
            "handlers": {
                "StudentSubscribedToCourse": "state + 1"
            },
            "tagFilters": [
                "course:{courseId}"
            ]
        },
        {
            "name": "numberOfStudentSubscriptions",
            "parameterSchema": {
                "type": "object",
                "properties": {
                    "studentId": {
                        "type": "string"
                    }
                }
            },
            "stateSchema": {
                "type": "number",
                "default": 0
            },
            "handlers": {
                "StudentSubscribedToCourse": "state + 1"
            },
            "tagFilters": [
                "student:{studentId}"
            ]
        }
    ],
    "commandHandlerDefinitions": [
        {
            "commandName": "subscribeStudentToCourse",
            "decisionModels": [
                {
                    "name": "courseExists",
                    "parameters": [
                        "command.courseId"
                    ]
                },
                {
                    "name": "courseCapacity",
                    "parameters": [
                        "command.courseId"
                    ]
                },
                {
                    "name": "numberOfCourseSubscriptions",
                    "parameters": [
                        "command.courseId"
                    ]
                },
                {
                    "name": "numberOfStudentSubscriptions",
                    "parameters": [
                        "command.studentId"
                    ]
                },
                {
                    "name": "studentAlreadySubscribed",
                    "parameters": [
                        "command.studentId",
                        "command.courseId"
                    ]
                }
            ],
            "constraintChecks": [
                {
                    "condition": "!state.courseExists",
                    "errorMessage": "Course \"{command.courseId}\" does not exist"
                },
                {
                    "condition": "state.numberOfCourseSubscriptions >= state.courseCapacity",
                    "errorMessage": "Course \"{command.courseId}\" is already fully booked"
                },
                {
                    "condition": "state.studentAlreadySubscribed",
                    "errorMessage": "Student already subscribed to this course"
                },
                {
                    "condition": "state.numberOfStudentSubscriptions >= 5",
                    "errorMessage": "Student already subscribed to 5 courses"
                }
            ],
            "successEvent": {
                "type": "StudentSubscribedToCourse",
                "data": {
                    "studentId": "{command.studentId}",
                    "courseId": "{command.courseId}"
                }
            }
        }
    ],
    "testCases": [
        {
            "description": "Subscribe student to non-existing course",
            "givenEvents": null,
            "whenCommand": {
                "type": "subscribeStudentToCourse",
                "data": {
                    "studentId": "s1",
                    "courseId": "c0"
                }
            },
            "thenExpectedError": "Course \"c0\" does not exist"
        },
        {
            "description": "Subscribe student to fully booked course",
            "givenEvents": [
                {
                    "type": "CourseDefined",
                    "data": {
                        "courseId": "c1",
                        "capacity": 3
                    }
                },
                {
                    "type": "StudentSubscribedToCourse",
                    "data": {
                        "studentId": "s1",
                        "courseId": "c1"
                    }
                },
                {
                    "type": "StudentSubscribedToCourse",
                    "data": {
                        "studentId": "s2",
                        "courseId": "c1"
                    }
                },
                {
                    "type": "StudentSubscribedToCourse",
                    "data": {
                        "studentId": "s3",
                        "courseId": "c1"
                    }
                }
            ],
            "whenCommand": {
                "type": "subscribeStudentToCourse",
                "data": {
                    "studentId": "s4",
                    "courseId": "c1"
                }
            },
            "thenExpectedError": "Course \"c1\" is already fully booked"
        },
        {
            "description": "Subscribe student to the same course twice",
            "givenEvents": [
                {
                    "type": "CourseDefined",
                    "data": {
                        "courseId": "c1",
                        "capacity": 10
                    }
                },
                {
                    "type": "StudentSubscribedToCourse",
                    "data": {
                        "studentId": "s1",
                        "courseId": "c1"
                    }
                }
            ],
            "whenCommand": {
                "type": "subscribeStudentToCourse",
                "data": {
                    "studentId": "s1",
                    "courseId": "c1"
                }
            },
            "thenExpectedError": "Student already subscribed to this course"
        },
        {
            "description": "Subscribe student to more than 5 courses",
            "givenEvents": [
                {
                    "type": "CourseDefined",
                    "data": {
                        "courseId": "c6",
                        "capacity": 10
                    }
                },
                {
                    "type": "StudentSubscribedToCourse",
                    "data": {
                        "studentId": "s1",
                        "courseId": "c1"
                    }
                },
                {
                    "type": "StudentSubscribedToCourse",
                    "data": {
                        "studentId": "s1",
                        "courseId": "c2"
                    }
                },
                {
                    "type": "StudentSubscribedToCourse",
                    "data": {
                        "studentId": "s1",
                        "courseId": "c3"
                    }
                },
                {
                    "type": "StudentSubscribedToCourse",
                    "data": {
                        "studentId": "s1",
                        "courseId": "c4"
                    }
                },
                {
                    "type": "StudentSubscribedToCourse",
                    "data": {
                        "studentId": "s1",
                        "courseId": "c5"
                    }
                }
            ],
            "whenCommand": {
                "type": "subscribeStudentToCourse",
                "data": {
                    "studentId": "s1",
                    "courseId": "c6"
                }
            },
            "thenExpectedError": "Student already subscribed to 5 courses"
        },
        {
            "description": "Subscribe student to course with capacity",
            "givenEvents": [
                {
                    "type": "CourseDefined",
                    "data": {
                        "courseId": "c1",
                        "capacity": 10
                    }
                }
            ],
            "whenCommand": {
                "type": "subscribeStudentToCourse",
                "data": {
                    "studentId": "s1",
                    "courseId": "c1"
                }
            },
            "thenExpectedEvent": {
                "type": "StudentSubscribedToCourse",
                "data": {
                    "studentId": "s1",
                    "courseId": "c1"
                }
            }
        }
    ]
}
</script>

### Other implementations

There is a working `JavaScript/TypeScript`[:octicons-link-external-16:](https://github.com/sennentech/dcb-event-sourced/tree/main/examples/course-manager-cli){:target="_blank" .small} and `PHP`[:octicons-link-external-16:](https://github.com/bwaidelich/dcb-example-courses){:target="_blank" .small} implementation of this example

## Conclusion

The course subscription example demonstrates a typical requirement to enforce consistency that affects multiple entities that are not part of the same Aggregate. This document demonstrates how easy it is to achieve that with DCB