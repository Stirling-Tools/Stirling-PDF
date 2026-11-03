package stirling.software.gradle

import com.github.jk1.license.License
import com.github.jk1.license.ManifestData
import com.github.jk1.license.ModuleData
import com.github.jk1.license.ProjectData
import com.github.jk1.license.filter.DependencyFilter
import com.github.jk1.license.render.LicenseDataCollector
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.gradle.api.GradleException

/**
 * Sets the license and source link reported for a dependency, keyed by {@code group:artifact}.
 * The selected license replaces all others for that module, in the report and in
 * {@code checkLicense}.
 *
 * <p>The selected license must be one the resolved module declares, otherwise the build fails.
 * {@code {version}} in a {@code sourceUrl} is replaced with the resolved version. Selections for
 * artifacts that are no longer resolved are removed from the file.
 */
class ModuleLicenseSelectionFilter implements DependencyFilter {
    private static final String VERSION_PLACEHOLDER = '{version}'

    private final File selectionsFile

    ModuleLicenseSelectionFilter(File selectionsFile) {
        this.selectionsFile = selectionsFile
    }

    @Override
    ProjectData filter(ProjectData projectData) {
        Map<String, Map<String, String>> selections = loadSelections()
        List<ModuleData> modules = projectData.configurations
                .collectMany { configuration -> configuration.dependencies }
        Set<String> resolvedCoordinates = modules
                .collect { module -> moduleCoordinate(module) } as Set<String>

        List<String> unusedCoordinates = selections.keySet()
                .findAll { coordinate -> !resolvedCoordinates.contains(coordinate) }
                .toList()
        if (!unusedCoordinates.isEmpty()) {
            unusedCoordinates.each { coordinate ->
                selections.remove(coordinate)
                projectData.project.logger.lifecycle(
                        "Removed unused license selection for ${coordinate}: "
                                + 'dependency is no longer resolved')
            }
            saveSelections(selections)
        }

        modules.each { module ->
            Map<String, String> selection = selections[moduleCoordinate(module)]
            if (selection != null) {
                applySelection(module, selection)
            }
        }
        return projectData
    }

    private void applySelection(ModuleData module, Map<String, String> selection) {
        Set<License> declaredLicenses =
                LicenseDataCollector.multiModuleLicenseInfo(module).licenses
        License chosenLicense = declaredLicenses.find { license -> license.name == selection.license }
        if (chosenLicense == null) {
            throw new GradleException(
                    "License selection for ${moduleId(module)} names '${selection.license}', "
                            + 'which the module does not declare. Declared: '
                            + "${declaredLicenses.collect { license -> license.name }}. "
                            + "Re-verify its license and update ${selectionsFile}.")
        }

        String moduleUrl = selection.sourceUrl?.replace(VERSION_PLACEHOLDER, module.version)
        if (moduleUrl == null) {
            moduleUrl = LicenseDataCollector.singleModuleLicenseInfo(module)[0]
        }

        module.poms = new TreeSet<>()
        module.licenseFiles = new TreeSet<>()
        module.manifests = [
                new ManifestData(
                        module.name,
                        module.version,
                        null,
                        null,
                        moduleUrl,
                        [chosenLicense] as LinkedHashSet<License>,
                        false)
        ] as LinkedHashSet<ManifestData>
    }

    private Map<String, Map<String, String>> loadSelections() {
        Object parsed = new JsonSlurper().parse(selectionsFile)
        if (!(parsed instanceof Map)) {
            throw new IllegalArgumentException(
                    "License selections file ${selectionsFile} must contain a JSON object")
        }
        Map<String, Map<String, String>> selections = parsed as Map<String, Map<String, String>>
        selections.each { coordinate, selection ->
            List<String> parts = coordinate.split(':') as List<String>
            if (parts.size() != 2 || parts.any { part -> part.isBlank() }) {
                throw new IllegalArgumentException(
                        "License selection key ${coordinate} must use group:artifact")
            }
            if (selection?.license == null || selection.license.isBlank()) {
                throw new IllegalArgumentException(
                        "License selection for ${coordinate} must set 'license'")
            }
        }
        return selections
    }

    private void saveSelections(Map<String, Map<String, String>> selections) {
        String json = JsonOutput.prettyPrint(JsonOutput.toJson(selections)) + System.lineSeparator()
        selectionsFile.setText(json, 'UTF-8')
    }

    private static String moduleId(ModuleData module) {
        return "${module.group}:${module.name}:${module.version}"
    }

    private static String moduleCoordinate(ModuleData module) {
        return "${module.group}:${module.name}"
    }
}
