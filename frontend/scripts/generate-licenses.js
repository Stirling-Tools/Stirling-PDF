#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Generate 3rd party licenses for frontend dependencies
 * This script creates a JSON file similar to the Java backend's 3rdPartyLicenses.json
 */

const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'assets', '3rdPartyLicenses.json');
const PACKAGE_JSON = path.join(__dirname, '..', 'package.json');

// Ensure the output directory exists
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🔍 Generating frontend license report...');

try {
    // Install license-checker if not present
    try {
        require.resolve('license-checker');
    } catch (e) {
        console.log('📦 Installing license-checker...');
        execSync('npm install --save-dev license-checker', { stdio: 'inherit' });
    }

    // Generate license report using license-checker (more reliable)
    const licenseReport = execSync('npx license-checker --production --json', { 
        encoding: 'utf8',
        cwd: path.dirname(PACKAGE_JSON)
    });
    
    const licenseData = JSON.parse(licenseReport);
    
    // Convert license-checker format to array
    const licenseArray = Object.entries(licenseData).map(([key, value]) => {
        let name, version;
        
        // Handle scoped packages like @mantine/core@1.0.0
        if (key.startsWith('@')) {
            const parts = key.split('@');
            name = `@${parts[1]}`;
            version = parts[2];
        } else {
            // Handle regular packages like react@18.0.0
            const lastAtIndex = key.lastIndexOf('@');
            name = key.substring(0, lastAtIndex);
            version = key.substring(lastAtIndex + 1);
        }
        
        return {
            name: name,
            version: version || value.version,
            licenseType: value.licenses,
            repository: value.repository,
            url: value.url,
            link: value.licenseUrl
        };
    });
    
    // Transform to match Java backend format
    const transformedData = {
        dependencies: licenseArray.map(dep => {
            const licenseType = Array.isArray(dep.licenseType) ? dep.licenseType.join(', ') : (dep.licenseType || 'Unknown');
            const licenseUrl = dep.link || getLicenseUrl(licenseType);
            
            return {
                moduleName: dep.name,
                moduleUrl: dep.repository || dep.url || `https://www.npmjs.com/package/${dep.name}`,
                moduleVersion: dep.version,
                moduleLicense: licenseType,
                moduleLicenseUrl: licenseUrl
            };
        })
    };
    
    // Log summary of license types found
    const licenseSummary = licenseArray.reduce((acc, dep) => {
        const license = Array.isArray(dep.licenseType) ? dep.licenseType.join(', ') : (dep.licenseType || 'Unknown');
        acc[license] = (acc[license] || 0) + 1;
        return acc;
    }, {});
    
    console.log('📊 License types found:');
    Object.entries(licenseSummary).forEach(([license, count]) => {
        console.log(`   ${license}: ${count} packages`);
    });

    // Check for potentially problematic licenses
    const problematicLicenses = checkLicenseCompatibility(licenseSummary, licenseArray);
    if (problematicLicenses.length > 0) {
        console.log('\n⚠️  License compatibility warnings:');
        problematicLicenses.forEach(warning => {
            console.log(`   ${warning.message}`);
        });
        
        // Write license warnings to a separate file for CI/CD
        const warningsFile = path.join(__dirname, '..', 'src', 'assets', 'license-warnings.json');
        fs.writeFileSync(warningsFile, JSON.stringify({
            warnings: problematicLicenses,
            generated: new Date().toISOString()
        }, null, 2));
        console.log(`⚠️  License warnings saved to: ${warningsFile}`);
    } else {
        console.log('\n✅ All licenses appear to be corporate-friendly');
    }

    // Write to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(transformedData, null, 4));
    
    console.log(`✅ License report generated successfully!`);
    console.log(`📄 Found ${transformedData.dependencies.length} dependencies`);
    console.log(`💾 Saved to: ${OUTPUT_FILE}`);
    
} catch (error) {
    console.error('❌ Error generating license report:', error.message);
    process.exit(1);
}

/**
 * Get standard license URLs for common licenses
 */
