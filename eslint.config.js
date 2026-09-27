import {FlatCompat} from "@eslint/eslintrc";
import js from "@eslint/js";
import {defineConfig} from "eslint/config";
import { importX } from "eslint-plugin-import-x";
import eslintPluginJsdoc from "eslint-plugin-jsdoc";
import globals from "globals";

const compat = new FlatCompat({
    baseDirectory: import.meta.dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

const config = defineConfig([{
    languageOptions: {
        globals: {
            ...globals.node,
        },

        "ecmaVersion": "latest",
        "sourceType": "module",
        parserOptions: {},
    },

    extends: [
        compat.extends("eslint:recommended"),
        importX.flatConfigs.recommended
    ],

    plugins: {
        jsdoc: eslintPluginJsdoc,
    },

    "rules": {
        "quotes": ["error", "double"],
        "semi": ["error", "always"],
        "no-var-requires": "off",
        "indent": "off",
        "import-x/order": ["error", {
            alphabetize: {
                caseInsensitive: true,
                order: "asc",
            },
            groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
            "newlines-between": "always",
        }],
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

export default config;
