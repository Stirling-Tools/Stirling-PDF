package stirling.software.proprietary.security.database.repository;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import stirling.software.proprietary.security.model.PersistentLogin;

@ApplicationScoped
public class PersistentLoginRepository
        implements PanacheRepositoryBase<PersistentLogin, String> {

    @Transactional
    public void deleteByUsername(String username) {
        delete("username", username);
    }
}
