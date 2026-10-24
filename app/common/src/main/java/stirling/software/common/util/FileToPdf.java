package stirling.software.common.util;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import io.github.pixee.security.ZipSecurity;

import stirling.software.common.model.api.converters.HTMLToPdfRequest;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

public class FileToPdf {

    static final String SANITIZED_ALLOWED_PROTOCOLS = "data";
    static final String UNSANITIZED_ALLOWED_PROTOCOLS = "data,http,https";

    private static final Pattern UNSAFE_NAME_CHARS = Pattern.compile("[^A-Za-z0-9._-]");
    private static final Pattern IMG_SRC =
            Pattern.compile(
                    "(<img\\b[^>]*?\\bsrc\\s*=\\s*)(\"([^\"]*)\"|'([^']*)'|([^\\s\"'>]+))",
                    Pattern.CASE_INSENSITIVE);
    private static final Pattern NUMERIC_ENTITY = Pattern.compile("&#(x?)([0-9a-fA-F]+);");
    private static final long MAX_INLINED_IMAGE_CHARS = 64L * 1024 * 1024;
    private static final Map<String, String> IMAGE_MIME_TYPES =
            Map.of(
                    "png", "image/png",
                    "jpg", "image/jpeg",
                    "jpeg", "image/jpeg",
                    "gif", "image/gif",
                    "webp", "image/webp",
                    "bmp", "image/bmp");
    private static final Comparator<String> HTML_ORDER =
            Comparator.comparingInt((String key) -> key.split("/").length)
                    .thenComparing(Comparator.naturalOrder());

    public static byte[] convertHtmlToPdf(
            String weasyprintPath,
            HTMLToPdfRequest request,
            byte[] fileBytes,
            String fileName,
            TempFileManager tempFileManager,
            CustomHtmlSanitizer customHtmlSanitizer)
            throws IOException, InterruptedException {

        String lowerName = fileName.toLowerCase(Locale.ROOT);
        String html;
        if (lowerName.endsWith(".html")) {
            html =
                    sanitizeHtmlContent(
                            new String(fileBytes, StandardCharsets.UTF_8), customHtmlSanitizer);
        } else if (lowerName.endsWith(".zip")) {
            html = htmlFromZip(fileBytes, tempFileManager, customHtmlSanitizer);
        } else {
            throw ExceptionUtils.createHtmlFileRequiredException();
        }

        try (TempFile tempOutputFile = new TempFile(tempFileManager, ".pdf");
                TempFile tempInputFile = new TempFile(tempFileManager, ".html")) {
            Files.writeString(tempInputFile.getPath(), html);

            List<String> command = new ArrayList<>();
            command.add(weasyprintPath);
            command.add("-e");
            command.add("utf-8");
            command.add("-v");
            command.add("--pdf-forms");
            command.add("--allowed-protocols");
            command.add(
                    customHtmlSanitizer.isDisabled()
                            ? UNSANITIZED_ALLOWED_PROTOCOLS
                            : SANITIZED_ALLOWED_PROTOCOLS);
            command.add(tempInputFile.getAbsolutePath());
            command.add(tempOutputFile.getAbsolutePath());

            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
                            .runCommandWithOutputHandling(command);

            return Files.readAllBytes(tempOutputFile.getPath());
        }
    }

    private static String sanitizeHtmlContent(
            String htmlContent, CustomHtmlSanitizer customHtmlSanitizer) {
        return customHtmlSanitizer.sanitize(htmlContent);
    }

    private static String htmlFromZip(
            byte[] zipBytes, TempFileManager tempFileManager, CustomHtmlSanitizer sanitizer)
            throws IOException {
        try (TempDirectory tempUnzippedDir = new TempDirectory(tempFileManager)) {
            Path root = tempUnzippedDir.getPath().toAbsolutePath().normalize();
            Map<String, Path> entries = extractZip(zipBytes, root);

            String mainEntry = selectMainHtml(entries.keySet());
            if (mainEntry == null) {
                throw ExceptionUtils.createHtmlFileRequiredException();
            }
            String html = Files.readString(entries.get(mainEntry), StandardCharsets.UTF_8);
            return sanitizeHtmlContent(inlineLocalImages(html, mainEntry, entries), sanitizer);
        }
    }

    private static Map<String, Path> extractZip(byte[] zipBytes, Path root) throws IOException {
        Map<String, Path> entries = new HashMap<>();
        try (ZipInputStream zipIn =
                ZipSecurity.createHardenedInputStream(new java.io.ByteArrayInputStream(zipBytes))) {
            ZipBombGuard.Budget budget = new ZipBombGuard.Budget();
            ZipEntry entry;
            while ((entry = zipIn.getNextEntry()) != null) {
                String key = normalizeEntryPath(entry.getName());
                String safeName = sanitizeZipFilename(entry.getName());
                if (!entry.isDirectory() && key != null && !safeName.isEmpty()) {
                    Path filePath = root.resolve(safeName).normalize();
                    if (!filePath.startsWith(root)) {
                        throw new IOException(
                                "Zip entry path escapes target directory: " + entry.getName());
                    }
                    Files.createDirectories(filePath.getParent());
                    budget.copyEntry(zipIn, filePath);
                    entries.put(key, filePath);
                }
                zipIn.closeEntry();
            }
        }
        return entries;
    }

