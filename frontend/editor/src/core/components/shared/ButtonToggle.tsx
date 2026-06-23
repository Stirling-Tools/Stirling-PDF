import { SegmentedControl } from "@shared/components/SegmentedControl";

export interface ButtonToggleOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface ButtonToggleProps {
  options: ButtonToggleOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  fullWidth?: boolean;
}

export const ButtonToggle = ({
  options,
  value,
  onChange,
  disabled = false,
  size = "md",
  fullWidth = true,
}: ButtonToggleProps) => {
  const segmentedSize = size === "xs" || size === "sm" ? "sm" : "md";

  const segmentedOptions = options.map((option) => ({
    value: option.value,
    disabled: disabled || option.disabled,
    label: (
      <div>
        <div style={{ fontWeight: 600 }}>{option.label}</div>
        {option.description && (
          <div
            style={{
              fontSize: "0.85em",
              opacity: 0.8,
              marginTop: 4,
              fontWeight: 400,
            }}
          >
            {option.description}
          </div>
        )}
      </div>
    ),
  }));

  return (
    <SegmentedControl
      options={segmentedOptions}
      value={value}
      onChange={onChange}
      size={segmentedSize}
      fullWidth={fullWidth}
    />
  );
};
