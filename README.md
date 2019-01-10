# element-scope-ids

[![Build Status](https://secure.travis-ci.org/chocolateboy/element-scope-ids.svg)](http://travis-ci.org/chocolateboy/element-scope-ids)
[![NPM Version](http://img.shields.io/npm/v/element-scope-ids.svg)](https://www.npmjs.org/package/element-scope-ids)

- [NAME](#name)
- [INSTALLATION](#installation)
- [SYNOPSIS](#synopsis)
- [DESCRIPTION](#description)
- [WHY?](#why)
- [TYPES](#types)
  - [IdAttrs](#type-idattrs)
  - [Options](#type-options)
- [EXPORTS](#exports)
  - [Scoper (default)](#scoper-class)
    - [Events](#events)
      - [id](#id)
      - [ids](#ids)
    - [Options](#options)
      - [exclude](#exclude)
      - [idAttrs](#idattrs)
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
        <li id="foo-tab-123" role="tab" aria-controls="foo-panel-234">Foo</li>
        <li id="bar-tab-345" role="tab" aria-controls="bar-panel-456">Bar</li>
    </ul>
    <div id="foo-panel-234" role="tabpanel">...</div>
    <div id="bar-panel-456" role-"tabpanel">...</div>
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
  (e.g. [`aria-controls`](https://www.w3.org/TR/wai-aria/#aria-controls) and
  [`aria-labelledby`](https://www.w3.org/TR/wai-aria/#aria-labelledby))
- labeled form elements ([`for`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/label#Attributes))

This approach works well for simple, static pages — e.g. if there's only one accordion or form on
a page — but quickly becomes cumbersome in situations where there's more than one such component,
e.g. in SPAs where many components of the same type may be embedded in the DOM at the same time.
It can also be tedious and error prone even in multi-page apps simply because IDs are names, and
[naming things is hard](https://martinfowler.com/bliki/TwoHardThings.html): decomposing
a page into reusable components can make it difficult to keep track of which IDs are safe to use
where, and this can be compounded in apps which pull in third-party components.

One solution is to use another attribute e.g. `data-id`, but these remain unique IDs in everything
but name, and they still need to be translated back into actual IDs for ARIA/form elements etc.,
so this does little more than move the problem sideways.

A better solution is to keep using IDs but to make them safe to compose and reuse — in the
same manner as class names in scoped CSS (and local variable names in most programming
languages). This is done by making each ID globally unique (with an escape hatch for
shared/global IDs).

# TYPES

The following types are referenced in the descriptions below:

## IdAttrs <a name="type-idattrs"></a>

An array (or other iterable collection) of attribute names to look for IDs in or a function which returns the names.

```typescript
type IdAttrs = Iterable<string> | (idAttrs: Iterable<string>) => Iterable<string>
```

## Options <a name="type-options"></a>

An options object which can be passed to the [Scoper](#scoper-class) constructor
and its [`scopeIds`](#scope-ids-method) and [`scopeOwnIds`](#scope-own-ids-method) methods.

```typescript
type Options = {
    exclude?: (HTMLElement, id: { name: string, value: string }, next: (typeof exclude)) => boolean | string;
    idAttrs?: IdAttrs;
}
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
ARIA attributes such as `aria-controls` and the `for` attribute on LABEL elements. The listener is passed
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

#### exclude

**Type**: (el: HTMLElement, id: { name: string, value: string }, next: (typeof exclude)) → boolean | string

A function which is used to prevent an ID being scoped. Called once for each ID in each ID-like attribute
(as defined by [`idAttrs`](#idattrs)) in each target element. If supplied, the function can veto scoping
(i.e. renaming) the ID by returning true. Alternatively, it can veto scoping by returning a replacement ID.

The `next` value in the final parameter is a reference to the default `exclude` function.
There can be up to three `exclude` functions (built-in, constructor option, method option)
and each one after the built-in can delegate to the one it's overriding, passing the decision
back from the method option (if supplied) to the constructor option (if supplied) to the
default implementation.

If the `next` function is called with no arguments, it is passed the original arguments. Otherwise
the supplied arguments are passed to the previous `exclude`.

```javascript
const scoper = new Scoper({
    exclude (element, id, next) {
        // next() (no arguments) is the same as next(...arguments)
        return (element.dataset.scopeIds || '') === 'false' ? true : next()
    }
})
```

`exclude` can be used to filter by type e.g. the default implementation restricts the `for`
attribute to LABEL elements:

```javascript
const scoper = new Scoper({
    exclude (element, id, next) {
        return id.name === 'for' ? element.tagName !== 'LABEL' : next()
    }
})
```

It can also be used to [exclude global IDs](#exclude-global-ids).

#### idAttrs

**Type**: [IdAttrs](#idattrs)

A list (e.g. array) of attribute names to treat as "ID-like" i.e. the names of attributes IDs should be replaced in.

To add (or remove) an ID from the default list, a function can be supplied which receives the list as an argument.
The function's return value is used as the new list:

```javascript
const scoper = new Scoper({
    idAttrs (defaultIdAttrs) {
        return defaultIdAttrs.concat(['contextmenu'])
    }
})
```

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
    scoper.scopeIds(el)
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
(to veto a change, see [`exclude`](#exclude)) e.g.:

```javascript
const scoper = new Scoper()

scoper.on('id', (element, id) => {
    console.log(`${element.tagName}[${id.name}]: ${id.old} => ${id.new}`)
})
```

## Exclude global IDs

This can be done by supplying an [`exclude`](#exclude) constructor/method
option which identifies and optionally transforms global IDs e.g.:

```javascript
function isGlobal (el, { value }, next) {
    return (value && value[0] === '/') ? value.substr(1) : next()
}

const scoper = new Scoper({ exclude: isGlobal })

for (const el of document.querySelectorAll('[data-scope-ids="true"]')) {
    scoper.scopeIds(el)
    el.setAttribute('data-scope-ids', 'done')
}
```

**before**:

```html
<div data-scope-ids"true">
    <span id="foo"></span>
    <span id="/bar"></span>
    <span id="/baz"></span>
    <span id="quux"></span>
</div>
```

**after**:

```html
<div data-scope-ids="done">
    <span id="foo-123"></span>
    <span id="bar"></span>
    <span id="baz"></span>
    <span id="quux-234"></span>
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

## Scoped CSS

- [CSS Modules](https://github.com/css-modules/css-modules)

# VERSION

0.1.0

# AUTHOR

[chocolateboy](mailto:chocolate@cpan.org)

# COPYRIGHT AND LICENSE

Copyright © 2018-2019 by chocolateboy.

This is free software; you can redistribute it and/or modify it under the
terms of the [Artistic License 2.0](http://www.opensource.org/licenses/artistic-license-2.0.php).
