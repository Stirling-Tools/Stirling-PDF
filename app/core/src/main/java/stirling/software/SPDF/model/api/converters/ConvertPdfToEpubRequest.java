package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

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

    public enum TargetDevice {
        TABLET_PHONE_IMAGES("tablet"),
        KINDLE_EINK_TEXT("kindle");

        private final String calibreProfile;

        TargetDevice(String calibreProfile) {
            this.calibreProfile = calibreProfile;
        }

        public String getCalibreProfile() {
            return calibreProfile;
        }
    }
}
