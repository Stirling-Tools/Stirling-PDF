package stirling.software.saas.controller;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

import io.swagger.v3.oas.annotations.Hidden;

/**
 * Serves the SaaS-specific landing page at {@code /} and {@code /index.html} when the {@code saas}
 * profile is active.
 *
 * <p>In OSS / self-hosted backend-only builds the core module's {@code copyApiLandingPage} Gradle
 * task renames {@code api-landing.html} to {@code index.html}, which Spring's
 * {@code WelcomePageHandlerMapping} serves at {@code /}. SaaS overrides that with an explicit
 * controller mapping (which takes precedence over the welcome-page handler) so the SaaS deployment
 * shows information about the Cloud API endpoint instead of self-hosted troubleshooting copy.
 */
@Controller
@Profile("saas")
@Hidden
public class SaasLandingController {

    @GetMapping({"/", "/index.html"})
    public String saasLanding() {
        return "forward:/saas-landing.html";
    }
}
