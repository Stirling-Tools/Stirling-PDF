import { useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { SetupWizard } from '@app/components/SetupWizard';

export const OPEN_SIGN_IN_EVENT = 'stirling:open-sign-in';

export function SignInModal() {
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const handler = () => setOpened(true);
    window.addEventListener(OPEN_SIGN_IN_EVENT, handler);
    return () => window.removeEventListener(OPEN_SIGN_IN_EVENT, handler);
  }, []);

  if (!opened) return null;

  return (
    <Modal
      opened={opened}
      onClose={() => setOpened(false)}
      size={520}
      centered
      withCloseButton={false}
      padding={0}
      radius="lg"
      zIndex={9000}
    >
      <SetupWizard
        noLayout
        onClose={() => setOpened(false)}
        onComplete={() => {
          setOpened(false);
          window.location.reload();
        }}
      />
    </Modal>
  );
}
