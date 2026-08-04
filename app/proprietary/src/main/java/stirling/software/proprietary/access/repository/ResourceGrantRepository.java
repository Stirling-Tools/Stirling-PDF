package stirling.software.proprietary.access.repository;

import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Parameters;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.access.model.PrincipalType;
import stirling.software.proprietary.access.model.ResourceGrant;
import stirling.software.proprietary.access.model.ResourceType;
import stirling.software.proprietary.security.model.User;

@ApplicationScoped
public class ResourceGrantRepository implements PanacheRepositoryBase<ResourceGrant, Long> {

    public List<ResourceGrant> findByResourceTypeAndResourceId(
            ResourceType resourceType, String resourceId) {
        return list("resourceType = ?1 and resourceId = ?2", resourceType, resourceId);
    }

    public List<ResourceGrant> findByResourceTypeAndPrincipalTypeAndPrincipalId(
            ResourceType resourceType, PrincipalType principalType, Long principalId) {
        return list(
                "resourceType = ?1 and principalType = ?2 and principalId = ?3",
                resourceType,
                principalType,
                principalId);
    }

    /** All grants held by a principal, across resource types (for the manage-access view). */
    public List<ResourceGrant> findByPrincipalTypeAndPrincipalId(
            PrincipalType principalType, Long principalId) {
        return list("principalType = ?1 and principalId = ?2", principalType, principalId);
    }

    @Transactional
    public void deleteByResourceTypeAndResourceId(ResourceType resourceType, String resourceId) {
        delete("resourceType = ?1 and resourceId = ?2", resourceType, resourceId);
    }

    /** Removes every grant held by a principal; used when the user/team behind it is deleted. */
    @Transactional
    public void deleteByPrincipalTypeAndPrincipalId(PrincipalType principalType, Long principalId) {
        delete("principalType = ?1 and principalId = ?2", principalType, principalId);
    }

    // Detach issued grants so deleting the granting user does not hit the FK.
    @Transactional
    public void clearGrantedBy(User user) {
        update(
                "update ResourceGrant g set g.grantedBy = null where g.grantedBy = :user",
                Parameters.with("user", user));
    }

    public boolean existsByResourceTypeAndResourceIdAndPrincipalTypeAndPrincipalId(
            ResourceType resourceType,
            String resourceId,
            PrincipalType principalType,
            Long principalId) {
        return count(
                        "resourceType = ?1 and resourceId = ?2 and principalType = ?3 and"
                                + " principalId = ?4",
                        resourceType,
                        resourceId,
                        principalType,
                        principalId)
                > 0;
    }

    /** Spring Data {@code save}: inserts a new grant, dirty-checks a managed one. */
    @Transactional
    public ResourceGrant save(ResourceGrant grant) {
        persist(grant);
        return grant;
    }
}
