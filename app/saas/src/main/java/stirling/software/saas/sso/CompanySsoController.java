package stirling.software.saas.sso;

import java.util.Map;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/** Validates ceremony tokens without invoking the normal filter's personal-team provisioning. */
@RestController
@Profile("saas")
@RequestMapping("/api/v1/company-sso")
@RequiredArgsConstructor
public class CompanySsoController {
    private final CompanySsoService service;
    private final JwtDecoder decoder;

    public record SaveRequest(String metadataXml) {}

    public record DiscoverRequest(String email) {}

    public record StartRequest(UUID connectionId) {}

    public record CompleteRequest(String attempt, String originalAccessToken) {}

    public record Failure(String code, String message, UUID connectionId) {}

    @GetMapping("/settings")
    public CompanySsoService.Settings settings(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return service.settings(bearer(authorization));
    }

    @PostMapping("/settings")
    public void save(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestBody SaveRequest request) {
        service.save(bearer(authorization), request.metadataXml());
    }

    @PostMapping("/activate")
    public void activate(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        service.activate(bearer(authorization));
    }

    @PostMapping("/discover")
    public Map<String, UUID> discover(@RequestBody DiscoverRequest request) {
        return Map.of("connectionId", service.discover(request.email()));
    }

    @PostMapping("/start")
    public CompanySsoService.LoginStart start(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false)
                    String authorization,
            @RequestBody StartRequest request) {
        return service.start(
                request.connectionId(), authorization == null ? null : bearer(authorization));
    }

    @PostMapping("/complete")
    public CompanySsoService.Completed complete(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestBody CompleteRequest request) {
        return service.complete(
                request.attempt(),
                bearer(authorization),
                request.originalAccessToken() == null
                        ? null
                        : decode(request.originalAccessToken()));
    }

    @ExceptionHandler(CompanySsoException.class)
    public ResponseEntity<Failure> failure(CompanySsoException e) {
        return ResponseEntity.badRequest()
                .body(new Failure(e.getCode(), e.getMessage(), e.getConnectionId()));
    }

    private Jwt bearer(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) throw invalid();
        return decode(authorization.substring(7));
    }

    private Jwt decode(String token) {
        try {
            Jwt jwt = decoder.decode(token);
            if (jwt.getAudience() == null
                    || !jwt.getAudience().contains("authenticated")
                    || jwt.getSubject() == null
                    || jwt.getClaimAsString("session_id") == null
                    || !"authenticated".equals(jwt.getClaimAsString("role"))
                    || Boolean.TRUE.equals(jwt.getClaimAsBoolean("is_anonymous"))) throw invalid();
            UUID.fromString(jwt.getSubject());
            UUID.fromString(jwt.getClaimAsString("session_id"));
            return jwt;
        } catch (JwtException | IllegalArgumentException e) {
            throw invalid();
        }
    }

    private static CompanySsoException invalid() {
        return new CompanySsoException("SIGN_IN_REQUIRED", "Sign in again to continue.");
    }
}
