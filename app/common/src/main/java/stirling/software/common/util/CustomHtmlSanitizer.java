package stirling.software.common.util;

import org.owasp.html.AttributePolicy;
import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;
import org.owasp.html.Sanitizers;
import org.springframework.stereotype.Component;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.SsrfProtectionService;

@Component
public class CustomHtmlSanitizer {

    private final SsrfProtectionService ssrfProtectionService;
    private final ApplicationProperties applicationProperties;

    public CustomHtmlSanitizer(
            SsrfProtectionService ssrfProtectionService,
            ApplicationProperties applicationProperties) {
        this.ssrfProtectionService = ssrfProtectionService;
        this.applicationProperties = applicationProperties;
    }

    private final AttributePolicy SSRF_SAFE_URL_POLICY =
            new AttributePolicy() {
                @Override
                public String apply(String elementName, String attributeName, String value) {
                    if (value == null || value.trim().isEmpty()) {
                        return null;
                    }

                    String trimmedValue = value.trim();

                    // Use the SSRF protection service to validate the URL
                    if (ssrfProtectionService != null
                            && !ssrfProtectionService.isUrlAllowed(trimmedValue)) {
                        return null;
                    }

                    return trimmedValue;
                }
            };

    private final PolicyFactory SSRF_SAFE_IMAGES_POLICY =
            new HtmlPolicyBuilder()
                    .allowElements("img")
                    .allowAttributes("alt", "width", "height", "title")
                    .onElements("img")
                    .allowAttributes("src")
                    .matching(SSRF_SAFE_URL_POLICY)
                    .onElements("img")
                    .toFactory();

    private final PolicyFactory POLICY =
            Sanitizers.FORMATTING
                    .and(Sanitizers.BLOCKS)
                    .and(Sanitizers.STYLES)
                    .and(Sanitizers.LINKS)
                    .and(Sanitizers.TABLES)
                    .and(SSRF_SAFE_IMAGES_POLICY)
                    .and(new HtmlPolicyBuilder().disallowElements("noscript").toFactory());

    public String sanitize(String html) {
        boolean disableSanitize =
                Boolean.TRUE.equals(applicationProperties.getSystem().getDisableSanitize());
        return disableSanitize ? html : POLICY.sanitize(html);
    }
}
