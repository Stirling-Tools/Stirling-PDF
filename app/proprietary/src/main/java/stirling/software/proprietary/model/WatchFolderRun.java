package stirling.software.proprietary.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import lombok.*;

import stirling.software.proprietary.model.watchfolder.RunStatus;

@Entity
@Table(
        name = "watch_folder_runs",
        indexes = {
            @Index(name = "idx_wfr_folder", columnList = "folder_id"),
        })
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class WatchFolderRun implements Serializable {

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

    @NotBlank
    @Size(max = 128)
    @Column(name = "input_file_id", nullable = false, length = 128)
    private String inputFileId;

    @Size(max = 128)
    @Column(name = "display_file_id", length = 128)
    private String displayFileId;

    /** JSON array of all output file ids. */
    @Size(max = 65_536)
    @Column(name = "display_file_ids", columnDefinition = "TEXT")
    private String displayFileIds;

    @Column(name = "status", nullable = false, length = 16)
    private RunStatus status = RunStatus.PROCESSING;

    @Column(name = "processed_at")
    private LocalDateTime processedAt;
}
