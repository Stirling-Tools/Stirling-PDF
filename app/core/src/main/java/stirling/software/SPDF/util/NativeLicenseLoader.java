package stirling.software.SPDF.util;

import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.Dependency;

/**
 * Reads third-party license notices bundled inside dependency jars. JPDFium ships its native
 * attribution as {@code licenses/NOTICE.txt} plus one full-text file per component inside every
 * natives jar, so discovery runs off the runtime classpath: whatever natives jars are present
 * (per-platform selects, future vips jars) contribute their notices with no code change.
 *
 * <p>License lines may wrap onto following lines and may name no sibling file at all (multi-license
 * stacks reference several texts inline); both still produce a notice, the latter without full
 * text. Deduplication only collapses records that say the same thing: anything that actually
 * differs (component, license, or text) is preserved, never discarded.
 */
@Slf4j
public final class NativeLicenseLoader {

    public static final String NOTICE_RESOURCE = "licenses/NOTICE.txt";

    private static final Pattern SECTION_HEADER = Pattern.compile("^\\d+\\.\\s+(.+?)\\s*$");
    private static final Pattern LICENSE_LEAD = Pattern.compile("^-\\s*License:\\s*(.*)$");
    private static final Pattern COPYRIGHT_LEAD = Pattern.compile("^-\\s*Copyright\\s+(.*)$");
    private static final Pattern SEE_FILE = Pattern.compile("\\(see\\s+(\\S+?)\\)");
    private static final Pattern FULL_TEXT_FILE = Pattern.compile("\\(full text in\\s+(\\S+?)\\)");

    private NativeLicenseLoader() {}

    public static List<Dependency> loadNativeLicenses(ClassLoader classLoader) {
        List<Dependency> merged = new ArrayList<>();
        Enumeration<URL> notices;
        try {
            notices = classLoader.getResources(NOTICE_RESOURCE);
        } catch (IOException e) {
            log.warn("Unable to enumerate native license notices", e);
            return List.of();
        }
        while (notices.hasMoreElements()) {
            URL noticeUrl = notices.nextElement();
            try {
                for (Dependency dependency : parseNotice(noticeUrl)) {
                    mergeNotice(merged, dependency);
                }
            } catch (Exception e) {
                log.warn("Skipping unreadable native license notice {}", noticeUrl, e);
            }
        }
        return merged;
    }

    private static void mergeNotice(List<Dependency> merged, Dependency incoming) {
        for (int i = 0; i < merged.size(); i++) {
            Dependency current = merged.get(i);
            if (!sameNameAndLicense(current, incoming)) {
                continue;
            }
            if (Objects.equals(current.getModuleLicenseText(), incoming.getModuleLicenseText())) {
                return;
            }
            if (current.getModuleLicenseText() == null && incoming.getModuleLicenseText() != null) {
                merged.set(i, incoming);
                return;
            }
            if (incoming.getModuleLicenseText() == null) {
                return;
            }
        }
        merged.add(incoming);
    }

    private static boolean sameNameAndLicense(Dependency left, Dependency right) {
        return Objects.equals(left.getModuleName(), right.getModuleName())
                && Objects.equals(left.getModuleLicense(), right.getModuleLicense());
    }

    private static List<Dependency> parseNotice(URL noticeUrl) throws IOException {
        List<String> lines;
        try (InputStream in = noticeUrl.openStream()) {
            lines = new String(in.readAllBytes(), StandardCharsets.UTF_8).lines().toList();
        }
        List<Dependency> dependencies = new ArrayList<>();
        String name = null;
        StringBuilder copyright = new StringBuilder();
        StringBuilder licenseValue = null;
        boolean inCopyright = false;
        for (String raw : lines) {
            Matcher header = SECTION_HEADER.matcher(raw);
            if (header.matches()) {
                flushSection(dependencies, noticeUrl, name, copyright, licenseValue);
                name = header.group(1).trim();
                copyright.setLength(0);
                licenseValue = null;
                inCopyright = false;
                continue;
            }
            if (name == null) {
                continue;
            }
            String trimmed = raw.trim();
            if (trimmed.isEmpty()) {
                flushSection(dependencies, noticeUrl, name, copyright, licenseValue);
                name = null;
                copyright.setLength(0);
                licenseValue = null;
                inCopyright = false;
                continue;
            }
            if (trimmed.startsWith("-")) {
                inCopyright = false;
                Matcher copyrightLead = COPYRIGHT_LEAD.matcher(trimmed);
                Matcher licenseLead = LICENSE_LEAD.matcher(trimmed);
                if (copyrightLead.matches()) {
                    if (!copyright.isEmpty()) {
                        copyright.append(' ');
                    }
                    copyright.append(copyrightLead.group(1).trim());
                    inCopyright = true;
                } else if (licenseLead.matches()) {
                    licenseValue = new StringBuilder(licenseLead.group(1).trim());
                }
                continue;
            }
            if (licenseValue != null) {
                licenseValue.append(' ').append(trimmed);
            } else if (inCopyright) {
                copyright.append(' ').append(trimmed);
            }
        }
        flushSection(dependencies, noticeUrl, name, copyright, licenseValue);
        return dependencies;
    }

    private static void flushSection(
            List<Dependency> dependencies,
            URL noticeUrl,
            String name,
            StringBuilder copyright,
            StringBuilder licenseValue) {
        if (name == null || licenseValue == null) {
            return;
        }
        String value = licenseValue.toString().trim();
        if (value.isEmpty()) {
            return;
        }
        String licenseFile = referencedFile(value);
        Dependency dependency = new Dependency();
        dependency.setModuleName(name);
        dependency.setModuleLicense(stripFileReferences(value));
        if (licenseFile != null) {
            String text = readSiblingText(noticeUrl, licenseFile);
            if (text != null) {
                String copyrightText = copyright.toString().trim();
                // A missing sibling is already reported by readSiblingText; leaving the text
                // unset keeps the UI from presenting copyright alone as the license.
                dependency.setModuleLicenseText(
                        copyrightText.isEmpty()
                                ? text
                                : "Copyright " + copyrightText + "\n\n" + text);
            }
        }
        dependencies.add(dependency);
    }

    private static String referencedFile(String licenseValue) {
        Matcher see = SEE_FILE.matcher(licenseValue);
        if (see.find()) {
            return see.group(1);
        }
        Matcher fullText = FULL_TEXT_FILE.matcher(licenseValue);
        return fullText.find() ? fullText.group(1) : null;
    }

    private static String stripFileReferences(String licenseValue) {
        return FULL_TEXT_FILE
                .matcher(SEE_FILE.matcher(licenseValue).replaceAll(""))
                .replaceAll("")
                .trim()
                .replaceAll("\\s{2,}", " ");
    }

    private static String readSiblingText(URL noticeUrl, String licenseFile) {
        try (InputStream in = new URL(noticeUrl, licenseFile).openStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).strip();
        } catch (IOException e) {
            log.warn("Unable to read native license text {} beside {}", licenseFile, noticeUrl, e);
            return null;
        }
    }
}
