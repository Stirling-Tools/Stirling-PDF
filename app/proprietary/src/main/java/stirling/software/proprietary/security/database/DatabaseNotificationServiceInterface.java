package stirling.software.proprietary.security.database;

public interface DatabaseNotificationServiceInterface {
    void notifyBackupsSuccess(String subject, String message);

    void notifyBackupsFailure(String subject, String message);

    void notifyImportsSuccess(String subject, String message);

    void notifyImportsFailure(String subject, String message);
}
