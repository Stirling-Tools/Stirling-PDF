package stirling.software.proprietary.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.*;

import stirling.software.proprietary.model.watchfolder.FileStatus;

@Entity
@Table(
        name = "watch_folder_files",
        uniqueConstraints = {
            @UniqueConstraint(
                    name = "uk_wff_folder_file",
                    columnNames = {"folder_id", "file_id"})
        },
        indexes = {
            @Index(name = "idx_wff_folder", columnList = "folder_id"),
            @Index(name = "idx_wff_file_id", columnList = "file_id"),
            @Index(name = "idx_wff_status", columnList = "status"),
        })
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class WatchFolderFile implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @EqualsAndHashCode.Include
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id", nullable = false)
    @JsonIgnore
    private WatchFolder folder;

    /** Client-side file identifier (matches the IDB file id). */
    @NotBlank
    @Size(max = 128)
    @Column(name = "file_id", nullable = false, length = 128)
    private String fileId;

    @Column(name = "status", nullable = false, length = 16)
    private FileStatus status = FileStatus.PENDING;

    @Size(max = 1024)
    @Column(name = "name", length = 1024)
    private String name;

    @Size(max = 4096)
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "failed_attempts", nullable = false)
    private Integer failedAttempts = 0;

    /**
     * True when this row represents a file that the folder itself created / ingested (e.g. dropped
     * on the folder from disk) and therefore owns — on folder deletion these files can be cleaned
     * up. False when the file comes from the shared sidebar store and must be left alone.
     */
    @Column(name = "owned_by_folder", nullable = false)
    private Boolean ownedByFolder = false;

    /**
     * True while the file has been uploaded to the server-side watch folder and is awaiting
     * processing by the pipeline directory processor (only meaningful when the owning folder's
     * input source is {@code server-folder}).
     */
    @Column(name = "pending_on_server", nullable = false)
    private Boolean pendingOnServer = false;

    /** JSON array of output file ids. */
    @Size(max = 65_536)
    @Column(name = "display_file_ids", columnDefinition = "TEXT")
    private String displayFileIds;

    /** JSON array of server-side output filenames. */
    @Size(max = 65_536)
    @Column(name = "server_output_filenames", columnDefinition = "TEXT")
    private String serverOutputFilenames;

    @CreationTimestamp
    @Column(name = "added_at", updatable = false)
    private LocalDateTime addedAt;

    @Column(name = "processed_at")
    private LocalDateTime processedAt;
}
