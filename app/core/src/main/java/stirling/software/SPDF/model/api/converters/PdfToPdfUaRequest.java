package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PdfToPdfUaRequest extends PDFFile {

    @Schema(
            description = "PDF/UA conformance level to target",
            defaultValue = "ua1",
            allowableValues = {"ua1", "ua2"})
    private String profile;

    @Schema(
            description =
                    "Document title, required by PDF/UA. Falls back to the first heading, then the"
                            + " filename.")
    private String title;

    @Schema(
            description =
                    "Document language as a BCP-47 tag, for example en-GB. Applied only when the"
                            + " document does not already declare one, unless overrideLanguage is"
                            + " set.",
            defaultValue = "en-GB")
    private String language;

    @Schema(
            description =
                    "Replace the language the document already declares. Off by default, so a"
                            + " document is never relabelled into a language it is not written in.",
            defaultValue = "false")
    private Boolean overrideLanguage;

    @Schema(
            description =
                    "What to do with an existing structure tree: keep it, rebuild it, or decide"
                            + " automatically",
            defaultValue = "auto",
            allowableValues = {"auto", "keep", "rebuild"})
    private String existingTags;

    @Schema(
            description =
                    "How to treat images with no description. require-alt leaves them undescribed so"
                            + " the report asks for input; mark-decorative treats every image as"
                            + " decoration.",
            defaultValue = "require-alt",
            allowableValues = {"require-alt", "mark-decorative"})
    private String figurePolicy;

    @Schema(
            description =
                    "Embed fonts the document references but does not carry. Required for"
                            + " conformance and needs Ghostscript.",
            defaultValue = "true")
    private Boolean embedFonts;

    @Schema(
            description =
                    "Alternative descriptions for figures, as key=text pairs separated by newlines."
                            + " Keys come from the accessibility-report endpoint's"
                            + " figuresNeedingDescription list, for example \"0:12=Bar chart of"
                            + " quarterly revenue\". Descriptions are never invented, so without"
                            + " these an illustrated document cannot claim conformance.")
    private String altText;
}
