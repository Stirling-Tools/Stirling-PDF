import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string | null | undefined): boolean {
  return EMAIL_RE.test((value ?? "").trim());
}

export function isFilled(value: string | null | undefined): boolean {
  return (value ?? "").trim().length > 0;
}

/**
 * Submit buttons in these forms stay enabled, so a blocked click must say why: this moves focus to
 * the first field marked invalid, once React has rendered the errors the click revealed.
 */
export function focusFirstInvalid(root: ParentNode | null = document): void {
  requestAnimationFrame(() => {
    root
      ?.querySelector<HTMLElement>(
        "[data-invalid] input, [data-invalid] select, [data-invalid] textarea",
      )
      ?.focus();
  });
}

/** A labelled form field; while `invalid` it turns red, says `error` under the input and flags it to assistive tech. */
export function Field({
  label,
  required,
  invalid,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  invalid?: boolean;
  error?: string;
  children: ReactNode;
}) {
  const control =
    invalid && isValidElement(children)
      ? cloneElement(children as ReactElement<{ "aria-invalid"?: boolean }>, {
          "aria-invalid": true,
        })
      : children;
  return (
    <label className="portal-qb__field" data-invalid={invalid || undefined}>
      <span className="portal-qb__field-label">
        {label}
        {required && (
          <span className="portal-qb__req" aria-hidden>
            {" *"}
          </span>
        )}
      </span>
      {control}
      {invalid && error && <FieldError>{error}</FieldError>}
    </label>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <span className="portal-qb__field-error" role="alert">
      {children}
    </span>
  );
}
