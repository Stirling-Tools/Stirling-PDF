package stirling.software.gradle

import com.github.jk1.license.ConfigurationData
import com.github.jk1.license.License
import com.github.jk1.license.ManifestData
import com.github.jk1.license.ModuleData
import com.github.jk1.license.ProjectData
import com.github.jk1.license.render.LicenseDataCollector
import org.gradle.testfixtures.ProjectBuilder
import org.junit.jupiter.api.Test

import static org.junit.jupiter.api.Assertions.assertEquals

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

    @Test
    void reportsPermissiveLicenseInsteadOfAlphabeticallyLastCopyleftOne() {
        ModuleData module = createModule(APACHE, GPL_CPE)
        assertEquals(GPL_CPE.name, singleLicenseInfo(module)[1])

        filter(module)

        assertEquals([HOMEPAGE, APACHE.name, APACHE.url], singleLicenseInfo(module))
        assertEquals([APACHE.name], licenseNames(module))
    }

    @Test
    void linksSourcesJarWhenOnlyCopyleftLicensesAreDeclared() {
        ModuleData module = createModule(MPL)

        filter(module)

        assertEquals([SOURCES_JAR, MPL.name, MPL.url], singleLicenseInfo(module))
    }

    @Test
    void prefersFileLevelCopyleftOverLgpl() {
        ModuleData module = createModule(EPL, LGPL)

        filter(module)

        assertEquals([SOURCES_JAR, EPL.name, EPL.url], singleLicenseInfo(module))
    }

    @Test
    void prefersWeakCopyleftOverGpl() {
        ModuleData module = createModule(EPL, GPL_CPE)

        filter(module)

        assertEquals([SOURCES_JAR, EPL.name, EPL.url], singleLicenseInfo(module))
        assertEquals([EPL.name], licenseNames(module))
    }

    @Test
    void leavesModuleUnchangedWhenDefaultLicenseIsAlreadyPermissive() {
        ModuleData module = createModule(APACHE, APACHE_ALIAS)

        filter(module)

        assertEquals([HOMEPAGE, APACHE_ALIAS.name, APACHE_ALIAS.url], singleLicenseInfo(module))
        assertEquals([APACHE.name, APACHE_ALIAS.name], licenseNames(module))
    }

    @Test
    void leavesModuleWithoutLicenseUnchanged() {
        ModuleData module = createModule()

        filter(module)

        assertEquals([HOMEPAGE, null, null], singleLicenseInfo(module))
    }

    @Test
    void ranksLicenseNames() {
        Map<String, Integer> expected = [
                'Apache-2.0': 0,
                'MIT-0': 0,
                'BSD 3-clause License w/nuclear disclaimer': 0,
                'EDL 1.0': 0,
                'Eclipse Distribution License - v 1.0': 0,
                'Public Domain, per Creative Commons CC0': 0,
                'UnRar License': 1,
                'Mozilla Public License 2.0 (MPL-2.0)': 2,
                'Eclipse Public License - v 2.0': 2,
                'COMMON DEVELOPMENT AND DISTRIBUTION LICENSE (CDDL) Version 1.0': 2,
                'CDDL/GPLv2+CE': 2,
                'GNU Lesser General Public License': 3,
                'LGPL-2.1-only': 3,
                'GPL2 w/ CPE': 4,
                'GNU General Public License, version 2 with the GNU Classpath Exception': 4
        ]

        expected.each { name, rank -> assertEquals(rank, PreferredLicenseFilter.rank(name), name) }
    }

    private static void filter(ModuleData module) {
        ConfigurationData configuration =
                new ConfigurationData('runtimeClasspath', [module] as LinkedHashSet<ModuleData>)
        new PreferredLicenseFilter().filter(
                new ProjectData(
                        ProjectBuilder.builder().build(),
                        [configuration] as LinkedHashSet<ConfigurationData>))
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
