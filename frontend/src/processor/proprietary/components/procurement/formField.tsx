import {
  cloneElement,
  isValidElement,
  useId,
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
 * The error a required email field shows, or null. A missing email waits for an attempt to submit;
 * a mistyped one shows as soon as the buyer leaves the field.
 */
export function emailFieldError(
  value: string | null | undefined,
  { tried, touched }: { tried: boolean; touched: boolean },
  messages: { required: string; invalid: string },
): string | null {
  if (isEmail(value)) return null;
  if (!isFilled(value)) return tried ? messages.required : null;
  return tried || touched ? messages.invalid : null;
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

type ControlAria = {
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
  "aria-describedby"?: string;
};

/**
 * A labelled form field for a single control. While `invalid` it turns red and says `error` under
 * the control, which it marks invalid and described by that error, so focusing it reads the reason.
 */
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
  const errorId = useId();
  const showError = !!invalid && !!error;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<ControlAria>, {
        "aria-invalid": invalid || undefined,
        "aria-required": required || undefined,
        "aria-describedby": showError ? errorId : undefined,
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
      {showError && <FieldError id={errorId}>{error}</FieldError>}
    </label>
  );
}

/** A labelled set of option buttons. Not a <label>, which would pass its clicks to the first one. */
export function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <div className="portal-qb__field" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="portal-qb__field-label">
        {label}
      </span>
      {children}
    </div>
  );
}

export function FieldError({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <span id={id} className="portal-qb__field-error">
      {children}
    </span>
  );
}

/** A box the buyer must tick to go on, such as accepting the EULA; `error` says so once `invalid`. */
export function ConsentCheckbox({
  checked,
  onChange,
  invalid,
  error,
  className = "portal-qb__eula",
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  invalid: boolean;
  error: string;
  className?: string;
  children: ReactNode;
}) {
  const errorId = useId();
  return (
    <>
      <label className={className} data-invalid={invalid || undefined}>
        <input
          type="checkbox"
          checked={checked}
          aria-invalid={invalid || undefined}
          aria-required
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{children}</span>
      </label>
      {invalid && <FieldError id={errorId}>{error}</FieldError>}
    </>
  );
}

/** One choice in a FieldGroup of option cards. */
export function OptionCard({
  on,
  title,
  sub,
  onClick,
}: {
  on: boolean;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="portal-qb__opt"
      aria-pressed={on}
      data-on={on || undefined}
      onClick={onClick}
    >
      <span className="portal-qb__opt-title">{title}</span>
      <span className="portal-qb__opt-sub">{sub}</span>
    </button>
  );
}
