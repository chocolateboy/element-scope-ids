import EventEmitter from 'little-emitter'
import nanoid       from 'nanoid/non-secure'

// an object which logs the changes made to an element's ID attributes. passed
// as a parameter to `ids` event listeners.
//
// each key is an attribute name (e.g. "id" or "aria-controls"), and each value
// is a before/after (new/old) pair for the attribute's value (string)
type Deltas = { [name: string]: { old: string, 'new': string } }

// a predicate which determines whether we reject (true) or accept (false) an ID
// rewrite
type Exclude = (el: HTMLElement, idAttr: IdAttr, next?: Exclude) => boolean | string

// an object passed to `id` event handlers which represents an element's modified
// ID attribute
type IdAttr = { name: string, value: string }

// a collection (e.g. array) of strings representing attribute names whose
// values are IDs. can be a function which augments or overrides the default
// collection
type IdAttrs = Iterable<string> | ((idAttrs: Iterable<string>) => Iterable<string>)

// a cache mapping unscoped IDs to their scoped (i.e. unique) replacements
type Scope = { [key: string]: string }

// the length of the random part of each scoped ID
// https://alex7kom.github.io/nano-nanoid-cc/
const HASH_LENGTH = 16

// options passed to a) the constructor, and b) the scoping methods
type Options = {
    exclude?: Exclude;
    idAttrs?: IdAttrs;
}

// the default list of attribute names we expect to find IDs in
//
// for ARIA attributes, see: https://www.w3.org/TR/wai-aria/
//
// FIXME this isn't a complete list:
// https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes
const DEFAULT_ID_ATTRS = [
    'id',
    'aria-activedescendant',
    'aria-controls',
    'aria-describedby',
    'aria-details',
    'aria-errormessage',
    'aria-flowto',
    'aria-labelledby',
    'aria-owns',
    'for'
]

// the string to prepend to all generated IDs i.e. their de-facto namespace
const ID_PREFIX = 'scoped-id'

// the base/fallback `exclude` predicate
function defaultExclude (el: HTMLElement, idAttr: IdAttr): boolean {
    if (idAttr.name === 'for') {
        return el.tagName === 'LABEL'
    }

    return false
}

// scope the supplied ID by returning a globally unique replacement
function generateId (id: string): string {
    const hash = nanoid(HASH_LENGTH)
    return `${ID_PREFIX}-${id}-${hash}`
}

// the `exclude` predicate is a function which takes a target element and the
// ID attribute's name/value and returns true if the ID change should be vetoed
// (i.e. excluded), false otherwise.
//
// there are up to 3 exclude predicates that can be consulted: a default
// (defaultExclude), a predicate passed to the Scoper constructor, and an override
// passed to the scoping methods
//
// each predicate can delegate to its previous/parent predicate e.g. the
// method predicate can delegate to the constructor predicate and the
// constructor predicate can delegate to the default predicate.
//
// delegation is handled by passing a `next` parameter into the function,
// similar to the way it's done for "middleware" in Express or Koa
//
// this function takes a base `exclude` predicate and an optional override and
// returns a function which handles the delegation correctly, injecting a suitable
// `next` function. if the `next` function is called with no arguments, it has
// the same effect as calling it with the arguments passed to the previous
// function in the chain
//
// see also:
//
//   - https://github.com/koajs/compose
//   - https://github.com/JeffRMoore/brigade
function getExclude (base: Exclude, override?: Exclude): Exclude {
    if (!override) {
        return base
    }

    return function (el: HTMLElement, idAttr: IdAttr): boolean | string {
        function next ($el: HTMLElement, $idAttr: IdAttr): boolean | string {
            if (arguments.length === 0) {
                return base(el, idAttr) // original args
            } else {
                return base($el, $idAttr) // overridden args
            }
        }

        return override(el, idAttr, next)
    }
}

// returns the collection (e.g. array) of attribute names which are examined for IDs.
// may be overridden (via a function), in which case we pass the (cloned)
// default collection as a parameter so that it can be modified or augmented
function getIdAttrs (base: Iterable<string>, override?: IdAttrs): Iterable<string> {
    if (typeof override === 'function') {
        const clone = [...base]
        override = override(clone)
    }

    return override || base
}

