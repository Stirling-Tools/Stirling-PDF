import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ToolInfoTooltip } from "@editor/components/tools/shared/ToolInfoTooltip";
import classes from "@editor/components/tools/shared/infoLabel.module.css";

/**
 * Props to spread into a Mantine input, checkbox, switch or `ButtonSelector` so a
 * tool field carries its explanation behind an (i) instead of as text under the
 * control. Tool-panel rule: the label is a short noun phrase; the why/how goes in
 * `info`; persistent text under a control is only for live readouts, warnings and
 * errors.
 *
 * Accessibility: the field's name is just `label`, and `info` is its accessible
 * description. The explanation sits in the field's description slot as hidden
 * text, and the (i) button, named "About <label>", is drawn beside the label but
 * kept out of both the `<label>` and the description, since anything inside them
 * would be read as part of the name or the description.
 */
export function infoLabelProps(
  label: ReactNode,
  info?: ReactNode,
): { label: ReactNode; description?: ReactNode } {
  if (!info) return { label };
  return { label, description: <InfoDescription label={label} info={info} /> };
}

function inlineInputControl(node: HTMLElement | null): HTMLInputElement | null {
  return (
    node
      ?.closest(".mantine-Checkbox-root, .mantine-Switch-root")
      ?.querySelector("input") ?? null
  );
}

function addDescribedBy(control: HTMLElement, id: string): () => void {
  const ids = (control.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (!ids.includes(id))
    control.setAttribute("aria-describedby", [...ids, id].join(" "));
  return () => {
    const remaining = (control.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter((entry) => entry && entry !== id);
    if (remaining.length > 0)
      control.setAttribute("aria-describedby", remaining.join(" "));
    else control.removeAttribute("aria-describedby");
  };
}

/**
 * Renders inside the field's description element, which Mantine links to text
 * inputs, selects and textareas (and `ButtonSelector` links to its group). A
 * checkbox's or switch's description is left unlinked by Mantine, so there the
 * hidden text links itself. The (i) button is moved to just after the
 * description element, outside the text the description is read from.
 */
function InfoDescription({
  label,
  info,
}: {
  label: ReactNode;
  info: ReactNode;
}) {
  const { t } = useTranslation();
  const textId = useId();
  const textRef = useRef<HTMLSpanElement>(null);
  const [buttonSlot, setButtonSlot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const text = textRef.current;
    const description = text?.parentElement;
    if (!text || !description) return;
    const slot = document.createElement("span");
    slot.className = classes.infoButton;
    description.after(slot);
    setButtonSlot(slot);
    const control = inlineInputControl(text);
    const unlink = control ? addDescribedBy(control, textId) : undefined;
    return () => {
      unlink?.();
      slot.remove();
      setButtonSlot(null);
    };
  }, [textId]);

  const buttonName =
    typeof label === "string"
      ? t("common.aboutField", "About {{field}}", { field: label })
      : t("common.moreInformation", "More information");

  return (
    <>
      <span ref={textRef} id={textId} className={classes.infoText}>
        {info}
      </span>
      {buttonSlot &&
        createPortal(
          <ToolInfoTooltip label={info} ariaLabel={buttonName} />,
          buttonSlot,
        )}
    </>
  );
}
