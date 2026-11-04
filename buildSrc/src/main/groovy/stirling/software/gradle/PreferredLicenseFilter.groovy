package stirling.software.gradle

import com.github.jk1.license.License
import com.github.jk1.license.ManifestData
import com.github.jk1.license.ModuleData
import com.github.jk1.license.ProjectData
import com.github.jk1.license.filter.DependencyFilter
import com.github.jk1.license.render.LicenseDataCollector
import groovy.json.JsonSlurper
import groovy.transform.PackageScope
import org.gradle.api.GradleException

/**
 * Reports, for each dependency, the declared license with the most permissive {@code category} in
 * the allowed-licenses file ({@code permissive}, then {@code weak-copyleft}, then
 * {@code copyleft}). Ties go to the alphabetically last name, as the plugin does. Declared licenses
 * with no matching entry are never reported; a dependency with none is left for
 * {@code checkLicense} to reject.
 *
 * <p>When the reported license is not {@code permissive}, the dependency's URL is replaced with its
 * {@code -sources.jar} on Maven Central for the resolved version.
 *
 * <p>A module is rewritten to report only the chosen license, in the report and in
 * {@code checkLicense}, unless its default license is already the chosen permissive one.
 *
 * <p>Entries are matched as {@code checkLicense} matches them, so the two agree on which licenses
 * are allowed. Every entry must set a valid {@code category}, otherwise the build fails.
 */
class PreferredLicenseFilter implements DependencyFilter {
    private static final String MAVEN_CENTRAL = 'https://repo1.maven.org/maven2'
    private static final List<String> CATEGORIES = ['permissive', 'weak-copyleft', 'copyleft']

    private final File allowedLicensesFile

    PreferredLicenseFilter(File allowedLicensesFile) {
        this.allowedLicensesFile = allowedLicensesFile
    }

    @Override
    ProjectData filter(ProjectData projectData) {
        List<Map<String, String>> entries = loadEntries(allowedLicensesFile)
        projectData.configurations
                .collectMany { configuration -> configuration.dependencies }
                .each { module -> applyPreferredLicense(module, entries) }
        return projectData
    }

    @PackageScope
    static List<Map<String, String>> loadEntries(File allowedLicensesFile) {
        List<Map<String, String>> entries =
                new JsonSlurper().parse(allowedLicensesFile).allowedLicenses as List<Map<String, String>>
        entries.each { entry ->
            if (!CATEGORIES.contains(entry.category)) {
                throw new GradleException(
                        "Allowed license ${entry.moduleLicense} for ${entry.moduleName} must set " +
                                "'category' to one of ${CATEGORIES} in ${allowedLicensesFile}")
            }
        }
        return entries
    }

    /**
     * Category of a license for a module, or {@code null} when no entry allows it. When several
     * entries match, the least permissive category wins.
     */
    @PackageScope
    static String categoryOf(
            String moduleName, String moduleVersion, String licenseName, List<Map<String, String>> entries) {
        List<Map<String, String>> matching = entries.findAll { entry ->
            matches(moduleName, entry.moduleName)
                    && matches(moduleVersion, entry.moduleVersion)
                    && matches(licenseName, entry.moduleLicense)
        }
        return matching.collect { entry -> entry.category }.max { category -> CATEGORIES.indexOf(category) }
    }

    private static void applyPreferredLicense(ModuleData module, List<Map<String, String>> entries) {
        String moduleName = "${module.group}:${module.name}"
        Map<License, Integer> rankByLicense = [:]
        LicenseDataCollector.multiModuleLicenseInfo(module).licenses
                .findAll { license -> license.name }
                .each { license ->
                    String category = categoryOf(moduleName, module.version, license.name, entries)
                    if (category != null) {
                        rankByLicense[license] = CATEGORIES.indexOf(category)
                    }
                }
        if (rankByLicense.isEmpty()) {
            return
        }

        int bestRank = rankByLicense.values().min()
        License chosen = rankByLicense
                .findAll { license, rank -> rank == bestRank }
                .keySet()
                .max { license -> license.name }
        boolean needsSource = bestRank > 0
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

    // Mirrors checkLicense: a missing pattern matches anything, otherwise regex or exact match.
    // PreferredLicenseFilterTest compares the two, so a plugin upgrade that changes it fails there.
    private static boolean matches(String value, String pattern) {
        return pattern == null || value ==~ pattern || value == pattern
    }

    private static String sourcesJarUrl(ModuleData module) {
        String directory = "${MAVEN_CENTRAL}/${module.group.replace('.', '/')}/${module.name}/${module.version}"
        return "${directory}/${module.name}-${module.version}-sources.jar"
    }
}
