/**
 * Window-counter names for {@link useRenderCount}.
 *
 * The hook is dev-only, so these exist purely so a spec can assert a render
 * budget from outside the app. Kept in a module with no side effects: importing
 * `constants/app.ts` from a Playwright spec would run its `import.meta.env`
 * lookup in Node.
 */
export const COLOUR_PICKER_RENDER_LABEL = "annotationColorPicker";

/**
 * Render-count label shared by the annotation menu's sliders. They are counted
 * together because they are one memoised component, so a budget on the label
 * covers every slider on screen at once.
 */
export const VALUE_SLIDER_RENDER_LABEL = "annotationValueSlider";