    static String selectMainHtml(Iterable<String> entryKeys) {
        String best = null;
        for (String key : entryKeys) {
            String lower = key.toLowerCase(Locale.ROOT);
            if (lower.equals("index.html") || lower.equals("index.htm")) {
                return key;
            }
            if ((lower.endsWith(".html") || lower.endsWith(".htm"))
                    && (best == null || HTML_ORDER.compare(key, best) < 0)) {
                best = key;
            }
        }
        return best;
    }

    private static String inlineLocalImages(
            String html, String mainEntry, Map<String, Path> entries) throws IOException {
        int slash = mainEntry.lastIndexOf('/');
        String baseDir = slash < 0 ? "" : mainEntry.substring(0, slash + 1);

        Matcher matcher = IMG_SRC.matcher(html);
        StringBuilder out = new StringBuilder();
        Map<String, String> encoded = new HashMap<>();
        long inlined = 0;
        while (matcher.find()) {
            String raw =
                    matcher.group(3) != null
                            ? matcher.group(3)
                            : matcher.group(4) != null ? matcher.group(4) : matcher.group(5);
            String ref = decodeHtmlAttribute(raw);
            String dataUri;
            if (encoded.containsKey(ref)) {
                dataUri = encoded.get(ref);
            } else {
                dataUri = toDataUri(ref, baseDir, entries);
                encoded.put(ref, dataUri);
            }
            if (dataUri != null) {
                inlined += dataUri.length();
                if (inlined > MAX_INLINED_IMAGE_CHARS) {
                    throw new IOException("Inlined image content exceeds the permitted size");
                }
            }
            String replacement =
                    dataUri == null ? matcher.group() : matcher.group(1) + "\"" + dataUri + "\"";
            matcher.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    private static String toDataUri(String ref, String baseDir, Map<String, Path> entries)
            throws IOException {
        if (ref.isEmpty() || ref.startsWith("//") || ref.matches("^[A-Za-z][A-Za-z0-9+.-]*:.*")) {
            return null;
        }
        String path = ref.replaceAll("[?#].*$", "");
        try {
            path = URLDecoder.decode(path.replace("+", "%2B"), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return null;
        }
        String key = normalizeEntryPath(path.startsWith("/") ? path : baseDir + path);
        Path file = key == null ? null : entries.get(key);
        String extension = key == null ? "" : key.substring(key.lastIndexOf('.') + 1);
        String mime = IMAGE_MIME_TYPES.get(extension.toLowerCase(Locale.ROOT));
        if (file == null || mime == null) {
            return null;
        }
        return "data:"
                + mime
                + ";base64,"
                + Base64.getEncoder().encodeToString(Files.readAllBytes(file));
    }

    private static String decodeHtmlAttribute(String value) {
        Matcher matcher = NUMERIC_ENTITY.matcher(value);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            String replacement;
            try {
                int codePoint =
                        Integer.parseInt(matcher.group(2), matcher.group(1).isEmpty() ? 10 : 16);
                replacement = new String(Character.toChars(codePoint));
            } catch (IllegalArgumentException e) {
                replacement = matcher.group();
            }
            matcher.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(out);
        return out.toString()
                .replace("&quot;", "\"")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&amp;", "&");
    }

    static String normalizeEntryPath(String entryName) {
        if (entryName == null) {
            return null;
        }
        Deque<String> segments = new ArrayDeque<>();
        for (String segment : entryName.replace('\\', '/').split("/")) {
            if (segment.isEmpty() || segment.equals(".")) {
                continue;
            }
            if (segment.equals("..")) {
                if (segments.isEmpty()) {
                    return null;
                }
                segments.removeLast();
            } else {
                segments.addLast(segment);
            }
        }
        return segments.isEmpty() ? null : String.join("/", segments);
    }

    public static String sanitizeZipFilename(String entryName) {
        if (entryName == null || entryName.trim().isEmpty()) {
            return "";
        }
        // Remove any drive letters (e.g., "C:\") and leading forward/backslashes
        entryName =
                RegexPatternUtils.getInstance()
                        .getDriveLetterPattern()
                        .matcher(entryName)
                        .replaceAll("");
        entryName =
                RegexPatternUtils.getInstance()
                        .getLeadingSlashesPattern()
                        .matcher(entryName)
                        .replaceAll("");
        // Normalize all backslashes to forward slashes
        entryName =
                RegexPatternUtils.getInstance()
                        .getBackslashPattern()
                        .matcher(entryName)
                        .replaceAll("/");

        List<String> safeSegments = new ArrayList<>();
        for (String segment : entryName.split("/")) {
            String safe = UNSAFE_NAME_CHARS.matcher(segment).replaceAll("_");
            if (!safe.isEmpty() && !safe.equals(".") && !safe.equals("..")) {
                safeSegments.add(safe);
            }
        }
        return String.join("/", safeSegments);
    }
}
