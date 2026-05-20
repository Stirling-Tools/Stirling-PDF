import { ActionIcon } from "@mantine/core";
import CloseIcon from "@mui/icons-material/Close";
import { useLogoAssets } from "@app/hooks/useLogoAssets";

interface LoginHeaderProps {
  title: string;
  subtitle?: string;
  centerOnly?: boolean;
  onClose?: () => void;
}

/**
 * Desktop override of LoginHeader.
 * Renders icon + title + optional close button all in one row.
 */
export default function LoginHeader({
  title,
  subtitle,
  centerOnly = false,
  onClose,
}: LoginHeaderProps) {
  const { tooltipLogo } = useLogoAssets();

  return (
    <div
      className={`login-header${centerOnly ? " login-header-centered" : ""}`}
      style={{ marginBottom: "2rem" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            flex: 1,
            minWidth: 0,
          }}
        >
          <img
            src={tooltipLogo}
            alt="Stirling PDF"
            style={{ width: 36, height: 36, flexShrink: 0 }}
          />
          {title && (
            <h1 className="login-title" style={{ margin: 0 }}>
              {title}
            </h1>
          )}
        </div>
        {onClose && (
          <ActionIcon
            onClick={onClose}
            radius="md"
            size={32}
            variant="subtle"
            style={{
              flexShrink: 0,
              color: "var(--text-secondary)",
              outline: "none",
            }}
          >
            <CloseIcon fontSize="small" />
          </ActionIcon>
        )}
      </div>
      {subtitle && <p className="login-subtitle">{subtitle}</p>}
    </div>
  );
}
