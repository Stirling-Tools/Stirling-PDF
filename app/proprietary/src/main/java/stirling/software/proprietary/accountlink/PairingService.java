package stirling.software.proprietary.accountlink;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

/**
 * Instance side of device-grant pairing (RFC 8628).
 *
 * <p>Starts a pairing, shows the admin a code, and advances it by polling SaaS until a team leader
 * approves. On approval the returned device credential is persisted exactly as the JWT path would
 * have persisted it, so nothing downstream can tell how an instance was linked.
 *
 * <p>Polling is driven lazily by {@link #advance} rather than a scheduler. The interactive flow
 * inherently requires the admin's browser to be open, so there is nothing to do in the background,
 * and an abandoned pairing simply expires. The advertised interval is enforced against the shared
 * state row, so several replicas polling at once cannot exceed it.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class PairingService {

    private final AccountLinkClient client;
    private final PairingStateRepository stateRepo;
    private final DeviceCredentialStore credentialStore;
    private final EntitlementCache entitlementCache;
    private final String instanceVersion;

    public PairingService(
            AccountLinkClient client,
            PairingStateRepository stateRepo,
            DeviceCredentialStore credentialStore,
            EntitlementCache entitlementCache,
            @org.springframework.beans.factory.annotation.Value("${stirling.version:}")
                    String instanceVersion) {
        this.client = client;
        this.stateRepo = stateRepo;
        this.credentialStore = credentialStore;
        this.entitlementCache = entitlementCache;
        this.instanceVersion = instanceVersion;
    }

    /**
     * What the portal renders. {@code phase} is one of idle, waiting, linked, expired, denied. The
     * device code is deliberately absent: only the code the human types is ever exposed.
     */
    public record PairingView(
            String phase,
            String userCode,
            String verificationUri,
            String expiresAt,
            int intervalSeconds) {

        static PairingView idle() {
            return new PairingView("idle", null, null, null, 0);
        }
    }

    /**
     * Begins a pairing, replacing any previous one. Restarting is the correct response to an
     * abandoned or expired code, and the old pairing is left to expire on the SaaS side.
     */
    @Transactional
    public PairingView start(String instanceName) throws IOException {
        AccountLinkClient.PairStartResult result = client.pairStart(instanceName, instanceVersion);
        LocalDateTime now = LocalDateTime.now();

        PairingState state = stateRepo.findState().orElseGet(PairingState::new);
        state.setId(PairingState.SINGLETON_ID);
        state.setUserCode(result.userCode());
        state.setDeviceCode(result.deviceCode());
        state.setVerificationUri(result.verificationUri());
        state.setIntervalSeconds(Math.max(1, result.intervalSeconds()));
        state.setStartedAt(now);
        state.setExpiresAt(now.plusSeconds(Math.max(1, result.expiresInSeconds())));
        state.setLastPolledAt(null);
        stateRepo.save(state);

        log.info("Pairing: awaiting approval of code {}", result.userCode());
        return view("waiting", state);
    }

    /**
     * Advances the current pairing, polling SaaS at most once per advertised interval. Returns the
     * phase the portal should render.
     */
    @Transactional
    public PairingView advance() {
        if (credentialStore.isLinked()) {
            return new PairingView("linked", null, null, null, 0);
        }
        Optional<PairingState> found = stateRepo.findState();
        if (found.isEmpty()) {
            return PairingView.idle();
        }
        PairingState state = found.get();
        LocalDateTime now = LocalDateTime.now();
        if (state.isExpired(now)) {
            return view("expired", state);
        }

        LocalDateTime last = state.getLastPolledAt();
        if (last != null && last.plusSeconds(state.getIntervalSeconds()).isAfter(now)) {
            return view("waiting", state);
        }
        state.setLastPolledAt(now);
        stateRepo.save(state);

        AccountLinkClient.PairPollResult poll;
        try {
            poll = client.pairPoll(state.getDeviceCode());
        } catch (IOException e) {
            // Transport or upstream fault. Stay waiting rather than tearing the pairing down: the
            // admin may still be mid-approval and the next poll can succeed.
            log.debug("Pairing: poll failed, still waiting: {}", e.getMessage());
            return view("waiting", state);
        }

        switch (poll.status()) {
            case "approved" -> {
                AccountLinkClient.RegisterResult cred = poll.credential();
                credentialStore.save(cred.deviceId(), cred.deviceSecret(), cred.teamId());
                stateRepo.delete(state);
                entitlementCache.invalidate();
                log.info("Pairing: linked to team {}", cred.teamId());
                return new PairingView("linked", null, null, null, 0);
            }
            case "denied" -> {
                stateRepo.delete(state);
                log.info("Pairing: approval was declined");
                return new PairingView("denied", null, null, null, 0);
            }
            case "expired", "unknown" -> {
                stateRepo.delete(state);
                return new PairingView("expired", null, null, null, 0);
            }
            default -> {
                return view("waiting", state);
            }
        }
    }

    /** Current pairing without contacting SaaS, for a cheap read. */
    @Transactional(readOnly = true)
    public PairingView current() {
        if (credentialStore.isLinked()) {
            return new PairingView("linked", null, null, null, 0);
        }
        return stateRepo
                .findState()
                .map(s -> view(s.isExpired(LocalDateTime.now()) ? "expired" : "waiting", s))
                .orElseGet(PairingView::idle);
    }

    /** Abandons the in-flight pairing. The SaaS row is left to expire. */
    @Transactional
    public void cancel() {
        stateRepo.findState().ifPresent(stateRepo::delete);
    }

    private static PairingView view(String phase, PairingState state) {
        return new PairingView(
                phase,
                state.getUserCode(),
                state.getVerificationUri(),
                state.getExpiresAt() != null ? state.getExpiresAt().toString() : null,
                state.getIntervalSeconds());
    }
}
