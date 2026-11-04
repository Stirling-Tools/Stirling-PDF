package stirling.software.gradle

import com.github.jk1.license.ConfigurationData
import com.github.jk1.license.License
import com.github.jk1.license.ManifestData
import com.github.jk1.license.ModuleData
import com.github.jk1.license.ProjectData
import com.github.jk1.license.check.LicenseChecker
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
            allowed(APACHE, 'permissive'),
            allowed(APACHE_ALIAS, 'permissive'),
            allowed(EPL, 'weak-copyleft'),
            allowed(MPL, 'weak-copyleft'),
            allowed(LGPL, 'copyleft'),
            allowed(GPL_CPE, 'copyleft')
    ]

    @TempDir
    Path temporaryDirectory

    @Test
    void reportsPermissiveLicenseInsteadOfAlphabeticallyLastOne() {
        ModuleData module = createModule(APACHE, GPL_CPE)
        assertEquals(GPL_CPE.name, singleLicenseInfo(module)[1])

        filter(module, ALLOWED)

        assertEquals([HOMEPAGE, APACHE.name, APACHE.url], singleLicenseInfo(module))
        assertEquals([APACHE.name], licenseNames(module))
    }

    @Test
    void linksSourcesJarForWeakCopyleftLicense() {
        ModuleData module = createModule(MPL)

        filter(module, ALLOWED)

        assertEquals([SOURCES_JAR, MPL.name, MPL.url], singleLicenseInfo(module))
    }

    @Test
    void prefersWeakCopyleftOverCopyleft() {
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
    void leavesModuleUnchangedWhenDefaultLicenseIsAlreadyPermissive() {
        ModuleData module = createModule(APACHE, APACHE_ALIAS)

        filter(module, ALLOWED)

        assertEquals([HOMEPAGE, APACHE_ALIAS.name, APACHE_ALIAS.url], singleLicenseInfo(module))
        assertEquals([APACHE.name, APACHE_ALIAS.name], licenseNames(module))
    }

    @Test
    void appliesModuleScopedEntryOnlyToThatModule() {
        List<Map<String, String>> allowed = [
                [moduleName: 'com.other:library', moduleLicense: UNLISTED.name, category: 'permissive'],
                allowed(GPL_CPE, 'copyleft')
        ]
        ModuleData module = createModule(UNLISTED, GPL_CPE)

        filter(module, allowed)

        assertEquals([SOURCES_JAR, GPL_CPE.name, GPL_CPE.url], singleLicenseInfo(module))
    }

    @Test
    void usesLeastPermissiveCategoryWhenEntriesConflict() {
        List<Map<String, String>> allowed = [allowed(MPL, 'permissive'), allowed(MPL, 'weak-copyleft')]
        ModuleData module = createModule(MPL)

        filter(module, allowed)

        assertEquals(SOURCES_JAR, singleLicenseInfo(module)[0])
    }

    @Test
    void failsWhenAllowedLicenseHasNoValidCategory() {
        List<Map<String, String>> allowed = [[moduleName: '.*', moduleLicense: MPL.name], allowed(APACHE, 'high')]

        GradleException failure = assertThrows(GradleException) { filter(createModule(MPL), allowed) }

        assertTrue(failure.message.contains(MPL.name))
    }

    @Test
    void agreesWithCheckLicenseOnTrickyEntries() {
        String quoted = '"Quoted, version 2.0";link="https://www.example.com/LICENSE-2.0.html"'
        List<Map<String, String>> allowed = [
                [moduleName: '.*', moduleLicense: 'Apache.*', category: 'permissive'],
                [moduleName: 'com.example:scoped', moduleLicense: 'Scoped License', category: 'permissive'],
                [moduleName: 'com.example:versioned', moduleVersion: '1\\..*', moduleLicense: 'Versioned License',
                 category: 'weak-copyleft'],
                [moduleName: '.*', moduleLicense: quoted, category: 'permissive'],
                [moduleLicense: 'No Module Name', category: 'copyleft'],
                [moduleName: 'com.example:any-license', moduleLicense: '.*', category: 'copyleft']
        ]
        List<List<String>> cases = [
                ['com.example:lib', '1.0', 'Apache License 2.0'],
                ['com.example:lib', '1.0', 'apache license 2.0'],
                ['com.example:scoped', '1.0', 'Scoped License'],
                ['com.example:other', '1.0', 'Scoped License'],
                ['com.example:versioned', '1.2', 'Versioned License'],
                ['com.example:versioned', '2.0', 'Versioned License'],
                ['com.example:lib', '1.0', quoted],
                ['com.example:lib', '1.0', 'No Module Name'],
                ['com.example:any-license', '1.0', 'Anything'],
                ['com.example:lib', '1.0', 'Unlisted License']
        ]

        assertAgreesWithCheckLicense(writeAllowedLicenses(allowed), cases)
    }

    @Test
    void agreesWithCheckLicenseOnRepositoryAllowedLicenses() {
        File allowedLicensesFile = new File('../app/allowed-licenses.json')
        List<List<String>> cases = PreferredLicenseFilter.loadEntries(allowedLicensesFile).collectMany { entry ->
            String moduleName = entry.moduleName == '.*' ? 'com.example:lib' : entry.moduleName
            String license = entry.moduleLicense
            [[moduleName, '1.0', license], [moduleName, '1.0', license.toLowerCase()], [moduleName, '1.0', "${license} ".toString()]]
        }

        assertAgreesWithCheckLicense(allowedLicensesFile, cases)
    }

    private void assertAgreesWithCheckLicense(File allowedLicensesFile, List<List<String>> cases) {
        File dependenciesFile = temporaryDirectory.resolve('dependencies.json').toFile()
        dependenciesFile.text = JsonOutput.toJson([dependencies: cases.collect { moduleName, version, license ->
            [moduleName: moduleName, moduleVersion: version, moduleLicenses: [[moduleLicense: license]]]
        }])
        File rejectedFile = temporaryDirectory.resolve('rejected.json').toFile()
        try {
            new LicenseChecker().checkAllDependencyLicensesAreAllowed(
                    allowedLicensesFile, dependenciesFile, rejectedFile)
        } catch (GradleException ignored) {
            // checkLicense throws when anything is rejected; the rejected file is what is compared.
        }
        Set<List<String>> rejected = (new JsonSlurper().parse(rejectedFile).dependenciesWithoutAllowedLicenses
                as List<Map<String, String>>)
                .collect { dependency -> [dependency.moduleName, dependency.moduleVersion, dependency.moduleLicense] }
                as Set<List<String>>
        assertTrue(!rejected.isEmpty() && rejected.size() < cases.size(), 'cases must include allowed and rejected')

        List<Map<String, String>> entries = PreferredLicenseFilter.loadEntries(allowedLicensesFile)
        cases.each { testCase ->
            boolean allowedByFilter = PreferredLicenseFilter.categoryOf(
                    testCase[0], testCase[1], testCase[2], entries) != null
            assertEquals(!rejected.contains(testCase), allowedByFilter, testCase.toString())
        }
    }

    private File writeAllowedLicenses(List<Map<String, String>> allowed) {
        File allowedLicensesFile = temporaryDirectory.resolve('allowed-licenses.json').toFile()
        allowedLicensesFile.text = JsonOutput.toJson([allowedLicenses: allowed])
        return allowedLicensesFile
    }

    private void filter(ModuleData module, List<Map<String, String>> allowed) {
        File allowedLicensesFile = writeAllowedLicenses(allowed)
        ConfigurationData configuration =
                new ConfigurationData('runtimeClasspath', [module] as LinkedHashSet<ModuleData>)
        new PreferredLicenseFilter(allowedLicensesFile).filter(
                new ProjectData(
                        ProjectBuilder.builder().build(),
                        [configuration] as LinkedHashSet<ConfigurationData>))
    }

    private static Map<String, String> allowed(License license, String category) {
        return [moduleName: '.*', moduleLicense: license.name, category: category]
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
