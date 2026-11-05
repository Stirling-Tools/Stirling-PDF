package stirling.software.saas.payg.billing;

import java.time.LocalDateTime;
import java.time.YearMonth;

import stirling.software.saas.payg.policy.PaygTeamExtensions;

/**
 * Monthly included credits, independent of the metered subscription's billing window. Renewal and
 * upgrade semantics must match the SaaS database's {@code refresh_team_included_credits} function.
 */
public record IncludedAllowance(
        LocalDateTime start, LocalDateTime end, long granted, long remaining) {

    /** Preserves issued credits on downgrade and applies only the difference on upgrade. */
    public static IncludedAllowance resolve(
            PaygTeamExtensions ext, long target, LocalDateTime now) {
        target = Math.max(0, target);
        LocalDateTime start = ext.getFreeUnitsPeriodStart();
        LocalDateTime end = ext.getFreeUnitsPeriodEnd();
        if (end == null && start != null) {
            end = start.plusMonths(1);
        }
        if (start == null || end == null || !now.isBefore(end)) {
            start = YearMonth.from(now).atDay(1).atStartOfDay();
            return new IncludedAllowance(start, start.plusMonths(1), target, target);
        }
        long issued = ext.getFreeUnitsGranted() == null ? target : ext.getFreeUnitsGranted();
        long granted = Math.max(issued, target);
        long remaining =
                Math.max(0, ext.getFreeUnitsRemaining() == null ? 0 : ext.getFreeUnitsRemaining());
        return new IncludedAllowance(
                start, end, granted, Math.min(granted, remaining + granted - issued));
    }

    /** Caller must hold the team's row lock and persist the entity in the same transaction. */
    public void store(PaygTeamExtensions ext, long balance) {
        ext.setFreeUnitsPeriodStart(start);
        ext.setFreeUnitsPeriodEnd(end);
        ext.setFreeUnitsGranted(granted);
        ext.setFreeUnitsRemaining(balance);
    }
}
