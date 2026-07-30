// Deliberately minimal: Prettier owns formatting and `task frontend:lint:colors`
// owns the theme tokens, so this only carries rules that catch real bugs.
export default {
  rules: {
    "no-duplicate-selectors": true,
  },
};
