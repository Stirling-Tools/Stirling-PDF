package stirling.software.SPDF.config.swagger;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * API response annotation for PDF to Microsoft Office format conversions. Specify the exact output
 * format(s) this endpoint supports.
 *
 * <p>Usage: @OfficeConversionResponse(OfficeFormat.DOCX) @OfficeConversionResponse({OfficeFormat.DOCX,
 * OfficeFormat.DOC})
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface OfficeConversionResponse {

    /** The Office formats this endpoint supports. */
    OfficeFormat[] value();

    /** Supported Microsoft Office output formats */
    enum OfficeFormat {
        DOCX(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Microsoft Word document (DOCX)",
                "Word document"),
        DOC("application/msword", "Microsoft Word document (DOC)", "Word document (legacy)"),
        XLSX(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Microsoft Excel document (XLSX)",
                "Excel spreadsheet"),
        PPTX(
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "Microsoft PowerPoint document (PPTX)",
                "PowerPoint presentation"),
        ODT(
                "application/vnd.oasis.opendocument.text",
                "OpenDocument Text document (ODT)",
                "OpenDocument text"),
        ODS(
                "application/vnd.oasis.opendocument.spreadsheet",
                "OpenDocument Spreadsheet (ODS)",
                "OpenDocument spreadsheet"),
        ODP(
                "application/vnd.oasis.opendocument.presentation",
                "OpenDocument Presentation (ODP)",
                "OpenDocument presentation");

        private final String mediaType;
        private final String description;
        private final String shortDescription;

        OfficeFormat(String mediaType, String description, String shortDescription) {
            this.mediaType = mediaType;
            this.description = description;
            this.shortDescription = shortDescription;
        }

        public String getMediaType() {
            return mediaType;
        }

        public String getDescription() {
            return description;
        }

        public String getShortDescription() {
            return shortDescription;
        }
    }
}
