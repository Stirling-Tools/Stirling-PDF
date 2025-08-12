package stirling.software.proprietary.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.model.ApiRateLimitConfig;
import stirling.software.proprietary.model.ApiRateLimitConfig.ScopeType;
import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.security.model.User;

@Repository
public interface ApiRateLimitConfigRepository extends JpaRepository<ApiRateLimitConfig, Long> {

    Optional<ApiRateLimitConfig> findByUserAndIsActiveTrue(User user);

    Optional<ApiRateLimitConfig> findByOrganizationAndIsActiveTrue(Organization organization);

    Optional<ApiRateLimitConfig> findByScopeTypeAndRoleNameAndIsActiveTrue(ScopeType scopeType, String roleName);

    @Query("""
           SELECT c
             FROM ApiRateLimitConfig c
            WHERE c.isActive = true
              AND c.scopeType = stirling.software.proprietary.model.ApiRateLimitConfig$ScopeType.ROLE_DEFAULT
              AND c.roleName = :roleName
           """)
    Optional<ApiRateLimitConfig> findDefaultForRole(@Param("roleName") String roleName);

}