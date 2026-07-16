package stirling.software.proprietary.policy.engine;

import java.util.List;

/**
 * What one policy sweep found and started, so a manual trigger can explain an empty result instead
 * of a blanket "nothing to do": how many files the sources listed, how many were skipped because
 * they are already processed at their current version, how many are parked by a failed run (not
 * retried until they change or history is cleared), and how many are still in flight from an
 * earlier sweep. Counts are zero for {@link SweepKind#LIGHT} sweeps, which do not take a full
 * listing.
 */
public record SweepOutcome(
        List<String> runIds, int filesListed, int alreadyProcessed, int parked, int inFlight) {

    public SweepOutcome {
        runIds = runIds == null ? List.of() : List.copyOf(runIds);
    }
}
