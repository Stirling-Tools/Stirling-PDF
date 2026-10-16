package stirling.software.saas.serverregistration;

import java.time.Duration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol;
import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol.Receipt;
import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol.RegistrationRequest;
import stirling.software.proprietary.serverregistration.ServerRegistrationProtocol.SyncRequest;

/**
 * Public transport with proof/credential authentication inside each operation, never a user
 * session.
 */
@Hidden
@RestController
@Profile("saas")
@RequestMapping(ServerRegistrationProtocol.PATH)
@ConditionalOnProperty(name = "stirling.server-registration.enabled", havingValue = "true")
public class ServerLicenseRegistrationController {
    private final KeygenServerLicenseVerifier verifier;
    private final ServerLicenseRegistrationStore store;
    private final RateLimitStore rateLimits;

    public ServerLicenseRegistrationController(
            KeygenServerLicenseVerifier verifier,
            ServerLicenseRegistrationStore store,
            RateLimitStore rateLimits) {
        this.verifier = verifier;
        this.store = store;
        this.rateLimits = rateLimits;
    }

    /** Validates live license ownership before any tracking record can be created. */
    @PostMapping
    public Receipt register(
            @Valid @RequestBody RegistrationRequest request, HttpServletRequest http) {
        rateLimit("bootstrap", http.getRemoteAddr(), 30);
        return store.register(
                request, verifier.verify(request.licenseProof(), request.machineFingerprint()));
    }

    /** Accepts sequenced counts only from the persisted registration credential. */
    @PostMapping("/sync")
    public Receipt sync(@Valid @RequestBody SyncRequest request, HttpServletRequest http) {
        rateLimit("sync", http.getRemoteAddr(), 120);
        return store.sync(request);
    }

    /** Rejects malformed bodies without rendering credential-bearing field errors. */
    @ExceptionHandler({
        MethodArgumentNotValidException.class,
        HttpMessageNotReadableException.class
    })
    public ProblemDetail invalidRequest() {
        return ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "Invalid registration request");
    }

    private void rateLimit(String operation, String address, long capacity) {
        if (!rateLimits
                .tryConsume(
                        "server-registration:" + operation + ":" + address,
                        capacity,
                        Duration.ofMinutes(1))
                .allowed()) {
            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS, "Registration rate limit exceeded");
        }
    }
}
