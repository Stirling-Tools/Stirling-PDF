package stirling.software.proprietary.policy.webhook;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.s3.S3Config;
import stirling.software.proprietary.policy.s3.S3ConnectionPool;
import stirling.software.proprietary.policy.s3.S3ConnectionResolver;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.trigger.WebhookTrigger;

import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/** Public receiver: HMAC-verifies a signed delivery, stages it, and fires the policies. */
@Slf4j
@RestController
@RequestMapping("/api/v1/webhooks")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Webhooks", description = "Inbound webhook source receiver")
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class WebhookReceiverController {

    static final String SIGNATURE_HEADER = "X-Stirling-Signature";
    static final String FILENAME_HEADER = "X-Stirling-Filename";
    private static final String WEBHOOK_TYPE = "webhook";

    private final SourceStore sourceStore;
    private final WebhookSpool spool;
    private final WebhookTrigger webhookTrigger;
    private final ApplicationProperties applicationProperties;
    private final S3ConnectionResolver connectionResolver;
    private final S3ConnectionPool connectionPool;

    @PostMapping("/{webhookId}")
    @Operation(
            summary = "Deliver a document to a webhook source",
            description =
                    "The body is the raw document; sign it with the source's secret and present"
                            + " 'sha256=<hex>' in the X-Stirling-Signature header. Returns 202 once"
                            + " the document is spooled for the referencing policies.")
    public ResponseEntity<WebhookDeliveryResponse> receive(
            @PathVariable String webhookId,
            @RequestHeader(value = SIGNATURE_HEADER, required = false) String signature,
            @RequestHeader(value = FILENAME_HEADER, required = false) String filename,
            HttpServletRequest request) {
        if (!WebhookIds.isValidId(webhookId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such webhook");
        }
        Source source = findWebhookSource(webhookId);
        if (source == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such webhook");
        }

        WebhookConfig config = WebhookConfig.from(source.options());
        byte[] body = readBoundedBody(request);
        if (!WebhookSignatures.verify(config.signingSecret(), body, signature)) {
            // Same 401 whether the header was absent or wrong: never confirm a guess.
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid signature");
        }
        if (!source.enabled()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Webhook source is paused; deliveries are not accepted");
        }
        if (body.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Empty request body");
        }

        String storedName =
                config.usesConnection()
                        ? stageToConnection(config, filename, body)
                        : stageToSpool(webhookId, filename, body);

        // Fire the referencing policies now; the trigger's reconcile is the safety net.
        webhookTrigger.fireForWebhook(webhookId);
        log.info(
                "Accepted webhook delivery '{}' ({} bytes) for {}",
                storedName,
                body.length,
                webhookId);
        return ResponseEntity.accepted()
                .contentType(MediaType.APPLICATION_JSON)
                .body(new WebhookDeliveryResponse(true, storedName, body.length));
    }

    /** The enabled-or-not webhook source whose routing id matches, or null if there is none. */
    private Source findWebhookSource(String webhookId) {
        for (Source source : sourceStore.all()) {
            if (!WEBHOOK_TYPE.equals(source.type())) {
                continue;
            }
            Object configured = source.options().get(WebhookConfig.WEBHOOK_ID_OPTION);
            if (configured != null && configured.toString().equals(webhookId)) {
                return source;
            }
        }
        return null;
    }

    /** Stage a delivery to the node-local spool; returns its display (original) name. */
    private String stageToSpool(String webhookId, String filename, byte[] body) {
        try {
            return WebhookSpool.displayName(
                    spool.store(webhookId, filename, body).getFileName().toString());
        } catch (IOException e) {
            log.error("Could not spool webhook delivery for {}: {}", webhookId, e.getMessage());
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Could not store delivery");
        }
    }

    /** Stage a delivery to the S3 connection (save-time access check trusted). */
    private String stageToConnection(WebhookConfig config, String filename, byte[] body) {
        S3Config s3 =
                connectionResolver.resolve(
                        Map.of(
                                WebhookConfig.CONNECTION_ID_OPTION,
                                config.connectionId(),
                                "prefix",
                                config.stagingPrefix()));
        S3Client client = connectionPool.clientFor(s3);
        String key = keyPrefix(s3.prefix()) + WebhookSpool.objectKeySuffix(filename);
        try {
            client.putObject(
                    PutObjectRequest.builder().bucket(s3.bucket()).key(key).build(),
                    RequestBody.fromBytes(body));
        } catch (SdkException e) {
            log.error(
                    "Could not stage webhook delivery for {} to s3://{}/{}: {}",
                    config.webhookId(),
                    s3.bucket(),
                    key,
                    e.getMessage());
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Could not store delivery");
        }
        return WebhookSpool.objectDisplayName(filename);
    }

    /** The configured prefix as a key-path prefix ("inbox" and "inbox/" mean the same). */
    private static String keyPrefix(String prefix) {
        if (prefix == null || prefix.isEmpty() || prefix.endsWith("/")) {
            return prefix == null ? "" : prefix;
        }
        return prefix + "/";
    }

    /**
     * Read the body into an exactly-sized buffer bounded by its declared Content-Length. Rejecting
     * an unknown or over-cap length up front stops an unauthenticated caller streaming an unbounded
     * body into heap before the signature can be checked (the HMAC needs the whole body).
     */
    private byte[] readBoundedBody(HttpServletRequest request) {
        long maxBytes = applicationProperties.getPolicies().getWebhookMaxBytes();
        long declared = request.getContentLengthLong();
        if (declared < 0) {
            throw new ResponseStatusException(
                    HttpStatus.LENGTH_REQUIRED, "A Content-Length header is required");
        }
        if (declared > maxBytes) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "Delivery exceeds the " + maxBytes + "-byte limit");
        }
        byte[] body = new byte[(int) declared];
        int total = 0;
        try (InputStream in = request.getInputStream()) {
            int read;
            while (total < body.length
                    && (read = in.read(body, total, body.length - total)) != -1) {
                total += read;
            }
            if (total == body.length && in.read() != -1) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Body exceeds the declared Content-Length");
            }
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Could not read request body");
        }
        return total == body.length ? body : Arrays.copyOf(body, total);
    }

    /** The 202 body: the stored (display) name and byte count of an accepted delivery. */
    public record WebhookDeliveryResponse(boolean accepted, String filename, int bytes) {}
}