// instances of this class scope IDs within an element i.e. rewrite them to be
// globally unique.
//
// the main reason to instantiate this is to register event listeners. otherwise,
// if the default options are fine, the scoping methods can be called on a
// default instance of this class via the exported wrapper functions
export default class Scoper extends EventEmitter {
    private exclude: Exclude
    private idAttrs: Iterable<string>

    constructor (_options?: Options) {
        super()

        const options = _options || {}

        this.exclude = getExclude(defaultExclude, options.exclude)
        this.idAttrs = getIdAttrs(DEFAULT_ID_ATTRS, options.idAttrs)
    }

    // the guts of the public scoping methods
    //
    // unlike the public versions, this takes an internal `scope` parameter which
    // is used to keep track of old-name -> new-name mappings
    private _scopeOwnIds<T extends HTMLElement>(element: T, scope: Scope, _options?: Options): T {
        const options = _options || {}
        const exclude = getExclude(this.exclude, options.exclude)
        const idAttrs = getIdAttrs(this.idAttrs, options.idAttrs)
        const deltas: Deltas = {}

        for (const name of idAttrs) {
            const oldIds = (element.getAttribute(name) || '').trim()

            if (!oldIds) {
                continue
            }

            const mapped = oldIds.split(/\s+/).map(id => {
                const $exclude = exclude(element, { name, value: id })

                if ($exclude) {
                    if (typeof $exclude === 'string') {
                        return $exclude
                    } else {
                        return id
                    }
                }

                let cached = scope[id]

                if (!cached) {
                    const newId = generateId(id)

                    cached = scope[id] = newId

                    // translated IDs should not be recycled in this scope
                    scope[newId] = newId
                }

                this.emit('id', element, { name, old: id, 'new': cached })

                return cached
            })

            const newIds = mapped.join(' ')

            if (newIds === oldIds) {
                continue
            }

            element.setAttribute(name, newIds)
            deltas[name] = { old: oldIds, 'new': newIds }
        }

        const names = Object.keys(deltas)

        if (names.length) {
            this.emit('ids', element, deltas)
        }

        return element
    }

    // replace IDs in the supplied element (i.e. not in its descendants) with
    // their scoped (i.e. globally unique) versions.
    //
    // returns the element for chaining
    scopeOwnIds<T extends HTMLElement>(element: T, options?: Options): T {
        return this._scopeOwnIds(element, {}, options)
    }

    // replace IDs in descendants of the supplied element (e.g. "foo-panel")
    // with scoped versions by making them globally unique (e.g.
    // "scoped-id-foo-panel-123")
    //
    // returns the element for chaining
    public scopeIds<T extends HTMLElement>(element: T, _options?: Options): T {
        let options = _options || {}

        const idAttrs = getIdAttrs(this.idAttrs, options.idAttrs)
        const scope = {}

        // merge in the resolved idAttrs: we don't need to keep resolving them
        // if the `idAttrs` option is a callback
        if (typeof options.idAttrs === 'function') {
            options = { ...options, idAttrs }
        }

        const selector = Array.from(idAttrs).map(name => `[${name}]`).join(', ')
        const descendants = element.querySelectorAll(selector) as NodeListOf<HTMLElement>

        for (const descendant of descendants) {
            this._scopeOwnIds(descendant, scope, options)
        }

        return element
    }
}

// the default Scoper instance used for the `scopeIds` helper function
const SCOPER = new Scoper()

// a convenience function which provides access to the `scopeIds` method for the
// common case where a custom Scoper instance isn't needed
export function scopeIds (el: HTMLElement, options?: Options) {
    return SCOPER.scopeIds(el, options)
}

// a convenience function which provides access to the `scopeOwnIds` method for
// the common case where a custom Scoper instance isn't needed
export function scopeOwnIds (el: HTMLElement, options?: Options) {
    return SCOPER.scopeOwnIds(el, options)
}
