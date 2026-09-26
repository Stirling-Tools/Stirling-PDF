import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@app/ui/Modal";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { uniqueName } from "@app/utils/uniqueName";
import {
  PHONE_DRAWING_CLEANUP,
  cleanUpSignatureImage,
} from "@app/utils/signatureImage";
import type { MobileSignaturePayload } from "@app/components/tools/sign/MobileSignatureModal";
import { DrawSignaturePanel } from "@app/components/tools/sign/createSignature/DrawSignaturePanel";
import { TypeSignaturePanel } from "@app/components/tools/sign/createSignature/TypeSignaturePanel";
import { UploadSignaturePanel } from "@app/components/tools/sign/createSignature/UploadSignaturePanel";
import { PhoneSignaturePanel } from "@app/components/tools/sign/createSignature/PhoneSignaturePanel";
import {
  SaveSignatureOptions,
  toSaveChoice,
  type SaveLibraryLimits,
  type SaveOptionsState,
} from "@app/components/tools/sign/createSignature/SaveSignatureOptions";
import {
  CREATE_TAB_ICONS,
  createTabLabel,
  createTabs,
  defaultSignatureName,
} from "@app/components/tools/sign/createSignature/createTabs";
import type {
  CreateTab,
  CreatedSignature,
  SaveChoice,
  SignaturePanelHandle,
  TypePanelHandle,
  UploadPanelHandle,
} from "@app/components/tools/sign/createSignature/types";
import { useTabReadiness } from "@app/components/tools/sign/createSignature/useTabReadiness";
import styles from "@app/components/tools/sign/createSignature/CreateSignatureModal.module.css";

interface CreateSignatureModalProps {
  initialTab: CreateTab;
  onClose: () => void;
  onCreate: (
    created: CreatedSignature,
    save: SaveChoice | null,
  ) => Promise<void>;
  limits: SaveLibraryLimits;
  showPhoneTab: boolean;
  existingLabels: string[];
}

export function CreateSignatureModal({
  initialTab,
  onClose,
  onCreate,
  limits,
  showPhoneTab,
  existingLabels,
}: CreateSignatureModalProps) {
  const { t } = useTranslation();
  const tabs = createTabs(showPhoneTab);
  const [tab, setTab] = useState<CreateTab>(
    tabs.includes(initialTab) ? initialTab : "draw",
  );
  const { ready, handlers } = useTabReadiness();
  const [phoneResult, setPhoneResult] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveOptionsState>({
    enabled: limits.canSave,
    label: null,
    scope: "personal",
    makeDefault: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const drawRef = useRef<SignaturePanelHandle>(null);
  const typeRef = useRef<TypePanelHandle>(null);
  const uploadRef = useRef<UploadPanelHandle>(null);

  const defaultLabel = uniqueName(defaultSignatureName(t, tab), existingLabels);

  const handlePhoneReceived = useCallback(
    (payload: MobileSignaturePayload) => {
      if (payload.kind === "photo") {
        uploadRef.current?.loadSource(payload.dataUrl, "phone-photo.png");
        setTab("upload");
        return;
      }
      if (payload.kind === "text") {
        typeRef.current?.setName(payload.text);
        setTab("type");
        return;
      }
      cleanUpSignatureImage(payload.dataUrl, PHONE_DRAWING_CLEANUP).then(
        (dataUrl) => {
          setPhoneResult(dataUrl);
          handlers.phone(true);
        },
      );
    },
    [handlers],
  );

  async function currentResult(): Promise<CreatedSignature | null> {
    if (tab === "phone") {
      return phoneResult
        ? { source: "phone", type: "canvas", dataUrl: phoneResult }
        : null;
    }
    const panels = { draw: drawRef, type: typeRef, upload: uploadRef };
    return (await panels[tab].current?.getResult()) ?? null;
  }

  async function handleUse() {
    setSubmitting(true);
    try {
      const created = await currentResult();
      if (created) {
        await onCreate(created, toSaveChoice(saveState, defaultLabel, limits));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const tabOptions = tabs.map((value) => ({
    value,
    label: (
      <span className={styles.tabLabel}>
        <Icon name={CREATE_TAB_ICONS[value]} size={15} />
        {createTabLabel(t, value)}
      </span>
    ),
  }));

  const footer = (
    <div className={styles.footer}>
      <Button variant="tertiary" onClick={onClose}>
        {t("sign.wallet.create.cancel", "Cancel")}
      </Button>
      <Button
        leftSection={<Icon name="check" size={16} />}
        onClick={handleUse}
        disabled={!ready[tab]}
        loading={submitting}
        data-testid="use-signature"
      >
        {t("sign.wallet.create.use", "Use signature")}
      </Button>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={t("sign.wallet.create.title", "New signature")}
      subtitle={t(
        "sign.wallet.create.subtitle",
        "Create it once, reuse it on any document.",
      )}
      width="lg"
      footer={footer}
    >
      <div className={styles.body}>
        <SegmentedControl
          options={tabOptions}
          value={tab}
          onChange={setTab}
          fullWidth
          ariaLabel={t("sign.wallet.create.method", "How to create it")}
        />
        <div hidden={tab !== "draw"}>
          <DrawSignaturePanel ref={drawRef} onReadyChange={handlers.draw} />
        </div>
        <div hidden={tab !== "type"}>
          <TypeSignaturePanel
            ref={typeRef}
            onReadyChange={handlers.type}
            saveEnabled={saveState.enabled && limits.canSave}
          />
        </div>
        <div hidden={tab !== "upload"}>
          <UploadSignaturePanel
            ref={uploadRef}
            onReadyChange={handlers.upload}
          />
        </div>
        {showPhoneTab && (
          <div hidden={tab !== "phone"}>
            <PhoneSignaturePanel
              active={tab === "phone"}
              received={phoneResult}
              onReceived={handlePhoneReceived}
            />
          </div>
        )}
        <SaveSignatureOptions
          value={saveState}
          onChange={setSaveState}
          defaultLabel={defaultLabel}
          limits={limits}
        />
      </div>
    </Modal>
  );
}
