package stirling.software.proprietary.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.*;

import stirling.software.proprietary.model.watchfolder.FolderScope;
import stirling.software.proprietary.model.watchfolder.InputSource;
import stirling.software.proprietary.model.watchfolder.OutputMode;
import stirling.software.proprietary.model.watchfolder.OutputNamePosition;
import stirling.software.proprietary.model.watchfolder.ProcessingMode;
import stirling.software.proprietary.security.model.User;

@Entity
@Table(
        name = "watch_folders",
        indexes = {
            @Index(name = "idx_wf_owner", columnList = "owner_id"),
            @Index(name = "idx_wf_scope", columnList = "scope"),
        })
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class WatchFolder implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * Client-supplied identifier (matches the IndexedDB folder id used by the React frontend).
     * Using a String PK — rather than an IDENTITY {@code Long} like other entities — keeps the
     * same opaque id across the local IDB cache and the server, so the frontend can round-trip a
     * folder between offline/local mode and server mode without remapping. Callers are expected
     * to supply a UUID (or equivalently collision-resistant string).
     */
    @Id
    @EqualsAndHashCode.Include
    @NotBlank
    @Size(max = 64)
    @Column(name = "id", length = 64)
    private String id;

    @NotBlank
    @Size(max = 255)
    @Column(name = "name", nullable = false)
    private String name;

    @Size(max = 1024)
    @Column(name = "description", length = 1024)
    private String description;

    /** JSON-serialised automation operations array — the full pipeline definition. */
    @Size(max = 65_536)
    @Column(name = "automation_config", columnDefinition = "TEXT")
    private String automationConfig;

    @Size(max = 64)
    @Column(name = "icon", length = 64)
    private String icon;

    @Size(max = 16)
    @Column(name = "accent_color", length = 16)
    private String accentColor;

    /** Visibility scope. Never null — defaulted to {@link FolderScope#PERSONAL}. */
    @Column(name = "scope", nullable = false, length = 16)
    private FolderScope scope = FolderScope.PERSONAL;

    /** Owner of this folder. Null for ORGANISATION-scoped folders. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    @JsonIgnore
    private User owner;

    @Column(name = "order_index")
    private Integer orderIndex;

    @Column(name = "is_default", nullable = false)
    private Boolean isDefault = false;

    @Column(name = "is_paused", nullable = false)
    private Boolean isPaused = false;

    @Column(name = "input_source", nullable = false, length = 32)
    private InputSource inputSource = InputSource.IDB;

    @Column(name = "processing_mode", nullable = false, length = 16)
    private ProcessingMode processingMode = ProcessingMode.LOCAL;

    @Column(name = "output_mode", nullable = false, length = 16)
    private OutputMode outputMode = OutputMode.NEW_FILE;

    @Size(max = 255)
    @Column(name = "output_name", length = 255)
    private String outputName;

    @Column(name = "output_name_position", nullable = false, length = 16)
    private OutputNamePosition outputNamePosition = OutputNamePosition.PREFIX;

    @Column(name = "output_ttl_hours")
    private Integer outputTtlHours;

    @Column(name = "delete_output_on_download", nullable = false)
    private Boolean deleteOutputOnDownload = false;

    @Column(name = "max_retries", nullable = false)
    private Integer maxRetries = 3;

    @Column(name = "retry_delay_minutes", nullable = false)
    private Integer retryDelayMinutes = 5;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "folder", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<WatchFolderFile> files = new ArrayList<>();

    @OneToMany(mappedBy = "folder", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore
    private List<WatchFolderRun> runs = new ArrayList<>();
}
