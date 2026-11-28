import { useState } from "react";
import {
  Alert,
  Anchor,
  Group,
  Radio,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { Icon } from "@editor/ui/Icon";
import { HardwareCertificateInfo } from "@editor/services/hardwareSigningService";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import "@editor/components/shared/signatureFields/SignatureChoiceCard.css";
import "@editor/components/tools/certSign/DigitalIdList.css";

interface DigitalIdListProps {
  certs: HardwareCertificateInfo[];
  selectedAlias?: string;
  onSelect: (alias: string) => void;
  loading: boolean;
  disabled: boolean;
  onRefresh?: () => void;
}

const SCROLL_AFTER = 4;
const SERIAL_SUFFIX_LENGTH = 8;

const isGuidish = (s?: string | null) =>
  !s ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s.trim(),
  );

// A GUID-only subject (Microsoft device certs) is unreadable; the Windows friendly name beats it.
export const digitalIdName = (cert: HardwareCertificateInfo): string => {
  if (cert.subjectCommonName && !isGuidish(cert.subjectCommonName)) {
    return cert.subjectCommonName;
  }
  if (cert.alias && !isGuidish(cert.alias)) {
    return cert.alias;
  }
  return cert.subjectCommonName || cert.alias;
};

export const isUsableDigitalId = (cert: HardwareCertificateInfo) =>
  !cert.expired && !cert.notYetValid;

const sameIdentity = (a: HardwareCertificateInfo, b: HardwareCertificateInfo) =>
  digitalIdName(a) === digitalIdName(b) &&
  a.issuerCommonName === b.issuerCommonName &&
  a.notAfter === b.notAfter;

const useDigitalIdDetails = () => {
  const { t, i18n } = useTranslation();
  const formatDate = (iso?: string) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "short",
    }).format(date);
  };

  return (
    cert: HardwareCertificateInfo,
    siblings: HardwareCertificateInfo[] = [],
  ) => {
    const parts: string[] = [];
    if (
      cert.issuerCommonName &&
      cert.issuerCommonName !== cert.subjectCommonName &&
      cert.issuerCommonName !== digitalIdName(cert)
    ) {
      parts.push(cert.issuerCommonName);
    }
    const date = formatDate(
      cert.expired
        ? cert.notAfter
        : cert.notYetValid
          ? cert.notBefore
          : cert.notAfter,
    );
    if (cert.expired) {
      parts.push(
        t("certSign.hardware.expiredOn", "Expired {{date}}", { date }),
      );
    } else if (cert.notYetValid) {
      parts.push(
        t("certSign.hardware.validFrom", "Valid from {{date}}", { date }),
      );
    } else if (cert.notAfter) {
      parts.push(
        t("certSign.hardware.expiresOn", "Expires {{date}}", { date }),
      );
    }
    if (
      cert.serialNumber &&
      siblings.some((o) => o !== cert && sameIdentity(o, cert))
    ) {
      parts.push(
        t("certSign.hardware.serial", "Serial …{{serial}}", {
          serial: cert.serialNumber.slice(-SERIAL_SUFFIX_LENGTH),
        }),
      );
    }
    return parts.join(" · ");
  };
};

const DigitalIdLocation = ({ cert }: { cert: HardwareCertificateInfo }) => {
  const { t } = useTranslation();
  if (cert.onToken == null) return null;
  const label = cert.onToken
    ? t("certSign.hardware.onToken", "On a security key or smart card")
    : t("certSign.hardware.onDevice", "Stored on this device");
  return (
    <span className="digital-id-location" title={label}>
      <Icon name={cert.onToken ? "usb" : "laptop"} size={12} title={label} />
    </span>
  );
};

const DigitalIdDetails = ({
  cert,
  text,
}: {
  cert: HardwareCertificateInfo;
  text: string;
}) => (
  <Text size="xs" c="dimmed">
    <DigitalIdLocation cert={cert} />
    {text}
  </Text>
);

/** A read-only card for one digital ID, styled like the entries of the list. */
export const DigitalIdSummary = ({
  cert,
}: {
  cert: HardwareCertificateInfo;
}) => {
  const describe = useDigitalIdDetails();
  return (
    <div className="signature-choice-card">
      <Stack gap={0} className={privateContentClassName}>
        <Text className="signature-choice-card-name">
          {digitalIdName(cert)}
        </Text>
        <DigitalIdDetails cert={cert} text={describe(cert)} />
      </Stack>
    </div>
  );
};

