import { useTranslation } from 'react-i18next';
import { Loader, Center, Text, Badge } from '@mantine/core';

interface SessionItem {
  itemType: 'signRequest' | 'mySession';
  sessionId: string;
  documentName: string;
  createdAt: string;
  myStatus?: string;
  ownerUsername?: string;
  ownerEmail?: string;
  dueDate?: string;
  finalized?: boolean;
  signedCount?: number;
  participantCount?: number;
}

interface CompletedSessionsPanelProps {
  sessions: SessionItem[];
  loading: boolean;
  onSessionClick: (session: SessionItem) => void;
}

const CompletedSessionsPanel = ({
  sessions,
  loading,
  onSessionClick,
}: CompletedSessionsPanelProps) => {
  const { t } = useTranslation();

  const getStatusColor = (status?: string, itemType?: string): string => {
    if (itemType === 'mySession') return 'green';
    switch (status) {
      case 'SIGNED':
        return 'green';
      case 'DECLINED':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusLabel = (item: SessionItem): string => {
    if (item.itemType === 'mySession') {
      return t('certSign.finalized', 'Finalized');
    }

    // For sign requests
    switch (item.myStatus) {
      case 'SIGNED':
        return t('certSign.signed', 'Signed');
      case 'DECLINED':
        return t('certSign.declined', 'Declined');
      default:
        return item.myStatus || 'COMPLETED';
    }
  };

  return (
    <div className="quick-access-popout__panel">
      {loading ? (
        <Center p="xl">
          <Loader size="sm" />
        </Center>
      ) : sessions.length === 0 ? (
        <div className="quick-access-popout__section">
          <Text size="sm" c="dimmed" ta="center" py="xl">
            {t('quickAccess.noCompletedSessions', 'No completed sessions')}
          </Text>
        </div>
      ) : (
        <>
          {sessions.map((session) => (
            <div
              key={`${session.itemType}-${session.sessionId}`}
              className="quick-access-popout__sign-request-row"
              onClick={() => onSessionClick(session)}
            >
              <div className="quick-access-popout__sign-request-info">
                <div className="quick-access-popout__row-title">{session.documentName}</div>
                <div className="quick-access-popout__row-subtitle">
                  {session.itemType === 'signRequest' ? (
                    <>
                      From: {session.ownerUsername}
                      {session.dueDate && ` • Due: ${new Date(session.dueDate).toLocaleDateString()}`}
                    </>
                  ) : (
                    <>
                      Created: {new Date(session.createdAt).toLocaleDateString()}
                      {session.signedCount !== undefined &&
                        session.participantCount !== undefined &&
                        ` • ${session.signedCount}/${session.participantCount} signed`}
                    </>
                  )}
                </div>
              </div>
              <div className="quick-access-popout__sign-request-badge">
                <Badge size="sm" color={getStatusColor(session.myStatus, session.itemType)}>
                  {getStatusLabel(session)}
                </Badge>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default CompletedSessionsPanel;
