import { useTranslation } from "react-i18next";
import { EmptyState } from "@app/ui/EmptyState";
import { Icon } from "@app/ui/Icon";
import { OptionCard } from "@app/ui/OptionCard";
import {
  CREATE_TAB_ICONS,
  createTabLabel,
  createTabs,
} from "@app/components/tools/sign/createSignature/createTabs";
import type { CreateTab } from "@app/components/tools/sign/createSignature/types";
import styles from "@app/components/tools/sign/wallet/SignatureWalletIntro.module.css";

interface SignatureWalletIntroProps {
  showPhone: boolean;
  browserStorage: boolean;
  disabled: boolean;
  onCreate: (tab: CreateTab) => void;
}

export function SignatureWalletIntro({
  showPhone,
  browserStorage,
  disabled,
  onCreate,
}: SignatureWalletIntroProps) {
  const { t } = useTranslation();
  const privacy = browserStorage
    ? t(
        "sign.wallet.intro.privacyBrowser",
        "Saved signatures stay in this browser.",
      )
    : t(
        "sign.wallet.intro.privacy",
        "Saved signatures are private to you unless you choose to share them.",
      );

  return (
    <div className={styles.intro} data-testid="signature-wallet-intro">
      <EmptyState
        size="compact"
        icon={<Icon name="signature" size={22} />}
        title={t("sign.wallet.intro.title", "Add your signature")}
        description={t(
          "sign.wallet.intro.body",
          "Create it once. It is saved here, ready for every document you sign.",
        )}
      />
      <div className={styles.options}>
        {createTabs(showPhone).map((tab) => (
          <OptionCard
            key={tab}
            padding="tight"
            icon={<Icon name={CREATE_TAB_ICONS[tab]} size={17} />}
            title={createTabLabel(t, tab)}
            disabled={disabled}
            onSelect={() => onCreate(tab)}
          />
        ))}
      </div>
      <p className={styles.privacy}>
        <Icon name="lock" size={14} />
        {privacy}
      </p>
    </div>
  );
}
