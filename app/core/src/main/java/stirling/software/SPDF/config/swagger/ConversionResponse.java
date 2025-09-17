package stirling.software.SPDF.config.swagger;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * API response annotation for conversion operations that output non-PDF formats. Use for PDF to
 * Word, Excel, PowerPoint, text, HTML, CSV, etc.
 *
 * <p>Specify the output formats this endpoint supports.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface ConversionResponse {

    /**
     * The output formats this conversion endpoint supports. Use OutputFormat enum values to specify
     * supported formats.
     */
    OutputFormat[] value() default {OutputFormat.DOCX, OutputFormat.TXT, OutputFormat.RTF};

    /** Supported output formats for conversion operations */
    enum OutputFormat {
        DOCX(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Microsoft Word document (DOCX)",
                "binary"),
        DOC("application/msword", "Microsoft Word document (DOC)", "binary"),
        XLSX(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Microsoft Excel document (XLSX)",
                "binary"),
        PPTX(
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "Microsoft PowerPoint document (PPTX)",
                "binary"),
        RTF("application/rtf", "Rich Text Format document", "binary"),
        TXT("text/plain", "Plain text content", "string"),
        HTML("text/html", "HTML content", "string"),
        CSV("text/csv", "CSV data", "string"),
        XML("application/xml", "XML document", "string"),
        JSON("application/json", "JSON data", "string"),
        BINARY("application/octet-stream", "Binary file output", "binary");

        private final String mediaType;
        private final String description;
        private final String schemaFormat;

        OutputFormat(String mediaType, String description, String schemaFormat) {
            this.mediaType = mediaType;
            this.description = description;
            this.schemaFormat = schemaFormat;
        }

        public String getMediaType() {
            return mediaType;
        }

        public String getDescription() {
            return description;
        }

        public String getSchemaFormat() {
            return schemaFormat;
        }
    }
}
