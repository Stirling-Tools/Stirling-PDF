package stirling.software.gradle

import com.github.jk1.license.License
import com.github.jk1.license.ManifestData
import com.github.jk1.license.ModuleData
import com.github.jk1.license.ProjectData
import com.github.jk1.license.filter.DependencyFilter
import com.github.jk1.license.render.LicenseDataCollector
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.gradle.api.internal.artifacts.ivyservice.ivyresolve.strategy.DefaultVersionComparator
import org.gradle.api.internal.artifacts.ivyservice.ivyresolve.strategy.Version
import org.gradle.api.internal.artifacts.ivyservice.ivyresolve.strategy.VersionParser

class ModuleLicenseOverrideFilter implements DependencyFilter {
    private static final VersionParser VERSION_PARSER = new VersionParser()
    private static final Comparator<Version> VERSION_COMPARATOR =
            new DefaultVersionComparator().asVersionComparator()

    private final File overridesFile

    ModuleLicenseOverrideFilter(File overridesFile) {
        this.overridesFile = overridesFile
    }

    @Override
    ProjectData filter(ProjectData projectData) {
        Map<String, Map<String, String>> overrides = loadOverrides()
        List<ModuleData> modules = projectData.configurations
                .collectMany { configuration -> configuration.dependencies }
        Map<String, List<ModuleData>> modulesByCoordinate = modules
                .groupBy { module -> moduleCoordinate(module) }

        boolean overridesChanged = false
        overrides.keySet().toList().each { overrideId ->
            ModuleCoordinates overrideModule = parseModuleId(overrideId)
            List<ModuleData> coordinateModules = modulesByCoordinate[overrideModule.coordinate]
            ModuleData currentModule = coordinateModules
                    ?.find { module -> module.version == overrideModule.version }
            if (currentModule == null) {
                currentModule = newestModule(coordinateModules, overrideModule.version)
            }
            if (currentModule == null) {
                overrides.remove(overrideId)
                overridesChanged = true
                projectData.project.logger.lifecycle(
                        "Removed unused license override for ${overrideId}: "
                                + 'dependency version is no longer resolved')
                return
            }

            if (hasDeclaredLicense(currentModule)) {
                overrides.remove(overrideId)
                overridesChanged = true
                projectData.project.logger.lifecycle(
                        "Removed stale license override for ${overrideId}: "
                                + "${moduleId(currentModule)} now declares a license")
                return
            }

            if (compareVersions(currentModule.version, overrideModule.version) > 0) {
                String currentModuleId = moduleId(currentModule)
                overrides.remove(overrideId)
                if (!overrides.containsKey(currentModuleId)) {
                    overrides[currentModuleId] = [name: null, url: null, projectUrl: null]
                }
                overridesChanged = true
                projectData.project.logger.lifecycle(
                        "Updated license override from ${overrideId} to ${currentModuleId}: "
                                + 'newer dependency still declares no license')
            }
        }

        modules.groupBy { module -> moduleId(module) }.each { currentModuleId, matchingModules ->
            ModuleData module = matchingModules.first()
            if (!overrides.containsKey(currentModuleId) && !hasDeclaredLicense(module)) {
                overrides[currentModuleId] = [name: null, url: null, projectUrl: null]
                overridesChanged = true
                projectData.project.logger.lifecycle(
                        "Added missing license override for ${currentModuleId}. "
                                + "Set 'name' and 'url' in ${overridesFile}.")
            }
        }
        if (overridesChanged) {
            saveOverrides(overrides)
        }

        projectData.configurations.each { configuration ->
            configuration.dependencies.each { module -> applyOverride(module, overrides) }
        }
        return projectData
    }

    private void applyOverride(
            ModuleData module, Map<String, Map<String, String>> overrides) {
        String moduleId = moduleId(module)
        Map<String, String> override = overrides[moduleId]
        if (override == null) {
            return
        }

        String licenseName = override.name
        String licenseUrl = override.url
        String projectUrl = override.projectUrl
        if (licenseName == null || licenseName.isBlank()) {
            return
        }

        Set<License> licenses = [new License(licenseName, licenseUrl)] as LinkedHashSet<License>
        ManifestData manifest =
                new ManifestData(module.name, module.version, null, null, projectUrl, licenses, false)
        Set<ManifestData> manifests = new LinkedHashSet<>(module.manifests ?: [])
        manifests.add(manifest)
        module.manifests = manifests
    }

    private Map<String, Map<String, String>> loadOverrides() {
        Object parsed = new JsonSlurper().parse(overridesFile)
        if (!(parsed instanceof Map)) {
            throw new IllegalArgumentException(
                    "License overrides file ${overridesFile} must contain a JSON object")
        }
        return parsed as Map<String, Map<String, String>>
    }

    private void saveOverrides(Map<String, Map<String, String>> overrides) {
        String json = JsonOutput.prettyPrint(JsonOutput.toJson(overrides)) + System.lineSeparator()
        overridesFile.setText(json, 'UTF-8')
    }

    private static String moduleId(ModuleData module) {
        return "${module.group}:${module.name}:${module.version}"
    }

    private static String moduleCoordinate(ModuleData module) {
        return "${module.group}:${module.name}"
    }

    private static ModuleCoordinates parseModuleId(String moduleId) {
        List<String> parts = moduleId.split(':', 3) as List<String>
        if (parts.size() != 3 || parts.any { part -> part.isBlank() }) {
            throw new IllegalArgumentException(
                    "License override key ${moduleId} must use group:module:version")
        }
        return new ModuleCoordinates("${parts[0]}:${parts[1]}", parts[2])
    }

    private static ModuleData newestModule(List<ModuleData> modules, String minimumVersion) {
        return modules
                ?.findAll { module -> compareVersions(module.version, minimumVersion) > 0 }
                ?.max { left, right -> compareVersions(left.version, right.version) }
    }

    private static int compareVersions(String left, String right) {
        return VERSION_COMPARATOR.compare(
                VERSION_PARSER.transform(left), VERSION_PARSER.transform(right))
    }

    private static boolean hasDeclaredLicense(ModuleData module) {
        Set<License> licenses = LicenseDataCollector.multiModuleLicenseInfo(module).licenses
        return licenses.any { license -> license.name != null && !license.name.isBlank() }
    }

    private static class ModuleCoordinates {
        final String coordinate
        final String version

        ModuleCoordinates(String coordinate, String version) {
            this.coordinate = coordinate
            this.version = version
        }
    }
}
