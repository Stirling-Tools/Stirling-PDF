package stirling.software.saas.store;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One pipeline store listing ({@code store_listing}). Holds the latest sanitised manifest only:
 * republishing overwrites it under the same {@link #storeId}, and installed copies are never
 * touched or told. Publisher identity ({@link #publisherTeamId}, {@link #publishedByUserId}) is
 * team-scoped data and must never reach a public DTO. Removal is soft so the id stays resolvable
 * and the team can bring the listing back by republishing; a staff removal cannot be undone by the
 * team.
 */
@Entity
@Table(name = "store_listing")
@Getter
@Setter
@NoArgsConstructor
public class StoreListing {

    public enum Status {
        LISTED,
        REMOVED
    }

    public enum RemovedBy {
        TEAM,
        STAFF
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "store_id", nullable = false, unique = true, length = 16)
    private String storeId;

    @Column(name = "slug", nullable = false, length = 120)
    private String slug;

    @Column(name = "name", nullable = false, length = 80)
    private String name;

    @Column(name = "description", nullable = false, length = 500)
    private String description;

    @Column(name = "category", nullable = false, length = 40)
    private String category;

    @Column(name = "icon", length = 40)
    private String icon;

    @Column(name = "publisher_team_id", nullable = false)
    private Long publisherTeamId;

    @Column(name = "published_by_user_id")
    private Long publishedByUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status = Status.LISTED;

    @Enumerated(EnumType.STRING)
    @Column(name = "removed_by", length = 16)
    private RemovedBy removedBy;

    @Column(name = "curated", nullable = false)
    private boolean curated;

    @Column(name = "manifest_json", nullable = false, columnDefinition = "text")
    private String manifestJson;

    @Column(name = "manifest_schema_version", nullable = false)
    private int manifestSchemaVersion = StoreManifest.SCHEMA_VERSION;

    /** JSON array of the step operation paths, in order: the tool filter and card icons read it. */
    @Column(name = "tools_json", nullable = false, columnDefinition = "text")
    private String toolsJson = "[]";

    @Column(name = "needs_connections", nullable = false)
    private boolean needsConnections;

    @Column(name = "latest_change", length = 300)
    private String latestChange;

    @Column(name = "rights_accepted_at")
    private LocalDateTime rightsAcceptedAt;

    @Column(name = "star_count", nullable = false)
    private int starCount;

    @Column(name = "install_count", nullable = false)
    private int installCount;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** Last publish or republish, shown as "Updated". Not bumped by stars or installs. */
    @Column(name = "published_at", nullable = false)
    private LocalDateTime publishedAt;

    public boolean isListed() {
        return status == Status.LISTED;
    }
}
