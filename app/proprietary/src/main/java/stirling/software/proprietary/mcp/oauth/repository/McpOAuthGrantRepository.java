package stirling.software.proprietary.mcp.oauth.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.mcp.oauth.model.McpOAuthGrant;

@Repository
public interface McpOAuthGrantRepository extends JpaRepository<McpOAuthGrant, Long> {

    Optional<McpOAuthGrant> findByUsernameAndClientId(String username, String clientId);

    @Modifying
    @Transactional
    @Query("update McpOAuthGrant g set g.lastUsedAt = :now where g.id = :id")
    int touch(@Param("id") Long id, @Param("now") Instant now);

    @Modifying
    @Transactional
    void deleteByUsernameAndClientId(String username, String clientId);

    List<McpOAuthGrant> findByUsernameOrderByCreatedAtDesc(String username);
}
