import 'core-js/fn/array/flat-map'
import EventEmitter from 'little-emitter'
import nanoid       from 'nanoid/non-secure'
import Pipeline     from './pipeline'

// the `idAttrs` option can be a function which augments the list rather than
// replacing it
type IdAttrs = Iterable<string> | ((idAttrs: Iterable<string>) => Iterable<string>)

// the object passed to `id` event handlers
type Id = { name: string, value: string, next?: Exclude }

// a predicate which determines whether we accept (true) or reject (false) an ID
// rewrite
type Exclude = (HTMLElement, id: Id) => boolean

// a cache mapping unscoped IDs to their scoped (i.e. unique) replacements
type Scope = { [key: string]: string }

// the length of the random part of each scoped ID
// https://alex7kom.github.io/nano-nanoid-cc/
const HASH_LENGTH = 16

// the options optionally passed to a) the constructor, and b) the `scopeIds`
// method
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
function defaultExclude (el: HTMLElement, { name }): boolean {
    if (name === 'for') {
        return el.tagName === 'LABEL'
    }

    return false
}

// instances of this class scope IDs within an element i.e. rewrite them to be
// globally unique.
//
// the main reason to instantiate this is to register event listeners. otherwise,
// if the default options are fine, the `scopeIds` method can be called on a
// default instance of this class via the exported `scopeIds` wrapper function
export default class Scoper extends EventEmitter {
    private idAttrs: Iterable<string> // FIXME why doesn't Options['idAttrs'] work here?
    private exclusions: Array<Exclude>
    private excluder: Pipeline<Exclude>

    // XXX these are here for CommonJS (because we get warnings and errors in
    // bundlers if we mix named and default exports (ESM) with CommonJS exports)
    static scopeIds = scopeIds
    static scopeOwnIds = scopeOwnIds

    constructor (_options?: Options) {
        super()

        const options = _options || {}
        const exclusions = [defaultExclude]

        if (options.exclude) {
            exclusions.push(options.exclude)
        }

        this.idAttrs = this.getIdAttrs(options.idAttrs, DEFAULT_ID_ATTRS)
        this.exclusions = exclusions

        function invoker (current, next, el, id): boolean | string {
            return current(el, id, next)
        }

        this.excluder = new Pipeline(invoker, { defaultValue: true })
    }

    // scope the supplied ID by returning a replacement that's globally unique
    private generateId (id: string): string {
        return `${ID_PREFIX}-${id}-${nanoid(HASH_LENGTH)}`
    }

    // returns the list (e.g. array) of attribute names which are examined for IDs.
    // may be overridden (via a function), in which case we pass the (cloned)
    // default list as a parameter so that it can be modified or augmented
    private getIdAttrs (idAttrs: IdAttrs | undefined, baseIdAttrs: Iterable<string>): Iterable<string> {
        if (typeof idAttrs === 'function') {
            const clone = [...baseIdAttrs]
            idAttrs = idAttrs(clone)
        }

        return idAttrs || baseIdAttrs
    }

    // the guts of the (shared) `scopeOwnId` method
    //
    // unlike the public version, this takes an internal `scope` parameter which
    // is used to keep track of old-name -> new-name mappings
    private _scopeOwnIds<T extends HTMLElement>(element: T, scope: Scope, _options?: Options): T {
        const options = _options || {}
        const idAttrs = this.getIdAttrs(options.idAttrs, this.idAttrs)
        const exclusions = options.exclude ? this.exclusions.concat(options.exclude) : this.exclusions
        const deltas = {}

        for (const name of idAttrs) {
            const oldIds = (element.getAttribute(name) || '').trim()

            if (!oldIds) {
                continue
            }

            const mapped = oldIds.split(/\s+/).flatMap(id => {
                const exclude = this.excluder.start(exclusions)

                if (!exclude(element, { name, value: id })) {
                    return []
                }

                let cached = scope[id]

                if (!cached) {
                    const newId = this.generateId(id)

                    cached = scope[id] = newId

                    // translated IDs should not be recycled in this scope
                    scope[newId] = newId
                }

                this.emit('id', element, { name, old: id, 'new': cached })

                return [cached]
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

        const idAttrs = this.getIdAttrs(options.idAttrs, this.idAttrs)
        const scope = {}

        // merge in the resolved idAttrs: we don't need to keep resolving them
        // if `idAttrs` is a callback
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
