import { useTranslation } from "react-i18next";
import { MEASUREMENT_COLORS } from "@editor/utils/measurementUtils";
import styles from "@editor/tools/measure/Measure.module.css";

interface ColorSwatchesProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorSwatches({ value, onChange }: ColorSwatchesProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.swatches} role="radiogroup">
      {MEASUREMENT_COLORS.map((color) => {
        const isSelected = color.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={t("measure.colorSwatch", "Colour {{color}}", { color })}
            className={`${styles.swatch} ${isSelected ? styles.swatchSelected : ""}`}
            style={{ background: color }}
            onClick={(e) => {
              e.stopPropagation();
              onChange(color);
            }}
          />
        );
      })}
    </div>
  );
}
