import { SegmentedControl } from "@shared/components/SegmentedControl";
import { useTranslation } from "react-i18next";

export type SignatureType = "draw" | "upload" | "type";

interface SignatureTypeSelectorProps {
  value: SignatureType;
  onChange: (value: SignatureType) => void;
  disabled?: boolean;
}

export const SignatureTypeSelector: React.FC<SignatureTypeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <SegmentedControl
      value={value}
      onChange={(val) => onChange(val as SignatureType)}
      options={[
        {
          value: "draw",
          label: t("certSign.collab.signRequest.signatureType.draw", "Draw"),
          disabled,
        },
        {
          value: "upload",
          label: t(
            "certSign.collab.signRequest.signatureType.upload",
            "Upload",
          ),
          disabled,
        },
        {
          value: "type",
          label: t("certSign.collab.signRequest.signatureType.type", "Type"),
          disabled,
        },
      ]}
      fullWidth
    />
  );
};
