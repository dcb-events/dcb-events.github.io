# dcb.events

This is the repository for the website https://dcb.events

Feel free to create [Pull Requests](https://github.com/dcb-events/dcb-events.github.io/pulls) if you want to improve the content or suggest additions. And please [get in touch](https://dcb.events/about/#contact-us) if you have any feedback, we really appreciate it!

## Local preview

```shell
git submodule update --init   # the DCB Playground, published at /playground/
python3 -m venv venv && source venv/bin/activate
pip install mkdocs-material mkdocs-glightbox
PYTHONPATH=. mkdocs serve
```

Rendering the examples requires [Node.js](https://nodejs.org/).

## Examples

Examples are written in the notation of the [DCB Playground](https://github.com/dcb-events/dcb-playground) as fenced `dcb` blocks:

````markdown
```dcb id="course_subscription_02" extends="course_subscription_01"
command ChangeCourseCapacity(courseId: CourseId, newCapacity: integer) {
  ...
}
```
````

A block with `extends` only contains the definitions it adds or replaces (and can drop some with `removes="command OrderProduct, event ProductOrdered"`). The scenarios of a replaced command or projection are inherited unless restated under the same name, so a block only lists its new or changed scenarios. A block is rendered as the complete model with the changed lines highlighted, next to the consistency boundary of each command and a link that opens the model in the playground.
The build fails if an example cannot be parsed or one of its scenarios does not hold (see `scripts/dcb-render/render.js`).

Declaring a definition again that is also listed in `removes` replaces it entirely, without inheriting its scenarios. A block with `hidden="true"` is checked but not shown, for instance to excerpt from it:

````markdown
```dcb excerpt="course_subscription_03" show="projection CourseCapacity, command ChangeCourseCapacity"
```
````

An excerpt shows the named definitions exactly as the model has them. A ` ```dcb-fragment ` block only highlights its text, for syntax that is no complete definition.

The notation is explained in `docs/notation/`. Examples on those pages open the playground in its code view and get no link to the notation.
