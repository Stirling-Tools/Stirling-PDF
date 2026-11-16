package stirling.software.saas.payg.repository;

import java.util.UUID;

/**
 * The idempotent meter-log insert: {@code ON CONFLICT (idempotency_key) DO NOTHING} collapses the
 * two meter triggers and reconcile retries to one row without an exception, which an ORM insert
 * cannot preserve. Declares its table so the commit scopes cache invalidation to {@code
 * payg_meter_event_log} instead of discarding every region.
 */
public interface PaygMeterEventLogRepositoryCustom {

    void insertPending(Long teamId, UUID jobId, String key, int units);
}
