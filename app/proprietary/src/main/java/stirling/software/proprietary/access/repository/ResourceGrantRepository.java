package stirling.software.proprietary.access.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.access.model.PrincipalType;
import stirling.software.proprietary.access.model.ResourceGrant;
import stirling.software.proprietary.access.model.ResourceType;

@Repository
public interface ResourceGrantRepository extends JpaRepository<ResourceGrant, Long> {

    List<ResourceGrant> findByResourceTypeAndResourceId(
            ResourceType resourceType, String resourceId);

    List<ResourceGrant> findByResourceTypeAndPrincipalTypeAndPrincipalId(
            ResourceType resourceType, PrincipalType principalType, Long principalId);

    void deleteByResourceTypeAndResourceId(ResourceType resourceType, String resourceId);

    boolean existsByResourceTypeAndResourceIdAndPrincipalTypeAndPrincipalId(
            ResourceType resourceType,
            String resourceId,
            PrincipalType principalType,
            Long principalId);
}
