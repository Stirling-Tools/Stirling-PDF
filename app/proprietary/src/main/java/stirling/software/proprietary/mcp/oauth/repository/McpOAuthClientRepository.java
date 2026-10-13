package stirling.software.proprietary.mcp.oauth.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.mcp.oauth.model.McpOAuthClient;

@Repository
public interface McpOAuthClientRepository extends JpaRepository<McpOAuthClient, String> {

    /** Registrations that never completed a sign-in and are older than {@code cutoff}. */
    @Query(
            "select c from McpOAuthClient c where c.dynamicallyRegistered = true and c.lastUsedAt"
                    + " is null and c.createdAt < :cutoff and not exists (select g from"
                    + " McpOAuthGrant g where g.clientId = c.clientId)")
    List<McpOAuthClient> findUnusedRegistrations(@Param("cutoff") Instant cutoff, Pageable page);
}
