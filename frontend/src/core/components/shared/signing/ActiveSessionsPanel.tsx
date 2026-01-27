import { useTranslation } from 'react-i18next';
import { Loader, Center, Text, Badge } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { SignRequestSummary, SessionSummary } from '@app/types/signingSession';

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

interface ActiveSessionsPanelProps {
  sessions: SessionItem[];
  loading: boolean;
  onSessionClick: (session: SessionItem) => void;
  onCreateNew: () => void;
}

const ActiveSessionsPanel = ({
  sessions,
  loading,
  onSessionClick,
  onCreateNew,
}: ActiveSessionsPanelProps) => {
  const { t } = useTranslation();

  const getStatusColor = (status?: string, itemType?: string, item?: SessionItem): string => {
    if (itemType === 'mySession' && item) {
      const signedCount = item.signedCount ?? 0;
      const totalCount = item.participantCount ?? 0;

      if (signedCount === totalCount && totalCount > 0) {
        return 'green';  // All signed
      }
      if (signedCount > 0) {
        return 'yellow'; // Partial
      }
      return 'blue';     // None signed
    }
    switch (status) {
      case 'VIEWED':
        return 'blue';
      case 'NOTIFIED':
      case 'PENDING':
        return 'orange';
      default:
        return 'gray';
    }
  };

  const getStatusLabel = (item: SessionItem): string => {
    if (item.itemType === 'mySession') {
      const signedCount = item.signedCount ?? 0;
      const totalCount = item.participantCount ?? 0;
      if (signedCount === totalCount && totalCount > 0) {
        return t('certSign.readyToFinalize', 'Ready to finalize');
      }
      // Show progress for all cases (including 0/X)
      if (totalCount > 0) {
        return t('certSign.signatureProgress', `${signedCount}/${totalCount} signatures`);
      }
      return t('certSign.awaitingSignatures', 'Awaiting signatures');
    }

    // For sign requests
    switch (item.myStatus) {
      case 'VIEWED':
        return t('certSign.viewed', 'Viewed');
      case 'NOTIFIED':
        return t('certSign.notified', 'Pending');
      case 'PENDING':
        return t('certSign.pending', 'Pending');
      default:
        return item.myStatus || 'PENDING';
    }
  };

  return (
    <div className="quick-access-popout__panel">
      {loading ? (
        <Center p="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <>
          {sessions.length === 0 ? (
            <div className="quick-access-popout__section">
              <Text size="sm" c="dimmed" ta="center" py="xl">
                {t('quickAccess.noActiveSessions', 'No pending sign requests or active sessions')}
              </Text>
            </div>
          ) : (
            <>
              <div className="quick-access-popout__section" style={{ marginBottom: '0.5rem' }}>
                <div className="quick-access-popout__label">
                  {t('quickAccess.allSessions', 'All Sessions')}
                </div>
              </div>
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
                    <Badge size="sm" color={getStatusColor(session.myStatus, session.itemType, session)}>
                      {getStatusLabel(session)}
                    </Badge>
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="quick-access-popout__section" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="quick-access-popout__primary"
              onClick={onCreateNew}
              style={{ width: '100%' }}
            >
              <LocalIcon icon="add-rounded" width="1rem" height="1rem" />
              {t('quickAccess.createNew', 'Create New Request')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ActiveSessionsPanel;
