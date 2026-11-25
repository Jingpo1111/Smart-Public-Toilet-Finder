import vue from 'eslint-plugin-vue'
import ts from 'typescript-eslint'
export default ts.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/vendor/**'] },
  ...ts.configs.recommended,
  ...vue.configs['flat/essential'],
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: ts.parser } } },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
)
