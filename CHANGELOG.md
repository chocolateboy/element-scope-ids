## 0.1.0 - 2019-01-10

- **Breaking changes**
  - remove the `scope` option
  - remove the `prefix` option
  - rename `idrefs` -> `idAttrs`
  - rename `include` (default: true) -> `exclude` (default: false)

- `exclude` can now return a string as its truthy value, representing
  the replacement name for the ID (e.g. for globals)
- remove `require`s from the ESM build
- shrink the event-emitter dependency
- build: migrate from rollup -> microbundle

## 0.0.2 - 2019-01-07

- fix import errors in Webpack 4/Angular 6+

## 0.0.1 - 2018-11-29

- initial release
