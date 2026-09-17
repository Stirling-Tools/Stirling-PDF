package stirling.software.saas.accountlink;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

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

    /** Local total allowed after subtracting cloud users and other deployments' last reports. */
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
                                                    - team.getSeatsUsed()
                                                    - others);
                        })
                .orElse(null);
    }
}
