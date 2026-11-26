import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Group, Text } from "@mantine/core";
import {
  NewSignatureTile,
  SignatureTile,
} from "@editor/components/tools/sign/wallet/SignatureTile";
import { ToolInfoTooltip } from "@editor/components/tools/shared/ToolInfoTooltip";
import "@editor/components/shared/signatureFields/SignatureImagePicker.css";

export interface SignatureImageChoice {
  id: string;
  label: string;
  dataUrl: string;
}

interface SignatureImagePickerProps {
  /** Saved signatures to offer, newest first. */
  saved: SignatureImageChoice[];
  value: File | undefined;
  onChange: (file: File | undefined) => void;
  disabled?: boolean;
}

const ACCEPT = "image/png,image/jpeg";
const pickedFrom = new WeakMap<File, string>();

async function toPngFile(choice: SignatureImageChoice): Promise<File> {
  const image = new Image();
  image.src = choice.dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || 600;
  canvas.height = image.naturalHeight || 200;
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Could not read the saved signature");
  const file = new File([blob], `${choice.label || "signature"}.png`, {
    type: "image/png",
  });
  pickedFrom.set(file, choice.id);
  return file;
}

function useObjectUrl(file: File | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

/** Picks the image drawn beside the signature details: a saved signature or an uploaded PNG or JPEG. */
export function SignatureImagePicker({
  saved,
  value,
  onChange,
  disabled = false,
}: SignatureImagePickerProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  const selectedId = value ? pickedFrom.get(value) : undefined;
  const uploaded = value && selectedId === undefined ? value : undefined;
  const uploadedUrl = useObjectUrl(uploaded);
  const title = t("certSign.appearance.graphic.imageTitle", "Signature image");
  const tiles = useMemo(
    () => saved.filter((choice) => choice.dataUrl),
    [saved],
  );

  const choose = (choice: SignatureImageChoice) => {
    setFailed(false);
    toPngFile(choice)
      .then(onChange)
      .catch(() => setFailed(true));
  };

  return (
    <div className="signature-image-picker">
      <Group gap={4} wrap="nowrap">
        <Text size="sm" fw={500}>
          {title}
        </Text>
        <ToolInfoTooltip
          label={t(
            "certSign.appearance.graphic.imageHint",
            "A handwritten signature or seal, PNG or JPEG",
          )}
          ariaLabel={t("common.aboutField", "About {{field}}", {
            field: title,
          })}
        />
      </Group>
      <div className="signature-image-picker__grid">
        {tiles.map((choice) => (
          <SignatureTile
            key={choice.id}
            label={choice.label}
            dataUrl={choice.dataUrl}
            selected={selectedId === choice.id}
            disabled={disabled}
            actions={[]}
            onClick={() => choose(choice)}
          />
        ))}
        {uploaded && uploadedUrl && (
          <SignatureTile
            label={uploaded.name}
            dataUrl={uploadedUrl}
            selected
            disabled={disabled}
            actions={[]}
            onClick={() => input.current?.click()}
          />
        )}
        <NewSignatureTile
          label={t("certSign.appearance.graphic.upload", "Upload")}
          disabled={disabled}
          onClick={() => input.current?.click()}
        />
      </div>
      {failed && (
        <Text size="xs" c="var(--c-danger)" role="alert">
          {t(
            "certSign.appearance.graphic.savedFailed",
            "That signature could not be used. Try another or upload an image.",
          )}
        </Text>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) {
            setFailed(false);
            onChange(file);
          }
        }}
      />
    </div>
  );
}
