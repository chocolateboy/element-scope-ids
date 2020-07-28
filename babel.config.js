module.exports = {
    env: {
        development: {
            sourceMaps: true,
            plugins: ['source-map-support'],
        }
    },

    presets: [
        'bili/babel',

        ['@babel/preset-env', {
            corejs: 3,

            // only include polyfills if they're used
            useBuiltIns: 'usage',

            // set this to true to see the applied transforms and bundled polyfills
            debug: (process.env.NODE_ENV === 'development'),

            // try to reduce the bundle size
            // XXX won't work with IE11 as a target
            bugfixes: true,
        }],
    ],
}
