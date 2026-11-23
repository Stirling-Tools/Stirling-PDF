package stirling.software.SPDF.controller.api.converters;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.Locale;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.OfficeToPdfService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.OfficeDocumentSanitizer;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@RequiredArgsConstructor
@Slf4j
public class ConvertOfficeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final OfficeDocumentSanitizer officeDocumentSanitizer;
    private final TempFileManager tempFileManager;
    private final OfficeToPdfService officeToPdfService;

    public File convertToPdf(MultipartFile inputFile) throws IOException {
        // Check for valid file extension and sanitize filename
        String originalFilename = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFilename == null || originalFilename.isBlank()) {
            throw ExceptionUtils.createFileNoNameException();
        }

        // Check for valid file extension
        String extension = FilenameUtils.getExtension(originalFilename);
        if (extension == null || !isValidFileExtension(extension)) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalid.extension", "Invalid file extension: " + extension);
        }
        String extensionLower = extension.toLowerCase(Locale.ROOT);
        if (!OfficeToPdfService.handles(extensionLower)) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.unsupportedOfficeFormat",
                    "Files of type .{0} cannot be converted to PDF",
                    extensionLower);
        }

        String baseName = FilenameUtils.getBaseName(originalFilename);
        if (baseName == null || baseName.isBlank()) {
            baseName = "input";
        }

        // The caller deletes it on success: the returned PDF lives in it.
        Path workDir = Files.createTempDirectory("office2pdf_");
        boolean converted = false;
        try {
            File pdf = convertInWorkDir(inputFile, extensionLower, baseName, workDir);
            converted = true;
            return pdf;
        } finally {
            if (!converted) {
                FileUtils.deleteQuietly(workDir.toFile());
            }
        }
    }

    private File convertInWorkDir(
            MultipartFile inputFile, String extension, String baseName, Path workDir)
            throws IOException {
        Path inputPath = workDir.resolve(baseName + "." + extension);
        Path outputPath = workDir.resolve(baseName + ".pdf");
        // OLE2 binaries are copied as-is: the ZIP sanitizer cannot read a compound file.
        if (!isLegacyBinaryOffice(inputFile)
                && officeDocumentSanitizer.isSanitizableExtension(extension)) {
            byte[] sanitized;
            try {
                sanitized = officeDocumentSanitizer.sanitize(inputFile.getBytes(), extension);
            } catch (IOException e) {
                OfficeToPdfService.rejectUnreadable(e);
                throw e;
            }
            Files.write(inputPath, sanitized);
        } else {
            try (InputStream in = inputFile.getInputStream()) {
                Files.copy(in, inputPath, StandardCopyOption.REPLACE_EXISTING);
            }
        }
        try {
            officeToPdfService.convert(inputPath, outputPath);
        } finally {
            Files.deleteIfExists(inputPath);
        }
        return outputPath.toFile();
    }

    private boolean isValidFileExtension(String fileExtension) {
        return RegexPatternUtils.getInstance()
                .getFileExtensionValidationPattern()
                .matcher(fileExtension)
                .matches();
    }

    // OLE2 compound-file signature: the start of every legacy binary Office document (.doc, .xls,
    // .ppt and their variants).
    private static final byte[] OLE2_SIGNATURE = {
        (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1
    };

    private static boolean isLegacyBinaryOffice(MultipartFile file) throws IOException {
        try (InputStream in = file.getInputStream()) {
            return Arrays.equals(in.readNBytes(OLE2_SIGNATURE.length), OLE2_SIGNATURE);
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/file/pdf",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(accepts = ToolFormat.ANY, produces = ToolFormat.PDF)
    @Operation(
            summary = "Convert office documents (Word, Excel, PowerPoint, OpenDocument) to PDF",
            description =
                    "Converts Word, Excel, PowerPoint, OpenDocument, RTF, CSV and text"
                            + " files with Stirling Office Convert. For web pages use"
                            + " html-to-pdf.")
    public ResponseEntity<Resource> processFileToPDF(@ModelAttribute GeneralFile generalFile)
            throws Exception {
        MultipartFile inputFile = generalFile.getFileInput();
        File file = null;
        TempFile tempOut = null;
        try {
            file = convertToPdf(inputFile);

            tempOut = tempFileManager.createManagedTempFile(".pdf");
            try (PDDocument doc = pdfDocumentFactory.load(file)) {
                doc.save(tempOut.getFile());
            }
            String filename =
                    GeneralUtils.generateFilename(inputFile.getOriginalFilename(), ".pdf");
            ResponseEntity<Resource> response =
                    WebResponseUtils.pdfFileToWebResponse(tempOut, filename);
            tempOut = null;
            return response;
        } catch (Exception e) {
            if (tempOut != null) {
                tempOut.close();
            }
            throw e;
        } finally {
            if (file != null && file.getParent() != null) {
                FileUtils.deleteDirectory(file.getParentFile());
            }
        }
    }
}
