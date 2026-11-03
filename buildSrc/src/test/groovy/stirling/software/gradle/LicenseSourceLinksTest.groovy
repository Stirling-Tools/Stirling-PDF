package stirling.software.gradle

import org.junit.jupiter.api.Test

import static org.junit.jupiter.api.Assertions.assertEquals
import static org.junit.jupiter.api.Assertions.assertTrue

class LicenseSourceLinksTest {
    private static final String SOURCE_URL = 'https://github.com/example/lib/tree/v1.0'

    @Test
    void passesWhenSelectedSourceLinkLoads() {
        List<String> problems = LicenseSourceLinks.problems(
                [dependency('com.example:lib', 'MPL 2.0', SOURCE_URL)],
                ['com.example:lib': [license: 'MPL 2.0', sourceUrl: SOURCE_URL]]) { url -> 200 }

        assertEquals([], problems)
    }

    @Test
    void reportsBrokenOrUnreachableSourceLink() {
        List<String> problems = LicenseSourceLinks.problems(
                [
                        dependency('com.example:lib', 'MPL 2.0', SOURCE_URL),
                        dependency('com.example:other', 'EPL-2.0', 'https://unreachable.example')
                ],
                [
                        'com.example:lib': [license: 'MPL 2.0', sourceUrl: SOURCE_URL],
                        'com.example:other': [license: 'EPL-2.0', sourceUrl: 'https://unreachable.example']
                ]) { url -> url == SOURCE_URL ? 404 : null }

        assertEquals(2, problems.size())
        assertTrue(problems[0].contains('returned 404'))
        assertTrue(problems[1].contains('returned no response'))
    }

    @Test
    void requiresSourceUrlForLicensesThatObligeSourceDisclosure() {
        List<String> licenses = [
                'Mozilla Public License 2.0 (MPL-2.0)', 'MPL 2.0', 'EPL-2.0',
                'Eclipse Public License - v 2.0', 'COMMON DEVELOPMENT AND DISTRIBUTION LICENSE (CDDL) Version 1.0',
                'LGPL-2.1-only', 'GPL2 w/ CPE', 'GNU Lesser General Public License'
        ]

        licenses.each { license ->
            List<String> problems = LicenseSourceLinks.problems(
                    [dependency('com.example:lib', license, 'https://www.example.com')], [:]) { url -> 200 }
            assertEquals(1, problems.size(), license)
        }
    }

    @Test
    void doesNotRequireSourceUrlForPermissiveLicenses() {
        List<String> licenses = [
                'Apache-2.0', 'MIT License', 'BSD 3-Clause License', 'Eclipse Distribution License - v 1.0', 'EDL 1.0'
        ]

        licenses.each { license ->
            List<String> problems = LicenseSourceLinks.problems(
                    [dependency('com.example:lib', license, null)], [:]) { url -> 200 }
            assertEquals([], problems, license)
        }
    }

    @Test
    void requestsEachUrlOnce() {
        int requests = 0
        LicenseSourceLinks.problems(
                [
                        dependency('com.example:lib', 'MPL 2.0', SOURCE_URL),
                        dependency('com.example:lib-extra', 'MPL 2.0', SOURCE_URL)
                ],
                [
                        'com.example:lib': [license: 'MPL 2.0', sourceUrl: SOURCE_URL],
                        'com.example:lib-extra': [license: 'MPL 2.0', sourceUrl: SOURCE_URL]
                ]) { url -> requests++; 200 }

        assertEquals(1, requests)
    }

    private static Map<String, String> dependency(String moduleName, String license, String moduleUrl) {
        return [moduleName: moduleName, moduleVersion: '1.0', moduleLicense: license, moduleUrl: moduleUrl]
    }
}
