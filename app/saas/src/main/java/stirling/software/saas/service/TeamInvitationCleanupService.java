package stirling.software.saas.service;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.InvitationStatus;
import stirling.software.saas.model.TeamInvitation;
import stirling.software.saas.repository.TeamInvitationRepository;

/**
 * Scheduled service for cleaning up expired team invitations. Runs daily to mark invitations that
 * have passed their expiration date as EXPIRED.
 */
@Service
@Profile("saas")
@RequiredArgsConstructor
@Slf4j
public class TeamInvitationCleanupService {

    private final TeamInvitationRepository invitationRepository;

    /** Mark expired invitations as EXPIRED. Runs every day at 2:00 AM. */
    @Scheduled(cron = "0 0 2 * * *")
    @Transactional
    public void markExpiredInvitations() {
        try {
            log.info("Starting invitation expiration cleanup job");

            int expiredCount = invitationRepository.markExpiredInvitations(LocalDateTime.now());

            if (expiredCount > 0) {
                log.info("Marked {} invitations as expired", expiredCount);
            } else {
                log.debug("No invitations to expire");
            }
        } catch (Exception e) {
            log.error("Error during invitation cleanup", e);
        }
    }

    /** Delete old expired invitations (older than 30 days). Runs monthly on the 1st at 3:00 AM. */
    @Scheduled(cron = "0 0 3 1 * *")
    @Transactional
    public void deleteOldExpiredInvitations() {
        try {
            log.info("Starting cleanup of old expired invitations");

            LocalDateTime cutoffDate = LocalDateTime.now().minusDays(30);

            List<TeamInvitation> oldInvitations =
                    invitationRepository.findByStatusAndExpiresAtBefore(
                            InvitationStatus.EXPIRED, cutoffDate);

            if (!oldInvitations.isEmpty()) {
                invitationRepository.deleteAll(oldInvitations);
                log.info("Deleted {} old expired invitations", oldInvitations.size());
            } else {
                log.debug("No old expired invitations to delete");
            }
        } catch (Exception e) {
            log.error("Error during old invitation cleanup", e);
        }
    }
}
