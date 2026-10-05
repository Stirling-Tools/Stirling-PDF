package stirling.software.gradle

import com.github.jk1.license.ConfigurationData
import com.github.jk1.license.License
import com.github.jk1.license.LicenseFileData
import com.github.jk1.license.ManifestData
import com.github.jk1.license.ModuleData
import com.github.jk1.license.PomData
import com.github.jk1.license.ProjectData
import com.github.jk1.license.render.LicenseDataCollector
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Path

class ModuleLicenseOverrideFilterTest {

    @TempDir
    lateinit var temporaryDirectory: Path

    @Test
    fun keepsOverrideForVersionWithoutLicenseMetadata() {
        val module = createModule(VERSION_WITHOUT_LICENSE, null)
        val overridesFile = createOverridesFile(moduleId(VERSION_WITHOUT_LICENSE))

        debugState("before filter", module, overridesFile)
        ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState("after filter", module, overridesFile)

        val overrides = readOverrides(overridesFile)
        assertTrue(overrides.containsKey(moduleId(VERSION_WITHOUT_LICENSE)))
        assertEquals(listOf(APACHE_NAME), licenseNames(module))
    }

    @Test
    fun removesOverrideWhenLaterVersionDeclaresLicense() {
        val module = createModule(VERSION_WITH_LICENSE, License(APACHE_NAME, APACHE_URL))
        val overridesFile = createOverridesFile(moduleId(VERSION_WITHOUT_LICENSE))

        debugState("before filter", module, overridesFile)
        ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState("after filter", module, overridesFile)

        val overrides = readOverrides(overridesFile)
        assertFalse(overrides.containsKey(moduleId(VERSION_WITHOUT_LICENSE)))
        assertEquals(listOf(APACHE_NAME), licenseNames(module))
    }

    @Test
    fun removesOverrideWhenOnlyOlderVersionIsResolved() {
        val module = createModule(VERSION_WITHOUT_LICENSE, License(APACHE_NAME, APACHE_URL))
        val overridesFile = createOverridesFile(moduleId(VERSION_WITH_LICENSE))

        debugState("before filter", module, overridesFile)
        ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState("after filter", module, overridesFile)

        val overrides = readOverrides(overridesFile)
        assertFalse(overrides.containsKey(moduleId(VERSION_WITH_LICENSE)))
        assertEquals(listOf(APACHE_NAME), licenseNames(module))
    }

    @Test
    fun removesOverrideWhenModuleIsNoLongerResolved() {
        val overridesFile = createOverridesFile(moduleId(VERSION_WITHOUT_LICENSE))

        ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData())

