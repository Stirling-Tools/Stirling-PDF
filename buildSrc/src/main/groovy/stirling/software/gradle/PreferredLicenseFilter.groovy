package stirling.software.gradle

import com.github.jk1.license.License
import com.github.jk1.license.ManifestData
import com.github.jk1.license.ModuleData
import com.github.jk1.license.ProjectData
import com.github.jk1.license.filter.DependencyFilter
import com.github.jk1.license.render.LicenseDataCollector
import java.util.regex.Pattern

/**
 * Reports the most permissive license a dependency declares, ranked permissive, then
 * unrecognised, then file-level copyleft (MPL, EPL, CDDL), then LGPL, then GPL. Ties go to the
 * alphabetically last name, as the plugin does.
 *
 * <p>When the reported license is copyleft, the dependency's URL is replaced with its
 * {@code -sources.jar} on Maven Central for the resolved version.
 *
 * <p>A module is rewritten to report only the chosen license, in the report and in
 * {@code checkLicense}, when its default license is not the chosen one or the chosen one is
 * copyleft. Other modules are left as the plugin reads them.
 */
class PreferredLicenseFilter implements DependencyFilter {
    private static final String MAVEN_CENTRAL = 'https://repo1.maven.org/maven2'

    private static final List<Map.Entry<Pattern, Integer>> RANKS = [
            Map.entry(Pattern.compile(
                    '(?i)apache|\\bmit\\b|\\bbsd|\\bisc\\b|\\bedl\\b|eclipse distribution'
                            + '|public domain|\\bcc0\\b|bouncy castle|\\bw3c\\b|\\bsax\\b|go license'), 0),
            Map.entry(Pattern.compile(
                    '(?i)mozilla|\\bmpl\\b|eclipse public|\\bepl\\b|cddl|common development and distribution'), 2),
            Map.entry(Pattern.compile('(?i)lesser general|\\blgpl'), 3),
            Map.entry(Pattern.compile('(?i)general public|\\bgpl'), 4)
    ]
    private static final int UNRECOGNISED_RANK = 1
    private static final int COPYLEFT_RANK = 2

    @Override
    ProjectData filter(ProjectData projectData) {
        projectData.configurations
                .collectMany { configuration -> configuration.dependencies }
                .each { module -> applyPreferredLicense(module) }
        return projectData
    }

    static int rank(String licenseName) {
        Map.Entry<Pattern, Integer> match =
                RANKS.find { entry -> entry.key.matcher(licenseName).find() }
        return match == null ? UNRECOGNISED_RANK : match.value
    }

    private static String sourcesJarUrl(ModuleData module) {
        String directory = "${MAVEN_CENTRAL}/${module.group.replace('.', '/')}/${module.name}/${module.version}"
        return "${directory}/${module.name}-${module.version}-sources.jar"
    }

    private static void applyPreferredLicense(ModuleData module) {
        Set<License> declared = LicenseDataCollector.multiModuleLicenseInfo(module).licenses
                .findAll { license -> license.name } as Set<License>
        if (declared.isEmpty()) {
            return
        }

        int bestRank = declared.collect { license -> rank(license.name) }.min()
        License chosen = declared
                .findAll { license -> rank(license.name) == bestRank }
                .max { license -> license.name }
        List<String> defaultInfo = LicenseDataCollector.singleModuleLicenseInfo(module)
        boolean copyleft = bestRank >= COPYLEFT_RANK
        if (!copyleft && defaultInfo[1] == chosen.name) {
            return
        }

        String moduleUrl = copyleft ? sourcesJarUrl(module) : defaultInfo[0]
        module.poms = new TreeSet<>()
        module.licenseFiles = new TreeSet<>()
        module.manifests = [
                new ManifestData(
                        module.name,
                        module.version,
                        null,
                        null,
                        moduleUrl,
                        [chosen] as LinkedHashSet<License>,
                        false)
        ] as LinkedHashSet<ManifestData>
    }
}
