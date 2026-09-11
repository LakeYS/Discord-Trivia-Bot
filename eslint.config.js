const {
    defineConfig,
} = require("eslint/config");

const globals = require("globals");
const jsdoc = require("eslint-plugin-jsdoc");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([{
    languageOptions: {
        globals: {
            ...globals.node,
        },

        "ecmaVersion": "latest",
        "sourceType": "module",
        parserOptions: {},
    },

    extends: compat.extends("eslint:recommended"),

    plugins: {
        jsdoc,
    },

    "rules": {
        "quotes": ["error", "double"],
        "semi": ["error", "always"],
        "no-var-requires": "off",
        "indent": "off",
        "no-console": "off",
        "no-irregular-whitespace": "off",
        "jsdoc/check-access": 1,
        "jsdoc/check-alignment": 1,
        "jsdoc/check-param-names": 1,
        "jsdoc/check-property-names": 1,
        "jsdoc/check-tag-names": 1,
        "jsdoc/check-types": 1,
        "jsdoc/check-values": 1,
        "jsdoc/empty-tags": 1,
        "jsdoc/implements-on-classes": 1,
        "jsdoc/multiline-blocks": 1,
        "jsdoc/no-multi-asterisks": 1,
        "jsdoc/no-undefined-types": 1,
        "jsdoc/require-jsdoc": 1,
        "jsdoc/require-param": 1,
        "jsdoc/require-param-description": 1,
        "jsdoc/require-param-name": 1,
        "jsdoc/require-param-type": 1,
        "jsdoc/require-property": 1,
        "jsdoc/require-property-description": 1,
        "jsdoc/require-property-name": 1,
        "jsdoc/require-property-type": 1,
        "jsdoc/require-returns": 1,
        "jsdoc/require-returns-check": 1,
        "jsdoc/require-returns-description": 1,
        "jsdoc/require-returns-type": 1,
        "jsdoc/require-yields": 1,
        "jsdoc/require-yields-check": 1,
        "jsdoc/tag-lines": 1,
        "jsdoc/valid-types": 1,
    },
}]);
