package stirling.software.proprietary.security.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.ApiCreditConfig;
import stirling.software.proprietary.model.ApiCreditConfig.ScopeType;
import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.security.model.User;

@Repository
public interface ApiCreditConfigRepository extends JpaRepository<ApiCreditConfig, Long> {

    Optional<ApiCreditConfig> findByUserAndIsActiveTrue(User user);

    Optional<ApiCreditConfig> findByOrganizationAndIsActiveTrue(Organization organization);

    Optional<ApiCreditConfig> findByScopeTypeAndRoleNameAndIsActiveTrue(
            ScopeType scopeType, String roleName);

    @Query(
            """
           SELECT c
             FROM ApiCreditConfig c
            WHERE c.isActive = true
              AND c.scopeType = stirling.software.proprietary.model.ApiCreditConfig$ScopeType.ROLE_DEFAULT
              AND c.roleName = :roleName
           """)
    Optional<ApiCreditConfig> findDefaultForRole(@Param("roleName") String roleName);

    List<ApiCreditConfig> findAllByIsActiveTrueOrderByCreatedAtDesc();
}
