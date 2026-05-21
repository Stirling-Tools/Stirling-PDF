package stirling.software.SPDF.model.api.security;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class RedactExecuteRequest extends PDFFile {

    /**
     * Discriminated union of redaction operation types. The {@code type} field is the discriminator
     * and drives both JSON deserialization and the service dispatch switch.
     */
    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
    @JsonSubTypes({
        @JsonSubTypes.Type(value = RedactByText.class, name = "text"),
        @JsonSubTypes.Type(value = RedactByRegex.class, name = "regex"),
        @JsonSubTypes.Type(value = RedactPages.class, name = "pages"),
        @JsonSubTypes.Type(value = RedactByRange.class, name = "range"),
        @JsonSubTypes.Type(value = RedactImageBox.class, name = "image_box"),
        @JsonSubTypes.Type(value = RedactAllImages.class, name = "all_images"),
    })
    @JsonIgnoreProperties(ignoreUnknown = true)
    public sealed interface RedactOperation
            permits RedactByText,
                    RedactByRegex,
                    RedactPages,
                    RedactByRange,
                    RedactImageBox,
                    RedactAllImages {}

    public record RedactByText(@Schema(description = "Exact strings to redact") List<String> values)
            implements RedactOperation {}

    public record RedactByRegex(
            @Schema(
                            description =
                                    "Regex patterns — each match is redacted. "
                                            + "Account for common format variants: different separators, optional "
                                            + "prefixes/suffixes, grouped vs unbroken digits, locale spellings, etc.")
                    List<String> patterns)
            implements RedactOperation {}

    public record RedactPages(
            @Schema(description = "1-indexed page numbers to wipe entirely")
                    List<Integer> pageNumbers)
            implements RedactOperation {}

    public record RedactByRange(
            @Schema(description = "Anchor text where redaction begins (inclusive)")
                    String startString,
            @Schema(
                            description =
                                    "Anchor text where redaction ends; empty = to end of document",
                            defaultValue = "")
                    String endString)
            implements RedactOperation {
        public RedactByRange {
            if (endString == null) endString = "";
        }
    }

    public record RedactImageBox(
            @Schema(description = "0-indexed page number") int pageIndex,
            float x1,
            float y1,
            float x2,
            float y2)
            implements RedactOperation {}

    public record RedactAllImages(
            @Schema(description = "1-indexed page numbers; empty = all pages")
                    List<Integer> pageNumbers)
            implements RedactOperation {
        public RedactAllImages {
            if (pageNumbers == null) pageNumbers = List.of();
        }
    }

    public enum RedactionStrategy {
        AUTO,
        OVERLAY_ONLY,
        IMAGE_FINALIZE
    }

    @Data
    public static class RedactStyle {
        @Schema(description = "Hex redaction box color", defaultValue = "#000000")
        private String color = "#000000";

        @Schema(
                description = "Extra padding around each box in points",
                type = "number",
                defaultValue = "0")
        private float padding = 0f;

        @Schema(description = "Rasterize output to prevent text extraction", defaultValue = "false")
        private boolean convertToImage = false;

        @Schema(
                description = "Execution strategy hint for the redaction pipeline",
                defaultValue = "AUTO")
        private RedactionStrategy strategy = RedactionStrategy.AUTO;
    }

    @Schema(description = "Ordered list of redaction operations to apply", defaultValue = "[]")
    private List<RedactOperation> operations = new ArrayList<>();

    @Schema(description = "Redaction style options")
    private RedactStyle style = new RedactStyle();
}
