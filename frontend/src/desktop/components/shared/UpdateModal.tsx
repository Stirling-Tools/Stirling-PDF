import React from 'react';
import CoreUpdateModal from '@core/components/shared/UpdateModal';
import type { UpdateModalProps } from '@core/components/shared/UpdateModal';
import { useVersionInfo } from '@app/hooks/useVersionInfo';

const UpdateModal: React.FC<UpdateModalProps> = (props) => {
  const { desktopVersion } = useVersionInfo();
  return <CoreUpdateModal {...props} isDesktop desktopVersion={desktopVersion} />;
};

export default UpdateModal;