const DigitalIdList = ({
  certs,
  selectedAlias,
  onSelect,
  loading,
  disabled,
  onRefresh,
}: DigitalIdListProps) => {
  const { t } = useTranslation();
  const describe = useDigitalIdDetails();
  const [showUnusable, setShowUnusable] = useState(false);

  const sorted = [...certs].sort(
    (a, b) =>
      Number(isGuidish(a.subjectCommonName) && isGuidish(a.alias)) -
        Number(isGuidish(b.subjectCommonName) && isGuidish(b.alias)) ||
      digitalIdName(a).localeCompare(digitalIdName(b)),
  );
  const usable = sorted.filter(isUsableDigitalId);
  const unusable = sorted.filter((c) => !isUsableDigitalId(c));
  const allUnusable = usable.length === 0 && unusable.length > 0;

  const details = (cert: HardwareCertificateInfo) => describe(cert, certs);

  const cardBody = (cert: HardwareCertificateInfo) => (
    <Stack gap={0} className={privateContentClassName}>
      <Text className="signature-choice-card-name">{digitalIdName(cert)}</Text>
      <DigitalIdDetails cert={cert} text={details(cert)} />
    </Stack>
  );

  const card = (cert: HardwareCertificateInfo) => (
    <Radio.Card
      key={cert.alias}
      value={cert.alias}
      className="signature-choice-card"
      disabled={disabled}
    >
      {cardBody(cert)}
    </Radio.Card>
  );

  // Not radios: Mantine's arrow keys step onto disabled cards in the group and stop there.
  const blockedCard = (cert: HardwareCertificateInfo) => (
    <div key={cert.alias} className="signature-choice-card" data-disabled>
      {cardBody(cert)}
    </div>
  );

  const shownUnusable = allUnusable || showUnusable ? unusable : [];
  const visibleCount = usable.length + shownUnusable.length;

  const list =
    loading && certs.length === 0 ? (
      <Stack gap={4}>
        <Skeleton height={46} radius="sm" />
        <Skeleton height={46} radius="sm" />
      </Stack>
    ) : certs.length === 0 ? (
      <Text size="sm" c="dimmed">
        {t(
          "certSign.hardware.noCerts",
          "No digital IDs found. Check your card is inserted, then refresh.",
        )}
      </Text>
    ) : (
      <ScrollArea.Autosize
        mah={visibleCount > SCROLL_AFTER ? 230 : undefined}
        offsetScrollbars="y"
        scrollbarSize={6}
      >
        <Stack gap={4}>
          {usable.length > 0 && (
            <Radio.Group
              value={selectedAlias ?? null}
              onChange={onSelect}
              aria-label={t("certSign.hardware.digitalId", "Digital ID")}
            >
              <Stack gap={4}>{usable.map(card)}</Stack>
            </Radio.Group>
          )}
          {shownUnusable.map(blockedCard)}
        </Stack>
      </ScrollArea.Autosize>
    );

  return (
    <Stack gap={6}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm" fw={500}>
          {t("certSign.hardware.digitalId", "Digital ID")}
        </Text>
        {onRefresh && (
          <ActionIcon
            variant="quiet"
            size="sm"
            aria-label={t("certSign.hardware.refreshList", "Refresh list")}
            title={t("certSign.hardware.refreshList", "Refresh list")}
            onClick={onRefresh}
            loading={loading}
            disabled={disabled}
          >
            <Icon name="refresh-cw" size={14} />
          </ActionIcon>
        )}
      </Group>
      {allUnusable && (
        <Alert color="yellow" variant="light">
          {t(
            "certSign.hardware.allExpired",
            "None of the digital IDs here can sign today.",
          )}
        </Alert>
      )}
      {list}
      {!allUnusable && unusable.length > 0 && (
        <Anchor
          component="button"
          type="button"
          size="xs"
          c="dimmed"
          underline="always"
          className="digital-id-link"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setShowUnusable((v) => !v)}
        >
          {showUnusable
            ? t("certSign.hardware.hideExpired", "Hide expired")
            : t("certSign.hardware.showExpired", "Show {{count}} expired", {
                count: unusable.length,
              })}
        </Anchor>
      )}
    </Stack>
  );
};

export default DigitalIdList;
