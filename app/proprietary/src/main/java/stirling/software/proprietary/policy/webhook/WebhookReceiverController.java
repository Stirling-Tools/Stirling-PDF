package stirling.software.proprietary.policy.webhook;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

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
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.trigger.WebhookTrigger;

/**
 * Public receiver for webhook input sources. External systems POST a document to {@code
 * /api/v1/webhooks/{webhookId}}; the request is authenticated not by a login session but by an
 * HMAC-SHA256 signature of the exact body under the source's signing secret, so this endpoint sits
 * outside the session auth wall (see {@code RequestUriUtils.isPublicAuthEndpoint}). A verified
 * delivery is spooled and the referencing policies are fired immediately.
 *
 * <p>The request body is the raw document bytes, sent with a binary content type - {@code
 * application/pdf} or {@code application/octet-stream} (e.g. {@code curl --data-binary @file.pdf -H
 * 'Content-Type: application/pdf'}). A form content type ({@code
 * application/x-www-form-urlencoded}) is rejected upstream because the container tries to parse the
 * body as form fields. The signature header is {@code sha256=<hex>}. Delivery is rejected before
 * anything is written if the id is unknown (404), the signature is missing or wrong (401), the
 * source is paused (403), or the body is empty (400) or larger than {@code
 * policies.webhookMaxBytes} (413).
 */
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

        String storedName;
        try {
            storedName =
                    WebhookSpool.displayName(
                            spool.store(webhookId, filename, body).getFileName().toString());
        } catch (IOException e) {
            log.error("Could not spool webhook delivery for {}: {}", webhookId, e.getMessage());
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Could not store delivery");
        }

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

    /**
     * Read the body into memory, capped at {@code policies.webhookMaxBytes}. Reading one byte past
     * the limit is enough to reject an over-sized (or unbounded, chunked) delivery with 413 before
     * it can fill memory or the disk.
     */
    private byte[] readBoundedBody(HttpServletRequest request) {
        long maxBytes = applicationProperties.getPolicies().getWebhookMaxBytes();
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        long total = 0;
        try (InputStream in = request.getInputStream()) {
            int read;
            while ((read = in.read(chunk)) != -1) {
                total += read;
                if (total > maxBytes) {
                    throw new ResponseStatusException(
                            HttpStatus.PAYLOAD_TOO_LARGE,
                            "Delivery exceeds the " + maxBytes + "-byte limit");
                }
                buffer.write(chunk, 0, read);
            }
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Could not read request body");
        }
        return buffer.toByteArray();
    }

    /** The 202 body: the stored (display) name and byte count of an accepted delivery. */
    public record WebhookDeliveryResponse(boolean accepted, String filename, int bytes) {}
}
