package stirling.software.proprietary.policy.store;

import java.io.Serializable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * JPA row for a {@link stirling.software.proprietary.policy.model.Policy}. The whole policy lives
 * as JSON in {@code policyJson} (authoritative on read); the scalar columns are denormalized copies
 * for querying, notably {@code triggerType} + {@code enabled} so background triggers can fetch
 * their policies, and {@code teamId} so the caller's team can be loaded without scanning every
 * team's rows. {@code owner} and {@code teamId} are plain values, not foreign keys, to stay
 * decoupled from the security entities.
 */
@Entity
@Table(name = "policies")
@NoArgsConstructor
@Getter
@Setter
public class PolicyEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "name")
    private String name;

    @Column(name = "owner")
    private String owner;

    @Column(name = "enabled")
    private boolean enabled;

    @Column(name = "trigger_type")
    private String triggerType;

    @Column(name = "team_id")
    private Long teamId;

    @Column(name = "policy_json", columnDefinition = "text")
    private String policyJson;
}
