package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.api.misc.ExtractImageScansRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ImageMemoryLimit;
import stirling.software.common.util.TempDirectory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.officeconvert.photosplit.PhotoSplitter;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class ExtractImageScansController {

    // Print-quality raster for the extracted scan; capped by system maxDPI
    private static final int SCAN_RENDER_DPI = 300;

    private static final String REPLACEFIRST = "[.][^.]+$";

    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/extract-image-scans",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @MultiFileResponse
    // Inputs are read with ImageIO, which cannot read the vector/PSD formats in IMAGE.
    @ToolIO(
            accepts = {ToolFormat.PDF, ToolFormat.IMAGE},
            inputExtensions = {
                "pdf", "bmp", "dib", "gif", "jpeg", "jpg", "jpe", "jp2", "png", "webp", "pbm",
                "pgm", "ppm", "pxm", "pnm", "pfm", "tiff", "tif"
            },
            produces = ToolFormat.IMAGE,
            arity = ToolArity.SIMO)
    @Operation(
            summary = "Extract photos scanned together on one page into separate images",
            description =
                    "Finds, crops and straightens each photo on every page or image."
                            + " Returns one PNG, or a zip when several are found.")
    public ResponseEntity<Resource> extractImageScans(
            @ModelAttribute ExtractImageScansRequest request) throws IOException {
        MultipartFile inputFile = request.getFileInput();

        String fileName = inputFile.getOriginalFilename();
        String extension = fileName.substring(fileName.lastIndexOf('.') + 1);

        PhotoSplitter.Options options =
                PhotoSplitter.Options.defaults()
                        .angleThreshold(request.getAngleThreshold())
                        .tolerance(request.getTolerance())
                        .minArea(request.getMinArea())
                        .minContourArea(request.getMinContourArea())
                        .borderSize(request.getBorderSize());
        int renderDpi = SCAN_RENDER_DPI;
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);
        if (properties != null && properties.getSystem() != null) {
            renderDpi = Math.min(renderDpi, properties.getSystem().getMaxDPI());
        }
        options = options.dpi(renderDpi).maxPixels(ImageMemoryLimit.maxPixels());

        TempFile finalOutput = null;
        boolean finalOutputOwnershipTransferred = false;
        try (TempFile input = tempFileManager.createManagedTempFile("." + extension);
                TempDirectory photosDir = new TempDirectory(tempFileManager)) {
            inputFile.transferTo(input.getPath());
            List<Path> photos =
                    PhotoSplitter.split(input.getPath(), photosDir.getPath(), "photo", options);

            if (photos.isEmpty()) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.noContent", "No {0} detected", "images");
            }
            if (photos.size() > 1) {
                String outputZipFilename =
                        GeneralUtils.generateFilename(fileName, "_processed.zip");
                finalOutput = tempFileManager.createManagedTempFile(".zip");
                try (ZipOutputStream zipOut =
                        new ZipOutputStream(Files.newOutputStream(finalOutput.getPath()))) {
                    for (int i = 0; i < photos.size(); i++) {
                        zipOut.putNextEntry(
                                new ZipEntry(
                                        GeneralUtils.generateFilename(
                                                fileName, "_processed_" + (i + 1) + ".png")));
                        Files.copy(photos.get(i), zipOut);
                        zipOut.closeEntry();
                    }
                }
                ResponseEntity<Resource> response =
                        WebResponseUtils.zipFileToWebResponse(finalOutput, outputZipFilename);
                finalOutputOwnershipTransferred = true;
                return response;
            }
            finalOutput = tempFileManager.createManagedTempFile(".png");
            Files.copy(
                    photos.getFirst(), finalOutput.getPath(), StandardCopyOption.REPLACE_EXISTING);
            ResponseEntity<Resource> response =
                    WebResponseUtils.fileToWebResponse(
                            finalOutput,
                            GeneralUtils.generateFilename(fileName, ".png"),
                            MediaType.IMAGE_PNG);
            finalOutputOwnershipTransferred = true;
            return response;
        } finally {
            if (finalOutput != null && !finalOutputOwnershipTransferred) {
                finalOutput.close();
            }
        }
    }
}
