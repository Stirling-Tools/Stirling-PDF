package stirling.software.proprietary.mcp.oauth;

import org.springframework.boot.autoconfigure.condition.AllNestedConditions;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;

/** Matches only when MCP is on, {@code mcp.auth.mode=builtin}, and this is not SaaS. */
public class McpBuiltinModeCondition extends AllNestedConditions {

    public McpBuiltinModeCondition() {
        super(ConfigurationPhase.REGISTER_BEAN);
    }

    @ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
    static class McpEnabled {}

    @ConditionalOnProperty(name = "mcp.auth.mode", havingValue = "builtin")
    static class BuiltinMode {}

    // SaaS signs users in with Supabase; a second authorization server there is never wanted.
    @Profile("!saas")
    static class NotSaas {}
}
