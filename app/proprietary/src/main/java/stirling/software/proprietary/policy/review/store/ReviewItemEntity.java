package stirling.software.proprietary.policy.review.store;

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
 * JPA row for a {@link stirling.software.proprietary.policy.review.ReviewItem}. Mirrors the
 * policies pattern: the whole item lives as JSON in {@code itemJson} (authoritative on read); the
 * scalar columns are denormalized copies for querying — {@code teamId} + {@code status} drive the
 * queue listing, {@code createdAt} its ordering. {@code teamId} is a plain value, not a foreign
 * key, to stay decoupled from the security entities.
 */
@Entity
@Table(name = "policy_review_items")
@NoArgsConstructor
@Getter
@Setter
public class ReviewItemEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "team_id")
    private Long teamId;

    @Column(name = "run_id")
    private String runId;

    @Column(name = "status")
    private String status;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "item_json", columnDefinition = "text")
    private String itemJson;
}
