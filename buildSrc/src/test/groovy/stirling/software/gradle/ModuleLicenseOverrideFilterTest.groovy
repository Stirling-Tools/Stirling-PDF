package stirling.software.gradle

import com.github.jk1.license.ConfigurationData
import com.github.jk1.license.License
import com.github.jk1.license.ManifestData
import com.github.jk1.license.ModuleData
import com.github.jk1.license.ProjectData
import com.github.jk1.license.render.LicenseDataCollector
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import java.nio.file.Path
import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

import static org.junit.jupiter.api.Assertions.assertEquals
import static org.junit.jupiter.api.Assertions.assertFalse
import static org.junit.jupiter.api.Assertions.assertTrue

class ModuleLicenseOverrideFilterTest {
    private static final String GROUP = 'com.example'
    private static final String MODULE = 'example-library'
    private static final String VERSION_WITHOUT_LICENSE = '1.4'
    private static final String VERSION_WITH_LICENSE = '1.7'
    private static final String APACHE_NAME = 'Apache License, Version 2.0'
    private static final String APACHE_URL = 'https://www.apache.org/licenses/LICENSE-2.0'
    private static final String PROJECT_URL = 'https://github.com/HubSpot/hubspot-immutables'

    @TempDir
    Path temporaryDirectory

    @Test
    void keepsOverrideForVersionWithoutLicenseMetadata() {
        ModuleData module = createModule(VERSION_WITHOUT_LICENSE, null)
        File overridesFile = createOverridesFile(moduleId(VERSION_WITHOUT_LICENSE))

        debugState('before filter', module, overridesFile)
        new ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState('after filter', module, overridesFile)

        Map<String, Object> overrides = readOverrides(overridesFile)
        assertTrue(overrides.containsKey(moduleId(VERSION_WITHOUT_LICENSE)))
        assertEquals([APACHE_NAME], licenseNames(module))
    }

    @Test
    void removesOverrideWhenLaterVersionDeclaresLicense() {
        License publishedLicense = new License(APACHE_NAME, APACHE_URL)
        ModuleData module = createModule(VERSION_WITH_LICENSE, publishedLicense)
        File overridesFile = createOverridesFile(moduleId(VERSION_WITHOUT_LICENSE))

        debugState('before filter', module, overridesFile)
        new ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState('after filter', module, overridesFile)

        Map<String, Object> overrides = readOverrides(overridesFile)
        assertFalse(overrides.containsKey(moduleId(VERSION_WITHOUT_LICENSE)))
        assertEquals([APACHE_NAME], licenseNames(module))
    }

    @Test
    void removesOverrideWhenOnlyOlderVersionIsResolved() {
        License publishedLicense = new License(APACHE_NAME, APACHE_URL)
        ModuleData module = createModule(VERSION_WITHOUT_LICENSE, publishedLicense)
        File overridesFile = createOverridesFile(moduleId(VERSION_WITH_LICENSE))

        debugState('before filter', module, overridesFile)
        new ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState('after filter', module, overridesFile)

        Map<String, Object> overrides = readOverrides(overridesFile)
        assertFalse(overrides.containsKey(moduleId(VERSION_WITH_LICENSE)))
        assertEquals([APACHE_NAME], licenseNames(module))
    }

    @Test
    void removesOverrideWhenModuleIsNoLongerResolved() {
        File overridesFile = createOverridesFile(moduleId(VERSION_WITHOUT_LICENSE))

        new ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData())

