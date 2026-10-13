package stirling.software.proprietary.mcp.oauth;

import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/** The built-in authorization server's tables exist only where it can run (never on SaaS). */
@Configuration
@Conditional(McpBuiltinModeCondition.class)
@EnableJpaRepositories("stirling.software.proprietary.mcp.oauth.repository")
@EntityScan("stirling.software.proprietary.mcp.oauth.model")
public class McpBuiltinPersistenceConfig {}
