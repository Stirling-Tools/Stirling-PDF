package stirling.software.proprietary.mcp.tools;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.security.model.User;

/** Stores each file inside a ZIP result separately, so the next step can take it by fileId. */
final class McpZipParts {

    static final int MAX_PARTS = 20;
    // Guards against ZIP bombs: unpacking stops once this much has been read.
    static final long MAX_TOTAL_BYTES = 200L * 1024 * 1024;

    private McpZipParts() {}

    record Part(String fileId, String name, long size, String contentType) {}

    /** The stored parts, how many files the ZIP holds, and whether unpacking stopped early. */
    record Unpacked(List<Part> parts, int total, boolean truncated) {}

    static Unpacked unpack(McpFiles files, User user, byte[] zip)
            throws IOException, McpFiles.McpFileException {
        List<Part> parts = new ArrayList<>();
        int total = 0;
        long read = 0;
        boolean truncated = false;
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                total++;
                if (parts.size() >= MAX_PARTS || truncated) {
                    continue;
                }
                byte[] bytes =
                        in.readNBytes(
                                (int) Math.min(Integer.MAX_VALUE - 8, MAX_TOTAL_BYTES - read + 1));
                read += bytes.length;
                if (read > MAX_TOTAL_BYTES) {
                    truncated = true;
                    continue;
                }
                String name = baseName(entry.getName());
                String type = contentType(name);
                McpFiles.Saved saved = files.save(user, bytes, name, type, false);
                parts.add(new Part(saved.fileId(), name, bytes.length, type));
            }
        }
        return new Unpacked(parts, total, truncated);
    }

    /** A ZIP's files in memory, for the next pipeline step; same limits as {@link #unpack}. */
    static List<McpInputFiles.Input> read(byte[] zip) throws IOException {
        List<McpInputFiles.Input> files = new ArrayList<>();
        long read = 0;
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                if (files.size() >= MAX_PARTS) {
                    throw new IOException("it makes more than " + MAX_PARTS + " files");
                }
                byte[] bytes =
                        in.readNBytes(
                                (int) Math.min(Integer.MAX_VALUE - 8, MAX_TOTAL_BYTES - read + 1));
                read += bytes.length;
                if (read > MAX_TOTAL_BYTES) {
                    throw new IOException("its files are too large to carry on");
                }
                files.add(new McpInputFiles.Input(bytes, baseName(entry.getName()), null));
            }
        }
        return files;
    }

    /** "pdf", "zip", "image" or "other", so agents know whether a result can be chained. */
    static String outputKind(String contentType, String name) {
        String type = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT);
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (type.contains("zip") || lower.endsWith(".zip")) {
            return "zip";
        }
        if (type.startsWith("application/pdf") || lower.endsWith(".pdf")) {
            return "pdf";
        }
        if (type.startsWith("image/")) {
            return "image";
        }
        String mime =
                type.isEmpty() || type.startsWith("application/octet-stream")
                        ? mimeFor(lower)
                        : type;
        if (mime.startsWith("text/") || mime.equals("application/json")) {
            return "text";
        }
        return OFFICE.contains(mime) ? "document" : "other";
    }

    private static final Set<String> OFFICE =
            Set.of(
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    "application/vnd.oasis.opendocument.text",
                    "application/vnd.oasis.opendocument.spreadsheet",
                    "application/vnd.oasis.opendocument.presentation",
                    "application/rtf",
                    "application/epub+zip");

    /** A specific type for common result extensions; servers often send octet-stream. */
    static String mimeFor(String name) {
        String lower = name == null ? "" : name.toLowerCase(Locale.ROOT);
        String ext = lower.substring(lower.lastIndexOf('.') + 1);
        return switch (ext) {
            case "pdf" -> "application/pdf";
            case "docx" ->
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "pptx" ->
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "odt" -> "application/vnd.oasis.opendocument.text";
            case "ods" -> "application/vnd.oasis.opendocument.spreadsheet";
            case "odp" -> "application/vnd.oasis.opendocument.presentation";
            case "rtf" -> "application/rtf";
            case "epub" -> "application/epub+zip";
            case "txt" -> "text/plain";
            case "csv" -> "text/csv";
            case "md" -> "text/markdown";
            case "html", "htm" -> "text/html";
            case "xml" -> "application/xml";
            case "json" -> "application/json";
            case "png" -> "image/png";
            case "jpg", "jpeg" -> "image/jpeg";
            case "zip" -> "application/zip";
            default -> "application/octet-stream";
        };
    }

    private static String baseName(String entryName) {
        String name = entryName.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1);
        return name.isBlank() ? "part" : name;
    }

    private static String contentType(String name) {
        return mimeFor(name);
    }
}
