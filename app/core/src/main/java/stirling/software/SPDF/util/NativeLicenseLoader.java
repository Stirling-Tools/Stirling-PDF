package stirling.software.SPDF.util;

import java.io.IOException;
import java.io.InputStream;
import java.net.JarURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.BreakIterator;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.jar.JarFile;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.Dependency;

/**
 * Reads third-party license notices bundled inside dependency jars. JPDFium ships its native
 * attribution as {@code licenses/NOTICE.txt} plus one full-text file per component inside every
 * natives jar, so discovery runs off the runtime classpath: whatever natives jars are present
 * (per-platform selects, future vips jars) contribute their notices with no code change.
 *
 * <p>License lines may wrap onto following lines, name sibling files in several phrasings, or name
 * no sibling file at all (multi-license stacks reference several texts inline); all still produce a
 * notice, the last without full text. Lettered subsections and free-form attribution bullets are
 * preserved because they carry notices the license line alone does not. License files that the
 * notice never mentions are listed from the same directory so bundled texts cannot disappear just
 * because the notice forgot them. Deduplication only collapses records that say the same thing:
 * anything that actually differs (component, license, or text) is preserved, never discarded.
 */
@Slf4j
public final class NativeLicenseLoader {

    public static final String NOTICE_RESOURCE = "licenses/NOTICE.txt";

    private static final String LICENSE_DIRECTORY = "licenses/";

