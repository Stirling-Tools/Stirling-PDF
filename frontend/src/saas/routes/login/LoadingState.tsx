import { useTranslation } from "@app/hooks/useTranslation";

export default function LoadingState() {
  const { t } = useTranslation();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f3f4f6",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>⏳</div>
        <p style={{ color: "#6b7280" }}>{t("loading")}</p>
      </div>
    </div>
  );
}