function getLicenseUrl(licenseType) {
    if (!licenseType || licenseType === 'Unknown') return '';
    
    const licenseUrls = {
        'MIT': 'https://opensource.org/licenses/MIT',
        'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
        'Apache License 2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
        'BSD-3-Clause': 'https://opensource.org/licenses/BSD-3-Clause',
        'BSD-2-Clause': 'https://opensource.org/licenses/BSD-2-Clause',
        'BSD': 'https://opensource.org/licenses/BSD-3-Clause',
        'GPL-3.0': 'https://www.gnu.org/licenses/gpl-3.0.html',
        'GPL-2.0': 'https://www.gnu.org/licenses/gpl-2.0.html',
        'LGPL-2.1': 'https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html',
        'LGPL-3.0': 'https://www.gnu.org/licenses/lgpl-3.0.html',
        'ISC': 'https://opensource.org/licenses/ISC',
        'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'Unlicense': 'https://unlicense.org/',
        'MPL-2.0': 'https://www.mozilla.org/en-US/MPL/2.0/',
        'WTFPL': 'http://www.wtfpl.net/',
        'Zlib': 'https://opensource.org/licenses/Zlib',
        'Artistic-2.0': 'https://opensource.org/licenses/Artistic-2.0',
        'EPL-1.0': 'https://www.eclipse.org/legal/epl-v10.html',
        'EPL-2.0': 'https://www.eclipse.org/legal/epl-2.0/',
        'CDDL-1.0': 'https://opensource.org/licenses/CDDL-1.0',
        'Ruby': 'https://www.ruby-lang.org/en/about/license.txt',
        'Python-2.0': 'https://www.python.org/download/releases/2.0/license/',
        'Public Domain': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'UNLICENSED': ''
    };
    
    // Try exact match first
    if (licenseUrls[licenseType]) {
        return licenseUrls[licenseType];
    }
    
    // Try case-insensitive match
    const lowerType = licenseType.toLowerCase();
    for (const [key, url] of Object.entries(licenseUrls)) {
        if (key.toLowerCase() === lowerType) {
            return url;
        }
    }
    
    // For non-standard licenses, return empty string (will use package link if available)
    return '';
}

/**
 * Check for potentially problematic licenses that may not be MIT/corporate compatible
 */
