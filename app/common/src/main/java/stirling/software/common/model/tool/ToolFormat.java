package stirling.software.common.model.tool;

import java.util.List;
import java.util.Locale;

import lombok.Getter;

/**
 * The kind of file a tool endpoint consumes or produces.
 *
 * <p>Each constant carries the file extensions it covers, which is how a running pipeline decides
 * whether an actual file may be handed to a step. That projection is deliberately lossy: {@link
 * #PDF} and {@link #PDF_ENCRYPTED} are distinct formats but share the {@code pdf} extension,
 * because a filename cannot tell you whether a PDF is encrypted. Static chain checking compares
 * formats; run-time file checking compares extensions.
 *
 * <p>Encryption is modelled as its own format rather than a separate attribute so that the ~73
 * endpoints accepting only {@link #PDF} reject an encrypted PDF without declaring anything. An
 * endpoint that genuinely tolerates one opts in by listing {@link #PDF_ENCRYPTED} explicitly.
 */
@Getter
public enum ToolFormat {
    PDF("pdf"),

    /** A password-protected PDF. */
    PDF_ENCRYPTED("pdf"),

    // Vector formats are folded in here rather than split out: the extension set has always
    // included svg/eps, and a separate VECTOR constant would make chains that run fine today
    // report as broken.
    IMAGE("png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "svg", "psd", "ai", "eps"),

    /**
     * An archive that is itself the deliverable. Multiple results use {@link ToolArity} instead.
     */
    ZIP("zip", "rar", "7z", "tar", "gz", "bz2", "xz", "lz", "lzma", "z"),

    WORD("doc", "docx", "odt", "rtf"),
    PPT("ppt", "pptx", "odp"),
    EXCEL("xls", "xlsx", "ods"),
    CSV("csv"),
    HTML("html", "htm", "xhtml"),
    XML("xml", "xsd", "xsl"),
    JSON("json"),
    TEXT("txt", "text", "md", "markdown"),
    MARKDOWN("md", "markdown"),
    JAVASCRIPT("js", "jsx"),
    EBOOK("epub", "mobi", "azw3", "fb2", "txt", "docx"),
    EMAIL("eml", "msg"),
    POSTSCRIPT("ps", "eps"),
    VIDEO("mp4", "webm", "avi", "mov", "mkv"),
    CBZ("cbz"),
    CBR("cbr"),

    /** Accepts or produces any file type. Never reported as incompatible. */
    ANY(),

    /** No file at all: the endpoint answers with a report or a status rather than a document. */
    NONE();

    private final List<String> extensions;

    ToolFormat(String... extensions) {
        this.extensions = List.of(extensions);
    }

    /** True for the formats that carry no file, so an extension check does not apply. */
    public boolean isFileless() {
        return this == ANY || this == NONE;
    }

    /** True if {@code filename}'s extension is one this format covers. */
    public boolean matchesFilename(String filename) {
        if (filename == null) {
            return false;
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return false;
        }
        return extensions.contains(filename.substring(dot + 1).toLowerCase(Locale.ROOT));
    }
}
