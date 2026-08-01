package stirling.software.saas.payg.job;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.UUID;

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

import stirling.software.saas.payg.model.JobStepStatus;

/** One tool invocation inside a {@link ProcessingJob}. Free after the first; carries audit data. */
@Entity
@Table(name = "processing_job_step")
@NoArgsConstructor
@Getter
@Setter
public class ProcessingJobStep implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "step_id")
    private Long id;

    @Column(name = "job_id", nullable = false)
    private UUID jobId;

    /** Endpoint path, e.g. {@code /api/v1/general/split-pages}. */
    @Column(name = "tool_id", nullable = false, length = 128)
    private String toolId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private JobStepStatus status;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "input_pages")
    private Integer inputPages;

    @Column(name = "input_bytes")
    private Long inputBytes;

    @Column(name = "error_code", length = 64)
    private String errorCode;
}