function checkLicenseCompatibility(licenseSummary, licenseArray) {
    const warnings = [];
    
    // Define problematic license patterns
    const problematicLicenses = {
        // Copyleft licenses
        'GPL-2.0': 'Strong copyleft license - requires derivative works to be GPL',
        'GPL-3.0': 'Strong copyleft license - requires derivative works to be GPL',
        'LGPL-2.1': 'Weak copyleft license - may require source disclosure for modifications',
        'LGPL-3.0': 'Weak copyleft license - may require source disclosure for modifications',
        'AGPL-3.0': 'Network copyleft license - requires source disclosure for network use',
        'AGPL-1.0': 'Network copyleft license - requires source disclosure for network use',
        
        // Other potentially problematic licenses
        'WTFPL': 'Potentially problematic license - legal uncertainty',
        'CC-BY-SA-4.0': 'ShareAlike license - requires derivative works to use same license',
        'CC-BY-SA-3.0': 'ShareAlike license - requires derivative works to use same license',
        'CC-BY-NC-4.0': 'Non-commercial license - prohibits commercial use',
        'CC-BY-NC-3.0': 'Non-commercial license - prohibits commercial use',
        'OSL-3.0': 'Copyleft license - requires derivative works to be OSL',
        'EPL-1.0': 'Weak copyleft license - may require source disclosure',
        'EPL-2.0': 'Weak copyleft license - may require source disclosure',
        'CDDL-1.0': 'Weak copyleft license - may require source disclosure',
        'CDDL-1.1': 'Weak copyleft license - may require source disclosure',
        'CPL-1.0': 'Weak copyleft license - may require source disclosure',
        'MPL-1.1': 'Weak copyleft license - may require source disclosure',
        'EUPL-1.1': 'Copyleft license - requires derivative works to be EUPL',
        'EUPL-1.2': 'Copyleft license - requires derivative works to be EUPL',
        'UNLICENSED': 'No license specified - usage rights unclear',
        'Unknown': 'License not detected - manual review required'
    };
    
    // Known good licenses (no warnings needed)
    const goodLicenses = new Set([
        'MIT', 'Apache-2.0', 'Apache License 2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD',
        'ISC', 'CC0-1.0', 'Public Domain', 'Unlicense', '0BSD', 'BlueOak-1.0.0',
        'Zlib', 'Artistic-2.0', 'Python-2.0', 'Ruby', 'MPL-2.0', 'CC-BY-4.0',
        'SEE LICENSE IN https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/refs/heads/main/proprietary/LICENSE'
    ]);
    
    // Check each license type
    Object.entries(licenseSummary).forEach(([license, count]) => {
        // Skip known good licenses
        if (goodLicenses.has(license)) {
            return;
        }
        
        // Check if this license only affects our own packages
        const affectedPackages = licenseArray.filter(dep => {
            const depLicense = Array.isArray(dep.licenseType) ? dep.licenseType.join(', ') : dep.licenseType;
            return depLicense === license;
        });
        
        const isOnlyOurPackages = affectedPackages.every(dep => 
            dep.name === 'frontend' || 
            dep.name.toLowerCase().includes('stirling-pdf') ||
            dep.name.toLowerCase().includes('stirling_pdf') ||
            dep.name.toLowerCase().includes('stirlingpdf')
        );
        
        if (isOnlyOurPackages && (license === 'UNLICENSED' || license.startsWith('SEE LICENSE IN'))) {
            return; // Skip warnings for our own Stirling-PDF packages
        }
        
        // Check for compound licenses like "(MIT AND Zlib)" or "(MIT OR CC0-1.0)"
        if (license.includes('AND') || license.includes('OR')) {
            // Parse compound license
            const hasProblematicComponent = Object.keys(problematicLicenses).some(problematic => 
                license.includes(problematic)
            );
            
            if (hasProblematicComponent) {
                const affectedPackages = licenseArray
                    .filter(dep => {
                        const depLicense = Array.isArray(dep.licenseType) ? dep.licenseType.join(', ') : dep.licenseType;
                        return depLicense === license;
                    })
                    .map(dep => ({
                        name: dep.name,
                        version: dep.version,
                        url: dep.repository || dep.url || `https://www.npmjs.com/package/${dep.name}`
                    }));
                
                warnings.push({
                    message: `📋 This PR contains ${count} package${count > 1 ? 's' : ''} with compound license "${license}" - manual review recommended`,
                    licenseType: license,
                    licenseUrl: '',
                    reason: 'Compound license with potentially problematic components',
                    packageCount: count,
                    affectedDependencies: affectedPackages
                });
            }
            return;
        }
        
        // Check for exact matches with problematic licenses
        if (problematicLicenses[license]) {
            const affectedPackages = licenseArray
                .filter(dep => {
                    const depLicense = Array.isArray(dep.licenseType) ? dep.licenseType.join(', ') : dep.licenseType;
                    return depLicense === license;
                })
                .map(dep => ({
                    name: dep.name,
                    version: dep.version,
                    url: dep.repository || dep.url || `https://www.npmjs.com/package/${dep.name}`
                }));
            
            const packageList = affectedPackages.map(pkg => pkg.name).slice(0, 5).join(', ') + (affectedPackages.length > 5 ? `, and ${affectedPackages.length - 5} more` : '');
            const licenseUrl = getLicenseUrl(license) || 'https://opensource.org/licenses';
            
            warnings.push({
                message: `⚠️  This PR contains ${count} package${count > 1 ? 's' : ''} with license type [${license}](${licenseUrl}) - ${problematicLicenses[license]}. Affected packages: ${packageList}`,
                licenseType: license,
                licenseUrl: licenseUrl,
                reason: problematicLicenses[license],
                packageCount: count,
                affectedDependencies: affectedPackages
            });
        } else {
            // Unknown license type - flag for manual review
            const affectedPackages = licenseArray
                .filter(dep => {
                    const depLicense = Array.isArray(dep.licenseType) ? dep.licenseType.join(', ') : dep.licenseType;
                    return depLicense === license;
                })
                .map(dep => ({
                    name: dep.name,
                    version: dep.version,
                    url: dep.repository || dep.url || `https://www.npmjs.com/package/${dep.name}`
                }));
            
            warnings.push({
                message: `❓ This PR contains ${count} package${count > 1 ? 's' : ''} with unknown license type "${license}" - manual review required`,
                licenseType: license,
                licenseUrl: '',
                reason: 'Unknown license type',
                packageCount: count,
                affectedDependencies: affectedPackages
            });
        }
    });
    
    return warnings;
}