package stirling.software.proprietary.policy.review.store;

import java.io.Serializable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * JPA row for a team's {@link stirling.software.proprietary.policy.review.ReviewBucketConfig} — one
 * row per team (or one teamless row when login is disabled), stored as authoritative JSON like the
 * policies table.
 */
@Entity
@Table(name = "policy_review_config")
@NoArgsConstructor
@Getter
@Setter
public class ReviewBucketConfigEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "team_id", unique = true)
    private Long teamId;

    @Column(name = "config_json", columnDefinition = "text")
    private String configJson;
}
