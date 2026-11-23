package stirling.software.saas.repository;

import org.hibernate.query.NativeQuery;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/** See {@link SaasTeamExtensionsRepositoryCustom}. */
class SaasTeamExtensionsRepositoryCustomImpl implements SaasTeamExtensionsRepositoryCustom {

    @PersistenceContext private EntityManager entityManager;

    @Override
    public int incrementSeatsUsed(Long teamId) {
        return entityManager
                .createNativeQuery(INCREMENT_SEATS_SQL)
                .setParameter("teamId", teamId)
                .unwrap(NativeQuery.class)
                // The claim writes only saas_team_extensions; declaring it keeps the commit from
                // evicting every cached region. The subqueries are reads.
                .addSynchronizedQuerySpace("saas_team_extensions")
                .executeUpdate();
    }
}
