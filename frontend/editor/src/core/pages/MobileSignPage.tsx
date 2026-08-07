import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Card,
  Group,
  Image,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Button as DSButton } from "@app/ui/Button";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { useTranslation } from "react-i18next";
import { LogoIcon } from "@app/components/shared/LogoIcon";
import { Wordmark } from "@app/components/shared/Wordmark";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import {
  MobileDrawCanvas,
  type MobileDrawCanvasHandle,
} from "@app/components/mobileSign/MobileDrawCanvas";
import apiClient from "@app/services/apiClient";

// Use the configured API base (e.g. api.stirling.com), not the page origin.
const API_BASE = (apiClient.defaults.baseURL ?? "").replace(/\/+$/, "");

type SignatureTab = "draw" | "type" | "photo";

const INK_COLORS = [
  { value: "#101010", label: "black" },
  { value: "#1d4ed8", label: "blue" },
];

const PEN_SIZES = [
  { value: 2, label: "S" },
  { value: 3.5, label: "M" },
  { value: 6, label: "L" },
];

const TYPE_FONTS = [
  { value: "Brush Script MT, cursive", label: "Brush Script" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Times New Roman, serif", label: "Times New Roman" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Courier New, monospace", label: "Courier New" },
];

/** Render typed text to a trimmed transparent PNG, sized for stamping. */
function renderTypedSignature(
  text: string,
  fontFamily: string,
  color: string,
): string | null {
  const fontSize = 96; // rendered large so the stamped image stays crisp
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.font = `${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text);
  const paddingX = Math.round(fontSize * 0.25);
  const paddingY = Math.round(fontSize * 0.35);
  canvas.width = Math.max(1, Math.ceil(metrics.width) + paddingX * 2);
  canvas.height = Math.max(1, fontSize + paddingY * 2);

  // Canvas state resets when its size changes, so set the font again.
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, paddingX, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * MobileSignPage
 *
 * Phone-side page for sending a signature to the desktop: draw one (the main
 * path), type one, or photograph one. Reached by scanning the QR code shown in
 * the editor's Sign tool; the session comes from the QR URL and rides the same
 * transfer backend as the mobile scanner.
 */
export default function MobileSignPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");
  // Landscape phones (not tablets — hence the height cap) get a compact
  // layout: branding hidden, tighter padding, shorter pad, so the canvas and
  // the Send button fit on screen together.
  const compactLandscape =
    useMediaQuery("(orientation: landscape) and (max-height: 32rem)") ?? false;

  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const [tab, setTab] = useState<SignatureTab>("draw");
  const [hasInk, setHasInk] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [typeFont, setTypeFont] = useState(TYPE_FONTS[0].value);
  const [inkColor, setInkColor] = useState(INK_COLORS[0].value);
  const [penSize, setPenSize] = useState(PEN_SIZES[1].value);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [justSent, setJustSent] = useState(false);

  const canvasHandle = useRef<MobileDrawCanvasHandle>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Validate the session up front, so a stale QR shows one clear error rather
  // than a canvas whose Send fails.
  useEffect(() => {
    if (!sessionId) {
      setSessionValid(false);
      return;
    }
    (async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/v1/mobile-scanner/validate-session/${sessionId}`,
        );
        const data = response.ok ? await response.json() : null;
        setSessionValid(Boolean(data?.valid));
      } catch {
        setSessionValid(false);
      }
    })();
  }, [sessionId]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError(
        t("mobileSign.photo.invalidType", "Please choose an image file."),
      );
      return;
    }
    setPhotoError(null);
    const reader = new FileReader();
    reader.onload = (event) =>
      setPhotoDataUrl((event.target?.result as string) ?? null);
    reader.readAsDataURL(file);
  };

  const currentSignature = useCallback((): string | null => {
    if (tab === "draw") return canvasHandle.current?.exportPng() ?? null;
    if (tab === "type") {
      const text = typedText.trim();
      return text ? renderTypedSignature(text, typeFont, inkColor) : null;
    }
    return photoDataUrl;
  }, [tab, typedText, typeFont, inkColor, photoDataUrl]);

  const canSend =
    (tab === "draw" && hasInk) ||
    (tab === "type" && typedText.trim().length > 0) ||
    (tab === "photo" && photoDataUrl !== null);

  const handleSend = async () => {
    const dataUrl = currentSignature();
    if (!dataUrl || !sessionId) return;

    setIsSending(true);
    setSendError(null);
    try {
      const blob = await dataUrlToBlob(dataUrl);
      const formData = new FormData();
      formData.append("files", blob, `signature-${Date.now()}.png`);

      const response = await fetch(
        `${API_BASE}/api/v1/mobile-scanner/upload/${sessionId}`,
        { method: "POST", body: formData },
      );
      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      setSentCount((count) => count + 1);
      setJustSent(true);
      // Reset the inputs so "send another" starts clean
      canvasHandle.current?.clear();
      setTypedText("");
      setPhotoDataUrl(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    } catch (err) {
      console.error("[MobileSignPage] upload failed:", err);
      setSendError(
        t(
          "mobileSign.sendError",
          "Could not send the signature. Check the connection and try again.",
        ),
      );
    } finally {
      setIsSending(false);
    }
  };

  const header = (
    <Group justify="center" gap="xs" py="md">
      <LogoIcon style={{ width: 28, height: 28 }} />
      <Wordmark style={{ height: 18 }} />
    </Group>
  );

  if (sessionValid === null) {
    return (
      <Box p="md">
        {header}
        <Text ta="center" c="dimmed">
          {t("mobileSign.validating", "Checking session…")}
        </Text>
      </Box>
    );
  }

  if (!sessionValid) {
    return (
      <Box p="md" maw={480} mx="auto">
        {header}
        <Alert
          icon={<ErrorRoundedIcon style={{ fontSize: "1rem" }} />}
          color="red"
          title={t("mobileSign.invalidSession", "Session expired")}
        >
          {t(
            "mobileSign.invalidSessionMessage",
            "This QR code is no longer valid. Open the Sign tool on your computer and scan the new code.",
          )}
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      p={compactLandscape ? "xs" : "md"}
      maw={640}
      mx="auto"
      style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}
    >
      {!compactLandscape && header}

      {justSent && (
        <Alert
          icon={<CheckCircleRoundedIcon style={{ fontSize: "1rem" }} />}
          color="green"
          mb="sm"
          withCloseButton
          onClose={() => setJustSent(false)}
        >
          {t(
            "mobileSign.sentMessage",
            "Signature sent to your computer. You can send another or close this page.",
          )}
        </Alert>
      )}
      {sendError && (
        <Alert
          icon={<ErrorRoundedIcon style={{ fontSize: "1rem" }} />}
          color="red"
          mb="sm"
        >
          {sendError}
        </Alert>
      )}

      <Box mb="sm">
        <SegmentedControl<SignatureTab>
          fullWidth
          value={tab}
          onChange={setTab}
          ariaLabel={t("mobileSign.tabsLabel", "Signature source")}
          options={[
            { value: "draw", label: t("mobileSign.tab.draw", "Draw") },
            { value: "type", label: t("mobileSign.tab.type", "Type") },
            { value: "photo", label: t("mobileSign.tab.photo", "Photo") },
          ]}
        />
      </Box>

      {tab === "draw" && (
        <Stack gap="sm" style={{ flex: 1 }}>
          <Card
            withBorder
            radius="md"
            p={0}
            style={{
              // A DEFINITE height, not flex/min-height: the canvas inside is
              // sized `height: 100%`, which resolves to the 150px intrinsic
              // canvas default when the parent's height is indefinite —
              // leaving most of the visible pad ignoring input. Landscape
              // phones get a shorter, wider pad that still fits on screen.
              height: compactLandscape
                ? "min(50dvh, 14rem)"
                : "min(48dvh, 26rem)",
              flexShrink: 0,
              // Checkerboard-free plain white: signatures are stamped on paper-
              // white pages, so drawing on white shows what you will get.
              background: "white",
              overflow: "hidden",
            }}
          >
            <MobileDrawCanvas
              ref={canvasHandle}
              penColor={inkColor}
              penSize={penSize}
              onHasInkChange={setHasInk}
            />
          </Card>

          <Group justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              {INK_COLORS.map((color) => (
                <Box
                  key={color.value}
                  component="button"
                  onClick={() => setInkColor(color.value)}
                  aria-label={color.label}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: color.value,
                    cursor: "pointer",
                    border:
                      inkColor === color.value
                        ? "3px solid var(--mantine-color-blue-4)"
                        : "3px solid transparent",
                  }}
                />
              ))}
              <SegmentedControl
                size="xs"
                value={String(penSize)}
                onChange={(value) => setPenSize(Number(value))}
                ariaLabel={t("mobileSign.penSizeLabel", "Pen size")}
                options={PEN_SIZES.map((size) => ({
                  value: String(size.value),
                  label: size.label,
                }))}
              />
            </Group>
            <Group gap="xs" wrap="nowrap">
              <DSButton
                variant="secondary"
                size="sm"
                disabled={!hasInk}
                onClick={() => canvasHandle.current?.undo()}
                leftSection={<UndoRoundedIcon style={{ fontSize: 16 }} />}
              >
                {t("mobileSign.undo", "Undo")}
              </DSButton>
              <DSButton
                variant="secondary"
                accent="danger"
                size="sm"
                disabled={!hasInk}
                onClick={() => canvasHandle.current?.clear()}
                leftSection={
                  <DeleteOutlineRoundedIcon style={{ fontSize: 16 }} />
                }
              >
                {t("mobileSign.clear", "Clear")}
              </DSButton>
            </Group>
          </Group>
        </Stack>
      )}

      {tab === "type" && (
        <Stack gap="sm">
          <TextInput
            size="lg"
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            placeholder={t("mobileSign.type.placeholder", "Your name")}
            autoComplete="name"
          />
          <Select
            value={typeFont}
            onChange={(value) => value && setTypeFont(value)}
            data={TYPE_FONTS}
            allowDeselect={false}
          />
          <Group gap="xs">
            {INK_COLORS.map((color) => (
              <Box
                key={color.value}
                component="button"
                onClick={() => setInkColor(color.value)}
                aria-label={color.label}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: color.value,
                  cursor: "pointer",
                  border:
                    inkColor === color.value
                      ? "3px solid var(--mantine-color-blue-4)"
                      : "3px solid transparent",
                }}
              />
            ))}
          </Group>
          <Card
            withBorder
            radius="md"
            style={{
              background: "white",
              minHeight: 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: typeFont,
                fontSize: "2.5rem",
                color: inkColor,
                lineHeight: 1.2,
                wordBreak: "break-word",
              }}
            >
              {typedText ||
                t("mobileSign.type.previewPlaceholder", "Signature preview")}
            </Text>
          </Card>
        </Stack>
      )}

      {tab === "photo" && (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t(
              "mobileSign.photo.hint",
              "Photograph a signature on white paper, or choose an existing image.",
            )}
          </Text>
          {photoDataUrl ? (
            <Card withBorder radius="md" style={{ background: "white" }}>
              <Image
                src={photoDataUrl}
                alt="Signature"
                fit="contain"
                mah={220}
              />
            </Card>
          ) : null}
          <Group grow>
            <DSButton
              variant="secondary"
              onClick={() => cameraInputRef.current?.click()}
              leftSection={<PhotoCameraRoundedIcon style={{ fontSize: 18 }} />}
            >
              {t("mobileSign.photo.takePhoto", "Take a photo")}
            </DSButton>
            <DSButton
              variant="secondary"
              onClick={() => photoInputRef.current?.click()}
              leftSection={
                <AddPhotoAlternateRoundedIcon style={{ fontSize: 18 }} />
              }
            >
              {t("mobileSign.photo.fromGallery", "From gallery")}
            </DSButton>
          </Group>
          {photoError && (
            <Text size="sm" c="red">
              {photoError}
            </Text>
          )}
          {/* Two inputs, not one: `capture` makes the OS open the camera
              directly, but an input carrying it never offers the gallery,
              so each source needs its own. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handlePhotoSelect}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handlePhotoSelect}
          />
        </Stack>
      )}

      <Box mt="md">
        <DSButton
          fullWidth
          size="lg"
          disabled={!canSend}
          loading={isSending}
          onClick={handleSend}
          leftSection={<SendRoundedIcon style={{ fontSize: 18 }} />}
        >
          {sentCount > 0
            ? t("mobileSign.sendAnother", "Send another signature")
            : t("mobileSign.send", "Send to computer")}
        </DSButton>
      </Box>
    </Box>
  );
}
