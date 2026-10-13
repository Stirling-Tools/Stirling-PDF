package stirling.software.proprietary.mcp.oauth.repository;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.mcp.oauth.model.McpAuthorizationRequest;

@Repository
public interface McpAuthorizationRequestRepository
        extends JpaRepository<McpAuthorizationRequest, String> {

    Optional<McpAuthorizationRequest> findByCode(String code);

    /** Moves {@code from} to {@code to} atomically; 1 for the single winner, 0 for a racer. */
    @Modifying
    @Transactional
    @Query(
            "update McpAuthorizationRequest r set r.status = :to where r.authorizationId = :id"
                    + " and r.status = :from")
    int transition(
            @Param("id") String authorizationId,
            @Param("from") McpAuthorizationRequest.Status from,
            @Param("to") McpAuthorizationRequest.Status to);

    @Modifying
    @Transactional
    void deleteByUsernameAndClientId(String username, String clientId);

    @Modifying
    @Transactional
    @Query("delete from McpAuthorizationRequest r where r.expiresAt < :cutoff")
    int deleteExpired(@Param("cutoff") Instant cutoff);
}
