package stirling.software.proprietary.access.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import stirling.software.proprietary.access.model.PrincipalType;
import stirling.software.proprietary.access.model.ResourceGrant;
import stirling.software.proprietary.access.model.ResourceType;
import stirling.software.proprietary.security.model.User;

public interface ResourceGrantRepository extends JpaRepository<ResourceGrant, Long> {

    List<ResourceGrant> findByResourceTypeAndResourceId(
            ResourceType resourceType, String resourceId);

    List<ResourceGrant> findByResourceTypeAndPrincipalTypeAndPrincipalId(
            ResourceType resourceType, PrincipalType principalType, Long principalId);

    /** All grants held by a principal, across resource types (for the manage-access view). */
    List<ResourceGrant> findByPrincipalTypeAndPrincipalId(
            PrincipalType principalType, Long principalId);

    void deleteByResourceTypeAndResourceId(ResourceType resourceType, String resourceId);

    /** Removes every grant held by a principal; used when the user/team behind it is deleted. */
    void deleteByPrincipalTypeAndPrincipalId(PrincipalType principalType, Long principalId);

    // Detach issued grants so deleting the granting user does not hit the FK.
    @Modifying
    @Query("update ResourceGrant g set g.grantedBy = null where g.grantedBy = :user")
    void clearGrantedBy(@Param("user") User user);

    boolean existsByResourceTypeAndResourceIdAndPrincipalTypeAndPrincipalId(
            ResourceType resourceType,
            String resourceId,
            PrincipalType principalType,
            Long principalId);
}
