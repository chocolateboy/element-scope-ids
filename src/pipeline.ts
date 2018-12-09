// execute the `include` predicate(s), threading the `next` parameter through
// them so that an override can delegate to the function it's overriding
//
// see also:
//
//   - https://github.com/koajs/compose
//   - https://github.com/JeffRMoore/brigade
//   - https://gist.github.com/darrenscerri/5c3b3dcbe4d370435cfa

// const invoker = (current, next, el, id) {
//     return current(el, { ...id, next })
// }
//
// const pipeline = new Pipeline(invoker, { defaultValue: true })
// const fn = pipeline.start(includes)
// const included = fn(el, id)

// TODO replace this with an NPM module

// FIXME can't get this to typecheck without pervasive hackery and guesswork
type GenericFunction = (...args: Array<any>) => any;
type Invoker<F extends GenericFunction> = (current: F, next: F, ...args) => ReturnType<F>;

type Options = {
    defaultValue: any;
}

export default class Pipeline<F extends GenericFunction> {
    private getDefaultValue: F
    private invoker: Invoker<F>

    constructor (invoker: Invoker<F>, _options: Options) {
        const options = _options || {}
        const defaultValue = options.defaultValue

        this.invoker = invoker
        this.getDefaultValue = ((..._args) => defaultValue) as F
    }

    start (_fns: Iterable<F>): F {
        const fns = [..._fns] // clone

        if (fns.length === 0) {
            return this.getDefaultValue
        }

        const current = fns.pop()

        // XXX current may be undefined: https://github.com/Microsoft/TypeScript/issues/10272
        if (!current) {
            return this.getDefaultValue
        }

        const self = this

        const fn = function (...currentArgs): ReturnType<F> {
            function next (...nextArgs): ReturnType<F> {
                const fn = self.start(fns)
                const args = (nextArgs.length === 0) ? currentArgs : nextArgs
                return fn(...args)
            }

            // FIXME typechecking fail hack
            return self.invoker(current, next as F, ...currentArgs)
        }

        return fn as F
    }
}
