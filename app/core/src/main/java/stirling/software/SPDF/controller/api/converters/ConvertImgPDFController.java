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

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.rendering.ImageType;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.converters.ConvertCbrToPdfRequest;
import stirling.software.SPDF.model.api.converters.ConvertCbzToPdfRequest;
import stirling.software.SPDF.model.api.converters.ConvertPdfToCbrRequest;
import stirling.software.SPDF.model.api.converters.ConvertPdfToCbzRequest;
import stirling.software.SPDF.model.api.converters.ConvertToImageRequest;
import stirling.software.SPDF.model.api.converters.ConvertToPdfRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
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
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/convert")
@Slf4j
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

    @POST
    @jakarta.ws.rs.Path("/pdf/img")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/pdf/img",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MultiFileResponse
    @Operation(
            summary = "Convert PDF to image(s)",
            description =
                    "This endpoint converts a PDF file to image(s) with the specified image format,"
                            + " color type, and DPI. Users can choose to get a single image or multiple"
                            + " images.  Input:PDF Output:Image Type:SI-Conditional")
    public Response convertToImage(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("imageFormat") String imageFormatParam,
            @RestForm("singleOrMultiple") String singleOrMultipleParam,
            @RestForm("colorType") String colorTypeParam,
            @RestForm("dpi") Integer dpiParam,
            @RestForm("pageNumbers") String pageNumbersParam,
            @RestForm("includeAnnotations") Boolean includeAnnotationsParam)
            throws Exception {
        ConvertToImageRequest request = new ConvertToImageRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setImageFormat(imageFormatParam);
        request.setSingleOrMultiple(singleOrMultipleParam);
        request.setColorType(colorTypeParam);
        request.setDpi(dpiParam);
        request.setPageNumbers(pageNumbersParam);
        request.setIncludeAnnotations(includeAnnotationsParam);

        stirling.software.common.model.MultipartFile file = request.getFileInput();
        String imageFormat = request.getImageFormat();
        String singleOrMultiple = request.getSingleOrMultiple();
        String colorType = request.getColorType();
        int dpi = request.getDpi();
        String pageNumbers = request.getPageNumbers();
        boolean includeAnnotations = Boolean.TRUE.equals(request.getIncludeAnnotations());
        Path tempFile = null;
        Path tempOutputDir = null;
        Path tempPdfPath = null;
        byte[] result = null;
        String[] pageOrderArr =
                (pageNumbers != null && !pageNumbers.trim().isEmpty())
                        ? pageNumbers.split(",")
                        : new String[] {"all"};
        ;
        try {
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
                log.error("resultant bytes for {} is null, error converting ", filename);
            }
            if ("webp".equalsIgnoreCase(imageFormat) && !CheckProgramInstall.isPythonAvailable()) {
                throw ExceptionUtils.createPythonRequiredForWebpException();
            } else if ("webp".equalsIgnoreCase(imageFormat)
                    && CheckProgramInstall.isPythonAvailable()) {
                // Write the output stream to a temp file
                tempFile = Files.createTempFile("temp_png", ".png");
                try (FileOutputStream fos = new FileOutputStream(tempFile.toFile())) {
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

                // Create a temporary directory for the output WebP files
                tempOutputDir = Files.createTempDirectory("webp_output");
                if (singleImage) {
                    // Run the Python script to convert PNG to WebP
                    command.add(tempFile.toString());
                    command.add(tempOutputDir.toString());
                    command.add("--single");
                } else {
                    // Save the uploaded PDF to a temporary file
                    tempPdfPath = Files.createTempFile("temp_pdf", ".pdf");
                    file.transferTo(tempPdfPath.toFile());
                    // Run the Python script to convert PDF to WebP
                    command.add(tempPdfPath.toString());
                    command.add(tempOutputDir.toString());
                }
                command.add("--dpi");
                command.add(String.valueOf(dpi));
                ProcessExecutorResult resultProcess =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV)
                                .runCommandWithOutputHandling(command);

                // Find all WebP files in the output directory
                List<Path> webpFiles;
                try (Stream<Path> walkStream = Files.walk(tempOutputDir)) {
                    webpFiles =
                            walkStream.filter(path -> path.toString().endsWith(".webp")).toList();
                }

                if (webpFiles.isEmpty()) {
                    log.error("No WebP files were created in: {}", tempOutputDir.toString());
                    throw new IOException(
                            "No WebP files were created. " + resultProcess.getMessages());
                }

                if (webpFiles.size() == 1) {
                    Path webpFilePath = webpFiles.get(0);
                    byte[] webpBytes = Files.readAllBytes(webpFilePath);
                    Files.deleteIfExists(tempFile);
                    tempFile = null;
                    FileUtils.deleteDirectory(tempOutputDir.toFile());
                    tempOutputDir = null;
                    String docName = filename + "." + imageFormat;
                    MediaType mediaType = MediaType.valueOf(getMediaType(imageFormat));
                    return WebResponseUtils.bytesToWebResponse(webpBytes, docName, mediaType);
                } else {
                    ByteArrayOutputStream zipBAOS = new ByteArrayOutputStream();
                    try (ZipOutputStream zos = new ZipOutputStream(zipBAOS)) {
                        for (Path webpFile : webpFiles) {
                            zos.putNextEntry(new ZipEntry(webpFile.getFileName().toString()));
                            Files.copy(webpFile, zos);
                            zos.closeEntry();
                        }
                    }
                    Files.deleteIfExists(tempFile);
                    tempFile = null;
                    FileUtils.deleteDirectory(tempOutputDir.toFile());
                    tempOutputDir = null;
                    String zipFilename = filename + "_convertedToImages.zip";
                    return WebResponseUtils.bytesToWebResponse(
                            zipBAOS.toByteArray(),
                            zipFilename,
                            MediaType.valueOf(MediaType.APPLICATION_OCTET_STREAM));
                }
            }

            if (singleImage) {
                String docName = filename + "." + imageFormat;
                MediaType mediaType = MediaType.valueOf(getMediaType(imageFormat));
                return WebResponseUtils.bytesToWebResponse(result, docName, mediaType);
            } else {
                String zipFilename = filename + "_convertedToImages.zip";
                return WebResponseUtils.bytesToWebResponse(
                        result,
                        zipFilename,
                        MediaType.valueOf(MediaType.APPLICATION_OCTET_STREAM));
            }

        } finally {
            try {
                // Clean up temporary files
                if (tempFile != null) {
                    Files.deleteIfExists(tempFile);
                }
                if (tempPdfPath != null) {
                    Files.deleteIfExists(tempPdfPath);
                }
                if (tempOutputDir != null) {
                    FileUtils.deleteDirectory(tempOutputDir.toFile());
                }
            } catch (Exception e) {
                log.error("Error cleaning up temporary files", e);
            }
        }
    }

    @POST
    @jakarta.ws.rs.Path("/img/pdf")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/img/pdf",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Convert images to a PDF file",
            description =
                    "This endpoint converts one or more images to a PDF file. Users can specify"
                            + " whether to stretch the images to fit the PDF page, and whether to"
                            + " automatically rotate the images. Input:Image Output:PDF Type:MISO")
    public Response convertToPdf(
            @RestForm("fileInput") List<FileUpload> fileUploads,
            @RestForm("fitOption") String fitOptionParam,
            @RestForm("colorType") String colorTypeParam,
            @RestForm("autoRotate") Boolean autoRotateParam)
            throws IOException {
        // TODO: Migration required - ConvertToPdfRequest.fileInput is still typed as Spring's
        // org.springframework.web.multipart.MultipartFile[]. setFileInput(...) below passes the
        // common shim (stirling.software.common.model.MultipartFile[]); this will not compile until
        // ConvertToPdfRequest is migrated to the shim type (collaborator edit on the model file).
        ConvertToPdfRequest request = new ConvertToPdfRequest();
        stirling.software.common.model.MultipartFile[] requestFiles =
                fileUploads == null
                        ? new stirling.software.common.model.MultipartFile[0]
                        : fileUploads.stream()
                                .map(FileUploadMultipartFile::of)
                                .toArray(stirling.software.common.model.MultipartFile[]::new);
        request.setFileInput(requestFiles);
        request.setFitOption(fitOptionParam);
        request.setColorType(colorTypeParam);
        request.setAutoRotate(autoRotateParam);

        stirling.software.common.model.MultipartFile[] file = request.getFileInput();
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

    @POST
    @jakarta.ws.rs.Path("/cbz/pdf")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/cbz/pdf",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Convert CBZ comic book archive to PDF",
            description =
                    "This endpoint converts a CBZ (ZIP) comic book archive to a PDF file. "
                            + "Input:CBZ Output:PDF Type:SISO")
    public Response convertCbzToPdf(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("optimizeForEbook") Boolean optimizeForEbookParam)
            throws IOException {
        // TODO: Migration required - ConvertCbzToPdfRequest.fileInput is still typed as Spring's
        // org.springframework.web.multipart.MultipartFile; setFileInput(...) passes the common shim
        // and will not compile until that model file is migrated to the shim type.
        ConvertCbzToPdfRequest request = new ConvertCbzToPdfRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setOptimizeForEbook(Boolean.TRUE.equals(optimizeForEbookParam));

        stirling.software.common.model.MultipartFile file = request.getFileInput();
        boolean optimizeForEbook = request.isOptimizeForEbook();

        // Disable optimization if Ghostscript is not available
        if (optimizeForEbook && !isGhostscriptEnabled()) {
            log.warn("Ghostscript optimization requested but Ghostscript is not enabled/available");
            optimizeForEbook = false;
        }

        TempFile pdfFile =
                CbzUtils.convertCbzToPdf(
                        file, pdfDocumentFactory, tempFileManager, optimizeForEbook);

        String filename = createConvertedFilename(file.getOriginalFilename(), "_converted.pdf");

        return WebResponseUtils.pdfFileToWebResponse(pdfFile, filename);
    }

    @POST
    @jakarta.ws.rs.Path("/pdf/cbz")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/pdf/cbz",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @Operation(
            summary = "Convert PDF to CBZ comic book archive",
            description =
                    "This endpoint converts a PDF file to a CBZ (ZIP) comic book archive. "
                            + "Input:PDF Output:CBZ Type:SISO")
    public Response convertPdfToCbz(
            @RestForm("fileInput") FileUpload fileUpload, @RestForm("dpi") Integer dpiParam)
            throws IOException {
        // TODO: Migration required - ConvertPdfToCbzRequest.fileInput is still typed as Spring's
        // org.springframework.web.multipart.MultipartFile; setFileInput(...) passes the common shim
        // and will not compile until that model file is migrated to the shim type.
        ConvertPdfToCbzRequest request = new ConvertPdfToCbzRequest();
        request.setFileInput(fileUpload);
        if (dpiParam != null) {
            request.setDpi(dpiParam);
        }

        stirling.software.common.model.MultipartFile file =
                FileUploadMultipartFile.of(fileUpload);
        int dpi = request.getDpi();

        if (dpi <= 0) {
            dpi = 300;
        }

        TempFile cbzFile =
                PdfToCbzUtils.convertPdfToCbz(file, dpi, pdfDocumentFactory, tempFileManager);

        String filename = createConvertedFilename(file.getOriginalFilename(), "_converted.cbz");

        return WebResponseUtils.zipFileToWebResponse(cbzFile, filename);
    }

    @POST
    @jakarta.ws.rs.Path("/cbr/pdf")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/cbr/pdf",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Convert CBR comic book archive to PDF",
            description =
                    "This endpoint converts a CBR (RAR) comic book archive to a PDF file. "
                            + "Input:CBR Output:PDF Type:SISO")
    public Response convertCbrToPdf(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("optimizeForEbook") Boolean optimizeForEbookParam)
            throws IOException {
        // TODO: Migration required - ConvertCbrToPdfRequest.fileInput is still typed as Spring's
        // org.springframework.web.multipart.MultipartFile; setFileInput(...) passes the common shim
        // and will not compile until that model file is migrated to the shim type.
        ConvertCbrToPdfRequest request = new ConvertCbrToPdfRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setOptimizeForEbook(Boolean.TRUE.equals(optimizeForEbookParam));

        stirling.software.common.model.MultipartFile file = request.getFileInput();
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

    @POST
    @jakarta.ws.rs.Path("/pdf/cbr")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/pdf/cbr",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @Operation(
            summary = "Convert PDF to CBR comic book archive",
            description =
                    "This endpoint converts a PDF file to a CBR comic book archive using the local RAR CLI. "
                            + "Input:PDF Output:CBR Type:SISO")
    public Response convertPdfToCbr(
            @RestForm("fileInput") FileUpload fileUpload, @RestForm("dpi") Integer dpiParam)
            throws IOException {
        // TODO: Migration required - ConvertPdfToCbrRequest.fileInput is still typed as Spring's
        // org.springframework.web.multipart.MultipartFile; setFileInput(...) passes the common shim
        // and will not compile until that model file is migrated to the shim type.
        ConvertPdfToCbrRequest request = new ConvertPdfToCbrRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        if (dpiParam != null) {
            request.setDpi(dpiParam);
        }

        stirling.software.common.model.MultipartFile file = request.getFileInput();
        int dpi = request.getDpi();

        if (dpi <= 0) {
            dpi = 300;
        }

        byte[] cbrBytes = PdfToCbrUtils.convertPdfToCbr(file, dpi, pdfDocumentFactory);

        String filename = createConvertedFilename(file.getOriginalFilename(), "_converted.cbr");

        return WebResponseUtils.bytesToWebResponse(
                cbrBytes, filename, MediaType.valueOf(MediaType.APPLICATION_OCTET_STREAM));
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
        return "null".equals(mimeType) ? MediaType.APPLICATION_OCTET_STREAM : mimeType;
    }

    /**
     * Rearranges the pages of the given PDF document based on the specified page order.
     *
     * @param pdfFile The MultipartFile of the original PDF file.
     * @param pageOrderArr An array of page numbers indicating the new order.
     * @return A byte array of the rearranged PDF.
     * @throws IOException If an error occurs while processing the PDF.
     */
    private byte[] rearrangePdfPages(
            stirling.software.common.model.MultipartFile pdfFile, String[] pageOrderArr)
            throws IOException {
        // Load the input PDF
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

            // Convert PDDocument to byte array
            document.save(baos);
            return baos.toByteArray();
        }
    }
}
