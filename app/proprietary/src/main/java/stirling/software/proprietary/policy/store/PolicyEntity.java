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
 * JPA row for a {@link stirling.software.proprietary.policy.model.Policy}.
 *
 * <p>The whole policy is stored as JSON in {@code policyJson} (authoritative on read, and the same
 * serialization the API uses); the scalar columns are denormalized copies for querying - notably
 * {@code triggerType} + {@code enabled} so background triggers can fetch their policies. Ownership
 * is a plain {@code owner} string rather than a foreign key, to stay decoupled from the security
 * entities; richer team scoping can be layered on later.
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

    @Column(name = "policy_json", columnDefinition = "text")
    private String policyJson;
}
