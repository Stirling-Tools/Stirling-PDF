package stirling.software.proprietary.mcp.oauth.repository;

import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.mcp.oauth.model.McpRefreshToken;

@Repository
public interface McpRefreshTokenRepository extends JpaRepository<McpRefreshToken, String> {

    /** Consumes an unexpired refresh token once, across every server node. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query(
            "update McpRefreshToken t set t.consumedAt = :now where t.tokenHash = :hash"
                    + " and t.consumedAt is null and t.expiresAt > :now")
    int consume(@Param("hash") String tokenHash, @Param("now") Instant now);

    @Modifying
    @Transactional
    void deleteByUsernameAndClientId(String username, String clientId);

    @Modifying
    @Transactional
    @Query("delete from McpRefreshToken t where t.expiresAt < :cutoff")
    int deleteExpired(@Param("cutoff") Instant cutoff);
}
