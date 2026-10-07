package stirling.software.proprietary.policy.webhook;

/**
 * One document a webhook delivered, held in app storage until every policy fed by that webhook has
 * processed it. {@code failedAt} is the last time a run on it ended without success, or null while
 * it has only ever succeeded or never run; retention is measured from it.
 */
public record WebhookDelivery(
        String id,
        String webhookId,
        String storageKey,
        String originalFilename,
        String contentType,
        long sizeBytes,
        long receivedAt,
        Long failedAt) {

    /**
     * The ledger identity: stable for the delivery's lifetime and name-shaped, so a run displays
     * the document it is processing by it. Not a filesystem path, so nothing about where the bytes
     * sit is exposed through it.
     */
    public String identity() {
        return webhookId + "/" + id + "-" + originalFilename;
    }

    /** A delivery never changes once stored, so its version gate is a constant. */
    public String gate() {
        return sizeBytes + ":" + receivedAt;
    }

    public WebhookDelivery withFailedAt(long failedAtMillis) {
        return new WebhookDelivery(
                id,
                webhookId,
                storageKey,
                originalFilename,
                contentType,
                sizeBytes,
                receivedAt,
                failedAtMillis);
    }
}
