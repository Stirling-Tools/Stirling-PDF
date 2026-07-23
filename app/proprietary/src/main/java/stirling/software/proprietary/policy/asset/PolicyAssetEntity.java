package stirling.software.proprietary.policy.asset;

import java.io.Serializable;

import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * JPA row for a {@link PolicyAsset} plus its bytes. Stored in the database (not on disk) so
 * multi-node deployments see the same assets regardless of which node stored or runs a policy.
 * {@code owner} and {@code teamId} are plain values, not foreign keys, matching {@code
 * PolicyEntity}.
 */
@Entity
@Table(name = "policy_assets")
@NoArgsConstructor
@Getter
@Setter
public class PolicyAssetEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "content_type")
    private String contentType;

    @Column(name = "size")
    private long size;

    @Column(name = "owner")
    private String owner;

    @Column(name = "team_id")
    private Long teamId;

    @Column(name = "created_at")
    private long createdAt;

    @Lob
    @Basic(fetch = FetchType.LAZY)
    @Column(name = "data", nullable = false, columnDefinition = "bytea")
    private byte[] data;
}
