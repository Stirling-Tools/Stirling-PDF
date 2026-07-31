package stirling.software.proprietary.policy.store;

import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.LockModeType;

@ApplicationScoped
public class PolicyRepository implements PanacheRepositoryBase<PolicyEntity, String> {

    /**
     * Enabled policies, for background triggers to scan for inputs of their trigger type. Which
     * inputs (and their trigger types) a policy carries lives in the JSON blob, so the type filter
     * is applied after parsing rather than in SQL.
     */
    public List<PolicyEntity> findByEnabledTrue() {
        return list("enabled = true");
    }

    /**
     * Policies belonging to a team, in run order (ascending {@code sortOrder}; a null order sorts
     * first, id breaks ties for stability). A {@code null} teamId matches the rows with no team
     * (login-disabled / pre-team data), mirroring the in-memory team filter rather than the empty
     * result a plain {@code = null} would give.
     */
    public List<PolicyEntity> findByTeam(Long teamId) {
        return list(
                "from PolicyEntity p where ((?1 is null and p.teamId is null) or p.teamId = ?1)"
                        + " order by coalesce(p.sortOrder, 0) asc, p.id asc",
                teamId);
    }

    /** All policies in run order - used when team scoping is off (login-disabled). */
    public List<PolicyEntity> findAllOrdered() {
        return list("from PolicyEntity p order by coalesce(p.sortOrder, 0) asc, p.id asc");
    }

    /**
     * The team's policy rows, locked for the transaction (SELECT … FOR UPDATE). Appending a new
     * policy reads the max {@code sortOrder} from these under the lock, so two concurrent creates
     * serialize instead of both reading a stale max and assigning the same position. Must be called
     * inside a transaction.
     */
    public List<PolicyEntity> findByTeamForUpdate(Long teamId) {
        return find("(?1 is null and teamId is null) or teamId = ?1", teamId)
                .withLock(LockModeType.PESSIMISTIC_WRITE)
                .list();
    }
}
