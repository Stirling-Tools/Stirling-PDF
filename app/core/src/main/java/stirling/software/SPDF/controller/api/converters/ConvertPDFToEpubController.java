package stirling.software.SPDF.controller.api.converters;

import org.apache.commons.io.FilenameUtils;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest;
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest.OutputFormat;
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest.TargetDevice;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.officeconvert.EbookOptions;

@ConvertApi
@RequiredArgsConstructor
@Slf4j
public class ConvertPDFToEpubController {

    private static final String DEFAULT_EXTENSION = "pdf";

    private final OfficeConversionService officeConversionService;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf/epub",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.EBOOK)
    @Operation(
            summary = "Convert PDF to EPUB/AZW3",
            description =
                    "Convert a PDF file to an EPUB or AZW3 ebook using Stirling Office Convert.")
    public ResponseEntity<Resource> convertPdfToEpub(
            @ModelAttribute ConvertPdfToEpubRequest request) throws Exception {

        MultipartFile inputFile = request.getFileInput();
        if (inputFile == null || inputFile.isEmpty()) {
            throw new IllegalArgumentException("No input file provided");
        }

        boolean detectChapters = !Boolean.FALSE.equals(request.getDetectChapters());
        TargetDevice targetDevice =
                request.getTargetDevice() == null
                        ? TargetDevice.TABLET_PHONE_IMAGES
                        : request.getTargetDevice();
        OutputFormat outputFormat =
                request.getOutputFormat() == null ? OutputFormat.EPUB : request.getOutputFormat();

        String originalFilename = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFilename == null || originalFilename.isBlank()) {
            originalFilename = "document." + DEFAULT_EXTENSION;
        }

        String extension = FilenameUtils.getExtension(originalFilename);
        if (extension.isBlank()) {
            throw new IllegalArgumentException("Unable to determine file type");
        }

        if (!DEFAULT_EXTENSION.equalsIgnoreCase(extension)) {
            throw new IllegalArgumentException("Input file must be a PDF");
        }

        EbookOptions ebook =
                EbookOptions.defaults()
                        .chapters(detectChapters)
                        .device(
                                targetDevice == TargetDevice.KINDLE_EINK_TEXT
                                        ? EbookOptions.Device.KINDLE
                                        : EbookOptions.Device.TABLET);
        return officeConversionService.convert(
                inputFile,
                outputFormat.getExtension(),
                MediaType.valueOf(outputFormat.getMediaType()),
                officeConversionService.settings().ebook(ebook));
    }
}
