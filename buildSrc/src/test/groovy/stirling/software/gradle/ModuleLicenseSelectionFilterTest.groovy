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
import org.gradle.api.GradleException
import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

import static org.junit.jupiter.api.Assertions.assertEquals
import static org.junit.jupiter.api.Assertions.assertThrows
import static org.junit.jupiter.api.Assertions.assertTrue

class ModuleLicenseSelectionFilterTest {
    private static final String GROUP = 'com.example'
    private static final String MODULE = 'example-library'
    private static final String COORDINATE = "${GROUP}:${MODULE}"
    private static final String VERSION = '1.4.2'
    private static final String HOMEPAGE = 'https://www.example.com'
    private static final License APACHE =
            new License('Apache License, Version 2.0', 'https://www.apache.org/licenses/LICENSE-2.0')
    private static final License GPL =
            new License('GNU General Public License, version 2', 'https://www.gnu.org/licenses/gpl-2.0')

    @TempDir
    Path temporaryDirectory

    @Test
    void reportShowsSelectedLicenseInsteadOfAlphabeticallyLastOne() {
        ModuleData module = createModule(APACHE, GPL)
        assertEquals(GPL.name, singleLicenseInfo(module)[1])

        File selectionsFile = createSelectionsFile([(COORDINATE): [license: APACHE.name]])
        new ModuleLicenseSelectionFilter(selectionsFile).filter(createProjectData(module))

        assertEquals([HOMEPAGE, APACHE.name, APACHE.url], singleLicenseInfo(module))
        assertEquals([APACHE.name], licenseNames(module))
    }

    @Test
    void substitutesResolvedVersionIntoSourceUrl() {
        ModuleData module = createModule(APACHE, GPL)
        File selectionsFile = createSelectionsFile(
                [(COORDINATE): [license: GPL.name, sourceUrl: 'https://github.com/example/lib/tree/v{version}']])

        new ModuleLicenseSelectionFilter(selectionsFile).filter(createProjectData(module))

        assertEquals(
                ["https://github.com/example/lib/tree/v${VERSION}".toString(), GPL.name, GPL.url],
                singleLicenseInfo(module))
    }

    @Test
    void failsWhenSelectedLicenseIsNotDeclaredByTheModule() {
        ModuleData module = createModule(GPL)
        File selectionsFile = createSelectionsFile([(COORDINATE): [license: APACHE.name]])

        GradleException failure = assertThrows(GradleException) {
            new ModuleLicenseSelectionFilter(selectionsFile).filter(createProjectData(module))
        }

        assertTrue(failure.message.contains("${COORDINATE}:${VERSION}"))
        assertEquals([GPL.name], licenseNames(module))
    }

    @Test
    void removesSelectionForArtifactThatIsNoLongerResolved() {
        File selectionsFile = createSelectionsFile(
                [(COORDINATE): [license: APACHE.name], 'com.example:other-library': [license: GPL.name]])

        new ModuleLicenseSelectionFilter(selectionsFile).filter(createProjectData(createModule(APACHE)))

        assertEquals([COORDINATE], readSelections(selectionsFile).keySet().toList())
    }

    @Test
    void rejectsVersionedSelectionKey() {
        File selectionsFile = createSelectionsFile(
                [("${COORDINATE}:${VERSION}".toString()): [license: APACHE.name]])

        assertThrows(IllegalArgumentException) {
            new ModuleLicenseSelectionFilter(selectionsFile).filter(createProjectData(createModule(APACHE)))
        }
    }

    private File createSelectionsFile(Map<String, Map<String, String>> selections) {
        File selectionsFile = temporaryDirectory.resolve('license-selections.json').toFile()
        selectionsFile.text = JsonOutput.prettyPrint(JsonOutput.toJson(selections))
        return selectionsFile
    }

    private static Map<String, Object> readSelections(File selectionsFile) {
        return new JsonSlurper().parse(selectionsFile) as Map<String, Object>
    }

    private static ProjectData createProjectData(ModuleData... modules) {
        ConfigurationData configuration =
                new ConfigurationData(
                        'runtimeClasspath', modules as LinkedHashSet<ModuleData>)
        return new ProjectData(
                ProjectBuilder.builder().build(),
                [configuration] as LinkedHashSet<ConfigurationData>)
    }

    private static ModuleData createModule(License... licenses) {
        Set<ManifestData> manifests = [
                new ManifestData(
                        MODULE,
                        VERSION,
                        null,
                        null,
                        HOMEPAGE,
                        licenses as LinkedHashSet<License>,
                        false)
        ] as LinkedHashSet<ManifestData>
        return new ModuleData(
                GROUP,
                MODULE,
                VERSION,
                true,
                manifests,
                new LinkedHashSet<>(),
                new LinkedHashSet<>())
    }

    private static List<String> singleLicenseInfo(ModuleData module) {
        return LicenseDataCollector.singleModuleLicenseInfo(module)
    }

    private static List<String> licenseNames(ModuleData module) {
        Set<License> licenses = LicenseDataCollector.multiModuleLicenseInfo(module).licenses
        return licenses.collect { license -> license.name }.sort()
    }
}
