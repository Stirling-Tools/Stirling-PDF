package stirling.software.SPDF.controller.web;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import stirling.software.common.model.ApplicationProperties;

/**
 * Serves /robots.txt dynamically so the system.googlevisibility flag actually controls
 * search-engine indexing. 'true' returns an allow-all policy; 'false' returns a disallow-all policy
 * to keep the instance out of search engines (useful for embedded/internal deployments).
 */
@Path("")
@ApplicationScoped
public class RobotsController {

    private final ApplicationProperties applicationProperties;

    public RobotsController(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    @GET
    @Path("/robots.txt")
    @Produces(MediaType.TEXT_PLAIN)
    public String robotsTxt() {
        boolean allowIndexing = applicationProperties.getSystem().isGooglevisibility();
        return "User-agent: *\n" + (allowIndexing ? "Allow: /\n" : "Disallow: /\n");
    }
}
