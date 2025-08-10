import { Notification } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export interface ErrorNotificationProps {
  error: string | null;
  onClose: () => void;
  title?: string;
  color?: string;
  mb?: string;
}

const ErrorNotification = ({
  error,
  onClose,
  title,
  color = 'red',
  mb = 'md'
}: ErrorNotificationProps) => {
  const { t } = useTranslation();

  if (!error) return null;

  return (
    <Notification
      color={color}
      title={title || t("error._value", "Error")}
      onClose={onClose}
      mb={mb}
    >
      {error}
    </Notification>
  );
}

export default ErrorNotification;
