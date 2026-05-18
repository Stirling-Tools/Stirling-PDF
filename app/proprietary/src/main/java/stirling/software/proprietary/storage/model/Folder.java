package stirling.software.proprietary.storage.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;

/**
 * A user-owned folder used by the file manager UI to organise stored files. Phase A entity - no
 * folder-level sharing yet (Phase 3).
 *
 * <p>The id is a UUID rather than a numeric auto-increment so it round-trips with the
 * client-generated {@code FolderId} and survives cross-device sync without re-keying.
 */
@Entity
@Table(
        name = "folders",
        indexes = {
            @Index(name = "idx_folders_owner", columnList = "owner_id"),
            @Index(name = "idx_folders_parent", columnList = "parent_folder_id"),
            @Index(name = "idx_folders_owner_parent", columnList = "owner_id, parent_folder_id")
        })
@NoArgsConstructor
@Getter
@Setter
public class Folder implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * Dialect-portable UUID column. The previous {@code columnDefinition = "uuid"} was
     * Postgres-specific and broke on H2/MariaDB. Hibernate's {@code UUID} mapping picks the right
     * native type per dialect (BINARY(16) on H2/MariaDB, uuid on Postgres) when no explicit
     * columnDefinition is set.
     */
    @Id
    @Column(name = "folder_id", nullable = false)
    private UUID id;

    /**
     * {@code OnDeleteAction.CASCADE} so deleting the owning {@code User} cascades to this row at
     * the DB level - UserService.deleteUserRelatedData doesn't enumerate folders today, and leaving
     * the FK without an action throws a constraint violation on user delete.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private User owner;

    /**
     * Parent folder; null = root. {@code OnDeleteAction.CASCADE} so a backend-side parent delete
     * cleans children automatically, matching the service-layer recursive-delete contract.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_folder_id")
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Folder parent;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Column(name = "color", length = 32)
    private String color;

    @Column(name = "icon", length = 64)
    private String icon;

    /**
     * Optimistic-locking version. Cross-PC sync without this lets last-write-win silently. The
     * column is nullable so existing rows from a pre-version deployment can be backfilled by
     * Hibernate's update-on-write rather than failing the ddl-auto upgrade.
     */
    @Version
    @Column(name = "version")
    private Long version;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