        assertTrue(readOverrides(overridesFile).isEmpty())
    }

    @Test
    void keepsOverrideWhenExactAndNewerVersionsAreBothResolved() {
        ModuleData olderModule = createModule(VERSION_WITHOUT_LICENSE, null)
        License publishedLicense = new License(APACHE_NAME, APACHE_URL)
        ModuleData newerModule = createModule(VERSION_WITH_LICENSE, publishedLicense)
        File overridesFile = createOverridesFile(moduleId(VERSION_WITHOUT_LICENSE))

        new ModuleLicenseOverrideFilter(overridesFile)
                .filter(createProjectData(olderModule, newerModule))

        Map<String, Object> overrides = readOverrides(overridesFile)
        assertTrue(overrides.containsKey(moduleId(VERSION_WITHOUT_LICENSE)))
        assertEquals([APACHE_NAME], licenseNames(olderModule))
        assertEquals([APACHE_NAME], licenseNames(newerModule))
    }

    @Test
    void movesOverrideUsingGradleNumericVersionOrdering() {
        String oldVersion = '1.9'
        String newVersion = '1.11.0'
        ModuleData module = createModule(newVersion, null)
        File overridesFile = createOverridesFile(moduleId(oldVersion))

        new ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))

        Map<String, Object> overrides = readOverrides(overridesFile)
        assertFalse(overrides.containsKey(moduleId(oldVersion)))
        assertEquals(
                [name: null, url: null, projectUrl: null], overrides[moduleId(newVersion)])
    }

    @Test
    void movesOverrideToLaterVersionWithoutLicenseAndClearsLicenseData() {
        ModuleData module = createModule(VERSION_WITH_LICENSE, null)
        File overridesFile = createOverridesFile(moduleId(VERSION_WITHOUT_LICENSE))

        debugState('before filter', module, overridesFile)
        new ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState('after filter', module, overridesFile)

        Map<String, Object> overrides = readOverrides(overridesFile)
        assertFalse(overrides.containsKey(moduleId(VERSION_WITHOUT_LICENSE)))
        assertEquals(
                [name: null, url: null, projectUrl: null],
                overrides[moduleId(VERSION_WITH_LICENSE)])
        assertTrue(licenseNames(module).isEmpty())
    }

    @Test
    void preservesExistingOverrideWhenRemovingOlderVersion() {
        ModuleData module = createModule(VERSION_WITH_LICENSE, null)
        File overridesFile = createOverridesFile(
                [
                    (moduleId(VERSION_WITHOUT_LICENSE)): [
                        name: APACHE_NAME, url: APACHE_URL
                    ],
                    (moduleId(VERSION_WITH_LICENSE)): [
                        name: APACHE_NAME, url: APACHE_URL, projectUrl: PROJECT_URL
                    ]
                ])

        debugState('before filter', module, overridesFile)
        new ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState('after filter', module, overridesFile)

        Map<String, Object> overrides = readOverrides(overridesFile)
        assertFalse(overrides.containsKey(moduleId(VERSION_WITHOUT_LICENSE)))
        assertEquals(
                [name: APACHE_NAME, url: APACHE_URL, projectUrl: PROJECT_URL],
                overrides[moduleId(VERSION_WITH_LICENSE)])
        assertEquals([APACHE_NAME], licenseNames(module))
    }

    @Test
    void addsMissingOverrideForModuleWithoutLicense() {
        ModuleData module = createModule(VERSION_WITHOUT_LICENSE, null)
        File overridesFile = createEmptyOverridesFile()

        debugState('before filter', module, overridesFile)
        new ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState('after filter', module, overridesFile)

        Map<String, Object> overrides = readOverrides(overridesFile)
        assertEquals(
                [name: null, url: null, projectUrl: null],
                overrides[moduleId(VERSION_WITHOUT_LICENSE)])
        assertTrue(licenseNames(module).isEmpty())
    }

    @Test
    void doesNotAddOverrideForModuleWithLicense() {
        License publishedLicense = new License(APACHE_NAME, APACHE_URL)
        ModuleData module = createModule(VERSION_WITH_LICENSE, publishedLicense)
        File overridesFile = createEmptyOverridesFile()

        debugState('before filter', module, overridesFile)
        new ModuleLicenseOverrideFilter(overridesFile).filter(createProjectData(module))
        debugState('after filter', module, overridesFile)

        assertTrue(readOverrides(overridesFile).isEmpty())
        assertEquals([APACHE_NAME], licenseNames(module))
    }

    private File createOverridesFile(String moduleId) {
        Map<String, Map<String, String>> overrides = [
            (moduleId): [name: APACHE_NAME, url: APACHE_URL]
        ]
        return createOverridesFile(overrides)
    }

    private File createOverridesFile(Map<String, Map<String, String>> overrides) {
        File overridesFile = temporaryDirectory.resolve('license-overrides.json').toFile()
        overridesFile.setText(JsonOutput.prettyPrint(JsonOutput.toJson(overrides)), 'UTF-8')
        return overridesFile
    }

    private File createEmptyOverridesFile() {
        File overridesFile = temporaryDirectory.resolve('license-overrides.json').toFile()
        overridesFile.setText('{}', 'UTF-8')
        return overridesFile
    }

    private static Map<String, Object> readOverrides(File overridesFile) {
        return new JsonSlurper().parse(overridesFile) as Map<String, Object>
    }

    private static void debugState(String stage, ModuleData module, File overridesFile) {
        String resolvedModuleId = "${module.group}:${module.name}:${module.version}"
        Map<String, Object> overrides = readOverrides(overridesFile)
        System.out.println(
                "[license-override-test] ${stage}: module=${resolvedModuleId}, "
                        + "licenses=${licenseNames(module)}, "
                        + "matchingOverride=${overrides.containsKey(resolvedModuleId)}, "
                        + "overrideKeys=${overrides.keySet().sort()}")
    }

    private static ProjectData createProjectData(ModuleData module) {
        return createProjectData(module as ModuleData[])
    }

    private static ProjectData createProjectData(ModuleData... modules) {
        ConfigurationData configuration =
                new ConfigurationData(
                        'runtimeClasspath', modules as LinkedHashSet<ModuleData>)
        return new ProjectData(
                ProjectBuilder.builder().build(),
                [configuration] as LinkedHashSet<ConfigurationData>)
    }

    private static ModuleData createModule(String version, License license) {
        Set<ManifestData> manifests = new LinkedHashSet<>()
        if (license != null) {
            manifests.add(
                    new ManifestData(
                            MODULE,
                            version,
                            null,
                            null,
                            null,
                            [license] as LinkedHashSet<License>,
                            false))
        }
        return new ModuleData(
                GROUP,
                MODULE,
                version,
                true,
                manifests,
                new LinkedHashSet<>(),
                new LinkedHashSet<>())
    }

    private static String moduleId(String version) {
        return "${GROUP}:${MODULE}:${version}"
    }

    private static List<String> licenseNames(ModuleData module) {
        Set<License> licenses = LicenseDataCollector.multiModuleLicenseInfo(module).licenses
        return licenses.collect { license -> license.name }.sort()
    }
}
