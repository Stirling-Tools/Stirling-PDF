package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.URLConnection;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.rendering.ImageType;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.ConvertCbrToPdfRequest;
import stirling.software.SPDF.model.api.converters.ConvertCbzToPdfRequest;
import stirling.software.SPDF.model.api.converters.ConvertPdfToCbrRequest;
import stirling.software.SPDF.model.api.converters.ConvertPdfToCbzRequest;
import stirling.software.SPDF.model.api.converters.ConvertToImageRequest;
import stirling.software.SPDF.model.api.converters.ConvertToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CbrUtils;
import stirling.software.common.util.CbzUtils;
import stirling.software.common.util.CheckProgramInstall;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfToCbrUtils;
import stirling.software.common.util.PdfToCbzUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.TempDirectory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Slf4j
@Tag(name = "Convert", description = "Convert APIs")
@RequiredArgsConstructor
public class ConvertImgPDFController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;
    private static final Pattern EXTENSION_PATTERN =
            RegexPatternUtils.getInstance().getPattern(RegexPatternUtils.getExtensionRegex());
    private static final String DEFAULT_COMIC_NAME = "comic";

    private boolean isGhostscriptEnabled() {
        return endpointConfiguration.isGroupEnabled("Ghostscript");
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/img")
    @Operation(
            summary = "Convert PDF to image(s)",
            description =
                    "This endpoint converts a PDF file to image(s) with the specified image format,"
                            + " color type, and DPI. Users can choose to get a single image or multiple"
                            + " images.  Input:PDF Output:Image Type:SI-Conditional")
    public ResponseEntity<byte[]> convertToImage(@ModelAttribute ConvertToImageRequest request)
            throws Exception {
        MultipartFile file = request.getFileInput();
        String imageFormat = request.getImageFormat();
        String singleOrMultiple = request.getSingleOrMultiple();
        String colorType = request.getColorType();
        int dpi = request.getDpi();
        String pageNumbers = request.getPageNumbers();
        boolean includeAnnotations = Boolean.TRUE.equals(request.getIncludeAnnotations());
        byte[] result;
        String[] pageOrderArr =
                (pageNumbers != null && !pageNumbers.trim().isEmpty())
                        ? pageNumbers.split(",")
                        : new String[] {"all"};
        // Load the input PDF
        byte[] newPdfBytes = rearrangePdfPages(file, pageOrderArr);

        ImageType colorTypeResult = ImageType.RGB;
        if ("greyscale".equals(colorType)) {
            colorTypeResult = ImageType.GRAY;
        } else if ("blackwhite".equals(colorType)) {
            colorTypeResult = ImageType.BINARY;
        }
        // returns bytes for image
        boolean singleImage = "single".equals(singleOrMultiple);
        String filename = GeneralUtils.generateFilename(file.getOriginalFilename(), "");

        result =
                PdfUtils.convertFromPdf(
                        pdfDocumentFactory,
                        newPdfBytes,
                        "webp".equalsIgnoreCase(imageFormat)
                                ? "png"
                                : imageFormat.toUpperCase(Locale.ROOT),
                        colorTypeResult,
                        singleImage,
                        dpi,
                        filename,
                        includeAnnotations);
        if (result == null || result.length == 0) {
            throw new IllegalStateException(
                    "PDF conversion failed - no result data available for file: " + filename);
        }
        if ("webp".equalsIgnoreCase(imageFormat) && !CheckProgramInstall.isPythonAvailable()) {
            throw ExceptionUtils.createPythonRequiredForWebpException();
        } else if ("webp".equalsIgnoreCase(imageFormat)
                && CheckProgramInstall.isPythonAvailable()) {
            TempFile tempFile = new TempFile(tempFileManager, ".png");
            TempDirectory tempOutputDir = new TempDirectory(tempFileManager);
            TempFile tempPdfPath = null;
            try (tempFile;
                    tempOutputDir) {
                try (FileOutputStream fos = new FileOutputStream(tempFile.getFile())) {
                    fos.write(result);
                    fos.flush();
                }

                String pythonVersion = CheckProgramInstall.getAvailablePythonCommand();
                Path pngToWebpScript = GeneralUtils.extractScript("png_to_webp.py");

                List<String> command = new ArrayList<>();
                command.add(pythonVersion);
                command.add(
                        pngToWebpScript
                                .toAbsolutePath()
                                .toString()); // Python script to handle the conversion

                if (singleImage) {
                    // Run the Python script to convert PNG to WebP
                    command.add(tempFile.getAbsolutePath());
                    command.add(tempOutputDir.getAbsolutePath());
                    command.add("--single");
                } else {
                    tempPdfPath = new TempFile(tempFileManager, ".pdf");
                    file.transferTo(tempPdfPath.getFile());
                    // Run the Python script to convert PDF to WebP
                    command.add(tempPdfPath.getAbsolutePath());
                    command.add(tempOutputDir.getAbsolutePath());
                }
                command.add("--dpi");
                command.add(String.valueOf(dpi));
                ProcessExecutorResult resultProcess =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV)
                                .runCommandWithOutputHandling(command);

                // Clean up temp PDF file if it was created
                if (tempPdfPath != null) {
                    tempPdfPath.close();
                }

                // Find all WebP files in the output directory
                List<Path> webpFiles;
                try (Stream<Path> walkStream = Files.walk(tempOutputDir.getPath())) {
                    webpFiles =
                            walkStream.filter(path -> path.toString().endsWith(".webp")).toList();
                }

                if (webpFiles.isEmpty()) {
                    log.error("No WebP files were created in: {}", tempOutputDir);
                    throw new IOException(
                            "No WebP files were created. " + resultProcess.getMessages());
                }

                byte[] bodyBytes;

                if (webpFiles.size() == 1) {
                    // Return the single WebP file directly
                    Path webpFilePath = webpFiles.get(0);
                    bodyBytes = Files.readAllBytes(webpFilePath);
                } else {
                    // Create a ZIP file containing all WebP images
                    ByteArrayOutputStream zipOutputStream = new ByteArrayOutputStream();
                    try (ZipOutputStream zos = new ZipOutputStream(zipOutputStream)) {
                        for (Path webpFile : webpFiles) {
                            zos.putNextEntry(new ZipEntry(webpFile.getFileName().toString()));
                            Files.copy(webpFile, zos);
                            zos.closeEntry();
                        }
                    }
                    bodyBytes = zipOutputStream.toByteArray();
                }
                result = bodyBytes;
            } catch (Exception e) {
                // Clean up temp PDF file in case of exception
                if (tempPdfPath != null) {
                    try {
                        tempPdfPath.close();
                    } catch (Exception ignored) {
                    }
                }
                throw e;
            }
        }

        if (result == null) {
            throw new IllegalStateException("Image conversion failed - no result data available");
        }

        if (singleImage) {
            String docName = filename + "." + imageFormat;
            MediaType mediaType = MediaType.parseMediaType(getMediaType(imageFormat));
            return WebResponseUtils.bytesToWebResponse(result, docName, mediaType);
        } else {
            String zipFilename = filename + "_convertedToImages.zip";
            return WebResponseUtils.bytesToWebResponse(
                    result, zipFilename, MediaType.APPLICATION_OCTET_STREAM);
        }
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/img/pdf")
    @Operation(
            summary = "Convert images to a PDF file",
            description =
                    "This endpoint converts one or more images to a PDF file. Users can specify"
                            + " whether to stretch the images to fit the PDF page, and whether to"
                            + " automatically rotate the images. Input:Image Output:PDF Type:MISO")
    public ResponseEntity<byte[]> convertToPdf(@ModelAttribute ConvertToPdfRequest request)
            throws IOException {
        MultipartFile[] file = request.getFileInput();
        String fitOption = request.getFitOption();
        String colorType = request.getColorType();
        boolean autoRotate = Boolean.TRUE.equals(request.getAutoRotate());
        // Handle Null entries for formdata
        if (colorType == null || colorType.isBlank()) {
            colorType = "color";
        }
        if (fitOption == null || fitOption.isEmpty()) {
            fitOption = "fillPage";
        }
        // Convert the file to PDF and get the resulting bytes
        byte[] bytes =
                PdfUtils.imageToPdf(file, fitOption, autoRotate, colorType, pdfDocumentFactory);
        return WebResponseUtils.bytesToWebResponse(
                bytes,
                GeneralUtils.generateFilename(file[0].getOriginalFilename(), "_converted.pdf"));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/cbz/pdf")
    @Operation(
            summary = "Convert CBZ comic book archive to PDF",
            description =
                    "This endpoint converts a CBZ (ZIP) comic book archive to a PDF file. "
                            + "Input:CBZ Output:PDF Type:SISO")
    public ResponseEntity<?> convertCbzToPdf(@ModelAttribute ConvertCbzToPdfRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        boolean optimizeForEbook = request.isOptimizeForEbook();

        // Disable optimization if Ghostscript is not available
        if (optimizeForEbook && !isGhostscriptEnabled()) {
            log.warn("Ghostscript optimization requested but Ghostscript is not enabled/available");
            optimizeForEbook = false;
        }

        byte[] pdfBytes =
                CbzUtils.convertCbzToPdf(
                        file, pdfDocumentFactory, tempFileManager, optimizeForEbook);

        String filename = createConvertedFilename(file.getOriginalFilename(), "_converted.pdf");

        return WebResponseUtils.bytesToWebResponse(pdfBytes, filename);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/cbz")
    @Operation(
            summary = "Convert PDF to CBZ comic book archive",
            description =
                    "This endpoint converts a PDF file to a CBZ (ZIP) comic book archive. "
                            + "Input:PDF Output:CBZ Type:SISO")
    public ResponseEntity<?> convertPdfToCbz(@ModelAttribute ConvertPdfToCbzRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        int dpi = request.getDpi();

        if (dpi <= 0) {
            dpi = 300;
        }

        byte[] cbzBytes = PdfToCbzUtils.convertPdfToCbz(file, dpi, pdfDocumentFactory);

        String filename = createConvertedFilename(file.getOriginalFilename(), "_converted.cbz");

        return WebResponseUtils.bytesToWebResponse(
                cbzBytes, filename, MediaType.APPLICATION_OCTET_STREAM);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/cbr/pdf")
    @Operation(
            summary = "Convert CBR comic book archive to PDF",
            description =
                    "This endpoint converts a CBR (RAR) comic book archive to a PDF file. "
                            + "Input:CBR Output:PDF Type:SISO")
    public ResponseEntity<?> convertCbrToPdf(@ModelAttribute ConvertCbrToPdfRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        boolean optimizeForEbook = request.isOptimizeForEbook();

        // Disable optimization if Ghostscript is not available
        if (optimizeForEbook && !isGhostscriptEnabled()) {
            log.warn("Ghostscript optimization requested but Ghostscript is not enabled/available");
            optimizeForEbook = false;
        }

        byte[] pdfBytes =
                CbrUtils.convertCbrToPdf(
                        file, pdfDocumentFactory, tempFileManager, optimizeForEbook);

        String filename = createConvertedFilename(file.getOriginalFilename(), "_converted.pdf");

        return WebResponseUtils.bytesToWebResponse(pdfBytes, filename);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/cbr")
    @Operation(
            summary = "Convert PDF to CBR comic book archive",
            description =
                    "This endpoint converts a PDF file to a CBR comic book archive using the local RAR CLI. "
                            + "Input:PDF Output:CBR Type:SISO")
    public ResponseEntity<?> convertPdfToCbr(@ModelAttribute ConvertPdfToCbrRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        int dpi = request.getDpi();

        if (dpi <= 0) {
            dpi = 300;
        }

        byte[] cbrBytes = PdfToCbrUtils.convertPdfToCbr(file, dpi, pdfDocumentFactory);

        String filename = createConvertedFilename(file.getOriginalFilename(), "_converted.cbr");

        return WebResponseUtils.bytesToWebResponse(
                cbrBytes, filename, MediaType.APPLICATION_OCTET_STREAM);
    }

    private String createConvertedFilename(String originalFilename, String suffix) {
        if (originalFilename == null) {
            return GeneralUtils.generateFilename(DEFAULT_COMIC_NAME, suffix);
        }

        String baseName = EXTENSION_PATTERN.matcher(originalFilename).replaceFirst("");
        if (baseName.isBlank()) {
            baseName = DEFAULT_COMIC_NAME;
        }

        return GeneralUtils.generateFilename(baseName, suffix);
    }

    private String getMediaType(String imageFormat) {
        String mimeType = URLConnection.guessContentTypeFromName("." + imageFormat);
        return "null".equals(mimeType) ? MediaType.APPLICATION_OCTET_STREAM_VALUE : mimeType;
    }

    /**
     * Rearranges the pages of the given PDF document based on the specified page order.
     *
     * @param pdfFile The byte array of the original PDF file.
     * @param pageOrderArr An array of page numbers indicating the new order.
     * @return A byte array of the rearranged PDF.
     * @throws IOException If an error occurs while processing the PDF.
     */
    private byte[] rearrangePdfPages(MultipartFile pdfFile, String[] pageOrderArr)
            throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(pdfFile);
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            int totalPages = document.getNumberOfPages();
            List<Integer> newPageOrder =
                    GeneralUtils.parsePageList(pageOrderArr, totalPages, false);

            // Create a new list to hold the pages in the new order
            List<PDPage> newPages = new ArrayList<>();
            for (int pageIndex : newPageOrder) {
                newPages.add(document.getPage(pageIndex));
            }

            // Remove all the pages from the original document
            for (int i = document.getNumberOfPages() - 1; i >= 0; i--) {
                document.removePage(i);
            }

            // Add the pages in the new order
            for (PDPage page : newPages) {
                document.addPage(page);
            }

            document.save(baos);
            return baos.toByteArray();
        }
    }
}
