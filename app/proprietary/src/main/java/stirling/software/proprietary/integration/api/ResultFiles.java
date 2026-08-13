package stirling.software.proprietary.integration.api;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.ZipExtractionUtils;

/**
 * Works out which bytes, and under which name, a response should contribute to the pipeline.
 *
 * <p>Three things go wrong if this is left implicit:
 *
 * <ul>
 *   <li><b>The name.</b> A step that replaces the document must name it for what came back, not for
 *       what went out. Keeping the inbound name means a PDF-to-DOCX call-out yields a DOCX called
 *       {@code .pdf}, and the next step's type check either waves it through or rejects it for the
 *       wrong reason. The response's own {@code Content-Disposition} or {@code Content-Type} is the
 *       only honest source.
 *   <li><b>Archives.</b> Plenty of APIs answer with a ZIP even when one file was sent - ConsignO
 *       returns "PDF (single) or ZIP (multiple)". Handing a {@code .zip} to a step expecting a PDF
 *       is a confusing failure, so a step can select what it wanted out of the archive.
 *   <li><b>Nothing useful at all.</b> An empty body or an error page is not a document, and saying
 *       so beats letting it flow onward as one.
 * </ul>
 */
final class ResultFiles {

    /** Extensions we can name from a content type; anything else keeps the server's filename. */
    private static final Map<String, String> EXTENSION_BY_TYPE =
            Map.ofEntries(
                    Map.entry("application/pdf", "pdf"),
                    Map.entry("application/zip", "zip"),
                    Map.entry("application/json", "json"),
                    Map.entry("text/plain", "txt"),
                    Map.entry("text/html", "html"),
                    Map.entry("image/png", "png"),
                    Map.entry("image/jpeg", "jpg"),
                    Map.entry("image/tiff", "tiff"),
                    Map.entry("application/msword", "doc"),
                    Map.entry(
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            "docx"),
                    Map.entry("application/vnd.ms-excel", "xls"),
                    Map.entry(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "xlsx"));

    private ResultFiles() {}

    /**
     * The filename to give the returned bytes.
     *
     * <p>Prefers what the server said ({@code Content-Disposition}), then the base name of the
     * request with an extension derived from {@code Content-Type}, and only then the original name
     * unchanged.
     */
    static String nameFor(ExternalApiCaller.Response response, String requestFilename) {
        String disposition = response.header("content-disposition");
        String fromServer = filenameFromDisposition(disposition);
        if (fromServer != null) {
            return fromServer;
        }
        String extension = extensionFor(response.contentType());
        if (extension == null) {
            return requestFilename;
        }
        return baseName(requestFilename) + "." + extension;
    }

    /**
     * Pick the file a step asked for out of an archive.
     *
     * @param select a glob such as {@code *.pdf}, or a 0-based index such as {@code 1}
     * @throws IOException if nothing in the archive matches, naming what was there - a silent pick
     *     of the wrong file would be worse than a failed step
     */
    static Resource selectFromArchive(
            Resource archive, String select, TempFileManager tempFileManager) throws IOException {
        List<Resource> entries = ZipExtractionUtils.extractZip(archive, tempFileManager);
        if (entries.isEmpty()) {
            throw new IOException("The API returned an empty archive");
        }
        Integer index = asIndex(select);
        if (index != null) {
            if (index < 0 || index >= entries.size()) {
                throw new IOException(
                        "'responseSelect' asked for entry "
                                + index
                                + " but the archive has "
                                + entries.size()
                                + ": "
                                + names(entries));
            }
            return entries.get(index);
        }
        List<Resource> matches = new ArrayList<>();
        for (Resource entry : entries) {
            if (matchesGlob(entry.getFilename(), select)) {
                matches.add(entry);
            }
        }
        if (matches.isEmpty()) {
            throw new IOException(
                    "'responseSelect' matched nothing in the archive; it holds " + names(entries));
        }
        if (matches.size() > 1) {
            // Taking the first would be a coin toss the operator did not ask for.
            throw new IOException(
                    "'responseSelect' matched "
                            + matches.size()
                            + " entries ("
                            + names(matches)
                            + "); narrow it, or use an index");
        }
        return matches.get(0);
    }

    /** Whether the chosen name is itself an archive, so its content type is not the entry's. */
    static boolean isArchiveName(String filename) {
        return filename != null && filename.toLowerCase(Locale.ROOT).endsWith(".zip");
    }

    static boolean isArchive(Resource resource) throws IOException {
        return ZipExtractionUtils.isZip(resource);
    }

    static Resource asResource(byte[] content, String filename) {
        return new ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
    }

    /** Only {@code *} is supported, and only against the entry's own name. */
    private static boolean matchesGlob(String filename, String glob) {
        if (filename == null) {
            return false;
        }
        String name = filename.toLowerCase(Locale.ROOT);
        String pattern = glob.trim().toLowerCase(Locale.ROOT);
        String regex =
                java.util.Arrays.stream(pattern.split("\\*", -1))
                        .map(java.util.regex.Pattern::quote)
                        .reduce((a, b) -> a + ".*" + b)
                        .orElse("");
        return name.matches(regex);
    }

    private static Integer asIndex(String select) {
        try {
            return Integer.valueOf(select.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String names(List<Resource> entries) {
        return entries.stream().map(Resource::getFilename).toList().toString();
    }

    /** {@code attachment; filename="signed.pdf"} or its RFC 5987 {@code filename*} form. */
    private static String filenameFromDisposition(String disposition) {
        if (disposition == null) {
            return null;
        }
        for (String part : disposition.split(";")) {
            String token = part.trim();
            String value = null;
            if (token.regionMatches(true, 0, "filename=", 0, 9)) {
                value = token.substring(9).trim();
            } else if (token.regionMatches(true, 0, "filename*=", 0, 10)) {
                value = token.substring(10).trim();
                int tick = value.lastIndexOf('\'');
                if (tick >= 0) {
                    value = value.substring(tick + 1);
                }
            }
            if (value == null) {
                continue;
            }
            if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
                value = value.substring(1, value.length() - 1);
            }
            // The name comes from the remote server, so it is treated as data: strip any path it
            // tries to bring with it rather than letting it steer where anything is written.
            String simple = io.github.pixee.security.Filenames.toSimpleFileName(value);
            if (simple != null && !simple.isBlank()) {
                return simple;
            }
        }
        return null;
    }

    private static String extensionFor(String contentType) {
        if (contentType == null) {
            return null;
        }
        String type = contentType.split(";")[0].trim().toLowerCase(Locale.ROOT);
        return EXTENSION_BY_TYPE.get(type);
    }

    private static String baseName(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot <= 0 ? filename : filename.substring(0, dot);
    }
}
