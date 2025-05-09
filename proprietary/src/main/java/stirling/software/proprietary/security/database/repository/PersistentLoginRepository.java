<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/database/repository/PersistentLoginRepository.java
package stirling.software.proprietary.security.database.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.PersistentLogin;
========
package stirling.software.enterprise.security.database.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.enterprise.security.model.PersistentLogin;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/database/repository/PersistentLoginRepository.java

@Repository
public interface PersistentLoginRepository extends JpaRepository<PersistentLogin, String> {
    void deleteByUsername(String username);
}
