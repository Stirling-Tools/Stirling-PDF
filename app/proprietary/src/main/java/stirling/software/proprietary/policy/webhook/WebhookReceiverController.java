package stirling.software.proprietary.policy.webhook;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;

import io.quarkus.arc.profile.IfBuildProfile;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.trigger.WebhookTrigger;

@Slf4j
@ApplicationScoped
@IfBuildProfile("saas")
@Path("/api/v1/webhooks")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Webhooks", description = "Inbound webhook source receiver")
public class WebhookReceiverController {

    static final String SIGNATURE_HEADER = "X-Stirling-Signature";
    static final String FILENAME_HEADER = "X-Stirling-Filename";
    private static final String WEBHOOK_TYPE = "webhook";

    private final SourceStore sourceStore;
    private final WebhookSpool spool;
    private final WebhookTrigger webhookTrigger;
    private final ApplicationProperties applicationProperties;

    @POST
    @Path("/{webhookId}")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Deliver a document to a webhook source",
            description =
                    "The body is the raw document; sign it with the source's secret and present"
                            + " 'sha256=<hex>' in the X-Stirling-Signature header. Returns 202 once"
                            + " the document is spooled for the referencing policies.")
    public Response receive(
            @PathParam("webhookId") String webhookId,
            @HeaderParam(SIGNATURE_HEADER) String signature,
            @HeaderParam(FILENAME_HEADER) String filename,
            @Context HttpHeaders headers,
            InputStream requestBody) {
        if (!WebhookIds.isValidId(webhookId)) {
            throw new WebApplicationException("No such webhook", Response.Status.NOT_FOUND);
        }
        Source source = findWebhookSource(webhookId);
        if (source == null) {
            throw new WebApplicationException("No such webhook", Response.Status.NOT_FOUND);
        }

        WebhookConfig config = WebhookConfig.from(source.options());
        byte[] body = readBoundedBody(headers, requestBody);
        if (!WebhookSignatures.verify(config.signingSecret(), body, signature)) {
            throw new WebApplicationException("Invalid signature", Response.Status.UNAUTHORIZED);
        }
        if (!source.enabled()) {
            throw new WebApplicationException(
                    "Webhook source is paused; deliveries are not accepted",
                    Response.Status.FORBIDDEN);
        }
        if (body.length == 0) {
            throw new WebApplicationException("Empty request body", Response.Status.BAD_REQUEST);
        }

        String storedName = stageToSpool(webhookId, filename, body);

        webhookTrigger.fireForWebhook(webhookId);
        log.info(
                "Accepted webhook delivery '{}' ({} bytes) for {}",
                storedName,
                body.length,
                webhookId);
        return Response.accepted(new WebhookDeliveryResponse(true, storedName, body.length))
                .build();
    }

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

    private String stageToSpool(String webhookId, String filename, byte[] body) {
        try {
            return WebhookSpool.displayName(
                    spool.store(webhookId, filename, body).getFileName().toString());
        } catch (IOException e) {
            log.error("Could not spool webhook delivery for {}: {}", webhookId, e.getMessage());
            throw new WebApplicationException(
                    "Could not store delivery", Response.Status.INTERNAL_SERVER_ERROR);
        }
    }

    private byte[] readBoundedBody(HttpHeaders headers, InputStream requestBody) {
        long maxBytes = applicationProperties.getPolicies().getWebhookMaxBytes();
        long declared = declaredLength(headers);
        if (declared < 0) {
            throw new WebApplicationException(
                    "A Content-Length header is required", Response.Status.LENGTH_REQUIRED);
        }
        if (declared > maxBytes) {
            throw new WebApplicationException(
                    "Delivery exceeds the " + maxBytes + "-byte limit",
                    Response.Status.REQUEST_ENTITY_TOO_LARGE);
        }
        byte[] body = new byte[(int) declared];
        int total = 0;
        // A body-less POST arrives as a null entity; treat it as empty rather than NPE-ing.
        try (InputStream in = requestBody == null ? InputStream.nullInputStream() : requestBody) {
            int read;
            while (total < body.length
                    && (read = in.read(body, total, body.length - total)) != -1) {
                total += read;
            }
            if (total == body.length && in.read() != -1) {
                throw new WebApplicationException(
                        "Body exceeds the declared Content-Length", Response.Status.BAD_REQUEST);
            }
        } catch (IOException e) {
            throw new WebApplicationException(
                    "Could not read request body", Response.Status.BAD_REQUEST);
        }
        return total == body.length ? body : Arrays.copyOf(body, total);
    }

    // Mirrors the servlet getContentLengthLong() this used to read: -1 when absent or unparseable.
    private static long declaredLength(HttpHeaders headers) {
        String declared = headers.getHeaderString(HttpHeaders.CONTENT_LENGTH);
        if (declared == null) {
            return -1;
        }
        try {
            return Long.parseLong(declared.trim());
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    public record WebhookDeliveryResponse(boolean accepted, String filename, int bytes) {}
}
