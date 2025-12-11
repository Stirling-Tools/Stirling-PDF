package stirling.software.SPDF.controller.api.converters;

import java.awt.Color;
import java.awt.color.ColorSpace;
import java.awt.color.ICC_Profile;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.io.RandomAccessRead;
import org.apache.pdfbox.io.RandomAccessReadBufferedFile;
import org.apache.pdfbox.pdfwriter.compress.CompressParameters;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.font.PDTrueTypeFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.color.PDOutputIntent;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationTextMarkup;
import org.apache.pdfbox.pdmodel.interactive.viewerpreferences.PDViewerPreferences;
import org.apache.pdfbox.preflight.Format;
import org.apache.pdfbox.preflight.PreflightConfiguration;
import org.apache.pdfbox.preflight.PreflightDocument;
import org.apache.pdfbox.preflight.ValidationResult;
import org.apache.pdfbox.preflight.ValidationResult.ValidationError;
import org.apache.pdfbox.preflight.exception.SyntaxValidationException;
import org.apache.pdfbox.preflight.exception.ValidationException;
import org.apache.pdfbox.preflight.parser.PreflightParser;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.AdobePDFSchema;
import org.apache.xmpbox.schema.DublinCoreSchema;
import org.apache.xmpbox.schema.PDFAIdentificationSchema;
import org.apache.xmpbox.schema.XMPBasicSchema;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpSerializer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.converters.PdfToPdfARequest;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Slf4j
@Tag(name = "Convert", description = "Convert APIs")
@RequiredArgsConstructor
public class ConvertPDFToPDFA {

    private final RuntimePathConfig runtimePathConfig;

    private static final String ICC_RESOURCE_PATH = "/icc/sRGB2014.icc";
    private static final int PDFA_COMPATIBILITY_POLICY = 1;

    private static void validateAndWarnPdfA(byte[] pdfBytes, PdfaProfile profile, String method) {
        Path tempPdfPath = null;
        try {
            tempPdfPath = Files.createTempFile("validate_", ".pdf");

            try (OutputStream out = Files.newOutputStream(tempPdfPath)) {
                out.write(pdfBytes);
            }

            ValidationResult validationResult =
                    performComprehensivePdfAValidation(tempPdfPath, profile);

            if (validationResult.isValid()) {
                log.info(
                        "PDF/A validation passed for {} using {}",
                        profile.getDisplayName(),
                        method);
            } else {
                log.warn(
                        "PDF/A validation warning for {} using {}: {}",
                        profile.getDisplayName(),
                        method,
                        buildComprehensiveValidationMessage(validationResult, profile));
            }
        } catch (Exception e) {
            log.warn(
                    "PDF/A validation warning for {} using {}: {}",
                    profile.getDisplayName(),
                    method,
                    e.getMessage());
        } finally {
            if (tempPdfPath != null) {
                try {
                    Files.deleteIfExists(tempPdfPath);
                } catch (IOException e) {
                    log.debug("Failed to delete temporary validation file", e);
                }
            }
        }
    }

    private static ValidationResult performComprehensivePdfAValidation(
            Path pdfPath, PdfaProfile profile) throws IOException {
        Optional<Format> format = profile.preflightFormat();
        if (format.isEmpty()) {
            // For profiles without preflight support, perform basic structure validation
            return performBasicPdfAValidation(pdfPath, profile);
        }

        try (RandomAccessRead rar = new RandomAccessReadBufferedFile(pdfPath.toFile())) {
            PreflightParser parser = new PreflightParser(rar);

            PreflightDocument document = parsePreflightDocument(parser, format.get(), profile);
            if (document == null) {
                throw new IOException(
                        "PDF/A preflight returned no document for " + profile.getDisplayName());
            }

            try (PreflightDocument closeableDocument = document) {
                return closeableDocument.validate();
            }
        } catch (SyntaxValidationException e) {
            return e.getResult();
        } catch (ValidationException e) {
            throw new IOException(
                    "PDF/A preflight validation failed for " + profile.getDisplayName(), e);
        }
    }

