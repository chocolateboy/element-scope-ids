// not much to do here until we have headless browser
// testing set up, but let's at least confirm the CommonJS
// exports work and match the ESM exports

const assert = require('assert')

const Scoper = require('./dist/index.js')
const { scopeIds, scopeOwnIds } = require('./dist/index.js')

assert(typeof Scoper === 'function')
assert(Scoper.name === 'Scoper')

const scoper = new Scoper()
assert(scoper instanceof Scoper)

assert(typeof scopeIds === 'function')
assert(scopeIds.name === 'scopeIds')

assert(typeof scopeOwnIds === 'function')
assert(scopeOwnIds.name === 'scopeOwnIds')
