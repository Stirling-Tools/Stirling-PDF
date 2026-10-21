import { useState, type CSSProperties } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { CodeBlock } from "@app/ui/CodeBlock";
import { Icon } from "@app/ui/Icon";
import { Select } from "@app/ui/Select";
import {
  DOCKER_COMPOSE_FILE,
  dockerRunCommand,
  HELM_INSTALL_COMMAND,
  JAR_RUN_COMMAND,
  SELF_HOST_GUIDES,
  SERVER_JAR_URL,
} from "@app/constants/selfHosting";
import { RunLocationStepLayout } from "@app/components/runLocation/RunLocationStepLayout";
import styles from "@app/components/runLocation/RunLocation.module.css";

type SelfHostMethod = "docker" | "compose" | "kubernetes" | "manual";

const COMMANDS: Record<SelfHostMethod, string> = {
  docker: dockerRunCommand(),
  compose: DOCKER_COMPOSE_FILE,
  kubernetes: HELM_INSTALL_COMMAND,
  manual: `curl -LO ${SERVER_JAR_URL}\n${JAR_RUN_COMMAND}`,
};

const GUIDES: Record<SelfHostMethod, string> = {
  docker: SELF_HOST_GUIDES.docker,
  compose: SELF_HOST_GUIDES.docker,
  kubernetes: SELF_HOST_GUIDES.kubernetes,
  manual: SELF_HOST_GUIDES.manual,
};

const METHODS: SelfHostMethod[] = ["docker", "compose", "kubernetes", "manual"];

// The command box is sized for the longest command, so switching method never
// resizes the card.
const COMMAND_LINES = Math.max(
  ...Object.values(COMMANDS).map((command) => command.split("\n").length),
);

const SERVER_URL = "http://<your-server>:8080";

const COPIED_RESET_MS = 1500;

interface SelfHostStepProps {
  onBack: () => void;
}

export function SelfHostStep({ onBack }: SelfHostStepProps) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<SelfHostMethod>("docker");
  const [copied, setCopied] = useState(false);

  const methodName = (id: SelfHostMethod) =>
    t(`runLocation.server.method.${id}`, id);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COMMANDS[method]);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard is blocked outside secure contexts; the command stays selectable.
    }
  };

  return (
    <RunLocationStepLayout
      onBack={onBack}
      title={t("runLocation.server.title", "Set up your server")}
      subtitle={t(
        "runLocation.server.subtitle",
        "Run this on your server, then open it in a browser.",
      )}
    >
      <div className={styles.settingRow}>
        <span className={styles.settingLabel} id="run-location-method">
          {t("runLocation.server.methodLabel", "Run it with")}
        </span>
        <div className={styles.settingControl}>
          <Select
            aria-labelledby="run-location-method"
            options={METHODS.map((id) => ({
              value: id,
              label: methodName(id),
            }))}
            value={method}
            onChange={(value) => {
              if (!value) return;
              setMethod(value as SelfHostMethod);
              setCopied(false);
            }}
          />
        </div>
      </div>
      <div
        className={styles.command}
        style={{ "--command-lines": COMMAND_LINES } as CSSProperties}
      >
        <CodeBlock
          code={COMMANDS[method]}
          lang={method === "compose" ? "plain" : "bash"}
          copyable={false}
        />
      </div>
      <Button
        variant="primary"
        fat
        fullWidth
        leftSection={<Icon name={copied ? "check" : "copy"} size={18} />}
        onClick={copy}
      >
        {copied
          ? t("runLocation.server.copied", "Copied")
          : method === "compose"
            ? t("runLocation.server.copyCompose", "Copy compose file")
            : t("runLocation.server.copy", "Copy command")}
      </Button>
      <div className={styles.note}>
        <Icon name="info" size={16} className={styles.noteIcon} />
        <div className={styles.noteBody}>
          <p className={styles.noteText}>
            <Trans
              t={t}
              i18nKey="runLocation.server.note"
              defaults="Then open <url/> to finish setup."
              components={{
                url: <code className={styles.inlineCode}>{SERVER_URL}</code>,
              }}
            />
          </p>
          <a
            className={styles.noteLink}
            href={GUIDES[method]}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("runLocation.server.guide", "{{method}} install guide", {
              method: methodName(method),
            })}
            <Icon name="external-link" size={14} />
          </a>
        </div>
      </div>
    </RunLocationStepLayout>
  );
}
