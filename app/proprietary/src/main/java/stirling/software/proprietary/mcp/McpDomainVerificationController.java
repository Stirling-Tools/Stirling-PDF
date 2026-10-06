package stirling.software.proprietary.mcp;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import stirling.software.common.model.ApplicationProperties;

/** Serves the OpenAI apps domain-verification token as bare text, as OpenAI requires. */
@RestController
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpDomainVerificationController {

    private final ApplicationProperties applicationProperties;

    public McpDomainVerificationController(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    @GetMapping("/.well-known/openai-apps-challenge")
    public ResponseEntity<String> openaiChallenge() {
        String token = applicationProperties.getMcp().getOpenaiAppsChallenge();
        if (token == null || token.isBlank()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(token.trim());
    }
}
