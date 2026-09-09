package stirling.software.common.model.tool;

import java.util.List;

import lombok.Getter;

/**
 * The kind of file a tool endpoint consumes or produces.
 *
 * <p>Encryption is its own format rather than a separate attribute, so the endpoints accepting only
 * {@link #PDF} reject an encrypted one without declaring anything.
 *
 * <p>Extensions are a lossy projection used for run-time file checks: {@link #PDF} and {@link
 * #PDF_ENCRYPTED} share {@code pdf}, because a filename cannot tell you whether a PDF is encrypted.
 */
@Getter
public enum ToolFormat {
    PDF("pdf"),
    PDF_ENCRYPTED("pdf"),

    // Vector formats are folded in: the extension set has always included svg/eps, and splitting
    // them out would make chains that run fine today report as broken.
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

    PCL("pcl", "pxl"),
    XPS("xps", "oxps"),

    VIDEO("mp4", "webm", "avi", "mov", "mkv"),
    CBZ("cbz"),
    CBR("cbr"),

    /** Never reported as incompatible. */
    ANY(),

    /** A report or a status rather than a document. */
    NONE();

    private final List<String> extensions;

    ToolFormat(String... extensions) {
        this.extensions = List.of(extensions);
    }
}
