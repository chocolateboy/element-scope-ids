# element-scope-ids

[![Build Status](https://secure.travis-ci.org/chocolateboy/element-scope-ids.svg)](http://travis-ci.org/chocolateboy/element-scope-ids)
[![NPM Version](http://img.shields.io/npm/v/element-scope-ids.svg)](https://www.npmjs.org/package/element-scope-ids)

- [NAME](#name)
- [INSTALLATION](#installation)
- [SYNOPSIS](#synopsis)
- [DESCRIPTION](#description)
- [WHY?](#why)
- [TYPES](#types)
  - [Idrefs](#type-idrefs)
  - [Options](#type-options)
  - [Scope](#type-scope)
- [EXPORTS](#exports)
  - [Scoper (default)](#scoper-class)
    - [Events](#events)
      - [id](#id)
      - [ids](#ids)
    - [Options](#options)
      - [idrefs](#idrefs)
      - [include](#include)
      - [prefix](#prefix)
    - [Methods](#methods)
      - [scopeIds](#scope-ids-method)
      - [scopeOwnIds](#scope-own-ids-method)
  - [scopeIds](#scope-ids-function)
  - [scopeOwnIds](#scope-own-ids-function)
- [EXAMPLES](#examples)
  - [Debugging](#debugging)
  - [Exclude global IDs](#exclude-global-ids)
  - [Use with jQuery](#use-with-jquery)
- [DEVELOPMENT](#development)
  - [NPM Scripts](#npm-scripts)
- [COMPATIBILITY](#compatibility)
- [SEE ALSO](#see-also)
- [VERSION](#version)
- [AUTHOR](#author)
- [COPYRIGHT AND LICENSE](#copyright-and-license)

# NAME

element-scope-ids - scope IDs to an element by rewriting them to be globally unique

# INSTALLATION

    $ npm install element-scope-ids

# SYNOPSIS

```javascript
import { scopeIds } from 'element-scope-ids'

for (const el of document.querySelectorAll('.tabs')) {
    scopeIds(el)
}
```

**before**:

```html
<div class="tabs">
    <ul role="tablist">
        <li id="foo-tab" role="tab" aria-controls="foo-panel">Foo</li>
        <li id="bar-tab" role="tab" aria-controls="bar-panel">Bar</li>
    </ul>
    <div id="foo-panel" role="tabpanel">...</div>
    <div id="bar-panel" role="tabpanel">...</div>
</div>
```

**after**:

```html
<div class="tabs">
    <ul role="tablist">
        <li id="foo-tab-abc123" role="tab" aria-controls="foo-panel-bcd234">Foo</li>
        <li id="bar-tab-cde345" role="tab" aria-controls="bar-panel-def456">Bar</li>
    </ul>
    <div id="foo-panel-bcd234" role="tabpanel">...</div>
    <div id="bar-panel-def456" role-"tabpanel">...</div>
</div>
```

# DESCRIPTION

This module exports a class (and helper functions which wrap an instance of the class)
which rewrites IDs within elements so that they're safe to compose with other elements
on the page which use the same IDs. This is done by rewriting each ID to be globally unique
(while preserving any internal links). This is similar to the technique used to transpile
scoped CSS (e.g. CSS modules) by PostCSS, Angular etc.

# WHY?

IDs are the natural way to declare relationships between elements in various HTML components e.g.:

- [accordions](https://www.w3.org/TR/wai-aria-practices/#accordion) and
  [tabs](https://www.w3.org/TR/wai-aria-practices/#tabpanel)
  (e.g. [aria-controls](https://www.w3.org/TR/wai-aria/#aria-controls) and
  [aria-labelledby](https://www.w3.org/TR/wai-aria/#aria-labelledby))
- labeled form elements ([for](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/label#Attributes))

This approach works well if the IDs are unique — e.g. if there's only one accordion or form on a
page — but quickly becomes cumbersome in situations where there's more than one such component,
e.g. in SPAs where typically many such components may be embedded in the DOM at the same time.
It can also be tedious and error prone even in multi-page apps simply because IDs are names, and
[naming things is hard](https://martinfowler.com/bliki/TwoHardThings.html): componentization
and other abstractions can make it difficult to keep track of which IDs are safe to use where, and this
can be compounded in apps which pull in third-party components/markup.

One solution to this is to use another attribute e.g. `data-id`. But this doesn't work
for ARIA/form elements, which were specced with plain old IDs in mind, and effort must still be
expended to manually namespace names to avoid collisions. In the case of ARIA widgets and labelled
form elements, these attributes will still need to be translated to `id` attributes with the same
values, so this does little more than shift the problem sideways.

Rather than trying to migrate every codebase and library which uses IDs to the sticking plaster
of using a different attribute with the same drawbacks, a simpler solution is to make IDs
<abbr title="Do What We Mean">DWWM</abbr> by automagically scoping (i.e. namespacing/renaming)
them, in the same way that scoped CSS — and scoped (i.e. local) variables — make components easy
to name and safe to compose.

# TYPES

The following types are referenced in the descriptions below:

## Idrefs <a name="type-idrefs"></a>

An array of attribute names to look for IDs in or a function which returns the names.

```typescript
type Idrefs = Iterable<string> | (idrefs: Iterable<string>) => Iterable<string>
```

## Options <a name="type-options"></a>

An options object which can be passed to the [Scoper](#scoper-class) constructor
and its [`scopeIds`](#scope-ids-method) and [`scopeOwnIds`](#scope-own-ids-method) methods.

```typescript
type Options = {
    idrefs?: Idrefs;
    include?: (HTMLElement, id: { name: string, value: string }) => boolean;
    prefix?: string;
}
```

## Scope <a name="type-scope"></a>

A scope is a mapping from old ID names to their new (unique) names which is populated when
the IDs in an element or its descendants are replaced.

```typescript
type Scope = { [key: string]: string }
```

# EXPORTS

## Scoper (default) <a name="scoper-class"></a>

Instances of this class can be used to rewrite IDs within DOM elements so that they can
safely be composed with other elements which use the same IDs. This is done by rewriting
the IDs to be globally unique, while preserving internal links.

**Type**: Scoper(options?: [Options](#type-options))

```javascript
import Scoper from 'element-scope-ids'

const scoper = new Scoper()

scoper.on('id', (element, id) => {
    element.setAttribute(`data-original-${id.name}`, id.old)
})

for (const el of document.querySelectorAll('.tabs')) {
    scoper.scopeIds(el)
}
```

### Events

Scoper implements the [EventEmitter](https://nodejs.org/api/events.html) interface. The following
events are supported:

#### id

**Type**: (el: HTMLElement, { name: string, old: string, new: string }) → void

Fired each time an ID-like attribute is changed. As well as the `id` attribute itself, this also includes
ARIA attributes such as `aria-controls` and the `for` attribute on LABEL elements. The handler is passed
the element and a delta object which contains the old ID and the new ID.

```javascript
scoper.on('id', (element, id) => {
    element.setAttribute(`data-original-${id.name}`, id.old)
})
```

Note that an event is fired for *each ID* rather than each attribute. This distinction is important
for attributes which may take multiple IDs, e.g. `aria-labelledby`.

#### ids

**Type**: (el: HTMLElement, { [name: string]: { old: string, new: string } }) → void

Fired after all IDs have been replaced in an element. Passed the element and an object whose
keys are the names of modified attributes and whose values are delta objects with the old and new
values for the attribute e.g.:

```javascript
scoper.on('ids', (element, ids) => {
    element.setAttribute('data-original-ids', Object.keys(ids).join(' '))
})
```

### Options

The constructor takes an optional [Options](#type-options) object with the following (optional) fields:

#### idrefs

**Type**: [Idrefs](#type-idrefs)

A list (e.g. array) of attribute names to treat as "ID-like" i.e. the names of attributes IDs should be replaced in.

To add (or remove) an ID from the default list, a function can be supplied which receives the list as an argument.
The function's return value is used as the new list:

```javascript
const scoper = new Scoper({
    idrefs (defaultIdrefs) {
        return defaultIdrefs.concat(['contextmenu'])
    }
})
```

#### include

**Type**: (el: HTMLElement, { name: string, value: string, next: (typeof include) }) → boolean

A function which is used to exclude attributes from substitution. Called for every
ID-like attribute in every target element. If supplied, the function can veto
replacing the ID(s) by returning false. Can be used to filter by type e.g. the default
implementation restricts the `for` attribute to LABEL elements:

```javascript
const scoper = new Scoper({
    include (element, attr) {
        return attr.name === 'for' ? element.tagName === 'LABEL' : true
    }
})
```

The `next` value in the second parameter is a reference to the default `include` function.
There can be up to three `include` functions (built-in, constructor option, method option)
and each one after the built-in can delegate to the one it's overriding e.g. passing the decision
back from the method option to the constructor option (if supplied) or default implementation.

If the `next` function is called with no arguments, it is passed the original arguments. Otherwise
the supplied arguments are passed to the previous `include`.

```javascript
const scoper = new Scoper({
    include (element, { name, value, next }) {
        // next() (no arguments) is the same as next(...arguments)
        return (element.dataset.scopeIds || '') === 'false' ? false : next()
    }
})
```

#### prefix

**Type**: string, default: "scoped-id"

The prefix to prepend to generated IDs. Must begin with a letter or an underscore; otherwise,
a warning is logged to the console and the default value is used instead.

```javascript
const scoper = new Scoper({ prefix: 'my-id' })
```

**before**:

```html
<div id="foo">
    <span id="bar">Bar</span>
</div>
```

**after**:

```html
<div id="my-id-foo-abc123">
    <span id="my-id-bar-xyz321">Bar</span>
</div>
```

#### scope

A [Scope](#type-scope) object to read from and write to during the course of a [`scopeIds`](#scope-ids-method)
or [`scopeOwnIds`](#scope-own-ids-method) method call.

This is an advanced option which can be used to coordinate ID sharing/reuse (and prevent IDs being re-mapped)
across different components, or even globally if supplied as an option to the constructor.

If not supplied, a new scope is created for each method call.

### Methods

#### scopeIds <a name="scope-ids-method"></a>

**Type**: <T extends HTMLElement>(el: T, options?: [Options](#type-options)) → T

Takes a DOM element and rewrites any IDs found in its child/descendant elements so
that they are globally unique, and thus safe to combine on a page with another element
which uses the same IDs.

If the `options` parameter is supplied, its values override the corresponding
options passed to the constructor for the scope of the call.

#### scopeOwnIds <a name="scope-own-ids-method"></a>

**Type**: <T extends HTMLElement>(el: T, options?: [Options](#type-options)) → T

Takes a DOM element and rewrites any IDs found in the element itself (i.e. not in its
descendants) so that they are globally unique, and thus safe to combine on a page with
another element which uses the same IDs.

If the `options` parameter is supplied, its values override the corresponding
options passed to the constructor for the scope of the call.

## scopeIds <a name="scope-ids-function"></a>

**Type**: (el: HTMLElement, options?: [Options](#type-options)) → void

A functional wrapper around the [`scopeIds`](#scope-ids-method) method of an instance of
the [Scoper](#scoper) class created with the default options i.e. this:

```javascript
import { scopeIds } from 'element-scope-ids'

for (const el of document.querySelectorAll('.tabs')) {
    scopeIds(el)
}
```

is equivalent to:

```javascript
import Scoper from 'element-scope-ids'

const scoper = new Scoper()

for (const el of document.querySelectorAll('.tabs')) {
    scoper.scopeIds(el, { prefix: 'my-ids' })
}
```

## scopeOwnIds <a name="scope-own-ids-function"></a>

**Type**: (el: HTMLElement, options?: [Options](#type-options)) → void

A functional wrapper around the [`scopeOwnIds`](#scope-own-ids-method) method of
an instance of the [Scoper](#scoper) class created with the default options.

Uses the same default instance of the Scoper class as [`scopeIds`](#scope-ids-function).

# EXAMPLES

## Debugging

To log what IDs have been changed where, intercept one of the [events](#events)
(to veto a change, see [`include`](#include)) e.g.:

```javascript
const scoper = new Scoper()

scoper.on('id', (element, id) => {
    console.log(`${element.tagName}[${id.name}]: ${id.old} => ${id.new}`)
})

```

## Exclude global IDs

This can be done by passing in a [scope](#scope) object. The scope is
effectively a cache which maps the original ID name to its new value,
so we can prevent rewrites by prepopulating the cache with global IDs
which map to themselves:

```javascript
for (const el of document.querySelectorAll('[data-preserve-ids]')) {
    const preserve = (el.dataset.preserveIds || '').trim().split(/\s+/)

    // map each ID to itself: { "foo": "foo", "bar": "bar", ... }
    const scope = preserve.reduce((scope, name) => (scope[name] = name, scope))

    scopeIds(el, { scope })
}
```

**before**:

```html
<div data-preserve-ids="bar baz">
    <span id="foo"></span>
    <span id="bar"></span>
    <span id="baz"></span>
    <span id="quux"></span>
</div>
```

**after**:

```html
<div data-preserve-ids="bar baz">
    <span id="foo-abc123"></span>
    <span id="bar"></span>
    <span id="baz"></span>
    <span id="quux-xyz321"></span>
</div>
```

## Use with jQuery

element-scope-ids doesn't depend on jQuery, but it can easily be
integrated with it, or any other front-end library or framework.

In this example, we mount a Tabs controller object on each tabs
widget after its IDs have been scoped.

```javascript
import 'jquery-initialize'
import Tablist from '@accede-web/tablist'

// scope IDs in every current and future element which has data-scope-ids="true"
$.initialize(`[data-scope-ids="true"]`, function () {
    scopeIds(this)
    $(this).attr('data-scope-ids', 'done') // mark the IDs as scoped
})

// don't process tabs until their IDs have been scoped
$.initialize(`[data-scope-ids="done"] [role="tablist"]`, function () {
    new Tablist(this).mount()
})
```

# DEVELOPMENT

<details>

## NPM Scripts

The following NPM scripts are available:

- build - compile the library and package it for release
- bundle - package the compiled source code for CommonJS, ESM etc.
- clean - remove temporary files and build artifacts
- compile - compile the source code ready for bundling

</details>

# COMPATIBILITY

- &gt; 1% of browsers
- IE 11
- not Opera Mini

# SEE ALSO

## IDs

- [@zthun/zidentifier.core](https://www.npmjs.com/package/@zthun/zidentifier.core) - generate namespaced IDs from nested paths

## ARIA widgets

- [@accede-web/accordion](https://www.npmjs.com/package/@accede-web/accordion) - a dependency-free WAI-ARIA accordion plugin
- [@accede-web/tablist](https://www.npmjs.com/package/@accede-web/tablist) - a dependency-free WAI-ARIA tab plugin
- [posthtml-aria-tabs](https://www.npmjs.com/package/posthtml-aria-tabs) - a PostHTML plugin for creating accessible tabs with minimal markup

# VERSION

0.0.3

# AUTHOR

[chocolateboy](mailto:chocolate@cpan.org)

# COPYRIGHT AND LICENSE

Copyright © 2018 by chocolateboy.

This is free software; you can redistribute it and/or modify it under the
terms of the [Artistic License 2.0](http://www.opensource.org/licenses/artistic-license-2.0.php).
