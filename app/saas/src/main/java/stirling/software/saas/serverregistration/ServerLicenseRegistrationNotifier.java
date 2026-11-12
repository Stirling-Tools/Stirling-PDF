package stirling.software.saas.serverregistration;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.serverregistration.RegistrationHttpTransport;

import tools.jackson.databind.ObjectMapper;

/** Best-effort first-sync alerts after commit; delivery failures never undo collection. */
@Slf4j
@Component
@Profile("saas")
@ConditionalOnProperty(name = "stirling.server-registration.enabled", havingValue = "true")
public class ServerLicenseRegistrationNotifier {
    private static final Duration TIMEOUT = Duration.ofSeconds(5);
    private final String webhookUrl;
    private final ObjectMapper mapper;
    private final HttpClient http;

    @Autowired
    public ServerLicenseRegistrationNotifier(Environment environment, ObjectMapper mapper) {
        this(
                Stream.of("SUPA_ALERTS_WEBHOOK_URL", "SUPABASE_ALERTS_WEBHOOK_URL")
                        .map(environment::getProperty)
                        .filter(value -> value != null && !value.isBlank())
                        .findFirst()
                        .orElse(""),
                mapper,
                HttpClient.newBuilder()
                        .connectTimeout(TIMEOUT)
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build());
    }

    ServerLicenseRegistrationNotifier(String webhookUrl, ObjectMapper mapper, HttpClient http) {
        this.webhookUrl = webhookUrl;
        this.mapper = mapper;
        this.http = http;
    }

    /** Safe identifiers and observed counts only; no license proof or registration credential. */
    public record FirstSync(
            UUID licenseId,
            UUID installationId,
            UUID registrationId,
            String subscriptionId,
            long reportedUsers,
            Integer licenseUserLimit) {}

    /** One attempt per license's first committed report; no retry on ambiguous Slack failures. */
    @Async("auditExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void notifyFirstSync(FirstSync event) {
        if (webhookUrl == null || webhookUrl.isBlank()) {
            log.warn("Server first-sync alert skipped: Supabase alerts webhook is not configured");
            return;
        }
        try {
            URI webhook = URI.create(webhookUrl.strip());
            if (!"https".equals(webhook.getScheme())
                    || !Set.of("hooks.slack.com", "hooks.slack-gov.com").contains(webhook.getHost())
                    || webhook.getUserInfo() != null) {
                throw new IllegalArgumentException("Invalid Slack webhook");
            }
            String allowance =
                    event.licenseUserLimit() == null
                            ? "Unknown"
                            : event.licenseUserLimit() == 0
                                    ? "Unlimited"
                                    : event.licenseUserLimit().toString();
            String details =
                    "Keygen license ID: "
                            + event.licenseId()
                            + "\nSubscription: "
                            + (event.subscriptionId() == null
                                    ? "Unresolved"
                                    : event.subscriptionId())
                            + "\nReported users (first installation): "
                            + event.reportedUsers()
                            + "\nLicense allowance: "
                            + allowance
                            + "\nInstallation: "
                            + event.installationId()
                            + "\nRegistration: "
                            + event.registrationId();
            var payload =
                    Map.of(
                            "text",
                            "Server license first sync",
                            "blocks",
                            List.of(
                                    Map.of(
                                            "type",
                                            "header",
                                            "text",
                                            Map.of(
                                                    "type",
                                                    "plain_text",
                                                    "text",
                                                    "Server license first sync")),
                                    Map.of(
                                            "type",
                                            "section",
                                            "text",
                                            Map.of("type", "plain_text", "text", details))));
            HttpRequest request =
                    HttpRequest.newBuilder(webhook)
                            .timeout(TIMEOUT)
                            .header("Content-Type", "application/json")
                            .POST(
                                    HttpRequest.BodyPublishers.ofString(
                                            mapper.writeValueAsString(payload)))
                            .build();
            var response = RegistrationHttpTransport.send(http, request, TIMEOUT);
            if (response.statusCode() != 200) {
                log.warn(
                        "Server first-sync alert failed for registration {}: HTTP {}",
                        event.registrationId(),
                        response.statusCode());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn(
                    "Server first-sync alert interrupted for registration {}",
                    event.registrationId());
        } catch (Exception e) {
            log.warn("Server first-sync alert failed for registration {}", event.registrationId());
        }
    }
}
