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
import org.gradle.api.internal.artifacts.ivyservice.ivyresolve.strategy.VersionParser
import java.io.File

/**
 * Supplies fallback license metadata for dependencies whose POM, manifest or license file states
 * nothing usable, and prunes overrides that have stopped being needed.
 *
 * Version ordering deliberately uses Gradle's own dependency version comparator so a migrated
 * override lands where dependency resolution would put it. That comparator lives in
 * `org.gradle.api.internal`, an unsupported package, so a Gradle upgrade can move or drop it.
 */
class ModuleLicenseOverrideFilter(private val overridesFile: File) : DependencyFilter {

    /** An override that has not been filled in yet keeps all three fields null. */
    data class LicenseOverride(val name: String?, val url: String?, val projectUrl: String?)

    override fun filter(projectData: ProjectData): ProjectData {
        val overrides = loadOverrides()
        val modules = projectData.configurations.flatMap { configuration -> configuration.dependencies }
        val modulesByCoordinate = modules.groupBy { module -> moduleCoordinate(module) }
        val logger = projectData.project.logger

        var overridesChanged = false
        // Snapshot the keys: the loop below both removes and adds entries.
        for (overrideId in overrides.keys.toList()) {
            val overrideModule = parseModuleId(overrideId)
            val coordinateModules = modulesByCoordinate[overrideModule.coordinate]
            var currentModule = coordinateModules?.find { module -> module.version == overrideModule.version }
            if (currentModule == null) {
                currentModule = newestModule(coordinateModules, overrideModule.version)
            }
            if (currentModule == null) {
                overrides.remove(overrideId)
                overridesChanged = true
                logger.lifecycle(
                    "Removed unused license override for $overrideId: " +
                        "dependency version is no longer resolved"
                )
                continue
            }

            if (hasDeclaredLicense(currentModule)) {
                overrides.remove(overrideId)
                overridesChanged = true
                logger.lifecycle(
                    "Removed stale license override for $overrideId: " +
                        "${moduleId(currentModule)} now declares a license"
                )
                continue
            }

            if (compareVersions(currentModule.version, overrideModule.version) > 0) {
                val currentModuleId = moduleId(currentModule)
                overrides.remove(overrideId)
                if (!overrides.containsKey(currentModuleId)) {
                    overrides[currentModuleId] = LicenseOverride(null, null, null)
                }
                overridesChanged = true
                logger.lifecycle(
                    "Updated license override from $overrideId to $currentModuleId: " +
                        "newer dependency still declares no license"
                )
            }
        }

        for ((currentModuleId, matchingModules) in modules.groupBy { module -> moduleId(module) }) {
            val module = matchingModules.first()
            if (!overrides.containsKey(currentModuleId) && !hasDeclaredLicense(module)) {
                overrides[currentModuleId] = LicenseOverride(null, null, null)
                overridesChanged = true
                logger.lifecycle(
                    "Added missing license override for $currentModuleId. " +
                        "Set 'name' and 'url' in $overridesFile."
                )
            }
        }
        if (overridesChanged) {
            saveOverrides(overrides)
        }

        for (configuration in projectData.configurations) {
            for (module in configuration.dependencies) {
                applyOverride(module, overrides)
            }
        }
        return projectData
    }

    private fun applyOverride(module: ModuleData, overrides: Map<String, LicenseOverride>) {
        val override = overrides[moduleId(module)] ?: return
        val licenseName = override.name
        if (licenseName.isNullOrBlank()) {
            return
        }

        val manifest = ManifestData(
            module.name,
            module.version,
            null,
            null,
            override.projectUrl,
            linkedSetOf(License(licenseName, override.url)),
            false,
        )
        val manifests = LinkedHashSet<ManifestData>(module.manifests ?: emptySet())
        manifests.add(manifest)
        module.manifests = manifests
    }

    private fun loadOverrides(): MutableMap<String, LicenseOverride> {
        @Suppress("UNCHECKED_CAST")
        val parsed = JsonSlurper().parse(overridesFile) as? Map<String, Any?>
            ?: throw IllegalArgumentException(
                "License overrides file $overridesFile must contain a JSON object"
            )

        val overrides = linkedMapOf<String, LicenseOverride>()
        for ((moduleId, value) in parsed) {
            val fields = value as? Map<*, *>
                ?: throw IllegalArgumentException("License override $moduleId must be a JSON object")
            overrides[moduleId] = LicenseOverride(
                fields["name"] as String?,
                fields["url"] as String?,
                fields["projectUrl"] as String?,
            )
        }
        return overrides
    }

    private fun saveOverrides(overrides: Map<String, LicenseOverride>) {
        // Written as an explicit field map rather than by reflecting over the data class: an
        // unfilled override must keep its three null keys on disk so it still reads as pending.
        val serializable = overrides.mapValuesTo(linkedMapOf()) { (_, override) ->
            linkedMapOf<String, Any?>(
                "name" to override.name,
                "url" to override.url,
                "projectUrl" to override.projectUrl,
            )
        }
        overridesFile.writeText(
            JsonOutput.prettyPrint(JsonOutput.toJson(serializable)) + System.lineSeparator()
        )
    }

    private data class ModuleCoordinates(val coordinate: String, val version: String)

    private companion object {
        private val VERSION_PARSER = VersionParser()
        private val VERSION_COMPARATOR = DefaultVersionComparator().asVersionComparator()

        private fun moduleId(module: ModuleData): String =
            "${module.group}:${module.name}:${module.version}"

        private fun moduleCoordinate(module: ModuleData): String = "${module.group}:${module.name}"

        private fun parseModuleId(moduleId: String): ModuleCoordinates {
            val parts = moduleId.split(':', limit = 3)
            if (parts.size != 3 || parts.any { part -> part.isBlank() }) {
                throw IllegalArgumentException(
                    "License override key $moduleId must use group:module:version"
                )
            }
            return ModuleCoordinates("${parts[0]}:${parts[1]}", parts[2])
        }

        private fun newestModule(modules: List<ModuleData>?, minimumVersion: String): ModuleData? =
            modules
                ?.filter { module -> compareVersions(module.version, minimumVersion) > 0 }
                ?.maxWithOrNull { left, right -> compareVersions(left.version, right.version) }

        private fun compareVersions(left: String, right: String): Int =
            VERSION_COMPARATOR.compare(VERSION_PARSER.transform(left), VERSION_PARSER.transform(right))

        private fun hasDeclaredLicense(module: ModuleData): Boolean =
            LicenseDataCollector.multiModuleLicenseInfo(module).licenses
                .any { license -> license.name?.isNotBlank() == true }
    }
}