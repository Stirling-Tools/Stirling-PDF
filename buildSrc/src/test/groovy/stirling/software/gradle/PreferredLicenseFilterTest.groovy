package stirling.software.gradle

import com.github.jk1.license.ConfigurationData
import com.github.jk1.license.License
import com.github.jk1.license.ManifestData
import com.github.jk1.license.ModuleData
import com.github.jk1.license.ProjectData
import com.github.jk1.license.render.LicenseDataCollector
import groovy.json.JsonOutput
import java.nio.file.Path
import org.gradle.api.GradleException
import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

import static org.junit.jupiter.api.Assertions.assertEquals
import static org.junit.jupiter.api.Assertions.assertThrows
import static org.junit.jupiter.api.Assertions.assertTrue

class PreferredLicenseFilterTest {
    private static final String GROUP = 'com.example.libs'
    private static final String MODULE = 'example-library'
    private static final String VERSION = '1.4.2'
    private static final String HOMEPAGE = 'https://www.example.com'
    private static final String SOURCES_JAR =
            'https://repo1.maven.org/maven2/com/example/libs/example-library/1.4.2/example-library-1.4.2-sources.jar'
    private static final License APACHE =
            new License('Apache License, Version 2.0', 'https://www.apache.org/licenses/LICENSE-2.0')
    private static final License APACHE_ALIAS =
            new License('The Apache Software License, Version 2.0', 'https://www.apache.org/licenses/LICENSE-2.0.txt')
    private static final License EPL = new License('EPL 2.0', 'https://www.eclipse.org/legal/epl-2.0')
    private static final License MPL = new License('MPL 2.0', 'https://www.mozilla.org/MPL/2.0/')
    private static final License LGPL = new License('LGPL-2.1-only', 'https://spdx.org/licenses/LGPL-2.1-only.html')
    private static final License GPL_CPE = new License('GPL2 w/ CPE', 'https://openjdk.org/legal/gplv2+ce.html')
    private static final License UNLISTED = new License('Unlisted License', 'https://www.example.com/license')

    private static final List<Map<String, String>> ALLOWED = [
            allowed(APACHE, 'high'),
            allowed(APACHE_ALIAS, 'high'),
            allowed(EPL, 'medium'),
            allowed(MPL, 'medium'),
            allowed(LGPL, 'low'),
            allowed(GPL_CPE, 'low')
    ]

    @TempDir
    Path temporaryDirectory

    @Test
    void reportsHighTierLicenseInsteadOfAlphabeticallyLastOne() {
        ModuleData module = createModule(APACHE, GPL_CPE)
        assertEquals(GPL_CPE.name, singleLicenseInfo(module)[1])

        filter(module, ALLOWED)

        assertEquals([HOMEPAGE, APACHE.name, APACHE.url], singleLicenseInfo(module))
        assertEquals([APACHE.name], licenseNames(module))
    }

    @Test
    void linksSourcesJarForMediumTierLicense() {
        ModuleData module = createModule(MPL)

        filter(module, ALLOWED)

        assertEquals([SOURCES_JAR, MPL.name, MPL.url], singleLicenseInfo(module))
    }

    @Test
    void prefersMediumTierOverLowTier() {
        ModuleData module = createModule(EPL, LGPL)

        filter(module, ALLOWED)

        assertEquals([SOURCES_JAR, EPL.name, EPL.url], singleLicenseInfo(module))
        assertEquals([EPL.name], licenseNames(module))
    }

    @Test
    void neverReportsLicenseMissingFromAllowedLicenses() {
        ModuleData module = createModule(MPL, UNLISTED)

        filter(module, ALLOWED)

        assertEquals([SOURCES_JAR, MPL.name, MPL.url], singleLicenseInfo(module))
    }

    @Test
    void leavesModuleWithoutAllowedLicenseUnchanged() {
        ModuleData module = createModule(UNLISTED)

        filter(module, ALLOWED)

        assertEquals([HOMEPAGE, UNLISTED.name, UNLISTED.url], singleLicenseInfo(module))
    }

    @Test
    void leavesModuleUnchangedWhenDefaultLicenseIsAlreadyHighTier() {
        ModuleData module = createModule(APACHE, APACHE_ALIAS)

        filter(module, ALLOWED)

        assertEquals([HOMEPAGE, APACHE_ALIAS.name, APACHE_ALIAS.url], singleLicenseInfo(module))
        assertEquals([APACHE.name, APACHE_ALIAS.name], licenseNames(module))
    }

    @Test
    void appliesModuleScopedEntryOnlyToThatModule() {
        List<Map<String, String>> allowed = [
                [moduleName: 'com.other:library', moduleLicense: UNLISTED.name, tier: 'high'],
                allowed(GPL_CPE, 'low')
        ]
        ModuleData module = createModule(UNLISTED, GPL_CPE)

        filter(module, allowed)

        assertEquals([SOURCES_JAR, GPL_CPE.name, GPL_CPE.url], singleLicenseInfo(module))
    }

    @Test
    void usesLeastPermissiveTierWhenEntriesConflict() {
        List<Map<String, String>> allowed = [allowed(MPL, 'high'), allowed(MPL, 'medium')]
        ModuleData module = createModule(MPL)

        filter(module, allowed)

        assertEquals(SOURCES_JAR, singleLicenseInfo(module)[0])
    }

    @Test
    void failsWhenAllowedLicenseHasNoValidTier() {
        List<Map<String, String>> allowed = [[moduleName: '.*', moduleLicense: MPL.name], allowed(APACHE, 'top')]

        GradleException failure = assertThrows(GradleException) { filter(createModule(MPL), allowed) }

        assertTrue(failure.message.contains(MPL.name))
    }

    private void filter(ModuleData module, List<Map<String, String>> allowed) {
        File allowedLicensesFile = temporaryDirectory.resolve('allowed-licenses.json').toFile()
        allowedLicensesFile.text = JsonOutput.toJson([allowedLicenses: allowed])
        ConfigurationData configuration =
                new ConfigurationData('runtimeClasspath', [module] as LinkedHashSet<ModuleData>)
        new PreferredLicenseFilter(allowedLicensesFile).filter(
                new ProjectData(
                        ProjectBuilder.builder().build(),
                        [configuration] as LinkedHashSet<ConfigurationData>))
    }

    private static Map<String, String> allowed(License license, String tier) {
        return [moduleName: '.*', moduleLicense: license.name, tier: tier]
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
