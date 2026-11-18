package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URLConnection;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.rendering.ImageType;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

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
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOCase;
import stirling.software.common.model.tool.ToolIOWhen;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CbrUtils;
import stirling.software.common.util.CbzUtils;
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
@Slf4j
@RequiredArgsConstructor
public class ConvertImgPDFController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;
    private static final Pattern EXTENSION_PATTERN =
            RegexPatternUtils.getInstance().getPattern(RegexPatternUtils.getExtensionRegex());
    private static final String DEFAULT_COMIC_NAME = "comic";
    private static final int WEBP_MAX_DIMENSION = 16383;

    private boolean isGhostscriptEnabled() {
        return endpointConfiguration.isGroupEnabled("Ghostscript");
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf/img",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MultiFileResponse
    @ToolIO(
            produces = ToolFormat.IMAGE,
            arity = ToolArity.SIMO,
            cases =
                    @ToolIOCase(
                            when = @ToolIOWhen(param = "singleOrMultiple", matches = "single"),
                            produces = ToolFormat.IMAGE,
                            arity = ToolArity.SISO))
    @Operation(
            summary = "Convert PDF to image(s)",
            description =
                    "This endpoint converts a PDF file to image(s) with the specified image format,"
                            + " color type, and DPI. Users can choose to get a single image or multiple"
                            + " images.")
    public ResponseEntity<?> convertToImage(@ModelAttribute ConvertToImageRequest request)
            throws Exception {
        MultipartFile file = request.getFileInput();
        String imageFormat = request.getImageFormat();
        String singleOrMultiple = request.getSingleOrMultiple();
        String colorType = request.getColorType();
        // Spring binds an empty dpi form field to null, which the field default cannot cover
        Integer requestedDpi = request.getDpi();
        int dpi =
                (requestedDpi == null || requestedDpi <= 0)
                        ? ConvertToImageRequest.DEFAULT_DPI
                        : requestedDpi;
        String pageNumbers = request.getPageNumbers();
        boolean includeAnnotations = Boolean.TRUE.equals(request.getIncludeAnnotations());
        byte[] result = null;
        String[] pageOrderArr =
                (pageNumbers != null && !pageNumbers.trim().isEmpty())
                        ? pageNumbers.split(",")
                        : new String[] {"all"};
        boolean webp = "webp".equalsIgnoreCase(imageFormat);
        if (webp && !endpointConfiguration.isGroupEnabled("ImageMagick")) {
            throw ExceptionUtils.createImageMagickRequiredForWebpException();
        }
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
                        webp ? "png" : imageFormat.toUpperCase(Locale.ROOT),
                        colorTypeResult,
                        singleImage,
                        dpi,
                        filename,
                        includeAnnotations);
        if (result == null || result.length == 0) {
            log.error("resultant bytes for {} is null, error converting ", filename);
        }
        if (webp) {
            return webpResponse(result, singleImage, filename);
        }

        if (singleImage) {
            String docName = filename + "." + imageFormat;
            MediaType mediaType = MediaType.parseMediaType(getMediaType(imageFormat));
            return WebResponseUtils.bytesToWebResponse(result, docName, mediaType);
        } else {
            String zipFilename = filename + ".zip";
            return WebResponseUtils.bytesToWebResponse(
                    result, zipFilename, MediaType.APPLICATION_OCTET_STREAM);
        }
    }

    private ResponseEntity<byte[]> webpResponse(
            byte[] rendered, boolean singleImage, String filename)
            throws IOException, InterruptedException {
        Path workDir = Files.createTempDirectory("webp_output");
        try {
            List<Path> pngs = new ArrayList<>();
            List<String> outputNames = new ArrayList<>();
            if (singleImage) {
                Path png = workDir.resolve("page_1.png");
                Files.write(png, rendered);
                pngs.add(png);
                outputNames.add(filename + ".webp");
            } else {
                try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(rendered))) {
                    ZipEntry entry;
                    while ((entry = zis.getNextEntry()) != null) {
                        if (entry.isDirectory()) {
                            continue;
                        }
                        Path png = workDir.resolve("page_" + (pngs.size() + 1) + ".png");
                        Files.copy(zis, png);
                        pngs.add(png);
                        outputNames.add(
                                EXTENSION_PATTERN.matcher(entry.getName()).replaceFirst("")
                                        + ".webp");
                    }
                }
            }

            List<String> command = new ArrayList<>();
            command.add("magick");
            command.add("mogrify");
            command.add("-format");
            command.add("webp");
            command.add("-quality");
            command.add("100");
            command.add("-resize");
            command.add(WEBP_MAX_DIMENSION + "x" + WEBP_MAX_DIMENSION + ">");
            pngs.forEach(png -> command.add(png.toString()));
            ProcessExecutorResult conversion =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.IMAGEMAGICK)
                            .runCommandWithOutputHandling(command);
            if (conversion.getRc() != 0) {
                throw new IOException("WebP conversion failed: " + conversion.getMessages());
            }

            List<Path> webps = new ArrayList<>();
            for (Path png : pngs) {
                Path webp = workDir.resolve(png.getFileName().toString().replace(".png", ".webp"));
                if (!Files.isRegularFile(webp)) {
                    throw new IOException(
                            "No WebP files were created. " + conversion.getMessages());
                }
                webps.add(webp);
            }

            if (singleImage) {
                return WebResponseUtils.bytesToWebResponse(
                        Files.readAllBytes(webps.getFirst()),
                        outputNames.getFirst(),
                        MediaType.parseMediaType(getMediaType("webp")));
            }
            ByteArrayOutputStream zipBytes = new ByteArrayOutputStream();
            try (ZipOutputStream zos = new ZipOutputStream(zipBytes)) {
                for (int i = 0; i < webps.size(); i++) {
                    zos.putNextEntry(new ZipEntry(outputNames.get(i)));
                    Files.copy(webps.get(i), zos);
                    zos.closeEntry();
                }
            }
            return WebResponseUtils.bytesToWebResponse(
                    zipBytes.toByteArray(), filename + ".zip", MediaType.APPLICATION_OCTET_STREAM);
        } finally {
            FileUtils.deleteDirectory(workDir.toFile());
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/img/pdf",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @StandardPdfResponse
    @ToolIO(
            accepts = ToolFormat.IMAGE,
            imageIOInput = true,
            produces = ToolFormat.PDF,
            arity = ToolArity.MISO)
    @Operation(
            summary = "Convert images to a PDF file",
            description =
                    "This endpoint converts one or more images to a PDF file. Users can specify"
                            + " whether to stretch the images to fit the PDF page, and whether to"
                            + " automatically rotate the images.")
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
                bytes, GeneralUtils.generateFilename(file[0].getOriginalFilename(), ".pdf"));
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/cbz/pdf",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @ToolIO(
            accepts = ToolFormat.CBZ,
            inputExtensions = {"cbz", "zip"},
            produces = ToolFormat.PDF)
    @Operation(
            summary = "Convert CBZ comic book archive to PDF",
            description = "This endpoint converts a CBZ (ZIP) comic book archive to a PDF file.")
    public ResponseEntity<Resource> convertCbzToPdf(@ModelAttribute ConvertCbzToPdfRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        boolean optimizeForEbook = request.isOptimizeForEbook();

        // Disable optimization if Ghostscript is not available
        if (optimizeForEbook && !isGhostscriptEnabled()) {
            log.warn("Ghostscript optimization requested but Ghostscript is not enabled/available");
            optimizeForEbook = false;
        }

        TempFile pdfFile =
                CbzUtils.convertCbzToPdf(
                        file, pdfDocumentFactory, tempFileManager, optimizeForEbook);

        String filename = createConvertedFilename(file.getOriginalFilename(), ".pdf");

        return WebResponseUtils.pdfFileToWebResponse(pdfFile, filename);
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf/cbz",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.CBZ)
    @Operation(
            summary = "Convert PDF to CBZ comic book archive",
            description = "This endpoint converts a PDF file to a CBZ (ZIP) comic book archive.")
    public ResponseEntity<Resource> convertPdfToCbz(@ModelAttribute ConvertPdfToCbzRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        int dpi = request.getDpi();

        if (dpi <= 0) {
            dpi = 300;
        }

        TempFile cbzFile =
                PdfToCbzUtils.convertPdfToCbz(file, dpi, pdfDocumentFactory, tempFileManager);

        String filename = createConvertedFilename(file.getOriginalFilename(), ".cbz");

        return WebResponseUtils.zipFileToWebResponse(cbzFile, filename);
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/cbr/pdf",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @ToolIO(
            accepts = ToolFormat.CBR,
            inputExtensions = {"cbr", "rar"},
            produces = ToolFormat.PDF)
    @Operation(
            summary = "Convert CBR comic book archive to PDF",
            description = "This endpoint converts a CBR (RAR) comic book archive to a PDF file.")
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

        String filename = createConvertedFilename(file.getOriginalFilename(), ".pdf");

        return WebResponseUtils.bytesToWebResponse(pdfBytes, filename);
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf/cbr",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.CBR)
    @Operation(
            summary = "Convert PDF to CBR comic book archive",
            description =
                    "This endpoint converts a PDF file to a CBR comic book archive using the local"
                            + " RAR CLI.")
    public ResponseEntity<?> convertPdfToCbr(@ModelAttribute ConvertPdfToCbrRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        int dpi = request.getDpi();

        if (dpi <= 0) {
            dpi = 300;
        }

        byte[] cbrBytes = PdfToCbrUtils.convertPdfToCbr(file, dpi, pdfDocumentFactory);

        String filename = createConvertedFilename(file.getOriginalFilename(), ".cbr");

        return WebResponseUtils.bytesToWebResponse(
                cbrBytes, filename, MediaType.APPLICATION_OCTET_STREAM);
    }

    private String createConvertedFilename(String originalFilename, String suffix) {
        if (originalFilename == null) {
            return GeneralUtils.appendSuffix(DEFAULT_COMIC_NAME, suffix);
        }

        String baseName = EXTENSION_PATTERN.matcher(originalFilename).replaceFirst("");
        if (baseName.isBlank()) {
            baseName = DEFAULT_COMIC_NAME;
        }

        return GeneralUtils.appendSuffix(baseName, suffix);
    }

    private String getMediaType(String imageFormat) {
        String mimeType = URLConnection.guessContentTypeFromName("." + imageFormat);
        return "null".equals(mimeType) ? MediaType.APPLICATION_OCTET_STREAM_VALUE : mimeType;
    }

    /**
     * Rearranges the pages of the given PDF document based on the specified page order.
     *
     * @param pdfFile The MultipartFile of the original PDF file.
     * @param pageOrderArr An array of page numbers indicating the new order.
     * @return A byte array of the rearranged PDF.
     * @throws IOException If an error occurs while processing the PDF.
     */
    private byte[] rearrangePdfPages(MultipartFile pdfFile, String[] pageOrderArr)
            throws IOException {
        // Load the input PDF
        try (PDDocument document = pdfDocumentFactory.load(pdfFile);
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            int totalPages = document.getNumberOfPages();
            GeneralUtils.requireValidPageSelection(String.join(",", pageOrderArr), totalPages);
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