    private static final Pattern SECTION_HEADER =
            Pattern.compile("^\\d+[a-z]*[.)]\\s+(.+?)\\s*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern BULLET_PREFIX = Pattern.compile("^[-*\u2022]\\s*");
    private static final Pattern LICENSE_LEAD =
            Pattern.compile("^License:\\s*(.*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern COPYRIGHT_LEAD =
            Pattern.compile("^Copyright:?\\s+(.*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern FILE_TOKEN = Pattern.compile("(?i)[a-z0-9._+/-]+\\.txt\\b");
    private static final Pattern PARENTHETICAL_FILE_REFERENCE =
            Pattern.compile("\\([^()]*\\.txt[^()]*\\)", Pattern.CASE_INSENSITIVE);
    private static final Set<String> LICENSE_MARKERS =
            Set.of(
                    "APACHE",
                    "BSD",
                    "MIT",
                    "ISC",
                    "LGPL",
                    "GPL",
                    "MPL",
                    "ZLIB",
                    "CC0",
                    "IJG",
                    "UNLICENSE",
                    "PUBLIC",
                    "0BSD");

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
                ParsedNotice parsed = parseNotice(noticeUrl);
                for (Dependency dependency : parsed.dependencies()) {
                    mergeNotice(merged, dependency);
                }
                for (Dependency orphan : orphanLicenses(noticeUrl, parsed.referencedFiles())) {
                    mergeNotice(merged, orphan);
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

    private static ParsedNotice parseNotice(URL noticeUrl) throws IOException {
        List<String> lines;
        try (InputStream in = noticeUrl.openStream()) {
            lines = new String(in.readAllBytes(), StandardCharsets.UTF_8).lines().toList();
        }
        List<Dependency> dependencies = new ArrayList<>();
        Set<String> referencedFiles = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        String name = null;
        StringBuilder copyright = new StringBuilder();
        StringBuilder licenseValue = null;
        StringBuilder notes = new StringBuilder();
        StringBuilder continuation = null;
        boolean inTitle = false;
        for (String raw : lines) {
            Matcher header = SECTION_HEADER.matcher(raw);
            if (header.matches()) {
                flushSection(
                        dependencies,
                        referencedFiles,
                        noticeUrl,
                        name,
                        copyright,
                        licenseValue,
                        notes);
                name = header.group(1).trim();
                copyright.setLength(0);
                licenseValue = null;
                notes.setLength(0);
                continuation = null;
                inTitle = true;
                continue;
            }
            if (name == null) {
                continue;
            }
            String trimmed = raw.trim();
            if (trimmed.isEmpty()) {
                flushSection(
                        dependencies,
                        referencedFiles,
                        noticeUrl,
                        name,
                        copyright,
                        licenseValue,
                        notes);
                name = null;
                copyright.setLength(0);
                licenseValue = null;
                notes.setLength(0);
                continuation = null;
                inTitle = false;
                continue;
            }
            Matcher bullet = BULLET_PREFIX.matcher(trimmed);
            boolean isBullet = bullet.lookingAt();
            if (inTitle && !isBullet) {
                // A section title may wrap onto the lines below it; everything up
                // to the first metadata bullet still names the component.
                name = name + " " + trimmed;
                continue;
            }
            if (isBullet) {
                inTitle = false;
                String content = trimmed.substring(bullet.end());
                Matcher copyrightLead = COPYRIGHT_LEAD.matcher(content);
                Matcher licenseLead = LICENSE_LEAD.matcher(content);
                if (copyrightLead.matches()) {
                    appendText(copyright, copyrightLead.group(1));
                    continuation = copyright;
                } else if (licenseLead.matches()) {
                    licenseValue = new StringBuilder(licenseLead.group(1).trim());
                    continuation = licenseValue;
                } else {
                    // Attribution bullets carry text the license line does not,
                    // such as the SLJIT notice under PCRE2 and the IJG sentence.
                    appendText(notes, content);
                    continuation = notes;
                }
                continue;
            }
            if (continuation != null) {
                appendText(continuation, trimmed);
            }
        }
        flushSection(
                dependencies, referencedFiles, noticeUrl, name, copyright, licenseValue, notes);
        return new ParsedNotice(dependencies, referencedFiles);
    }

    private static void appendText(StringBuilder target, String text) {
        if (!target.isEmpty()) {
            target.append(' ');
        }
        target.append(text.trim());
    }

    private static void flushSection(
            List<Dependency> dependencies,
            Set<String> referencedFiles,
            URL noticeUrl,
            String name,
            StringBuilder copyright,
            StringBuilder licenseValue,
            StringBuilder notes) {
        if (name == null) {
            return;
        }
        String license = licenseValue == null ? "" : licenseValue.toString().trim();
        String notesText = notes.toString().trim();
        List<String> licenseFiles = referencedFiles(license, notesText);
        String moduleLicense;
        if (!license.isEmpty()) {
            moduleLicense = stripFileReferences(license);
        } else if (!licenseFiles.isEmpty()) {
            // A section may name only a bundled notice file, as the compact
            // CMYK profile does; the file is still the license source.
            moduleLicense = "Bundled notice";
        } else {
            return;
        }
        if (moduleLicense.isEmpty()) {
            moduleLicense = "Bundled license text";
        }
        referencedFiles.addAll(licenseFiles);

        Dependency dependency = new Dependency();
        dependency.setModuleName(name);
        dependency.setModuleLicense(moduleLicense);
        if (!licenseFiles.isEmpty()) {
            List<String> texts = new ArrayList<>();
            for (String file : licenseFiles) {
                String text = readSiblingText(noticeUrl, file);
                if (text == null) {
                    continue;
                }
                // Every referenced file keeps a heading so a multi-text notice
                // still shows which text came from where.
                texts.add(licenseFiles.size() > 1 ? "--- " + file + " ---\n" + text : text);
            }
            if (!texts.isEmpty()) {
                List<String> parts = new ArrayList<>();
                String copyrightText = copyright.toString().trim();
                if (!copyrightText.isEmpty()) {
                    parts.add("Copyright " + copyrightText);
                }
                if (!notesText.isEmpty()) {
                    parts.add(notesText);
                }
                parts.add(String.join("\n\n", texts));
                dependency.setModuleLicenseText(String.join("\n\n", parts));
            }
        }
        dependencies.add(dependency);
    }

    private static List<String> referencedFiles(String... values) {
        Set<String> files = new LinkedHashSet<>();
        for (String value : values) {
            Matcher matcher = FILE_TOKEN.matcher(value);
            while (matcher.find()) {
                String file = matcher.group();
                if (!"NOTICE.txt".equalsIgnoreCase(file)) {
                    files.add(file);
                }
            }
        }
        return new ArrayList<>(files);
    }

    // A license line can point at its texts in any phrasing. Removing the
    // parenthetical or sentence that contains a sibling filename keeps the
    // label stable without teaching the parser each phrasing in advance.
    private static String stripFileReferences(String text) {
        if (text.isEmpty()) {
            return text;
        }
        String stripped = PARENTHETICAL_FILE_REFERENCE.matcher(text).replaceAll("");
        String withoutReferences = removeSentencesWithFileReferences(stripped);
        if (withoutReferences.isBlank() && FILE_TOKEN.matcher(stripped).find()) {
            withoutReferences = FILE_TOKEN.matcher(stripped).replaceAll("");
        }
        return tidyLabel(FILE_TOKEN.matcher(withoutReferences).replaceAll(""));
    }

    private static String removeSentencesWithFileReferences(String text) {
        BreakIterator boundaries = BreakIterator.getSentenceInstance(Locale.ROOT);
        boundaries.setText(text);
        StringBuilder kept = new StringBuilder(text.length());
        for (int start = boundaries.first(), end = boundaries.next();
                end != BreakIterator.DONE;
                start = end, end = boundaries.next()) {
            String sentence = text.substring(start, end);
            if (!FILE_TOKEN.matcher(sentence).find()) {
                kept.append(sentence);
            }
        }
        return kept.toString();
    }

    private static String tidyLabel(String text) {
        return text.trim()
                .replaceAll("\\s{2,}", " ")
                .replaceAll("\\(\\s*\\)", "")
                .replaceAll("\\s+([,;])", "$1")
                .replaceAll("\\s+\\.(?!\\.)", ".")
                .trim();
    }

    private static List<Dependency> orphanLicenses(URL noticeUrl, Set<String> referencedFiles) {
        List<String> files;
        try {
            files = siblingLicenseFiles(noticeUrl);
        } catch (IOException e) {
            log.warn("Unable to list native license files beside {}", noticeUrl, e);
            return List.of();
        }
        List<Dependency> orphans = new ArrayList<>();
        for (String file : files) {
            if ("NOTICE.txt".equalsIgnoreCase(file)
                    || referencedFiles.contains(file)
                    || file.startsWith(".")) {
                continue;
            }
            String text = readSiblingText(noticeUrl, file);
            if (text == null || text.isBlank()) {
                continue;
            }
            Dependency dependency = new Dependency();
            dependency.setModuleName(moduleNameFromFile(file));
            dependency.setModuleLicense(moduleLicenseFromFile(file));
            dependency.setModuleLicenseText(text);
            orphans.add(dependency);
        }
        return orphans;
    }

    private static List<String> siblingLicenseFiles(URL noticeUrl) throws IOException {
        URLConnection connection = noticeUrl.openConnection();
        if (connection instanceof JarURLConnection jarConnection) {
            jarConnection.setUseCaches(false);
            try (JarFile jar = jarConnection.getJarFile()) {
                return jar.stream()
                        .map(entry -> entry.getName())
                        .filter(name -> name.startsWith(LICENSE_DIRECTORY))
                        .map(name -> name.substring(LICENSE_DIRECTORY.length()))
                        .filter(name -> !name.isEmpty() && !name.contains("/"))
                        .filter(name -> name.toLowerCase(Locale.ROOT).endsWith(".txt"))
                        .sorted()
                        .toList();
            }
        }
        if ("file".equals(noticeUrl.getProtocol())) {
            Path directory;
            try {
                directory = Path.of(noticeUrl.toURI()).getParent();
            } catch (URISyntaxException e) {
                throw new IOException("Invalid native license directory " + noticeUrl, e);
            }
            if (directory == null) {
                return List.of();
            }
            try (Stream<Path> entries = Files.list(directory)) {
                return entries.filter(Files::isRegularFile)
                        .map(path -> path.getFileName().toString())
                        .filter(name -> name.toLowerCase(Locale.ROOT).endsWith(".txt"))
                        .sorted()
                        .toList();
            }
        }
        return List.of();
    }

    private static String moduleNameFromFile(String file) {
        String stem = stripExtension(file);
        int marker = licenseMarkerIndex(stem);
        return marker <= 0
                ? stem
                : String.join("-", Arrays.copyOfRange(stem.split("-"), 0, marker));
    }

    private static String moduleLicenseFromFile(String file) {
        String stem = stripExtension(file);
        int marker = licenseMarkerIndex(stem);
        if (marker < 0) {
            return "Bundled license text";
        }
        String[] parts = stem.split("-");
        return humanizeLicense(String.join("-", Arrays.copyOfRange(parts, marker, parts.length)));
    }

    private static int licenseMarkerIndex(String stem) {
        String[] parts = stem.split("-");
        for (int i = 0; i < parts.length; i++) {
            if (LICENSE_MARKERS.contains(parts[i].toUpperCase(Locale.ROOT))) {
                return i;
            }
        }
        return -1;
    }

    private static String stripExtension(String file) {
        int dot = file.lastIndexOf('.');
        return dot > 0 ? file.substring(0, dot) : file;
    }

    private static String humanizeLicense(String token) {
        return switch (token.toUpperCase(Locale.ROOT)) {
            case "APACHE-2.0" -> "Apache-2.0";
            case "BSD-2" -> "BSD-2-Clause";
            case "BSD-3" -> "BSD-3-Clause";
            case "MIT" -> "MIT";
            case "ISC" -> "ISC";
            case "0BSD" -> "0BSD";
            case "LGPL-2.1" -> "LGPL-2.1";
            case "LGPL-3.0" -> "LGPL-3.0";
            case "PUBLIC-DOMAIN" -> "Public domain";
            case "ZLIB" -> "Zlib";
            default -> token;
        };
    }

    // NOTICE files come from any jar on the classpath and the endpoint is unauthenticated,
    // so only plain sibling filenames may be read. Anything else could escape the notice
    // directory (../) or switch schemes entirely (file:/C:/) and leak local files.
    private static String readSiblingText(URL noticeUrl, String licenseFile) {
        if (!licenseFile.matches("[A-Za-z0-9._+-]+") || licenseFile.startsWith(".")) {
            log.warn(
                    "Ignoring suspicious native license reference {} beside {}",
                    licenseFile,
                    noticeUrl);
            return null;
        }
        try (InputStream in = siblingUrl(noticeUrl, licenseFile).openStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).strip();
        } catch (IOException e) {
            log.warn("Unable to read native license text {} beside {}", licenseFile, noticeUrl, e);
            return null;
        }
    }

    private static URL siblingUrl(URL noticeUrl, String licenseFile) throws IOException {
        String base = noticeUrl.toString();
        int slash = base.lastIndexOf('/');
        if (slash < 0) {
            throw new IOException("Cannot resolve native license file " + licenseFile);
        }
        try {
            return URI.create(base.substring(0, slash + 1) + licenseFile).toURL();
        } catch (IllegalArgumentException e) {
            throw new IOException("Cannot resolve native license file " + licenseFile, e);
        }
    }

    private record ParsedNotice(List<Dependency> dependencies, Set<String> referencedFiles) {}
}
