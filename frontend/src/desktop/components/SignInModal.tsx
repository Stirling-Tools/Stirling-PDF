import { useEffect, useState } from "react";
import { Modal } from "@mantine/core";
import { SetupWizard } from "@app/components/SetupWizard";
import { OPEN_SIGN_IN_EVENT } from "@app/constants/signInEvents";
import { Z_INDEX_SIGN_IN_MODAL } from "@app/styles/zIndex";

export function SignInModal() {
  const [opened, setOpened] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setLocked(detail?.locked === true);
      setOpened(true);
    };
    window.addEventListener(OPEN_SIGN_IN_EVENT, handler);
    return () => window.removeEventListener(OPEN_SIGN_IN_EVENT, handler);
  }, []);

  if (!opened) return null;

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!locked) setOpened(false);
      }}
      size={520}
      centered
      withCloseButton={false}
      closeOnClickOutside={!locked}
      closeOnEscape={!locked}
      padding={0}
      radius="lg"
      zIndex={Z_INDEX_SIGN_IN_MODAL}
    >
      <SetupWizard
        noLayout
        onClose={() => setOpened(false)}
        onComplete={() => {
          setOpened(false);
          // No reload needed — AppProviders remounts the SaaS provider tree via
          // connectionModeService subscription when mode changes.
        }}
      />
    </Modal>
  );
}
