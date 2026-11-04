package stirling.software.gradle

import com.github.jk1.license.License
import com.github.jk1.license.ManifestData
import com.github.jk1.license.ModuleData
import com.github.jk1.license.ProjectData
import com.github.jk1.license.filter.DependencyFilter
import com.github.jk1.license.render.LicenseDataCollector
import groovy.json.JsonSlurper
import org.gradle.api.GradleException

/**
 * Reports, for each dependency, the declared license with the highest {@code tier} in the
 * allowed-licenses file ({@code high}, then {@code medium}, then {@code low}). Ties go to the
 * alphabetically last name, as the plugin does. Declared licenses with no matching entry are never
 * reported; a dependency with none is left for {@code checkLicense} to reject.
 *
 * <p>When the reported license is {@code medium} or {@code low}, the dependency's URL is replaced
 * with its {@code -sources.jar} on Maven Central for the resolved version.
 *
 * <p>A module is rewritten to report only the chosen license, in the report and in
 * {@code checkLicense}, unless its default license is already the chosen {@code high} one.
 *
 * <p>Entries are matched as {@code checkLicense} matches them, so the two agree on which licenses
 * are allowed. Every entry must set a valid {@code tier}, otherwise the build fails.
 */
class PreferredLicenseFilter implements DependencyFilter {
    private static final String MAVEN_CENTRAL = 'https://repo1.maven.org/maven2'
    private static final List<String> TIERS = ['high', 'medium', 'low']

    private final File allowedLicensesFile

    PreferredLicenseFilter(File allowedLicensesFile) {
        this.allowedLicensesFile = allowedLicensesFile
    }

    @Override
    ProjectData filter(ProjectData projectData) {
        List<Map<String, String>> entries = loadEntries()
        projectData.configurations
                .collectMany { configuration -> configuration.dependencies }
                .each { module -> applyPreferredLicense(module, entries) }
        return projectData
    }

    private List<Map<String, String>> loadEntries() {
        List<Map<String, String>> entries =
                new JsonSlurper().parse(allowedLicensesFile).allowedLicenses as List<Map<String, String>>
        entries.each { entry ->
            if (!TIERS.contains(entry.tier)) {
                throw new GradleException(
                        "Allowed license ${entry.moduleLicense} for ${entry.moduleName} must set " +
                                "'tier' to one of ${TIERS} in ${allowedLicensesFile}")
            }
        }
        return entries
    }

    private static void applyPreferredLicense(ModuleData module, List<Map<String, String>> entries) {
        Map<License, Integer> tierByLicense = [:]
        LicenseDataCollector.multiModuleLicenseInfo(module).licenses
                .findAll { license -> license.name }
                .each { license ->
                    Integer tier = tierOf(module, license.name, entries)
                    if (tier != null) {
                        tierByLicense[license] = tier
                    }
                }
        if (tierByLicense.isEmpty()) {
            return
        }

        int bestTier = tierByLicense.values().min()
        License chosen = tierByLicense
                .findAll { license, tier -> tier == bestTier }
                .keySet()
                .max { license -> license.name }
        boolean needsSource = bestTier > 0
        List<String> defaultInfo = LicenseDataCollector.singleModuleLicenseInfo(module)
        if (!needsSource && defaultInfo[1] == chosen.name) {
            return
        }

        String moduleUrl = needsSource ? sourcesJarUrl(module) : defaultInfo[0]
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

    // When several entries match one license, the least permissive tier wins.
    private static Integer tierOf(ModuleData module, String licenseName, List<Map<String, String>> entries) {
        String moduleName = "${module.group}:${module.name}"
        List<Integer> tiers = entries
                .findAll { entry ->
                    matches(moduleName, entry.moduleName)
                            && matches(module.version, entry.moduleVersion)
                            && matches(licenseName, entry.moduleLicense)
                }
                .collect { entry -> TIERS.indexOf(entry.tier) }
        return tiers.isEmpty() ? null : tiers.max()
    }

    // Mirrors checkLicense: a missing pattern matches anything, otherwise regex or exact match.
    private static boolean matches(String value, String pattern) {
        return pattern == null || value ==~ pattern || value == pattern
    }

    private static String sourcesJarUrl(ModuleData module) {
        String directory = "${MAVEN_CENTRAL}/${module.group.replace('.', '/')}/${module.name}/${module.version}"
        return "${directory}/${module.name}-${module.version}-sources.jar"
    }
}
