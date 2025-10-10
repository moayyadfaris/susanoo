const js = require('@eslint/js')

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022, // Support optional chaining
      sourceType: 'commonjs',
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
        global: 'readonly',
        module: 'writable',
        require: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        // Mocha test globals
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        // Test utilities (can be overridden per file)
        baseUrl: 'readonly'
      }
    },
    rules: {
      'indent': ['error', 2, { 'SwitchCase': 1 }],
      'quotes': ['error', 'single'],
      'semi': ['error', 'never'],
      'object-curly-spacing': ['error', 'always'],
      'key-spacing': ['error', { 'afterColon': true }],
      'no-multi-spaces': 'error',
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'no-case-declarations': 'off', // Allow declarations in case blocks
      'no-async-promise-executor': 'off' // Allow async promise executors
    },
    ignores: [
      'node_modules/**',
      'public/**',
      'coverage/**',
      '*.min.js'
    ]
  }
]