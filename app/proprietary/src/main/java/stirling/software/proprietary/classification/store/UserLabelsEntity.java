package stirling.software.proprietary.classification.store;

import java.io.Serializable;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * JPA row for a user's personal (additive) classification labels — one row per user. The label set
 * lives as JSON in {@code labelsJson} (authoritative on read). {@code userId} is the natural key;
 * the sentinel {@link #NO_USER} stands in for the login-disabled single-operator case, mirroring
 * {@link TeamLabelsEntity#NO_TEAM}. Kept decoupled from the security entities — {@code userId} is a
 * plain value, not a foreign key — so classification can be enabled or disabled without touching
 * them.
 */
@Entity
@Table(name = "classification_user_labels")
@NoArgsConstructor
@Getter
@Setter
public class UserLabelsEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * Sentinel key for the personal label set when there is no resolvable user (login disabled).
     */
    public static final long NO_USER = 0L;

    @Id
    @Column(name = "user_id")
    private long userId;

    @Column(name = "labels_json", columnDefinition = "text")
    private String labelsJson;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
