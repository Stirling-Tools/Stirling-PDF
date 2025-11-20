package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.Getter;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ConvertPdfToEpubRequest extends PDFFile {

    @Schema(
            description = "Detect headings that look like chapters and insert EPUB page breaks.",
            allowableValues = {"true", "false"},
            defaultValue = "true")
    private Boolean detectChapters = Boolean.TRUE;

    @Schema(
            description = "Choose an output profile optimized for the reader device.",
            allowableValues = {"TABLET_PHONE_IMAGES", "KINDLE_EINK_TEXT"},
            defaultValue = "TABLET_PHONE_IMAGES")
    private TargetDevice targetDevice = TargetDevice.TABLET_PHONE_IMAGES;

    @Schema(
            description = "Choose the output format for the ebook.",
            allowableValues = {"EPUB", "AZW3"},
            defaultValue = "EPUB")
    private OutputFormat outputFormat = OutputFormat.EPUB;

    @Getter
    public enum TargetDevice {
        TABLET_PHONE_IMAGES("tablet"),
        KINDLE_EINK_TEXT("kindle");

        private final String calibreProfile;

        TargetDevice(String calibreProfile) {
            this.calibreProfile = calibreProfile;
        }
    }

    @Getter
    public enum OutputFormat {
        EPUB("epub", "application/epub+zip"),
        AZW3("azw3", "application/vnd.amazon.ebook");

        private final String extension;
        private final String mediaType;

        OutputFormat(String extension, String mediaType) {
            this.extension = extension;
            this.mediaType = mediaType;
        }
    }
}
