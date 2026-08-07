import { useEffect, useRef } from "react";

/**
 * Mantine drops caller-supplied accessibility wiring in a few places:
 * Input-based components overwrite `aria-describedby` with their own
 * Input.Wrapper context (unset here — FormField owns the help text),
 * MultiSelect consumes `required` for its label asterisk without marking the
 * focusable field, and Slider's thumb ignores unknown `thumbProps` keys
 * entirely. These hooks re-apply the attributes to the rendered DOM node
 * after every render so FormField's injected wiring survives.
 */

/**
 * Ref for a Mantine input component; keeps `aria-describedby` applied.
 * Pass `required` only when Mantine doesn't put the attribute on the field
 * itself (MultiSelect) — it is announced as `aria-required`, since a native
 * `required` on a combobox search field would misfire form validation.
 */
export function useInputAria(options: {
  describedBy?: string;
  required?: boolean;
}) {
  const { describedBy, required } = options;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    applyAria(ref.current, "aria-describedby", describedBy);
    applyAria(ref.current, "aria-required", required ? "true" : undefined);
  });
  return ref;
}

/** Ref for Mantine Slider's root; keeps aria wiring applied to the thumb. */
export function useThumbAria(
  describedBy: string | undefined,
  invalid: boolean | undefined,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const thumb = rootRef.current?.querySelector('[role="slider"]');
    applyAria(thumb, "aria-describedby", describedBy);
    applyAria(thumb, "aria-invalid", invalid ? "true" : undefined);
  });
  return rootRef;
}

function applyAria(
  el: Element | null | undefined,
  attribute: string,
  value: string | undefined,
) {
  if (!el) return;
  if (value !== undefined) {
    el.setAttribute(attribute, value);
  } else {
    el.removeAttribute(attribute);
  }
}
