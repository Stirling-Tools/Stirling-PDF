package stirling.software.proprietary.accountlink;

import java.io.IOException;

import io.quarkus.arc.profile.IfBuildProfile;
import io.swagger.v3.oas.annotations.Hidden;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.extern.slf4j.Slf4j;

/**
 * Same-origin account-link surface on the self-hosted instance (combined-billing "Mode A").
 *
 * <p>The portal (served from this same origin, admin authenticated by the existing self-hosted
 * security chain) calls these. {@code POST /link} relays the admin's Supabase JWT to the SaaS
 * backend, which mints + returns a device credential we store locally. {@code GET /status} backs
 * the portal's link card; {@code GET /usage} exposes locally-accrued unsynced usage the portal adds
 * to SaaS-synced spend; {@code POST /sync-now} forces an immediate usage sync (ops "reconcile now"
 * / test aid).
 *
 * <p>Admin-only, {@code @IfBuildProfile("!saas")}, gated behind {@code
 * stirling.billing.account-link.enabled} — off → 404.
 */
@Slf4j
@Hidden
@ApplicationScoped
@Path("/api/v1/account-link")
@Produces(MediaType.APPLICATION_JSON)
@IfBuildProfile("!saas")
@RolesAllowed("ADMIN")
// Arc cannot gate a bean on a runtime property and JAX-RS registers the resource regardless, so the
// account-link flag is checked per request instead: off → 404, as bean-absence used to give.
public class AccountLinkController {

    private final AccountLinkService service;
    private final LocalUsageService localUsageService;
    // Metering has its own flag; with it off (or the bean absent) /sync-now reports 409.
    private final Instance<UsageSyncService> syncServiceProvider;
    private final AccountLinkProperties properties;

    public AccountLinkController(
            AccountLinkService service,
            LocalUsageService localUsageService,
            Instance<UsageSyncService> syncServiceProvider,
            AccountLinkProperties properties) {
        this.service = service;
        this.localUsageService = localUsageService;
        this.syncServiceProvider = syncServiceProvider;
        this.properties = properties;
    }

    /** {@code supabaseJwt} is the admin's short-lived token the portal already holds. */
    public record LinkRequest(String supabaseJwt, String name) {}

    @POST
    @Path("/link")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response link(LinkRequest req) {
        requireEnabled();
        if (req == null || req.supabaseJwt() == null || req.supabaseJwt().isBlank()) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(java.util.Map.of("error", "supabaseJwt is required"))
                    .build();
        }
        try {
            return Response.ok(service.link(req.supabaseJwt(), req.name())).build();
        } catch (AccountLinkClient.UpstreamException e) {
            // Auth failures are the admin's token, not a gateway fault: surface 401/403 as-is so
            // the portal can prompt a re-sign-in. Anything else upstream → 502. Don't echo the
            // raw upstream body back to the browser.
            Response.Status status =
                    e.status() == Response.Status.UNAUTHORIZED.getStatusCode()
                                    || e.status() == Response.Status.FORBIDDEN.getStatusCode()
                            ? Response.Status.fromStatusCode(e.status())
                            : Response.Status.BAD_GATEWAY;
            log.warn("Account-link register rejected upstream: HTTP {}", e.status());
            return Response.status(status).entity(java.util.Map.of("error", "LINK_FAILED")).build();
        } catch (IOException e) {
            // Don't echo e.getMessage() to the browser: a DNS/connection/TLS failure can carry the
            // configured SaaS host/IP. Log it server-side; return the same opaque body the
            // UpstreamException branch does.
            log.warn("Account-link failed (transport): {}", e.getMessage());
            return Response.status(Response.Status.BAD_GATEWAY)
                    .entity(java.util.Map.of("error", "LINK_FAILED"))
                    .build();
        }
    }

    @GET
    @Path("/status")
    public Response status() {
        requireEnabled();
        return Response.ok(service.status()).build();
    }

    @POST
    @Path("/unlink")
    public Response unlink() {
        requireEnabled();
        service.unlink();
        return Response.noContent().build();
    }

    /**
     * Locally accrued usage not yet reported to SaaS — the portal adds it to the SaaS-synced spend
     * so "current usage" includes work done since the last daily sync.
     */
    @GET
    @Path("/usage")
    public Response usage() {
        requireEnabled();
        return Response.ok(localUsageService.currentPeriodUnsynced()).build();
    }

    /**
     * Forces an immediate usage sync to SaaS — the same work the daily scheduler does. An admin
     * "reconcile now" action (and a test aid so you don't wait on the scheduler). Idempotent:
     * re-reports the current cumulative, so a repeat trigger bills nothing. {@code 204} once run;
     * {@code 409} when metering is off (as the absent sync bean used to report).
     */
    @POST
    @Path("/sync-now")
    public Response syncNow() {
        requireEnabled();
        if (!properties.getMetering().isEnabled() || !syncServiceProvider.isResolvable()) {
            return Response.status(Response.Status.CONFLICT).build();
        }
        syncServiceProvider.get().syncNow();
        return Response.noContent().build();
    }

    /** Master flag off: 404 the whole surface, the response main got from the absent bean. */
    private void requireEnabled() {
        if (!properties.isEnabled()) {
            throw new WebApplicationException(Response.Status.NOT_FOUND);
        }
    }
}
