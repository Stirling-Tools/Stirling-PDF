package stirling.software.saas.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Serves the OpenAI domain-verification token for our ChatGPT app listing, as bare text. */
@RestController
public class OpenAiAppsChallengeController {

    public static final String PATH = "/.well-known/openai-apps-challenge";

    private final String token;

    public OpenAiAppsChallengeController(@Value("${app.openai.apps-challenge:}") String token) {
        this.token = token == null ? "" : token.trim();
    }

    @GetMapping(PATH)
    public ResponseEntity<String> challenge() {
        if (token.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok().contentType(MediaType.TEXT_PLAIN).body(token);
    }
}
