import { useEffect, useRef, useState } from "react";
import { NumberInput } from "@app/ui/NumberInput";
import styles from "@app/tools/measure/Measure.module.css";

const TYPED_DECIMALS = 6;

interface NumberFieldProps {
  label: string;
  /** Keep the label for screen readers only, e.g. under a shared column heading. */
  hideLabel?: boolean;
  value: number;
  unit: string;
  /** Decimals the value is shown with; more can be typed. */
  decimals: number;
  onChange: (value: number) => void;
  min?: number;
}

/**
 * A number input that applies every valid value as it is typed. While it has
 * focus it keeps the typed text rather than the rounded value coming back, so
 * a half-typed "12." is not rewritten mid-edit; blur or Enter tidies it.
 */
export function NumberField({
  label,
  hideLabel = false,
  value,
  unit,
  decimals,
  onChange,
  min,
}: NumberFieldProps) {
  const rounded = Number(value.toFixed(decimals));
  const [text, setText] = useState<number | string>(rounded);
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) setText(rounded);
  }, [rounded]);

  const handleChange = (next: number | string) => {
    setText(next);
    const parsed = typeof next === "number" ? next : Number.parseFloat(next);
    if (Number.isFinite(parsed) && (min === undefined || parsed >= min)) {
      onChange(parsed);
    }
  };

  const finishEditing = () => {
    isEditingRef.current = false;
    setText(rounded);
  };

  return (
    <label className={styles.numberField}>
      {!hideLabel && <span className={styles.numberFieldLabel}>{label}</span>}
      <NumberInput
        inputSize="sm"
        hideControls
        aria-label={label}
        value={text}
        decimalScale={Math.max(decimals, TYPED_DECIMALS)}
        min={min}
        onChange={handleChange}
        onFocus={() => {
          isEditingRef.current = true;
        }}
        onBlur={finishEditing}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
        }}
        rightSection={<span className={styles.numberFieldUnit}>{unit}</span>}
        rightSectionWidth="2.25rem"
      />
    </label>
  );
}
