import { useTranslation } from "react-i18next";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { useToolRegistry } from "@app/contexts/ToolRegistryContext";
import {
  findToolForOperation,
  operationLabel,
} from "@portal/components/store/storeTools";
import "@portal/components/store/StoreToolIcons.css";

interface StoreToolIconsProps {
  /** Operation endpoint paths, in chain order. */
  tools: string[];
  /** Icons past this count collapse into a "+n" pill. */
  max?: number;
  size?: "sm" | "md";
}

/**
 * A listing's tool chain as a row of registry glyphs. An operation no tool models falls back to a
 * generic settings glyph, so an unknown step still takes its place in the row.
 */
export function StoreToolIcons({
  tools,
  max = 6,
  size = "sm",
}: StoreToolIconsProps) {
  const { t } = useTranslation();
  const { allTools } = useToolRegistry();
  const shown = tools.slice(0, max);
  const rest = tools.length - shown.length;
  return (
    <div className={`portal-store__tools portal-store__tools--${size}`}>
      {shown.map((operation, i) => {
        const label = operationLabel(operation, allTools, t);
        const icon = findToolForOperation(operation, allTools)?.entry.icon;
        return (
          <span
            key={`${operation}-${i}`}
            className="portal-store__tool"
            title={label}
            aria-label={label}
            role="img"
          >
            {icon ?? <TuneRoundedIcon />}
          </span>
        );
      })}
      {rest > 0 && (
        <span className="portal-store__tool portal-store__tool--more">
          {t("portal.store.card.moreTools", { count: rest })}
        </span>
      )}
    </div>
  );
}
