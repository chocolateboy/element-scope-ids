import EventEmitter from 'little-emitter'
import flatMap      from 'lodash/flatMap' // FIXME this is in ES201? and core-js
import nanoid       from 'nanoid/non-secure'
import Pipeline     from './pipeline'

// the `idrefs` option can be a function which augments the list rather than
// replacing it
type Idrefs = Iterable<string> | ((idrefs: Iterable<string>) => Iterable<string>)

// the object passed to `id` event handlers
type Id = { name: string, value: string, next?: Include }

// a predicate which determines whether we accept (true) or reject (false) an ID
// rewrite
type Include = (HTMLElement, id: Id) => boolean

// a cache mapping unscoped IDs to their scoped (i.e. unique) replacements
type Scope = { [key: string]: string }

// the length of the random part of each scoped ID
// https://alex7kom.github.io/nano-nanoid-cc/
const HASH_LENGTH = 16

// the options optionally passed to a) the constructor, and b) the `scopeIds`
// method
type Options = {
    idrefs?: Idrefs;
    include?: Include;
    prefix?: string;
    scope?: Scope;
}

// the default list of attribute names we expect to find IDs in
//
// for ARIA attributes, see: https://www.w3.org/TR/wai-aria/
//
// FIXME this isn't a complete list:
// https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes
const DEFAULT_IDREFS = [
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

// the default string to prepend to all generated IDs i.e. their de-facto namespace
//
// XXX not sure about exposing this as a config option as it encourages
// knowledge of and reliance on what should be an implementation detail
const DEFAULT_PREFIX = 'scoped-id'

// the base/fallback `include` predicate
function defaultInclude (el: HTMLElement, { name }): boolean {
    if (name === 'for') {
        return el.tagName === 'LABEL'
    }

    return true
}

// instances of this class scope IDs within an element i.e. rewrite them to be
// globally unique.
//
// the main reason to instantiate this is to register event listeners. otherwise,
// if the default options are fine, the `scopeIds` method can be called on a
// default instance of this class via the exported `scopeIds` wrapper function
export default class Scoper extends EventEmitter {
    private idrefs: Iterable<string> // FIXME why doesn't Options['idrefs'] work here?
    private includes: Array<Include>
    private includer: Pipeline<Include>
    private prefix: string // FIXME may be undefined if we use Options['prefix']
    private scope: Scope | undefined

    // XXX these are here for CommonJS (because we get warnings and errors in
    // bundlers if we mix named and default exports (ESM) with CommonJS exports)
    static scopeIds = scopeIds
    static scopeOwnIds = scopeOwnIds

    constructor (_options?: Options) {
        super()

        const options = _options || {}
        const includes = [defaultInclude]

        if (options.include) {
            includes.push(options.include)
        }

        this.idrefs = this.getIdrefs(options.idrefs, DEFAULT_IDREFS)
        this.includes = includes
        this.scope = options.scope

        function invoker (current, next, el, id): boolean {
            return current(el, { ...id, next })
        }

        this.includer = new Pipeline(invoker, { defaultValue: true })

        // make sure it's not an empty string
        const prefix = (options.prefix || DEFAULT_PREFIX).trim()

        if (prefix && /^[a-zA-z_]/.test(prefix)) {
            this.prefix = prefix
        } else {
            const dump = JSON.stringify(prefix)
            console.warn(`invalid prefix (${dump}): prefix must start with a character in the range /[a-zA-Z_]/`)
            this.prefix = DEFAULT_PREFIX
        }
    }

    // scope the supplied ID by returning a replacement that's globally unique
    private generateId (id: string, prefix: string): string {
        return `${prefix}-${id}-${nanoid(HASH_LENGTH)}`
    }

    // returns the list (e.g. array) of attribute names which are examined for IDs.
    // may be overridden (via a function), in which case we pass the (cloned)
    // default list as a parameter so that it can be modified or augmented
    private getIdrefs (idrefs: Idrefs | undefined, baseIdrefs: Iterable<string>): Iterable<string> {
        if (typeof idrefs === 'function') {
            const clone = [...baseIdrefs]
            idrefs = idrefs(clone)
        }

        return idrefs || baseIdrefs
    }

    // replace IDs in the supplied element (i.e. not in its descendants) with
    // their scoped (i.e. globally unique) versions.
    //
    // returns the element for chaining
    scopeOwnIds<T extends HTMLElement>(element: T, _options?: Options): T {
        const options = _options || {}
        const idrefs = this.getIdrefs(options.idrefs, this.idrefs)
        const includes = options.include ? this.includes.concat(options.include) : this.includes
        const prefix = options.prefix || this.prefix
        const scope = options.scope || this.scope || {}
        const deltas = {}

        for (const name of idrefs) {
            const oldIds = (element.getAttribute(name) || '').trim()

            if (!oldIds) {
                continue
            }

            const mapped = flatMap(oldIds.split(/\s+/), id => {
                const include = this.includer.start(includes)

                if (!include(element, { name, value: id })) {
                    return []
                }

                let cached = scope[id]

                if (!cached) {
                    const newId = this.generateId(id, prefix)

                    cached = scope[id] = newId

                    // translated IDs should not be recycled in this scope
                    // (which may be a global scope if a scope option was passed
                    // to the constructor)
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

    // replace IDs in descendants of the supplied element (e.g. "summary-panel")
    // with scoped versions by making them globally unique (e.g.
    // "scoped-id-summary-panel-abc123")
    //
    // returns the element for chaining
    public scopeIds<T extends HTMLElement>(element: T, _options?: Options): T {
        let options = _options || {}

        const idrefs = this.getIdrefs(options.idrefs, this.idrefs)
        const scope = options.scope || this.scope || {}

        // if there's a new/different scope, merge it into the options
        if (scope !== options.scope) {
            options = { ...options, scope }
        }

        // merge in the resolved idrefs: we don't need to keep resolving them
        // if `idrefs` is a callback
        if (typeof options.idrefs === 'function') {
            options = { ...options, idrefs }
        }

        const selector = Array.from(idrefs).map(name => `[${name}]`).join(', ')
        const descendants = element.querySelectorAll(selector) as NodeListOf<HTMLElement>

        for (const descendant of descendants) {
            this.scopeOwnIds(descendant, options)
        }

        return element
    }
}

// the default Scoper instance used for the `scopeIds` helper function
const SCOPER = new Scoper()

// a convenience function which provides access to the `scopeIds` method for the
// common case where a custom Scoper instance isn't needed
//
// XXX don't export this (yet), as mixing named and default exports triggers
// breakage (microbundle) or a warning (bili)
export function scopeIds (el: HTMLElement, options?: Options) {
    return SCOPER.scopeIds(el, options)
}

// a convenience function which provides access to the `scopeOwnIds` method for
// the common case where a custom Scoper instance isn't needed
export function scopeOwnIds (el: HTMLElement, options?: Options) {
    return SCOPER.scopeOwnIds(el, options)
}
