package stirling.software.proprietary.mcp.oauth.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.mcp.oauth.model.McpOAuthGrant;

@Repository
public interface McpOAuthGrantRepository extends JpaRepository<McpOAuthGrant, Long> {

    Optional<McpOAuthGrant> findByUsernameAndClientId(String username, String clientId);

    List<McpOAuthGrant> findByUsernameOrderByCreatedAtDesc(String username);
}
