package stirling.software.proprietary.serverregistration;

import java.io.IOException;
import java.net.http.HttpTimeoutException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.FixedDelayTask;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.security.service.UserService;

/**
 * Reports installed Server licenses independently of Team linking, billing and entitlement refresh.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.server-registration.enabled", havingValue = "true")
public class LegacyServerRegistrationService implements SchedulingConfigurer {
    private static final Duration MIN_FAILURE_BACKOFF = Duration.ofMinutes(15);
    private static final Duration MAX_FAILURE_BACKOFF = Duration.ofHours(24);
    private final LicenseKeyChecker licenses;
    private final ApplicationProperties application;
    private final ObjectProvider<UserService> users;
    private final ServerRegistrationStateStore states;
    private final ServerRegistrationClient client;
    private final ServerRegistrationProperties properties;
    private final String version;
    private final Clock clock;
    private Duration failureBackoff = Duration.ZERO;
    private Instant nextAttemptAt = Instant.MIN;
    private Instant nextWarningAt = Instant.MIN;
    private String lastFailure;

    @Autowired
    public LegacyServerRegistrationService(
            LicenseKeyChecker licenses,
            ApplicationProperties application,
            ObjectProvider<UserService> users,
            ServerRegistrationStateStore states,
            ServerRegistrationClient client,
            ServerRegistrationProperties properties,
            @Qualifier("appVersion") String version) {
        this(licenses, application, users, states, client, properties, version, Clock.systemUTC());
    }

    LegacyServerRegistrationService(
            LicenseKeyChecker licenses,
            ApplicationProperties application,
            ObjectProvider<UserService> users,
            ServerRegistrationStateStore states,
            ServerRegistrationClient client,
            ServerRegistrationProperties properties,
            String version,
            Clock clock) {
        this.licenses = licenses;
        this.application = application;
        this.users = users;
        this.states = states;
        this.client = client;
        this.properties = properties;
        this.version = version;
        this.clock = clock;
    }

    @Override
    public void configureTasks(ScheduledTaskRegistrar registrar) {
        Duration interval = properties.getSyncInterval();
        if (interval.compareTo(Duration.ofMinutes(1)) < 0) {
            throw new IllegalArgumentException(
                    "Server registration interval must be at least one minute");
        }
        registrar.addFixedDelayTask(
                new FixedDelayTask(this::reportNow, interval, Duration.ofSeconds(30)));
    }

    /**
     * Serialized with scheduled runs. All reporting failures leave the working license untouched.
     * Retry cooldowns and warning deduplication are per process and reset on restart.
     */
    public synchronized void reportNow() {
        if (licenses.getLicenseKeyResult() != License.SERVER) return;
        if (clock.instant().isBefore(nextAttemptAt)) return;
        String operation = "reading license";
        try {
            String proof = readProof();
            if (proof == null || proof.isBlank() || proof.length() > 65536) {
                recordFailure(operation, "missing, blank or oversized proof", true, null);
                return;
            }
            operation = "counting users";
            UserService localUsers = users.getIfAvailable();
            if (localUsers == null) {
                recordFailure(operation, "user service unavailable", false, null);
                return;
            }
            for (int attempt = 0; attempt < 2; attempt++) {
                operation = "counting users";
                long count = localUsers.getTotalUsersCount();
                if (count < 0 || count > Integer.MAX_VALUE) {
                    recordFailure(operation, "count outside supported range", true, null);
                    return;
                }
                operation = "reserving local state";
                ServerRegistrationState state = states.reserve(proof);
                var report =
                        new ServerRegistrationProtocol.Report(
                                state.getReportSequence(),
                                count,
                                version,
                                ServerRegistrationProtocol.CAPABILITY_VERSION);
                ServerRegistrationProtocol.Receipt receipt;
                try {
                    if (state.getRegistrationId() == null
                            || state.getPurchaseMapping()
                                    != ServerRegistrationProtocol.PurchaseMapping.RESOLVED) {
                        operation = "registering with cloud";
                        receipt =
                                client.register(
                                        new ServerRegistrationProtocol.RegistrationRequest(
                                                state.getInstallationId(),
                                                proof,
                                                GeneralUtils.generateMachineFingerprint(),
                                                state.getRegistrationSecret(),
                                                report));
                    } else {
                        operation = "syncing with cloud";
                        receipt =
                                client.sync(
                                        new ServerRegistrationProtocol.SyncRequest(
                                                state.getRegistrationId(),
                                                state.getRegistrationSecret(),
                                                report));
                    }
                    operation = "saving acknowledgement";
                    states.acknowledge(state, receipt);
                    if (lastFailure != null) log.info("Server registration reporting recovered");
                    lastFailure = null;
                    failureBackoff = Duration.ZERO;
                    nextAttemptAt = Instant.MIN;
                    nextWarningAt = Instant.MIN;
                    return;
                } catch (ServerRegistrationClient.SequenceConflictException e) {
                    operation = "recovering report sequence";
                    if (attempt != 0 || !states.reconcile(state, e.conflict())) throw e;
                }
            }
        } catch (IOException | RuntimeException e) {
            if (Thread.currentThread().isInterrupted()) return;
            if (e instanceof ServerRegistrationClient.HttpFailureException failure) {
                int status = failure.status();
                boolean rejected = status < 500 && status != 408 && status != 425 && status != 429;
                String reason =
                        "HTTP " + status + (rejected ? "; check registration configuration" : "");
                recordFailure(operation, reason, rejected, failure.retryNotBefore());
            } else {
                String reason =
                        e instanceof HttpTimeoutException
                                ? "request timed out"
                                : e.getClass().getSimpleName();
                boolean rejected =
                        e instanceof ServerRegistrationClient.InvalidResponseException
                                || e instanceof ServerRegistrationClient.SequenceConflictException;
                recordFailure(operation, reason, rejected, null);
            }
        }
    }

    private void recordFailure(
            String operation, String reason, boolean rejected, Instant retryNotBefore) {
        Instant now = clock.instant();
        if (rejected) {
            failureBackoff = MAX_FAILURE_BACKOFF;
        } else if (failureBackoff.isZero()) {
            failureBackoff = MIN_FAILURE_BACKOFF;
        } else {
            failureBackoff = failureBackoff.multipliedBy(2);
        }
        if (failureBackoff.compareTo(MAX_FAILURE_BACKOFF) > 0) {
            failureBackoff = MAX_FAILURE_BACKOFF;
        }
        Duration delay =
                properties.getSyncInterval().compareTo(failureBackoff) > 0
                        ? properties.getSyncInterval()
                        : failureBackoff;
        nextAttemptAt = now.plus(delay);
        if (retryNotBefore != null && retryNotBefore.isAfter(nextAttemptAt)) {
            nextAttemptAt = retryNotBefore;
        }
        String failure = operation + ": " + reason;
        if (!failure.equals(lastFailure) || !now.isBefore(nextWarningAt)) {
            log.warn(
                    "Server registration failed while {} ({}); next attempt no earlier than {}. Installed license unchanged",
                    operation,
                    reason,
                    nextAttemptAt);
            nextWarningAt = now.plus(MAX_FAILURE_BACKOFF);
        }
        lastFailure = failure;
    }

    private String readProof() throws IOException {
        String configured = application.getPremium().getKey();
        if (configured == null || !configured.startsWith("file:")) return configured;
        Path path = Path.of(configured.substring(5));
        if (Files.size(path) > 65536) return null;
        return Files.readString(path);
    }
}
