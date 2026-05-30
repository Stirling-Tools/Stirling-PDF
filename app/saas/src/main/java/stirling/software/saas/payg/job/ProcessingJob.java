package stirling.software.saas.payg.job;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.JobStatus;
import stirling.software.saas.payg.model.ProcessType;

/**
 * One process — a workflow that may comprise multiple lineage-linked tool calls but is billed once
 * at process open. Closed by an explicit caller, by the frontend, or by the stale-close scheduler.
 */
@Entity
@Table(name = "processing_job")
@NoArgsConstructor
@Getter
@Setter
public class ProcessingJob implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "job_id")
    private UUID id;

    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    @Column(name = "owner_team_id")
    private Long ownerTeamId;

    @Enumerated(EnumType.STRING)
    @Column(name = "process_type", nullable = false, length = 32)
    private ProcessType processType;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 32)
    private JobSource source;

    /** SHA-256 of the union of input file hashes; null if the input set is mixed or unknown. */
    @Column(name = "document_fingerprint", length = 64)
    private String documentFingerprint;

    @Column(name = "doc_units", nullable = false)
    private Integer docUnits = 0;

    @Column(name = "step_count", nullable = false)
    private Integer stepCount = 0;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "last_step_at", nullable = false)
    private LocalDateTime lastStepAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "policy_id", nullable = false)
    private Long policyId;

    /** Filled at close-time; absent while the job is still OPEN. */
    @Column(name = "charged_units")
    private Integer chargedUnits;

    /** Cached money equivalent for receipts; not used by cap evaluation. */
    @Column(name = "charged_cents")
    private Integer chargedCents;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private JobStatus status;

    /** Stable idempotency key for the open-process Stripe meter event. */
    @Column(name = "idempotency_key", unique = true, length = 128)
    private String idempotencyKey;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", columnDefinition = "jsonb")
    private Map<String, Object> metadata = new HashMap<>();
}
