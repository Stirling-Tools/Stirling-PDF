export const addGlowToElements = (selectors: string[]) => {
  selectors.forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) {
      if (selector === '[data-tour="settings-content-area"]') {
        element.classList.add('tour-content-glow');
      } else {
        element.classList.add('tour-nav-glow');
      }
    }
  });
};

export const removeAllGlows = () => {
  document.querySelectorAll('.tour-content-glow').forEach((el) => el.classList.remove('tour-content-glow'));
  document.querySelectorAll('.tour-nav-glow').forEach((el) => el.classList.remove('tour-nav-glow'));
};