        assertTrue(readOverrides(overridesFile).isEmpty())
    }

    @Test
    fun keepsOverrideWhenExactAndNewerVersionsAreBothResolved() {
        val olderModule = createModule(VERSION_WITHOUT_LICENSE, null)
        val newerModule = createModule(VERSION_WITH_LICENSE, License(APACHE_NAME, APACHE_URL))
        val overridesFile = createOverridesFile(moduleId(VERSION_WITHOUT_LICENSE))

        ModuleLicenseOverrideFilter(overridesFile)
            .filter(createProjectData(olderModule, newerModule))

        val overrides = readOverrides(overridesFile)
        assertTrue(overrides.containsKey(moduleId(VERSION_WITHOUT_LICENSE)))
        assertEquals(listOf(APACHE_NAME), licenseNames(olderModule))
        assertEquals(listOf(APACHE_NAME), licenseNames(newerModule))
    }

    @Test
    fun movesOverrideUsingGradleNumericVersionOrdering() {
        val oldVersion = "1.9"
        val newVersion = "1.11.0"
        val module = createModule(newVersion, null)
        val overridesFile = createOverridesFile(moduleId(oldVersion))

        ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))

        val overrides = readOverrides(overridesFile)
        assertFalse(overrides.containsKey(moduleId(oldVersion)))
        assertEquals(emptyPlaceholder(), overrides[moduleId(newVersion)])
    }

    @Test
    fun movesOverrideToLaterVersionWithoutLicenseAndClearsLicenseData() {
        val module = createModule(VERSION_WITH_LICENSE, null)
        val overridesFile = createOverridesFile(moduleId(VERSION_WITHOUT_LICENSE))

        debugState("before filter", module, overridesFile)
        ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState("after filter", module, overridesFile)

        val overrides = readOverrides(overridesFile)
        assertFalse(overrides.containsKey(moduleId(VERSION_WITHOUT_LICENSE)))
        assertEquals(emptyPlaceholder(), overrides[moduleId(VERSION_WITH_LICENSE)])
        assertTrue(licenseNames(module).isEmpty())
    }

    @Test
    fun preservesExistingOverrideWhenRemovingOlderVersion() {
        val module = createModule(VERSION_WITH_LICENSE, null)
        val overridesFile = createOverridesFile(
            mapOf(
                moduleId(VERSION_WITHOUT_LICENSE) to mapOf("name" to APACHE_NAME, "url" to APACHE_URL),
                moduleId(VERSION_WITH_LICENSE) to mapOf(
                    "name" to APACHE_NAME,
                    "url" to APACHE_URL,
                    "projectUrl" to PROJECT_URL,
                ),
            )
        )

        debugState("before filter", module, overridesFile)
        ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState("after filter", module, overridesFile)

        val overrides = readOverrides(overridesFile)
        assertFalse(overrides.containsKey(moduleId(VERSION_WITHOUT_LICENSE)))
        assertEquals(
            mapOf("name" to APACHE_NAME, "url" to APACHE_URL, "projectUrl" to PROJECT_URL),
            overrides[moduleId(VERSION_WITH_LICENSE)],
        )
        assertEquals(listOf(APACHE_NAME), licenseNames(module))
    }

    @Test
    fun addsMissingOverrideForModuleWithoutLicense() {
        val module = createModule(VERSION_WITHOUT_LICENSE, null)
        val overridesFile = createEmptyOverridesFile()

        debugState("before filter", module, overridesFile)
        ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState("after filter", module, overridesFile)

        val overrides = readOverrides(overridesFile)
        assertEquals(emptyPlaceholder(), overrides[moduleId(VERSION_WITHOUT_LICENSE)])
        assertTrue(licenseNames(module).isEmpty())
    }

    @Test
    fun doesNotAddOverrideForModuleWithLicense() {
        val module = createModule(VERSION_WITH_LICENSE, License(APACHE_NAME, APACHE_URL))
        val overridesFile = createEmptyOverridesFile()

        debugState("before filter", module, overridesFile)
        ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState("after filter", module, overridesFile)

        assertTrue(readOverrides(overridesFile).isEmpty())
        assertEquals(listOf(APACHE_NAME), licenseNames(module))
    }

    private fun createOverridesFile(moduleId: String): File =
        createOverridesFile(
            mapOf(moduleId to mapOf("name" to APACHE_NAME, "url" to APACHE_URL))
        )

    private fun createOverridesFile(overrides: Map<String, Map<String, String?>>): File {
        val overridesFile = temporaryDirectory.resolve("license-overrides.json").toFile()
        overridesFile.writeText(JsonOutput.prettyPrint(JsonOutput.toJson(overrides)))
        return overridesFile
    }

    private fun createEmptyOverridesFile(): File {
        val overridesFile = temporaryDirectory.resolve("license-overrides.json").toFile()
        overridesFile.writeText("{}")
        return overridesFile
    }

    private fun debugState(stage: String, module: ModuleData, overridesFile: File) {
        val resolvedModuleId = "${module.group}:${module.name}:${module.version}"
        val overrides = readOverrides(overridesFile)
        println(
            "[license-override-test] $stage: module=$resolvedModuleId, " +
                "licenses=${licenseNames(module)}, " +
                "matchingOverride=${overrides.containsKey(resolvedModuleId)}, " +
                "overrideKeys=${overrides.keys.sorted()}"
        )
    }

    private fun createProjectData(vararg modules: ModuleData): ProjectData {
        val configuration = ConfigurationData("runtimeClasspath", LinkedHashSet(modules.toList()))
        return ProjectData(ProjectBuilder.builder().build(), linkedSetOf(configuration))
    }

    private fun createModule(version: String, license: License?): ModuleData {
        val manifests = LinkedHashSet<ManifestData>()
        if (license != null) {
            manifests.add(ManifestData(MODULE, version, null, null, null, linkedSetOf(license), false))
        }
        return ModuleData(
            GROUP,
            MODULE,
            version,
            true,
            manifests,
            LinkedHashSet<LicenseFileData>(),
            LinkedHashSet<PomData>(),
        )
    }

    private fun moduleId(version: String): String = "$GROUP:$MODULE:$version"

    private fun licenseNames(module: ModuleData): List<String?> =
        LicenseDataCollector.multiModuleLicenseInfo(module).licenses
            .map { license -> license.name }
            .sorted()

    private fun emptyPlaceholder(): Map<String, String?> = mapOf(
        "name" to null,
        "url" to null,
        "projectUrl" to null,
    )

    private companion object {
        private const val GROUP = "com.example"
        private const val MODULE = "example-library"
        private const val VERSION_WITHOUT_LICENSE = "1.4"
        private const val VERSION_WITH_LICENSE = "1.7"
        private const val APACHE_NAME = "Apache License, Version 2.0"
        private const val APACHE_URL = "https://www.apache.org/licenses/LICENSE-2.0"
        private const val PROJECT_URL = "https://github.com/HubSpot/hubspot-immutables"
    }
}

private fun readOverrides(overridesFile: File): Map<String, Any?> {
    @Suppress("UNCHECKED_CAST")
    return JsonSlurper().parse(overridesFile) as Map<String, Any?>
}