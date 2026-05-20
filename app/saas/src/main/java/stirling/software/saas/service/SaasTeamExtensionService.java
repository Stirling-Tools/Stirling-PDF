package stirling.software.saas.service;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.Team;
import stirling.software.saas.model.SaasTeamExtensions;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;

/**
 * Read/write access to {@link SaasTeamExtensions}. Reads return safe defaults (non-personal team,
 * seat fields zeroed) when no row exists; writes create the row lazily.
 */
@Service
@Profile("saas")
@RequiredArgsConstructor
@Slf4j
public class SaasTeamExtensionService {

    private final SaasTeamExtensionsRepository repository;

    public SaasTeamExtensions getOrCreate(Team team) {
        return repository
                .findByTeamId(team.getId())
                .orElseGet(() -> repository.save(new SaasTeamExtensions(team)));
    }

    /** Whether the team is personal (1-seat owned by a single user). Defaults to false. */
    public boolean isPersonal(Team team) {
        if (team == null || team.getId() == null) {
            return false;
        }
        return repository
                .findByTeamId(team.getId())
                .map(SaasTeamExtensions::isPersonal)
                .orElse(false);
    }

    /** Team type string ("PERSONAL" or "STANDARD"). Defaults to STANDARD. */
    public String getTeamType(Team team) {
        if (team == null || team.getId() == null) {
            return SaasTeamExtensions.TEAM_TYPE_STANDARD;
        }
        return repository
                .findByTeamId(team.getId())
                .map(SaasTeamExtensions::getTeamType)
                .orElse(SaasTeamExtensions.TEAM_TYPE_STANDARD);
    }

    public int getSeatsUsed(Team team) {
        return repository
                .findByTeamId(team.getId())
                .map(SaasTeamExtensions::getSeatsUsed)
                .orElse(0);
    }

    public int getMaxSeats(Team team) {
        return repository.findByTeamId(team.getId()).map(SaasTeamExtensions::getMaxSeats).orElse(1);
    }

    public Long getCreatedByUserId(Team team) {
        return repository
                .findByTeamId(team.getId())
                .map(SaasTeamExtensions::getCreatedByUserId)
                .orElse(null);
    }

    /** Whether the team has unused seats. See {@link SaasTeamExtensions#hasAvailableSeats()}. */
    public boolean hasAvailableSeats(Team team) {
        return repository
                .findByTeamId(team.getId())
                .map(SaasTeamExtensions::hasAvailableSeats)
                .orElse(true);
    }

    /**
     * Whether the team accepts new invitations. See {@link SaasTeamExtensions#canInviteMembers()}.
     */
    public boolean canInviteMembers(Team team) {
        return repository
                .findByTeamId(team.getId())
                .map(SaasTeamExtensions::canInviteMembers)
                .orElse(true);
    }

    /** Atomic seat increment with personal-team cap enforcement. */
    @Transactional
    public int incrementSeatsUsed(Team team) {
        getOrCreate(team);
        return repository.incrementSeatsUsed(team.getId());
    }

    /** Atomic seat decrement, floored at 0. */
    @Transactional
    public int decrementSeatsUsed(Team team) {
        return repository.decrementSeatsUsed(team.getId());
    }

    @Transactional
    public void setPersonal(Team team, boolean personal) {
        SaasTeamExtensions ext = getOrCreate(team);
        ext.setIsPersonal(personal);
        ext.setTeamType(
                personal
                        ? SaasTeamExtensions.TEAM_TYPE_PERSONAL
                        : SaasTeamExtensions.TEAM_TYPE_STANDARD);
        repository.save(ext);
    }

    @Transactional
    public void setSeats(Team team, int seatCount, int maxSeats) {
        SaasTeamExtensions ext = getOrCreate(team);
        ext.setSeatCount(seatCount);
        ext.setMaxSeats(maxSeats);
        repository.save(ext);
    }

    @Transactional
    public void setCreatedByUserId(Team team, Long createdByUserId) {
        SaasTeamExtensions ext = getOrCreate(team);
        ext.setCreatedByUserId(createdByUserId);
        repository.save(ext);
    }
}
