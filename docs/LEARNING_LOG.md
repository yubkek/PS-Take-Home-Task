# Learning log: Angular
## What the project uses

- Standalone components, with no NgModules
- Zoneless change detection, driven by signals
- `httpResource` for reads, which refetches when a signal it reads changes
- Reactive forms for the add-candidate form
- `withComponentInputBinding`, which passes route parameters to component inputs
- Vitest through `ng test`, and `proxy.conf.json` to send `/api` to the server in development

## What I read

- Angular docs on Signals, httpResource, Reactive forms, Dependency injection, Control flow, Zoneless, Routing, Testing HTTP requests.
- I normally use React, so I read them looking for the Angular equivalent of what I already know.
- Claude Code wrote most of the Angular code, and I reviewed it from a React background.

## What confused me

- Testing: tests hung because whenStable() waits for pending HTTP requests, and our tests only flushed those requests afterwards. React tests with MSW answer requests automatically, whereas HttpTestingController needs each one flushed by hand.
- Reactive forms: the form is an object defined in the class and connected to the template, rather than state handled per input. A control's value is also not a signal. Compared to react where you can build the form as you go.
- Dependency injection: in React I would pass shared things down as props or use Context. In Angular a component asks for a shared service with inject() and gets the same instance everywhere. For example, the candidate page triggers the confirm popup through a service without the two components being connected, which was less obvious to follow at first.

## What I'd tell the next engineer

- Unit tests do not run in a real browser, so they can miss things that only break there. Delete did nothing in the browser I tested in, even though the tests passed, so check key flows by hand too.
- Declare forms up front as one object in the class.
- Angular comes with the router, forms, HTTP and dependency injection built in, so there are fewer library choices to make.
- Check a resource for errors before reading its value, because value() throws an error if the request failed, which could break the rendering.
