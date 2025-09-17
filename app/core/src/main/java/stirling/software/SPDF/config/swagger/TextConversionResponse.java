package stirling.software.SPDF.config.swagger;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * API response annotation for PDF to text/document format conversions. Specify the exact output
 * format(s) this endpoint supports.
 *
 * <p>Usage: @TextConversionResponse(TextFormat.TXT) @TextConversionResponse({TextFormat.TXT,
 * TextFormat.RTF})
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface TextConversionResponse {

    /** The text/document formats this endpoint supports. */
    TextFormat[] value();

    /** Supported text and document output formats */
    enum TextFormat {
        TXT("text/plain", "Plain text file", "Plain text"),
        RTF("application/rtf", "Rich Text Format document", "RTF document"),
        HTML("text/html", "HTML document", "HTML file"),
        XML("application/xml", "XML document", "XML file"),
        CSV("text/csv", "Comma-separated values file", "CSV data"),
        JSON("application/json", "JSON document", "JSON data"),
        MARKDOWN("text/markdown", "Markdown document", "Markdown file");

        private final String mediaType;
        private final String description;
        private final String shortDescription;

        TextFormat(String mediaType, String description, String shortDescription) {
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
