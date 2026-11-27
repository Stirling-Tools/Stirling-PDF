import { useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@editor/ui/Input";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import {
  ILLEGAL_FILE_NAME_CHARS,
  splitFileName,
} from "@editor/utils/fileUtils";

interface FileNameInputProps {
  name: string;
  /** Gets the new full name. Rejecting keeps the field open with the message. */
  onRename: (name: string) => Promise<void>;
  /** The edit is over: renamed, left unchanged or cancelled. */
  onClose: () => void;
  className?: string;
}

const keepInField = (event: SyntheticEvent) => event.stopPropagation();

const CARET_ROOM_PX = 2;

/**
 * Edits a file name in place; mount it only while editing. Only the base name
 * is editable: the extension stays fixed so a rename can't leave the file
 * claiming the wrong type. Enter or blur commits, Escape cancels.
 */
export function FileNameInput({
  name,
  onRename,
  onClose,
  className,
}: FileNameInputProps) {
  const { t } = useTranslation();
  const [base, extension] = splitFileName(name);
  const [draft, setDraft] = useState(base);
  const [error, setError] = useState<string | null>(null);
  // Set while a rename is in flight and once the field is closing. A ref, not
  // state: Enter and Escape are followed by a blur, from the field unmounting,
  // that must see it within the same tick.
  const settling = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Collapsed first so scrollWidth reads the text, not the current width.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.width = "0";
    input.style.width = `${input.scrollWidth + CARET_ROOM_PX}px`;
  }, [draft]);

  const close = () => {
    settling.current = true;
    onClose();
  };

  const commit = async () => {
    if (settling.current) return;
    const nextBase = draft.trim();
    const nextName = `${nextBase}${extension}`;
    if (!nextBase || nextName === name) {
      close();
      return;
    }
    if (ILLEGAL_FILE_NAME_CHARS.test(nextBase)) {
      setError(
        t(
          "fileSidebar.rename.illegalCharacters",
          "A file name can't contain \\ / : * ? \" < > |",
        ),
      );
      return;
    }
    settling.current = true;
    try {
      await onRename(nextName);
      onClose();
    } catch (err) {
      settling.current = false;
      setError(
        err instanceof Error
          ? err.message
          : t("fileSidebar.rename.error", "Could not rename the file."),
      );
    }
  };

  return (
    <Tooltip position="bottom" content={error} open={error != null}>
      <Input
        ref={inputRef}
        className={[privateContentClassName, className]
          .filter(Boolean)
          .join(" ")}
        inputSize="sm"
        autoFocus
        value={draft}
        invalid={error != null}
        maxLength={200}
        aria-label={t("fileSidebar.rename.label", "File name")}
        aria-invalid={error != null}
        trailingIcon={extension || undefined}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setError(null);
        }}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => void commit()}
        onPointerDown={keepInField}
        onClick={keepInField}
        onDoubleClick={keepInField}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      />
    </Tooltip>
  );
}
