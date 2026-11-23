package stirling.software.saas.repository;

/**
 * The atomic seat claim: one conditional UPDATE over {@code saas_team_extensions}, {@code
 * linked_instance} and {@code procurement_deal}, where 0 rows means capacity is exhausted and no
 * lock is taken - which a locked read-modify-write in ORM would not preserve. Declares its table so
 * the commit scopes cache invalidation to {@code saas_team_extensions}.
 */
public interface SaasTeamExtensionsRepositoryCustom {

    /**
     * The claim as a standalone statement, so tests can execute it against a database without
     * booting Hibernate.
     */
    String INCREMENT_SEATS_SQL =
            "UPDATE stirling_pdf.saas_team_extensions e SET seats_used = seats_used + 1 WHERE"
                    + " team_id = :teamId AND ("
                    + SaasTeamExtensionsRepository.FLEET_SEATS
                    + " < max_seats OR "
                    + SaasTeamExtensionsRepository.ENTERPRISE_ACCESS
                    + ")";

    int incrementSeatsUsed(Long teamId);
}
