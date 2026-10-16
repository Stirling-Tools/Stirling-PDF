package stirling.software.proprietary.serverregistration;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Commits the installation credential and reserved sequence before any outbound request. */
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.server-registration.enabled", havingValue = "true")
public class ServerRegistrationStateStore {
    private final ServerRegistrationStateRepository repository;
    private final SecureRandom random = new SecureRandom();

    public ServerRegistrationStateStore(ServerRegistrationStateRepository repository) {
        this.repository = repository;
    }

    /**
     * Called serially by the reporting service; failed sends burn a sequence without losing
     * identity.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ServerRegistrationState reserve(String licenseProof) {
        ServerRegistrationState state = repository.findById(1L).orElseGet(this::newState);
        String hash = hash(licenseProof);
        if (!hash.equals(state.getProofHash())) {
            state.setProofHash(hash);
            state.setRegistrationId(null);
            state.setLastSuccessAt(null);
        }
        state.setReportSequence(Math.incrementExact(state.getReportSequence()));
        return repository.saveAndFlush(state);
    }

    /** A reply from an older reservation cannot attach to a replacement license. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void acknowledge(
            ServerRegistrationState sent, ServerRegistrationProtocol.Receipt receipt) {
        ServerRegistrationState current = repository.findById(1L).orElseThrow();
        if (current.getReportSequence() != sent.getReportSequence()
                || !current.getProofHash().equals(sent.getProofHash())
                || receipt.acceptedSequence() != sent.getReportSequence()
                || (current.getRegistrationId() != null
                        && !current.getRegistrationId().equals(receipt.registrationId()))) {
            return;
        }
        current.setRegistrationId(receipt.registrationId());
        current.setLastSuccessAt(Instant.now());
        repository.saveAndFlush(current);
    }

    private ServerRegistrationState newState() {
        ServerRegistrationState state = new ServerRegistrationState();
        state.setInstallationId(UUID.randomUUID());
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        state.setRegistrationSecret(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
        return state;
    }

    private static String hash(String proof) {
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(proof.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
