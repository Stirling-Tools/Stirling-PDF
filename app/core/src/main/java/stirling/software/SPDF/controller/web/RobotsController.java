package stirling.software.SPDF.controller.web;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

import stirling.software.common.model.ApplicationProperties;

/**
 * Serves /robots.txt dynamically so the system.googlevisibility flag actually controls
 * search-engine indexing. 'true' returns an allow-all policy; 'false' returns a disallow-all policy
 * to keep the instance out of search engines (useful for embedded/internal deployments).
 */
@RestController
public class RobotsController {

    private final ApplicationProperties applicationProperties;

    public RobotsController(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    @GetMapping(value = "/robots.txt", produces = MediaType.TEXT_PLAIN_VALUE)
    @ResponseBody
    public String robotsTxt() {
        boolean allowIndexing = applicationProperties.getSystem().isGooglevisibility();
        return "User-agent: *\n" + (allowIndexing ? "Allow: /\n" : "Disallow: /\n");
    }
}
