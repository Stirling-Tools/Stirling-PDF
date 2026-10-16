package stirling.software.proprietary.serverregistration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import org.springframework.beans.factory.ObjectProvider;
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
    private final LicenseKeyChecker licenses;
    private final ApplicationProperties application;
    private final ObjectProvider<UserService> users;
    private final ServerRegistrationStateStore states;
    private final ServerRegistrationClient client;
    private final ServerRegistrationProperties properties;
    private final String version;

    public LegacyServerRegistrationService(
            LicenseKeyChecker licenses,
            ApplicationProperties application,
            ObjectProvider<UserService> users,
            ServerRegistrationStateStore states,
            ServerRegistrationClient client,
            ServerRegistrationProperties properties,
            @Qualifier("appVersion") String version) {
        this.licenses = licenses;
        this.application = application;
        this.users = users;
        this.states = states;
        this.client = client;
        this.properties = properties;
        this.version = version;
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
     */
    public synchronized void reportNow() {
        if (licenses.getLicenseKeyResult() != License.SERVER) return;
        UserService localUsers = users.getIfAvailable();
        if (localUsers == null) return;
        try {
            String proof = readProof();
            if (proof == null || proof.isBlank() || proof.length() > 65536) return;
            long count = localUsers.getTotalUsersCount();
            if (count < 0 || count > Integer.MAX_VALUE) return;
            ServerRegistrationState state = states.reserve(proof);
            var report =
                    new ServerRegistrationProtocol.Report(
                            state.getReportSequence(),
                            count,
                            version,
                            ServerRegistrationProtocol.CAPABILITY_VERSION);
            ServerRegistrationProtocol.Receipt receipt;
            if (state.getRegistrationId() == null) {
                receipt =
                        client.register(
                                new ServerRegistrationProtocol.RegistrationRequest(
                                        state.getInstallationId(),
                                        proof,
                                        GeneralUtils.generateMachineFingerprint(),
                                        state.getRegistrationSecret(),
                                        report));
            } else {
                receipt =
                        client.sync(
                                new ServerRegistrationProtocol.SyncRequest(
                                        state.getRegistrationId(),
                                        state.getRegistrationSecret(),
                                        report));
            }
            states.acknowledge(state, receipt);
        } catch (IOException | RuntimeException e) {
            log.debug("Server registration unavailable; reporting will retry");
        }
    }

    private String readProof() throws IOException {
        String configured = application.getPremium().getKey();
        if (configured == null || !configured.startsWith("file:")) return configured;
        Path path = Path.of(configured.substring(5));
        if (Files.size(path) > 65536) return null;
        return Files.readString(path);
    }
}
