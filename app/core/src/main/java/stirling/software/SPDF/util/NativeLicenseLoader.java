package stirling.software.SPDF.util;

import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.Dependency;

/**
 * Reads third-party license notices bundled inside dependency jars. JPDFium ships its native
 * attribution as {@code licenses/NOTICE.txt} plus one full-text file per component inside every
 * natives jar, so discovery runs off the runtime classpath: whatever natives jars are present
 * (per-platform selects, future vips jars) contribute their notices with no code change.
 */
@Slf4j
public final class NativeLicenseLoader {

    public static final String NOTICE_RESOURCE = "licenses/NOTICE.txt";

    private static final Pattern SECTION_HEADER = Pattern.compile("^\\d+\\.\\s+(.+?)\\s*$");
    private static final Pattern LICENSE_LINE =
            Pattern.compile("^-\\s*License:\\s*(.+?)\\s*\\(see\\s+(\\S+?)\\)\\s*$");
    private static final Pattern COPYRIGHT_LEAD = Pattern.compile("^-\\s*Copyright\\s+(.*)$");

    private NativeLicenseLoader() {}

    public static List<Dependency> loadNativeLicenses(
            ClassLoader classLoader, String toolkitVersion) {
        Map<String, Dependency> byName = new LinkedHashMap<>();
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
                for (Dependency dependency : parseNotice(noticeUrl, toolkitVersion)) {
                    byName.putIfAbsent(dependency.getModuleName(), dependency);
                }
            } catch (Exception e) {
                log.warn("Skipping unreadable native license notice {}", noticeUrl, e);
            }
        }
        return new ArrayList<>(byName.values());
    }

    private static List<Dependency> parseNotice(URL noticeUrl, String toolkitVersion)
            throws IOException {
        List<String> lines;
        try (InputStream in = noticeUrl.openStream()) {
            lines = new String(in.readAllBytes(), StandardCharsets.UTF_8).lines().toList();
        }
        List<Dependency> dependencies = new ArrayList<>();
        String name = null;
        StringBuilder copyright = new StringBuilder();
        boolean inCopyright = false;
        for (String raw : lines) {
            Matcher header = SECTION_HEADER.matcher(raw);
            if (header.matches()) {
                name = header.group(1).trim();
                copyright.setLength(0);
                inCopyright = false;
                continue;
            }
            if (name == null) {
                continue;
            }
            String trimmed = raw.trim();
            Matcher copyrightLead = COPYRIGHT_LEAD.matcher(trimmed);
            Matcher license = LICENSE_LINE.matcher(trimmed);
            if (copyrightLead.matches()) {
                if (!copyright.isEmpty()) {
                    copyright.append(' ');
                }
                copyright.append(copyrightLead.group(1).trim());
                inCopyright = true;
            } else if (license.matches()) {
                dependencies.add(
                        buildDependency(
                                noticeUrl,
                                name,
                                copyright.toString(),
                                license.group(1).trim(),
                                license.group(2).trim(),
                                toolkitVersion));
                name = null;
                inCopyright = false;
            } else if (inCopyright && !trimmed.isEmpty() && !trimmed.startsWith("-")) {
                copyright.append(' ').append(trimmed);
            } else {
                inCopyright = false;
            }
        }
        return dependencies;
    }

    private static Dependency buildDependency(
            URL noticeUrl,
            String name,
            String copyright,
            String licenseName,
            String licenseFile,
            String toolkitVersion) {
        Dependency dependency = new Dependency();
        dependency.setModuleName(name);
        dependency.setModuleVersion(toolkitVersion);
        dependency.setModuleLicense(licenseName);
        String text = readSiblingText(noticeUrl, licenseFile);
        if (text != null) {
            // A missing sibling is already reported by readSiblingText; leaving the text
            // unset keeps the UI from presenting copyright alone as the license.
            dependency.setModuleLicenseText(
                    copyright.isEmpty() ? text : "Copyright " + copyright + "\n\n" + text);
        }
        return dependency;
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
