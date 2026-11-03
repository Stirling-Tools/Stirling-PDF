package stirling.software.gradle

import java.util.function.Function
import java.util.regex.Pattern

/**
 * Finds dependencies in the license report whose source link is missing or does not load. A
 * dependency under MPL, EPL, CDDL, LGPL or GPL needs a {@code sourceUrl} in
 * {@code license-selections.json}.
 */
class LicenseSourceLinks {
    static final Pattern SOURCE_DISCLOSURE_LICENSE = Pattern.compile(
            '(?i)mozilla|\\bmpl\\b|eclipse public|\\bepl\\b|cddl|common development and distribution'
                    + '|\\bl?gpl|general public')

    /**
     * @param statusOf HTTP status for a URL, or {@code null} when it could not be reached
     * @return one message per problem, empty when every link is present and loads
     */
    static List<String> problems(
            List<Map<String, String>> dependencies,
            Map<String, Map<String, String>> selections,
            Function<String, Integer> statusOf) {
        List<String> problems = []
        Map<String, Integer> statusByUrl = [:]
        dependencies.each { dependency ->
            String moduleId = "${dependency.moduleName}:${dependency.moduleVersion}"
            boolean hasSourceUrl = selections[dependency.moduleName]?.sourceUrl != null
            if (!hasSourceUrl) {
                String license = dependency.moduleLicense ?: ''
                if (SOURCE_DISCLOSURE_LICENSE.matcher(license).find()) {
                    problems << "${moduleId} is under '${license}' but has no sourceUrl in license-selections.json"
                }
                return
            }

            String url = dependency.moduleUrl
            Integer status = url == null ? null : statusByUrl.computeIfAbsent(url) { statusOf.apply(url) }
            if (status == null || status >= 400) {
                problems << "${moduleId} source link ${url} returned ${status ?: 'no response'}"
            }
        }
        return problems
    }
}
