package stirling.software.proprietary.policy.webhook;

import java.io.Serializable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * JPA row for a {@link WebhookDelivery}. The index exists because {@code StorageProvider} can only
 * load a key it is handed: this table is how a sweep learns which deliveries are waiting.
 */
@Entity
@Table(
        name = "webhook_deliveries",
        indexes = {
            @Index(name = "idx_webhook_deliveries_webhook", columnList = "webhook_id"),
            @Index(name = "idx_webhook_deliveries_failed_at", columnList = "failed_at")
        })
@NoArgsConstructor
@Getter
@Setter
public class WebhookDeliveryEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 32)
    private String id;

    @Column(name = "webhook_id", nullable = false, length = 64)
    private String webhookId;

    @Column(name = "storage_key", nullable = false, length = 1024)
    private String storageKey;

    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Column(name = "content_type", length = 255)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "received_at", nullable = false)
    private long receivedAt;

    @Column(name = "failed_at")
    private Long failedAt;

    static WebhookDeliveryEntity from(WebhookDelivery delivery) {
        WebhookDeliveryEntity entity = new WebhookDeliveryEntity();
        entity.setId(delivery.id());
        entity.setWebhookId(delivery.webhookId());
        entity.setStorageKey(delivery.storageKey());
        entity.setOriginalFilename(delivery.originalFilename());
        entity.setContentType(delivery.contentType());
        entity.setSizeBytes(delivery.sizeBytes());
        entity.setReceivedAt(delivery.receivedAt());
        entity.setFailedAt(delivery.failedAt());
        return entity;
    }

    WebhookDelivery toDelivery() {
        return new WebhookDelivery(
                id,
                webhookId,
                storageKey,
                originalFilename,
                contentType,
                sizeBytes,
                receivedAt,
                failedAt);
    }
}
