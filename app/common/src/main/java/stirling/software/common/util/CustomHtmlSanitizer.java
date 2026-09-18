package stirling.software.common.util;

import java.util.regex.Pattern;

import org.owasp.html.AttributePolicy;
import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;
import org.owasp.html.Sanitizers;
import org.springframework.stereotype.Component;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.SsrfProtectionService;

@Component
public class CustomHtmlSanitizer {

    private static final Pattern RASTER_IMAGE_DATA_URI =
            Pattern.compile("^data:image/(png|jpe?g|gif|webp|bmp)[;,]", Pattern.CASE_INSENSITIVE);

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
                    if (value.trim().isEmpty()) {
                        return null;
                    }

                    String trimmedValue = value.trim();

                    if (trimmedValue.regionMatches(true, 0, "data:", 0, 5)
                            && !RASTER_IMAGE_DATA_URI.matcher(trimmedValue).find()) {
                        return null;
                    }

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
                    .allowUrlProtocols("data")
                    .allowElements("img")
                    .allowAttributes("alt", "width", "height", "title")
                    .onElements("img")
                    .allowAttributes("src")
                    .matching(SSRF_SAFE_URL_POLICY)
                    .onElements("img")
                    .toFactory();

    /**
     * The policy every HTML this application renders passes through - LibreOffice's HTML importer
     * here, WeasyPrint on the html/eml/markdown endpoints.
     *
     * <p>It carries no CSS reference policy on purpose. {@code Sanitizers.STYLES} is {@code
     * allowStyling()}, which leaves {@code StylingPolicy}'s url rewriter null, and a null rewriter
     * makes the library drop any declaration holding a {@code url(...)} - escaped, commented,
     * quoted or bare - while {@code style}, {@code link} and {@code base} are not allowed elements,
     * so {@code @import} and {@code @font-face} can never reach the output at all. Reopening it
     * takes {@code allowUrlsInStyles} together with an allowed url protocol, and then {@code
     * SsrfProtectionService} at its default MEDIUM level admits any resolvable public host: CSS
     * fetches would start working again on all four converters. {@code CustomHtmlSanitizerCssTest}
     * fails if that closure is ever lost.
     */
    private final PolicyFactory POLICY =
            Sanitizers.FORMATTING
                    .and(Sanitizers.BLOCKS)
                    .and(Sanitizers.STYLES)
                    .and(Sanitizers.LINKS)
                    .and(Sanitizers.TABLES)
                    .and(SSRF_SAFE_IMAGES_POLICY)
                    .and(new HtmlPolicyBuilder().allowElements("pre").toFactory())
                    .and(new HtmlPolicyBuilder().disallowElements("noscript").toFactory());

    public String sanitize(String html) {
        return isDisabled() ? html : POLICY.sanitize(html);
    }

    public boolean isDisabled() {
        return applicationProperties.getSystem().isDisableSanitize();
    }
}
