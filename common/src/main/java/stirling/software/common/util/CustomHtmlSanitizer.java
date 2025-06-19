/**
 * Description: Enter description
 * Author: Your Name
 * Date: 2025-06-19
 * Time: 17:06:51
 */


package stirling.software.common.util;

import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;
import org.owasp.html.Sanitizers;

public class CustomHtmlSanitizer {
    private static final PolicyFactory POLICY =
            Sanitizers.FORMATTING
                    .and(Sanitizers.BLOCKS)
                    .and(Sanitizers.STYLES)
                    .and(Sanitizers.LINKS)
                    .and(Sanitizers.TABLES)
                    .and(Sanitizers.IMAGES)
                    .and(new HtmlPolicyBuilder().disallowElements("noscript").toFactory());

    public static String sanitize(String html) {
        String htmlAfter = POLICY.sanitize(html);
        return htmlAfter;
    }
}
