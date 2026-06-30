package stirling.software.saas.payg.meter;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Backend-side audit row for one Stripe meter-event POST attempt ({@code payg_meter_event_log},
 * V15). A row is written <em>pending</em> ({@code posted_to_stripe_at} NULL) just before the POST
 * and stamped on success; a failed POST leaves it unposted with the Stripe error captured. Rows
 * still unposted after a short delay are retried by {@link PaygMeterReconcileScheduler} — this is
 * the durability mechanism behind the fail-open meter path, so a Stripe blip never silently
 * under-bills.
 *
 * <p>{@code idempotency_key} is UNIQUE and identical to the key sent to Stripe ({@code
 * process:<jobId>:close}); the unique constraint gives safe at-least-once semantics across the dual
 * meter triggers (completion + stale-close) and reconcile retries.
 */
@Entity
@Table(name = "payg_meter_event_log")
@Getter
@Setter
@NoArgsConstructor
public class PaygMeterEventLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long eventId;

    @Column(name = "team_id", nullable = false)
    private Long teamId;

    @Column(name = "job_id")
    private UUID jobId;

    @Column(name = "idempotency_key", nullable = false, unique = true, length = 128)
    private String idempotencyKey;

    @Column(name = "units", nullable = false)
    private Integer units;

    /**
     * Insert time; the DB column defaults to {@code CURRENT_TIMESTAMP} (set by {@code
     * insertPending}).
     */
    @Column(name = "occurred_at", nullable = false, insertable = false, updatable = false)
    private LocalDateTime occurredAt;

    /** NULL while pending; stamped when the meter-payg-units edge fn returns success. */
    @Column(name = "posted_to_stripe_at")
    private LocalDateTime postedToStripeAt;

    @Column(name = "stripe_error_code", length = 64)
    private String stripeErrorCode;

    @Column(name = "stripe_error_body", columnDefinition = "text")
    private String stripeErrorBody;
}
