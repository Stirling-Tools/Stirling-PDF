package stirling.software.saas.accountlink;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.saas.repository.SaasTeamExtensionsRepository;

/** Fleet capacity uses each active deployment's last report, including offline deployments. */
@Service
@Profile("saas")
@RequiredArgsConstructor
public class FleetSeatService {
    private final LinkedInstanceRepository instances;
    private final SaasTeamExtensionsRepository teams;

    /**
     * Reports are scoped to the authenticated device; unlinked devices cannot restore their count.
     */
    @Transactional
    public void report(Long teamId, Long instanceId, int seats) {
        if (seats < 0) throw new IllegalArgumentException("Seat count must be non-negative");
        if (instances.reportSeats(teamId, instanceId, seats, OffsetDateTime.now(ZoneOffset.UTC))
                != 1) throw new IllegalStateException("Linked instance is no longer active");
    }

    /** For an authenticated active deployment, excludes the required cloud owner from usage. */
    @Transactional(readOnly = true)
    public Integer allowance(Long teamId, Long instanceId) {
        return teams.findByTeamId(teamId)
                .map(
                        team -> {
                            long others = instances.otherDeploymentSeats(teamId, instanceId);
                            return (int)
                                    Math.max(
                                            0L,
                                            (long) team.getMaxSeats()
                                                    - Math.max(0, team.getSeatsUsed() - 1)
                                                    - others);
                        })
                .orElse(null);
    }

    /** Seat sources for the owning team's billing view; null counts have never been reported. */
    public record DeploymentSeats(
            String deviceId, String name, Integer users, OffsetDateTime reportedAt) {}

    /** The single required cloud owner is exempt only while the team has an active deployment. */
    public record Breakdown(
            int cloudUsers, int excludedOwners, List<DeploymentSeats> deployments) {}

    /** Returns the team's active seat sources, or null when its capacity record is unavailable. */
    @Transactional(readOnly = true)
    public Breakdown breakdown(Long teamId) {
        var deployments =
                instances.findByTeamIdOrderByCreatedAtDesc(teamId).stream()
                        .filter(instance -> instance.getRevokedAt() == null)
                        .map(
                                instance ->
                                        new DeploymentSeats(
                                                instance.getDeviceId(),
                                                instance.getName(),
                                                instance.getSeatCount(),
                                                instance.getSeatsReportedAt()))
                        .toList();
        return teams.findByTeamId(teamId)
                .map(
                        team -> {
                            int excluded =
                                    deployments.isEmpty() ? 0 : Math.min(1, team.getSeatsUsed());
                            return new Breakdown(
                                    Math.max(0, team.getSeatsUsed() - excluded),
                                    excluded,
                                    deployments);
                        })
                .orElse(null);
    }
}
