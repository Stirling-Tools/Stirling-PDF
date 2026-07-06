package stirling.software.proprietary.policy.source;

import java.io.Serializable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * JPA row for a {@link Source}. The whole source lives as JSON in {@code sourceJson} (authoritative
 * on read); the scalar columns are denormalized copies for querying. {@code owner} and {@code
 * teamId} are plain values, not foreign keys, to stay decoupled from the security entities -
 * matching {@link stirling.software.proprietary.policy.store.PolicyEntity}.
 */
@Entity
@Table(name = "policy_sources")
@NoArgsConstructor
@Getter
@Setter
public class SourceEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "name")
    private String name;

    @Column(name = "type")
    private String type;

    @Column(name = "owner")
    private String owner;

    @Column(name = "team_id")
    private Long teamId;

    @Column(name = "enabled")
    private boolean enabled;

    @Column(name = "source_json", columnDefinition = "text")
    private String sourceJson;
}
