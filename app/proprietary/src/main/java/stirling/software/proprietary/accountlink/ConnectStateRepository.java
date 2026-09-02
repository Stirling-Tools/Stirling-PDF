package stirling.software.proprietary.accountlink;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/** Data access for the singleton {@link ConnectState} row. */
@ApplicationScoped
public class ConnectStateRepository implements PanacheRepositoryBase<ConnectState, Long> {

    /** Spring Data's {@code save}: the id is assigned, so a detached row has to merge. */
    @Transactional
    public ConnectState save(ConnectState state) {
        if (state.getId() == null || getEntityManager().contains(state)) {
            persist(state);
            return state;
        }
        return getEntityManager().merge(state);
    }
}
