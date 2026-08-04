package stirling.software.proprietary.accountlink;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/** Persistence for the singleton {@link AccountLinkSyncState} (combined-billing "Mode A"). */
@ApplicationScoped
public class AccountLinkSyncStateRepository
        implements PanacheRepositoryBase<AccountLinkSyncState, Long> {

    /**
     * Spring Data's {@code save}. The id is assigned rather than generated, so a detached row must
     * merge (insert-or-update); plain {@code persist} would reject the singleton on re-save.
     */
    @Transactional
    public AccountLinkSyncState save(AccountLinkSyncState state) {
        if (state.getId() == null || getEntityManager().contains(state)) {
            persist(state);
            return state;
        }
        return getEntityManager().merge(state);
    }
}
