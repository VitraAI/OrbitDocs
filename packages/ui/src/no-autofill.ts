/**
 * Props for search and filter inputs that browsers and password managers must
 * leave alone. Chrome ignores `autoComplete="off"` on a field it takes for a
 * login, so the input also gets a non-identity `name` from its caller and the
 * opt-outs of the common password managers.
 */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
} as const;