    private static ValidationResult performBasicPdfAValidation(Path pdfPath, PdfaProfile profile)
            throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdfPath.toFile())) {
            ValidationResult result = new ValidationResult(true);

            float version = doc.getVersion();
            float expectedVersion = profile.getPart() == 1 ? 1.4f : 1.7f;
            if (version < expectedVersion) {
                result.addError(
                        new ValidationError(
                                "PDF_VERSION",
                                "PDF version "
                                        + version
                                        + " is below required "
                                        + expectedVersion
                                        + " for "
                                        + profile.getDisplayName()));
            }

            PDDocumentCatalog catalog = doc.getDocumentCatalog();
            if (catalog.getMetadata() == null) {
                result.addError(
                        new ValidationError(
                                "MISSING_XMP",
                                "XMP metadata is required for " + profile.getDisplayName()));
            }

            if (catalog.getOutputIntents().isEmpty()) {
                result.addError(
                        new ValidationError(
                                "MISSING_OUTPUT_INTENT",
                                "Output intent (ICC profile) is required for "
                                        + profile.getDisplayName()));
            }

            return result;
        }
    }

    private static String buildComprehensiveValidationMessage(
            ValidationResult result, PdfaProfile profile) {
        if (result == null) {
            return "PDF/A validation failed for "
                    + profile.getDisplayName()
                    + ": no validation result available";
        }

        List<ValidationError> errors = result.getErrorsList();

        StringBuilder message = new StringBuilder();
        message.append("PDF/A validation issues for ").append(profile.getDisplayName());

        if (errors != null && !errors.isEmpty()) {
            message.append(" - ").append(errors.size()).append(" errors");
        }
        message.append(":");

        if (errors != null && !errors.isEmpty()) {
            message.append(" ERRORS: ");
            message.append(
                    errors.stream()
                            .limit(5)
                            .map(
                                    error ->
                                            (error.getErrorCode() != null
                                                            ? error.getErrorCode()
                                                            : "UNKNOWN")
                                                    + (error.getDetails() != null
                                                            ? ": " + error.getDetails()
                                                            : ""))
                            .collect(Collectors.joining("; ")));
        }

        return message.toString();
    }

    private static void deleteQuietly(Path directory) {
        if (directory == null) {
            return;
        }
        try (Stream<Path> stream = Files.walk(directory)) {
            stream.sorted(Comparator.reverseOrder())
                    .forEach(
                            path -> {
                                try {
                                    Files.deleteIfExists(path);
                                } catch (IOException e) {
                                    log.warn("Failed to delete temporary file: {}", path, e);
                                }
                            });
        } catch (IOException e) {
            log.warn("Failed to clean temporary directory: {}", directory, e);
        }
    }

    private static List<String> buildGhostscriptCommand(
            Path inputPdf,
            Path outputPdf,
            ColorProfiles colorProfiles,
            Path workingDir,
            PdfaProfile profile,
            Path pdfaDefFile) {

        List<String> command = new ArrayList<>();
        command.add("gs");
        command.add("--permit-file-read=" + workingDir.toAbsolutePath());
        command.add("--permit-file-read=" + colorProfiles.rgb().toAbsolutePath());
        command.add("--permit-file-read=" + colorProfiles.gray().toAbsolutePath());
        command.add("--permit-file-read=" + inputPdf.toAbsolutePath());
        command.add("--permit-file-read=" + pdfaDefFile.toAbsolutePath());
        command.add("--permit-file-write=" + workingDir.toAbsolutePath());

        command.add("-dPDFA=" + profile.getPart());
        command.add("-dPDFACompatibilityPolicy=" + PDFA_COMPATIBILITY_POLICY);
        command.add("-dCompatibilityLevel=" + profile.getCompatibilityLevel());
        command.add("-sDEVICE=pdfwrite");

        command.add("-sColorConversionStrategy=RGB");
        command.add("-dProcessColorModel=/DeviceRGB");
        command.add("-sOutputICCProfile=" + colorProfiles.rgb().toAbsolutePath());
        command.add("-sDefaultRGBProfile=" + colorProfiles.rgb().toAbsolutePath());
        command.add("-sDefaultGrayProfile=" + colorProfiles.gray().toAbsolutePath());
        command.add("-sDefaultCMYKProfile=" + colorProfiles.rgb().toAbsolutePath());

        // Font handling optimized for PDF/A CIDSet compliance
        command.add("-dEmbedAllFonts=true");
        command.add(
                "-dSubsetFonts=true"); // Enable subsetting to generate proper CIDSet streams for
        // PDF/A-1
        command.add("-dCompressFonts=true");
        command.add("-dNOSUBSTFONTS=false"); // Allow font substitution for problematic fonts
        command.add("-dNOPAUSE");
        command.add("-dBATCH");
        command.add("-dNOOUTERSAVE");
        command.add("-sOutputFile=" + outputPdf.toAbsolutePath());

        command.add(pdfaDefFile.toAbsolutePath().toString());
        command.add(inputPdf.toAbsolutePath().toString());

        return command;
    }

    private static PreflightDocument parsePreflightDocument(
            PreflightParser parser, Format format, PdfaProfile profile) throws IOException {
        try {
            PreflightConfiguration config = PreflightConfiguration.createPdfA1BConfiguration();
            if (profile.getPart() != 1) {
                log.debug(
                        "Using PDF/A-1B configuration for PDF/A-{} validation", profile.getPart());
            }

            return (PreflightDocument) parser.parse(format, config);
        } catch (SyntaxValidationException e) {
            throw new IOException(buildComprehensiveValidationMessage(e.getResult(), profile), e);
        } catch (ClassCastException e) {
            throw new IOException(
                    "PDF/A preflight did not produce a PreflightDocument for "
                            + profile.getDisplayName(),
                    e);
        }
    }

    private static void writeJavaIccProfile(ICC_Profile profile, Path target) throws IOException {
        try (OutputStream out = Files.newOutputStream(target)) {
            out.write(profile.getData());
        }
    }

    private static Path createPdfaDefFile(
            Path workingDir, ColorProfiles colorProfiles, PdfaProfile profile) throws IOException {
        Path pdfaDefFile = workingDir.resolve("PDFA_def.ps");

        String title = "Converted to " + profile.getDisplayName();
        String rgbProfilePath = colorProfiles.rgb().toAbsolutePath().toString().replace("\\", "/");
        String pdfaDefContent =
                String.format(
                        """
                %% This is a sample prefix file for creating a PDF/A document.
                %% Feel free to modify entries marked with "Customize".

                %% Define entries in the document Info dictionary.
                [/Title (%s)
                 /DOCINFO pdfmark

                %% Define an ICC profile.
                [/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
                [{icc_PDFA} <<
                  /N 3
                >> /PUT pdfmark
                [{icc_PDFA} (%s) (r) file /PUT pdfmark

                %% Define the output intent dictionary.
                [/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
                [{OutputIntent_PDFA} <<
                  /Type /OutputIntent
                  /S /GTS_PDFA1
                  /DestOutputProfile {icc_PDFA}
                  /OutputConditionIdentifier (sRGB IEC61966-2.1)
                  /Info (sRGB IEC61966-2.1)
                  /RegistryName (http://www.color.org)
                >> /PUT pdfmark
                [{Catalog} <</OutputIntents [ {OutputIntent_PDFA} ]>> /PUT pdfmark
                """,
                        title, rgbProfilePath);

        Files.writeString(pdfaDefFile, pdfaDefContent);
        return pdfaDefFile;
    }

    private static List<String> buildGhostscriptCommandX(
            Path inputPdf,
            Path outputPdf,
            ColorProfiles colorProfiles,
            Path workingDir,
            PdfXProfile profile) {

        List<String> command = new ArrayList<>(25);
        command.add("gs");
        command.add("--permit-file-read=" + workingDir.toAbsolutePath());
        command.add("--permit-file-read=" + colorProfiles.rgb().toAbsolutePath());
        command.add("--permit-file-read=" + colorProfiles.gray().toAbsolutePath());
        command.add("--permit-file-read=" + inputPdf.toAbsolutePath());
        command.add("--permit-file-write=" + workingDir.toAbsolutePath());
        command.add("-dPDFX=" + profile.getPdfxVersion());
        command.add("-dCompatibilityLevel=" + profile.getCompatibilityLevel());
        command.add("-sDEVICE=pdfwrite");
        command.add("-sColorConversionStrategy=RGB");
        command.add("-dProcessColorModel=/DeviceRGB");
        command.add("-sOutputICCProfile=" + colorProfiles.rgb().toAbsolutePath());
        command.add("-sDefaultRGBProfile=" + colorProfiles.rgb().toAbsolutePath());
        command.add("-sDefaultGrayProfile=" + colorProfiles.gray().toAbsolutePath());
        command.add("-dEmbedAllFonts=true");
        command.add("-dSubsetFonts=false"); // Embed complete fonts to avoid incomplete glyphs
        command.add("-dCompressFonts=true");
        command.add("-dNOSUBSTFONTS=false"); // Allow font substitution for problematic fonts
        command.add("-dPDFSETTINGS=/prepress");
        command.add("-dNOPAUSE");
        command.add("-dBATCH");
        command.add("-dNOOUTERSAVE");
        command.add("-sOutputFile=" + outputPdf.toAbsolutePath());
        command.add(inputPdf.toAbsolutePath().toString());

        return command;
    }

    private static void embedMissingFonts(
            PDDocument loDoc, PDDocument baseDoc, Set<String> missingFonts) throws IOException {
        List<PDPage> loPages = new ArrayList<>(loDoc.getNumberOfPages());
        loDoc.getPages().forEach(loPages::add);
        List<PDPage> basePages = new ArrayList<>(baseDoc.getNumberOfPages());
        baseDoc.getPages().forEach(basePages::add);

        for (int i = 0; i < loPages.size(); i++) {
            PDResources loRes = loPages.get(i).getResources();
            PDResources baseRes = basePages.get(i).getResources();

            for (COSName fontKey : loRes.getFontNames()) {
                PDFont loFont = loRes.getFont(fontKey);
                if (loFont == null) continue;

                String psName = loFont.getName();
                if (!missingFonts.contains(psName)) continue;

                PDFontDescriptor desc = loFont.getFontDescriptor();
                if (desc == null) continue;

                PDStream fontStream = null;
                if (desc.getFontFile() != null) {
                    fontStream = desc.getFontFile();
                } else if (desc.getFontFile2() != null) {
                    fontStream = desc.getFontFile2();
                } else if (desc.getFontFile3() != null) {
                    fontStream = desc.getFontFile3();
                }
                if (fontStream == null) continue;

                // Read the font stream into memory once so we can create fresh
                // InputStreams for multiple load attempts. This avoids reusing a
                // consumed stream and allows try-with-resources for each attempt.
                byte[] fontBytes;
                try (InputStream in = fontStream.createInputStream()) {
                    fontBytes = in.readAllBytes();
                }

                PDFont embeddedFont = null;
                // First try PDType0 (CID) font
                try (InputStream tryIn = new ByteArrayInputStream(fontBytes)) {
                    embeddedFont = PDType0Font.load(baseDoc, tryIn, false);
                } catch (IOException e1) {
                    // Fallback to TrueType
                    try (InputStream tryIn2 = new ByteArrayInputStream(fontBytes)) {
                        try {
                            embeddedFont = PDTrueTypeFont.load(baseDoc, tryIn2, null);
                        } catch (IllegalArgumentException | IOException e2) {
                            log.error("Could not embed font {}: {}", psName, e2.getMessage());
                        }
                    }
                }

                if (embeddedFont != null) {
                    baseRes.put(fontKey, embeddedFont);
                }
            }
        }
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/pdfa")
    @Operation(
            summary = "Convert a PDF to a PDF/A or PDF/X",
            description =
                    "This endpoint converts a PDF file to a PDF/A or PDF/X file using Ghostscript (preferred) or PDFBox/LibreOffice (fallback). PDF/A is a format designed for long-term archiving, while PDF/X is optimized for print production. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> pdfToPdfA(@ModelAttribute PdfToPdfARequest request)
            throws Exception {
        MultipartFile inputFile = request.getFileInput();
        String outputFormat = request.getOutputFormat();

        // Validate input file type
        if (!MediaType.APPLICATION_PDF_VALUE.equals(inputFile.getContentType())) {
            log.error("Invalid input file type: {}", inputFile.getContentType());
            throw ExceptionUtils.createPdfFileRequiredException();
        }

        // Determine if this is PDF/A or PDF/X conversion
        boolean isPdfX = outputFormat != null && outputFormat.toLowerCase().startsWith("pdfx");

        if (isPdfX) {
            return handlePdfXConversion(inputFile, outputFormat);
        } else {
            return handlePdfAConversion(inputFile, outputFormat);
        }
    }

    private static Set<String> findUnembeddedFontNames(PDDocument doc) throws IOException {
        Set<String> missing = new HashSet<>(16);
        for (PDPage page : doc.getPages()) {
            PDResources res = page.getResources();
            for (COSName name : res.getFontNames()) {
                PDFont font = res.getFont(name);
                if (font != null && !font.isEmbedded()) {
                    missing.add(font.getName());
                }
            }
        }
        return missing;
    }

    private ResponseEntity<byte[]> handlePdfXConversion(
            MultipartFile inputFile, String outputFormat) throws Exception {
        PdfXProfile profile = PdfXProfile.fromRequest(outputFormat);

        String originalFileName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFileName == null || originalFileName.trim().isEmpty()) {
            originalFileName = "output.pdf";
        }
        String baseFileName =
                originalFileName.contains(".")
                        ? originalFileName.substring(0, originalFileName.lastIndexOf('.'))
                        : originalFileName;

        Path workingDir = Files.createTempDirectory("pdfx_conversion_");
        Path inputPath = workingDir.resolve("input.pdf");
        inputFile.transferTo(inputPath);

        try {
            // PDF/X conversion uses Ghostscript (no fallback currently)
            if (!isGhostscriptAvailable()) {
                log.error("Ghostscript is required for PDF/X conversion");
                throw new IOException(
                        "Ghostscript is required for PDF/X conversion but is not available on the system");
            }

            log.info("Using Ghostscript for PDF/X conversion to {}", profile.getDisplayName());
            byte[] converted = convertWithGhostscriptX(inputPath, workingDir, profile);
            String outputFilename = baseFileName + profile.outputSuffix();

            log.info("PDF/X conversion completed successfully to {}", profile.getDisplayName());

            return WebResponseUtils.bytesToWebResponse(
                    converted, outputFilename, MediaType.APPLICATION_PDF);

        } catch (IOException | InterruptedException e) {
            log.error("PDF/X conversion failed", e);
            throw ExceptionUtils.createPdfaConversionFailedException();
        } finally {
            deleteQuietly(workingDir);
        }
    }

    private boolean isGhostscriptAvailable() {
        try {
            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                            .runCommandWithOutputHandling(Arrays.asList("gs", "--version"));
            return result.getRc() == 0;
        } catch (Exception e) {
            log.debug("Ghostscript availability check failed", e);
            return false;
        }
    }

    private static void fixCidSetIssues(PDDocument document) throws IOException {
        for (PDPage page : document.getPages()) {
            PDResources resources = page.getResources();
            if (resources == null) continue;

            for (COSName fontName : resources.getFontNames()) {
                try {
                    PDFont font = resources.getFont(fontName);
                    if (font == null) continue;

                    PDFontDescriptor descriptor = font.getFontDescriptor();
                    if (descriptor == null) continue;

                    COSDictionary fontDict = descriptor.getCOSObject();

                    // Remove invalid or incomplete CIDSet entries for PDF/A-1 compliance
                    // PDF/A-1 requires CIDSet to be present and complete for subsetted CIDFonts
                    // For PDF/A-2+, CIDSet is optional but must be complete if present
                    COSBase cidSet = fontDict.getDictionaryObject(COSName.getPDFName("CIDSet"));
                    if (cidSet != null) {
                        // If CIDSet exists but may be invalid, remove it to avoid validation errors
                        // This is safer than trying to fix incomplete CIDSet streams
                        fontDict.removeItem(COSName.getPDFName("CIDSet"));
                        log.debug(
                                "Removed potentially invalid CIDSet from font {}", font.getName());
                    }
                } catch (Exception e) {
                    log.debug("Error processing CIDSet for font: {}", e.getMessage());
                }
            }
        }
    }

    private static void importFlattenedImages(PDDocument loDoc, PDDocument baseDoc)
            throws IOException {
        List<PDPage> loPages = new ArrayList<>(loDoc.getNumberOfPages());
        loDoc.getPages().forEach(loPages::add);
        List<PDPage> basePages = new ArrayList<>(baseDoc.getNumberOfPages());
        baseDoc.getPages().forEach(basePages::add);

        for (int i = 0; i < loPages.size(); i++) {
            PDPage loPage = loPages.get(i);
            PDPage basePage = basePages.get(i);

            PDResources loRes = loPage.getResources();
            PDResources baseRes = basePage.getResources();
            if (loRes == null || baseRes == null) continue;

            Set<COSName> toReplace = detectTransparentXObjects(basePage);

            for (COSName name : toReplace) {
                PDXObject loXo = loRes.getXObject(name);
                if (!(loXo instanceof PDImageXObject img)) continue;

                PDImageXObject newImg = LosslessFactory.createFromImage(baseDoc, img.getImage());

                // replace the resource under the same name
                baseRes.put(name, newImg);
            }
        }
    }

    private ColorProfiles prepareColorProfiles(Path workingDir) throws IOException {
        Path rgbProfile = workingDir.resolve("sRGB.icc");
        copyResourceIcc(rgbProfile);

        Path grayProfile = workingDir.resolve("Gray.icc");
        try {
            writeJavaIccProfile(ICC_Profile.getInstance(ColorSpace.CS_GRAY), grayProfile);
        } catch (IllegalArgumentException e) {
            log.warn("Falling back to sRGB ICC profile for grayscale defaults", e);
            Files.copy(rgbProfile, grayProfile, StandardCopyOption.REPLACE_EXISTING);
        }

        return new ColorProfiles(rgbProfile, grayProfile);
    }

    private static Set<COSName> detectTransparentXObjects(PDPage page) {
        Set<COSName> transparentObjects = new HashSet<>();
        PDResources res = page.getResources();
        if (res == null) return transparentObjects;

        for (COSName name : res.getXObjectNames()) {
            try {
                PDXObject xo = res.getXObject(name);
                if (xo instanceof PDImageXObject img) {
                    COSDictionary d = img.getCOSObject();
                    if (d.containsKey(COSName.SMASK)
                            || isTransparencyGroup(d)
                            || d.getBoolean(COSName.INTERPOLATE, false)) {
                        transparentObjects.add(name);
                    }
                }
            } catch (IOException ioe) {
                log.error("Error processing XObject {}: {}", name.getName(), ioe.getMessage());
            }
        }
        return transparentObjects;
    }

    /**
     * Merge fonts & flattened images from loPdfPath into basePdfPath, then run the standard
     * PDFBox/A pipeline.
     *
     * @param basePdfPath Path to the original (or highlight‐preprocessed) PDF
     * @param loPdfPath Path to the LibreOffice–flattened PDF/A, or null if not used
     * @param pdfaPart 1 (PDF/A-1B) or 2 (PDF/A-2B)
     * @return the final PDF/A bytes
     */
    private byte[] convertToPdfA(
            Path basePdfPath,
            Path loPdfPath,
            int pdfaPart,
            Set<String> missingFonts,
            boolean importImages)
            throws Exception {
        try (PDDocument baseDoc = Loader.loadPDF(basePdfPath.toFile())) {

            if (loPdfPath != null) {
                try (PDDocument loDoc = Loader.loadPDF(loPdfPath.toFile())) {
                    if (!missingFonts.isEmpty()) {
                        embedMissingFonts(loDoc, baseDoc, missingFonts);
                    }
                    if (importImages) {
                        importFlattenedImages(loDoc, baseDoc);
                    }
                }
            }
            return processWithPDFBox(baseDoc, pdfaPart);
        }
    }

    private byte[] convertWithGhostscript(Path inputPdf, Path workingDir, PdfaProfile profile)
            throws IOException, InterruptedException {
        Path outputPdf = workingDir.resolve("gs_output.pdf");
        ColorProfiles colorProfiles = prepareColorProfiles(workingDir);
        Path pdfaDefFile = createPdfaDefFile(workingDir, colorProfiles, profile);

        // Preprocess PDF for PDF/A compliance
        Path preprocessedPdf = inputPdf;

        // For PDF/A-1, clean CIDSet issues that may cause validation failures
        if (profile.getPart() == 1) {
            Path cidSetCleaned = cleanCidSetWithQpdf(inputPdf);
            if (cidSetCleaned != null) {
                preprocessedPdf = cidSetCleaned;
            }
        }

        // Normalize PDF with qpdf before Ghostscript conversion to ensure proper font program
        // handling
        Path normalizedInputPdf = normalizePdfWithQpdf(preprocessedPdf);
        Path inputForGs = (normalizedInputPdf != null) ? normalizedInputPdf : preprocessedPdf;

        try {
            List<String> command =
                    buildGhostscriptCommand(
                            inputForGs, outputPdf, colorProfiles, workingDir, profile, pdfaDefFile);

            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                            .runCommandWithOutputHandling(command);

            if (result.getRc() != 0) {
                throw new IOException("Ghostscript exited with code " + result.getRc());
            }

            if (!Files.exists(outputPdf)) {
                throw new IOException("Ghostscript did not produce an output file");
            }

            return Files.readAllBytes(outputPdf);
        } finally {
            // Clean up temporary files
            if (normalizedInputPdf != null && !normalizedInputPdf.equals(preprocessedPdf)) {
                try {
                    Files.deleteIfExists(normalizedInputPdf);
                } catch (IOException e) {
                    log.debug("Failed to delete temporary normalized file", e);
                }
            }
            if (preprocessedPdf != null && !preprocessedPdf.equals(inputPdf)) {
                try {
                    Files.deleteIfExists(preprocessedPdf);
                } catch (IOException e) {
                    log.debug("Failed to delete temporary CIDSet cleaned file", e);
                }
            }
        }
    }

    private static void fixType1FontCharSet(PDDocument document) throws IOException {
        for (PDPage page : document.getPages()) {
            PDResources resources = page.getResources();
            if (resources == null) continue;

            for (COSName fontName : resources.getFontNames()) {
                try {
                    PDFont font = resources.getFont(fontName);
                    if (font == null) continue;

                    String fontNameStr = font.getName();
                    if (fontNameStr == null) continue;

                    PDFontDescriptor descriptor = font.getFontDescriptor();
                    if (descriptor == null) continue;

                    // Check if this is a Type1 font
                    if (fontNameStr.contains("Type1")
                            || descriptor.getFontFile() != null
                            || (descriptor.getFontFile2() == null
                                    && descriptor.getFontFile3() == null)) {

                        // Check if CharSet is missing or suspicious
                        String existingCharSet =
                                descriptor.getCOSObject().getString(COSName.CHAR_SET);
                        if (existingCharSet == null || existingCharSet.trim().isEmpty()) {

                            // Build a CharSet from commonly used glyphs
                            // For Type1 fonts, include standard PDF glyphs
                            String glyphSet = buildStandardType1GlyphSet();
                            if (!glyphSet.isEmpty()) {
                                descriptor.getCOSObject().setString(COSName.CHAR_SET, glyphSet);
                                log.debug(
                                        "Fixed CharSet for Type1 font {} with {} glyphs",
                                        fontNameStr,
                                        glyphSet.split(" ").length);
                            }
                        }
                    }
                } catch (Exception e) {
                    log.warn(
                            "Error processing font descriptor for page resource: {}",
                            e.getMessage());
                }
            }
        }
    }

    private static String buildStandardType1GlyphSet() {
        Set<String> glyphNames = new LinkedHashSet<>();

        String[] standardGlyphs = {
            ".notdef",
            ".null",
            "nonmarkingreturn",
            "space",
            "exclam",
            "quotedbl",
            "numbersign",
            "dollar",
            "percent",
            "ampersand",
            "quoteright",
            "parenleft",
            "parenright",
            "asterisk",
            "plus",
            "comma",
            "hyphen",
            "period",
            "slash",
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "colon",
            "semicolon",
            "less",
            "equal",
            "greater",
            "question",
            "at",
            "A",
            "B",
            "C",
            "D",
            "E",
            "F",
            "G",
            "H",
            "I",
            "J",
            "K",
            "L",
            "M",
            "N",
            "O",
            "P",
            "Q",
            "R",
            "S",
            "T",
            "U",
            "V",
            "W",
            "X",
            "Y",
            "Z",
            "bracketleft",
            "backslash",
            "bracketright",
            "asciicircum",
            "underscore",
            "quoteleft",
            "a",
            "b",
            "c",
            "d",
            "e",
            "f",
            "g",
            "h",
            "i",
            "j",
            "k",
            "l",
            "m",
            "n",
            "o",
            "p",
            "q",
            "r",
            "s",
            "t",
            "u",
            "v",
            "w",
            "x",
            "y",
            "z",
            "braceleft",
            "bar",
            "braceright",
            "asciitilde",
            "exclamdown",
            "cent",
            "sterling",
            "currency",
            "yen",
            "brokenbar",
            "section",
            "dieresis",
            "copyright",
            "ordfeminine",
            "guillemotleft",
            "logicalnot",
            "uni00AD",
            "registered",
            "macron",
            "degree",
            "plusminus",
            "twosuperior",
            "threesuperior",
            "acute",
            "mu",
            "paragraph",
            "periodcentered",
            "cedilla",
            "onesuperior",
            "ordmasculine",
            "guillemotright",
            "onequarter",
            "onehalf",
            "threequarters",
            "questiondown",
            "Agrave",
            "Aacute",
            "Acircumflex",
            "Atilde",
            "Adieresis",
            "Aring",
            "AE",
            "Ccedilla",
            "Egrave",
            "Eacute",
            "Ecircumflex",
            "Edieresis",
            "Igrave",
            "Iacute",
            "Icircumflex",
            "Idieresis",
            "Eth",
            "Ntilde",
            "Ograve",
            "Oacute",
            "Ocircumflex",
            "Otilde",
            "Odieresis",
            "multiply",
            "Oslash",
            "Ugrave",
            "Uacute",
            "Ucircumflex",
            "Udieresis",
            "Yacute",
            "Thorn",
            "germandbls",
            "agrave",
            "aacute",
            "acircumflex",
            "atilde",
            "adieresis",
            "aring",
            "ae",
            "ccedilla",
            "egrave",
            "eacute",
            "ecircumflex",
            "edieresis",
            "igrave",
            "iacute",
            "icircumflex",
            "idieresis",
            "eth",
            "ntilde",
            "ograve",
            "oacute",
            "ocircumflex",
            "otilde",
            "odieresis",
            "divide",
            "oslash",
            "ugrave",
            "uacute",
            "ucircumflex",
            "udieresis",
            "yacute",
            "thorn",
            "ydieresis"
        };

        Collections.addAll(glyphNames, standardGlyphs);

        return String.join(" ", glyphNames);
    }

    private byte[] processWithPDFBox(PDDocument document, int pdfaPart) throws Exception {
        removeElementsForPdfA(document, pdfaPart);

        document.getDocument().setVersion(pdfaPart == 1 ? 1.4f : 1.7f);

        mergeAndAddXmpMetadata(document, pdfaPart);

        addICCProfileIfNotPresent(document);

        // Fix CIDSet issues for PDF/A compliance
        if (pdfaPart == 1) {
            fixCidSetIssues(document);
        }

        fixType1FontCharSet(document);

        PDDocumentCatalog catalog = document.getDocumentCatalog();
        catalog.setMetadata(document.getDocumentCatalog().getMetadata());

        PDViewerPreferences viewerPrefs = new PDViewerPreferences(catalog.getCOSObject());
        viewerPrefs.setDisplayDocTitle(true);
        catalog.setViewerPreferences(viewerPrefs);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        CompressParameters compressParams =
                pdfaPart == 1 ? CompressParameters.NO_COMPRESSION : new CompressParameters();

        document.save(baos, compressParams);
        log.debug("PDF/A-{} document processed with PDFBox", pdfaPart);

        return baos.toByteArray();
    }

    private Path runLibreOfficeConversion(Path tempInputFile, int pdfaPart) throws Exception {
        // Create temp output directory
        Path tempOutputDir = Files.createTempDirectory("output_");

        // Determine PDF/A filter based on requested format
        String pdfFilter =
                pdfaPart == 2
                        ? "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"2\"}}"
                        : "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"1\"}}";

        Path libreOfficeProfile = Files.createTempDirectory("libreoffice_profile_");
        try {
            // Prepare LibreOffice command
            List<String> command =
                    new ArrayList<>(
                            Arrays.asList(
                                    runtimePathConfig.getSOfficePath(),
                                    "-env:UserInstallation="
                                            + libreOfficeProfile.toUri().toString(),
                                    "--headless",
                                    "--nologo",
                                    "--convert-to",
                                    pdfFilter,
                                    "--outdir",
                                    tempOutputDir.toString(),
                                    tempInputFile.toString()));

            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                            .runCommandWithOutputHandling(command);

            if (returnCode.getRc() != 0) {
                log.error("PDF/A conversion failed with return code: {}", returnCode.getRc());
                throw ExceptionUtils.createPdfaConversionFailedException();
            }
        } finally {
            FileUtils.deleteQuietly(libreOfficeProfile.toFile());
        }

        // Get the output file
        File[] outputFiles = tempOutputDir.toFile().listFiles();
        if (outputFiles == null || outputFiles.length != 1) {
            throw ExceptionUtils.createPdfaConversionFailedException();
        }
        return outputFiles[0].toPath();
    }

    private byte[] convertWithGhostscriptX(Path inputPdf, Path workingDir, PdfXProfile profile)
            throws IOException, InterruptedException {
        Path outputPdf = workingDir.resolve("gs_output_pdfx.pdf");
        ColorProfiles colorProfiles = prepareColorProfiles(workingDir);

        List<String> command =
                buildGhostscriptCommandX(inputPdf, outputPdf, colorProfiles, workingDir, profile);

        ProcessExecutorResult result =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                        .runCommandWithOutputHandling(command);

        if (result.getRc() != 0) {
            throw new IOException("Ghostscript exited with code " + result.getRc());
        }

        if (!Files.exists(outputPdf)) {
            throw new IOException("Ghostscript did not produce an output file");
        }

        return Files.readAllBytes(outputPdf);
    }

    private static boolean isTransparencyGroup(COSDictionary dict) {
        COSBase g = dict.getDictionaryObject(COSName.GROUP);
        return g instanceof COSDictionary gd
                && COSName.TRANSPARENCY.equals(gd.getCOSName(COSName.S));
    }

    private static boolean hasTransparentImages(PDDocument doc) {
        for (PDPage page : doc.getPages()) {
            PDResources res = page.getResources();
            if (res == null) continue;
            for (COSName name : res.getXObjectNames()) {
                try {
                    PDXObject xo = res.getXObject(name);
                    if (xo instanceof PDImageXObject img) {
                        COSDictionary dict = img.getCOSObject();
                        if (dict.containsKey(COSName.SMASK)) return true;
                        COSBase g = dict.getDictionaryObject(COSName.GROUP);
                        if (g instanceof COSDictionary gd
                                && COSName.TRANSPARENCY.equals(gd.getCOSName(COSName.S))) {
                            return true;
                        }
                        if (dict.getBoolean(COSName.INTERPOLATE, false)) return true;
                    }
                } catch (IOException ioe) {
                    log.error("Error processing XObject {}: {}", name.getName(), ioe.getMessage());
                }
            }
        }
        return false;
    }

    private static void sanitizePdfA(COSBase base, int pdfaPart) {
        if (base instanceof COSDictionary dict) {
            if (pdfaPart == 1) {
                COSBase group = dict.getDictionaryObject(COSName.GROUP);
                if (group instanceof COSDictionary gDict
                        && COSName.TRANSPARENCY.equals(gDict.getCOSName(COSName.S))) {
                    dict.removeItem(COSName.GROUP);
                }

                dict.removeItem(COSName.SMASK);
                dict.removeItem(COSName.CA);
                dict.removeItem(COSName.getPDFName("ca"));
            }

            if (dict.containsKey(COSName.INTERPOLATE)
                    && dict.getBoolean(COSName.INTERPOLATE, true)) {
                dict.setBoolean(COSName.INTERPOLATE, false);
            }

            dict.removeItem(COSName.JAVA_SCRIPT);
            dict.removeItem(COSName.getPDFName("JS"));
            dict.removeItem(COSName.getPDFName("RichMedia"));
            dict.removeItem(COSName.getPDFName("Movie"));
            dict.removeItem(COSName.getPDFName("Sound"));
            dict.removeItem(COSName.getPDFName("Launch"));
            dict.removeItem(COSName.URI);
            dict.removeItem(COSName.getPDFName("GoToR"));
            dict.removeItem(COSName.EMBEDDED_FILES);
            dict.removeItem(COSName.FILESPEC);

            for (Map.Entry<COSName, COSBase> entry : dict.entrySet()) {
                sanitizePdfA(entry.getValue(), pdfaPart);
            }

        } else if (base instanceof COSArray arr) {
            for (COSBase item : arr) {
                sanitizePdfA(item, pdfaPart);
            }
        }
    }

    private static void removeElementsForPdfA(PDDocument doc, int pdfaPart) {

        if (pdfaPart == 1) {
            doc.getDocumentCatalog().getCOSObject().removeItem(COSName.getPDFName("OCProperties"));
        }

        for (PDPage page : doc.getPages()) {
            if (pdfaPart == 1) {
                page.setAnnotations(Collections.emptyList());
            }
            PDResources res = page.getResources();
            sanitizePdfA(page.getCOSObject(), pdfaPart);

            if (res != null) {
                for (COSName name : res.getXObjectNames()) {
                    try {
                        PDXObject xo = res.getXObject(name);
                        if (xo instanceof PDFormXObject form) {
                            sanitizePdfA(form.getCOSObject(), pdfaPart);
                        } else if (xo instanceof PDImageXObject img) {
                            sanitizePdfA(img.getCOSObject(), pdfaPart);
                        }
                    } catch (IOException ioe) {
                        log.error("Cannot load XObject {}: {}", name.getName(), ioe.getMessage());
                    }
                }
            }
        }
    }

    /** Embbeds the XMP metadata required for PDF/A compliance. */
    private static void mergeAndAddXmpMetadata(PDDocument document, int pdfaPart) throws Exception {
        PDMetadata existingMetadata = document.getDocumentCatalog().getMetadata();
        XMPMetadata xmp;

        if (existingMetadata != null) {
            try (InputStream xmpStream = existingMetadata.createInputStream()) {
                DomXmpParser parser = new DomXmpParser();
                parser.setStrictParsing(false);
                xmp = parser.parse(xmpStream);
            } catch (Exception e) {
                xmp = XMPMetadata.createXMPMetadata();
            }
        } else {
            xmp = XMPMetadata.createXMPMetadata();
        }

        PDDocumentInformation docInfo = document.getDocumentInformation();
        if (docInfo == null) {
            docInfo = new PDDocumentInformation();
        }

        String originalCreator = Optional.ofNullable(docInfo.getCreator()).orElse("Unknown");
        String originalProducer = Optional.ofNullable(docInfo.getProducer()).orElse("Unknown");

        DublinCoreSchema dcSchema = xmp.getDublinCoreSchema();
        if (dcSchema != null) {
            List<String> existingCreators = dcSchema.getCreators();
            if (existingCreators != null) {
                for (String creator : new ArrayList<>(existingCreators)) {
                    dcSchema.removeCreator(creator);
                }
            }
        } else {
            dcSchema = xmp.createAndAddDublinCoreSchema();
        }
        dcSchema.addCreator(originalCreator);

        PDFAIdentificationSchema pdfaSchema =
                (PDFAIdentificationSchema) xmp.getSchema(PDFAIdentificationSchema.class);
        if (pdfaSchema == null) {
            pdfaSchema = xmp.createAndAddPDFAIdentificationSchema();
        }
        pdfaSchema.setPart(pdfaPart);
        pdfaSchema.setConformance("B");

        XMPBasicSchema xmpBasicSchema = xmp.getXMPBasicSchema();
        if (xmpBasicSchema == null) {
            xmpBasicSchema = xmp.createAndAddXMPBasicSchema();
        }

        AdobePDFSchema adobePdfSchema = xmp.getAdobePDFSchema();
        if (adobePdfSchema == null) {
            adobePdfSchema = xmp.createAndAddAdobePDFSchema();
        }

        docInfo.setCreator(originalCreator);
        xmpBasicSchema.setCreatorTool(originalCreator);

        docInfo.setProducer(originalProducer);
        adobePdfSchema.setProducer(originalProducer);

        String originalAuthor = docInfo.getAuthor();
        if (originalAuthor != null && !originalAuthor.isBlank()) {
            docInfo.setAuthor(null);
            if (!originalCreator.equals(originalAuthor)) {
                dcSchema.addCreator(originalAuthor);
            }
        }

        String title = docInfo.getTitle();
        if (title != null && !title.isBlank()) {
            dcSchema.setTitle(title);
        }
        String subject = docInfo.getSubject();
        if (subject != null && !subject.isBlank()) {
            dcSchema.addSubject(subject);
        }
        String keywords = docInfo.getKeywords();
        if (keywords != null && !keywords.isBlank()) {
            adobePdfSchema.setKeywords(keywords);
        }

        Instant nowInstant = Instant.now();
        ZonedDateTime nowZdt = ZonedDateTime.ofInstant(nowInstant, ZoneId.of("UTC"));

        Instant creationInstant;
        Calendar originalCreationDate = docInfo.getCreationDate();
        if (originalCreationDate != null) {
            creationInstant = originalCreationDate.toInstant();
        } else {
            creationInstant = nowInstant;
        }
        ZonedDateTime creationZdt = ZonedDateTime.ofInstant(creationInstant, ZoneId.of("UTC"));

        GregorianCalendar creationCal = GregorianCalendar.from(creationZdt);
        GregorianCalendar modificationCal = GregorianCalendar.from(nowZdt);

        docInfo.setCreationDate(creationCal);
        xmpBasicSchema.setCreateDate(creationCal);

        docInfo.setModificationDate(modificationCal);
        xmpBasicSchema.setModifyDate(modificationCal);
        xmpBasicSchema.setMetadataDate(modificationCal);

        ByteArrayOutputStream xmpOut = new ByteArrayOutputStream();
        new XmpSerializer().serialize(xmp, xmpOut, true);

        PDMetadata newMetadata = new PDMetadata(document);
        newMetadata.importXMPMetadata(xmpOut.toByteArray());
        document.getDocumentCatalog().setMetadata(newMetadata);
    }

    private static File preProcessHighlights(File inputPdf) throws Exception {

        try (PDDocument document = Loader.loadPDF(inputPdf)) {

            for (PDPage page : document.getPages()) {
                List<PDAnnotation> annotations = page.getAnnotations();
                for (PDAnnotation annot : annotations) {
                    if ("Highlight".equals(annot.getSubtype())
                            && annot instanceof PDAnnotationTextMarkup highlight) {
                        float[] colorComponents =
                                highlight.getColor() != null
                                        ? highlight.getColor().getComponents()
                                        : new float[] {1f, 1f, 0f};
                        Color highlightColor =
                                new Color(
                                        colorComponents[0], colorComponents[1], colorComponents[2]);

                        float[] quadPoints = highlight.getQuadPoints();
                        if (quadPoints != null) {
                            try (PDPageContentStream cs =
                                    new PDPageContentStream(
                                            document,
                                            page,
                                            PDPageContentStream.AppendMode.PREPEND,
                                            true,
                                            true)) {

                                cs.setStrokingColor(highlightColor);
                                cs.setLineWidth(0.05f);
                                float spacing = 2f;
                                for (int i = 0; i < quadPoints.length; i += 8) {
                                    float minX =
                                            Math.min(
                                                    Math.min(quadPoints[i], quadPoints[i + 2]),
                                                    Math.min(quadPoints[i + 4], quadPoints[i + 6]));
                                    float maxX =
                                            Math.max(
                                                    Math.max(quadPoints[i], quadPoints[i + 2]),
                                                    Math.max(quadPoints[i + 4], quadPoints[i + 6]));
                                    float minY =
                                            Math.min(
                                                    Math.min(quadPoints[i + 1], quadPoints[i + 3]),
                                                    Math.min(quadPoints[i + 5], quadPoints[i + 7]));
                                    float maxY =
                                            Math.max(
                                                    Math.max(quadPoints[i + 1], quadPoints[i + 3]),
                                                    Math.max(quadPoints[i + 5], quadPoints[i + 7]));

                                    float width = maxX - minX;
                                    float height = maxY - minY;

                                    for (float y = minY; y <= maxY; y += spacing) {
                                        float len = Math.min(width, maxY - y);
                                        cs.moveTo(minX, y);
                                        cs.lineTo(minX + len, y + len);
                                    }
                                    for (float x = minX + spacing; x <= maxX; x += spacing) {
                                        float len = Math.min(maxX - x, height);
                                        cs.moveTo(x, minY);
                                        cs.lineTo(x + len, minY + len);
                                    }
                                }

                                cs.stroke();
                            }
                        }

                        page.getAnnotations().remove(highlight);
                        COSDictionary pageDict = page.getCOSObject();

                        if (pageDict.containsKey(COSName.GROUP)) {
                            COSDictionary groupDict =
                                    (COSDictionary) pageDict.getDictionaryObject(COSName.GROUP);

                            if (groupDict != null
                                    && COSName.TRANSPARENCY
                                            .getName()
                                            .equalsIgnoreCase(
                                                    groupDict.getNameAsString(COSName.S))) {
                                pageDict.removeItem(COSName.GROUP);
                            }
                        }
                    }
                }
            }
            // Save the modified document to a temporary file.
            File preProcessedFile = Files.createTempFile("preprocessed_", ".pdf").toFile();
            document.save(preProcessedFile);
            return preProcessedFile;
        }
    }

    private ResponseEntity<byte[]> handlePdfAConversion(
            MultipartFile inputFile, String outputFormat) throws Exception {
        PdfaProfile profile = PdfaProfile.fromRequest(outputFormat);

        // Get the original filename without extension
        String originalFileName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFileName == null || originalFileName.trim().isEmpty()) {
            originalFileName = "output.pdf";
        }
        String baseFileName =
                originalFileName.contains(".")
                        ? originalFileName.substring(0, originalFileName.lastIndexOf('.'))
                        : originalFileName;

        Path workingDir = Files.createTempDirectory("pdfa_conversion_");
        Path inputPath = workingDir.resolve("input.pdf");
        inputFile.transferTo(inputPath);

        try {
            byte[] converted;

            // Try Ghostscript first (preferred method)
            if (isGhostscriptAvailable()) {
                log.info("Using Ghostscript for PDF/A conversion to {}", profile.getDisplayName());
                try {
                    converted = convertWithGhostscript(inputPath, workingDir, profile);
                    String outputFilename = baseFileName + profile.outputSuffix();

                    validateAndWarnPdfA(converted, profile, "Ghostscript");

                    return WebResponseUtils.bytesToWebResponse(
                            converted, outputFilename, MediaType.APPLICATION_PDF);
                } catch (Exception e) {
                    log.warn(
                            "Ghostscript conversion failed, falling back to PDFBox/LibreOffice method",
                            e);
                }
            } else {
                log.info("Ghostscript not available, using PDFBox/LibreOffice fallback method");
            }

            converted = convertWithPdfBoxMethod(inputPath, profile);
            String outputFilename = baseFileName + profile.outputSuffix();

            // Validate with PDFBox preflight and warn if issues found
            validateAndWarnPdfA(converted, profile, "PDFBox/LibreOffice");

            return WebResponseUtils.bytesToWebResponse(
                    converted, outputFilename, MediaType.APPLICATION_PDF);

        } finally {
            deleteQuietly(workingDir);
        }
    }

    private Path normalizePdfWithQpdf(Path inputPdf) {
        try {
            ProcessExecutorResult checkResult =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                            .runCommandWithOutputHandling(Arrays.asList("qpdf", "--version"));

            if (checkResult.getRc() != 0) {
                log.debug("QPDF not available");
                return null;
            }

            Path normalizedPdf =
                    inputPdf.getParent().resolve("normalized_" + inputPdf.getFileName().toString());

            List<String> command =
                    Arrays.asList(
                            "qpdf",
                            "--normalize-content=y",
                            "--object-streams=preserve",
                            inputPdf.toAbsolutePath().toString(),
                            normalizedPdf.toAbsolutePath().toString());

            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                            .runCommandWithOutputHandling(command);

            if (result.getRc() == 0 && Files.exists(normalizedPdf)) {
                log.info("PDF normalized with QPDF to fix font programs and CIDSet issues");
                return normalizedPdf;
            }
            return null;

        } catch (Exception e) {
            log.debug("QPDF normalization error: {}", e.getMessage());
            return null;
        }
    }

    private Path cleanCidSetWithQpdf(Path inputPdf) {
        try {
            ProcessExecutorResult checkResult =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                            .runCommandWithOutputHandling(Arrays.asList("qpdf", "--version"));

            if (checkResult.getRc() != 0) {
                log.debug("QPDF not available for CIDSet cleaning");
                return null;
            }

            Path cleanedPdf =
                    inputPdf.getParent()
                            .resolve("cidset_cleaned_" + inputPdf.getFileName().toString());

            // Use QPDF to remove problematic CIDSet entries that may be incomplete
            List<String> command =
                    Arrays.asList(
                            "qpdf",
                            "--remove-unreferenced-resources=yes",
                            "--normalize-content=y",
                            "--object-streams=preserve",
                            inputPdf.toAbsolutePath().toString(),
                            cleanedPdf.toAbsolutePath().toString());

            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                            .runCommandWithOutputHandling(command);

            if (result.getRc() == 0 && Files.exists(cleanedPdf)) {
                log.info("PDF CIDSet cleaned with QPDF");
                return cleanedPdf;
            }
            return null;

        } catch (Exception e) {
            log.debug("QPDF CIDSet cleaning error: {}", e.getMessage());
            return null;
        }
    }

    private byte[] convertWithPdfBoxMethod(Path inputPath, PdfaProfile profile) throws Exception {
        Path tempInputFile = null;
        byte[] fileBytes;
        Path loPdfPath = null;
        File preProcessedFile = null;
        int pdfaPart = profile.getPart();
        Path normalizedPath = null;

        try {
            tempInputFile = inputPath;

            normalizedPath = normalizePdfWithQpdf(tempInputFile);
            if (normalizedPath != null) {
                tempInputFile = normalizedPath;
            }

            if (pdfaPart == 2 || pdfaPart == 3) {
                preProcessedFile = tempInputFile.toFile();
            } else {
                preProcessedFile = preProcessHighlights(tempInputFile.toFile());
            }

            Set<String> missingFonts;
            boolean needImgs;
            try (PDDocument doc = Loader.loadPDF(preProcessedFile)) {
                missingFonts = findUnembeddedFontNames(doc);
                needImgs = (pdfaPart == 1) && hasTransparentImages(doc);
                if (!missingFonts.isEmpty() || needImgs) {
                    loPdfPath = runLibreOfficeConversion(preProcessedFile.toPath(), pdfaPart);
                }
            }
            fileBytes =
                    convertToPdfA(
                            preProcessedFile.toPath(), loPdfPath, pdfaPart, missingFonts, needImgs);

            return fileBytes;

        } finally {
            if (loPdfPath != null && loPdfPath.getParent() != null) {
                FileUtils.deleteDirectory(loPdfPath.getParent().toFile());
            }
            if (preProcessedFile != null && !preProcessedFile.equals(tempInputFile.toFile())) {
                Files.deleteIfExists(preProcessedFile.toPath());
            }
            if (normalizedPath != null && !normalizedPath.equals(inputPath)) {
                Files.deleteIfExists(normalizedPath);
            }
        }
    }

    private void copyResourceIcc(Path target) throws IOException {
        try (InputStream in = getClass().getResourceAsStream(ICC_RESOURCE_PATH)) {
            if (in == null) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.resourceNotFound", "Resource not found: {0}", ICC_RESOURCE_PATH);
            }
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private void addICCProfileIfNotPresent(PDDocument document) {
        if (document.getDocumentCatalog().getOutputIntents().isEmpty()) {
            try (InputStream colorProfile = getClass().getResourceAsStream(ICC_RESOURCE_PATH)) {
                if (colorProfile == null) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.resourceNotFound", "Resource not found: {0}", ICC_RESOURCE_PATH);
                }
                PDOutputIntent outputIntent = new PDOutputIntent(document, colorProfile);
                // PDF/A compliant output intent settings
                outputIntent.setInfo("sRGB IEC61966-2.1");
                outputIntent.setOutputCondition("sRGB IEC61966-2.1");
                outputIntent.setOutputConditionIdentifier("sRGB IEC61966-2.1");
                outputIntent.setRegistryName("http://www.color.org");
                document.getDocumentCatalog().addOutputIntent(outputIntent);
                log.debug("Added ICC color profile for PDF/A compliance");
            } catch (Exception e) {
                log.error("Failed to load ICC profile: {}", e.getMessage());
                throw new RuntimeException("ICC profile loading failed for PDF/A compliance", e);
            }
        }
    }

    @Getter
    private enum PdfaProfile {
        PDF_A_1B(1, "PDF/A-1b", "_PDFA-1b.pdf", "1.4", Format.PDF_A1B, "pdfa-1"),
        PDF_A_2B(2, "PDF/A-2b", "_PDFA-2b.pdf", "1.7", null, "pdfa", "pdfa-2", "pdfa-2b"),
        PDF_A_3B(3, "PDF/A-3b", "_PDFA-3b.pdf", "1.7", null, "pdfa-3", "pdfa-3b");

        private final int part;
        private final String displayName;
        private final String suffix;
        private final String compatibilityLevel;
        private final Format preflightFormat;
        private final List<String> requestTokens;

        PdfaProfile(
                int part,
                String displayName,
                String suffix,
                String compatibilityLevel,
                Format preflightFormat,
                String... requestTokens) {
            this.part = part;
            this.displayName = displayName;
            this.suffix = suffix;
            this.compatibilityLevel = compatibilityLevel;
            this.preflightFormat = preflightFormat;
            this.requestTokens =
                    Arrays.stream(requestTokens)
                            .map(token -> token.toLowerCase(Locale.ROOT))
                            .toList();
        }

        static PdfaProfile fromRequest(String requestToken) {
            if (requestToken == null) {
                return PDF_A_2B;
            }
            String normalized = requestToken.trim().toLowerCase(Locale.ROOT);
            Optional<PdfaProfile> match =
                    Arrays.stream(values())
                            .filter(profile -> profile.requestTokens.contains(normalized))
                            .findFirst();

            return match.orElse(PDF_A_2B);
        }

        String outputSuffix() {
            return suffix;
        }

        Optional<Format> preflightFormat() {
            return Optional.ofNullable(preflightFormat);
        }
    }

    @Getter
    private enum PdfXProfile {
        PDF_X_1("PDF/X-1", "_PDFX-1.pdf", "1.3", "2001", "pdfx-1", "pdfx"),
        PDF_X_3("PDF/X-3", "_PDFX-3.pdf", "1.3", "2003", "pdfx-3"),
        PDF_X_4("PDF/X-4", "_PDFX-4.pdf", "1.4", "2008", "pdfx-4");

        private final String displayName;
        private final String suffix;
        private final String compatibilityLevel;
        private final String pdfxVersion;
        private final List<String> requestTokens;

        PdfXProfile(
                String displayName,
                String suffix,
                String compatibilityLevel,
                String pdfxVersion,
                String... requestTokens) {
            this.displayName = displayName;
            this.suffix = suffix;
            this.compatibilityLevel = compatibilityLevel;
            this.pdfxVersion = pdfxVersion;
            this.requestTokens =
                    Arrays.stream(requestTokens)
                            .map(token -> token.toLowerCase(Locale.ROOT))
                            .toList();
        }

        static PdfXProfile fromRequest(String requestToken) {
            if (requestToken == null) {
                return PDF_X_4;
            }
            String normalized = requestToken.trim().toLowerCase(Locale.ROOT);
            Optional<PdfXProfile> match =
                    Arrays.stream(values())
                            .filter(profile -> profile.requestTokens.contains(normalized))
                            .findFirst();

            return match.orElse(PDF_X_4);
        }

        String outputSuffix() {
            return suffix;
        }
    }

    private record ColorProfiles(Path rgb, Path gray) {}
}
