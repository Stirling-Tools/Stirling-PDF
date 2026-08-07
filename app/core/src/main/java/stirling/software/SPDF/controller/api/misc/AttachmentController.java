package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import java.util.Optional;

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

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.controller.api.converters.ConvertPDFToPDFA;
import stirling.software.SPDF.model.api.misc.AddAttachmentRequest;
import stirling.software.SPDF.model.api.misc.BatchAttachmentRequest;
import stirling.software.SPDF.model.api.misc.DeleteAttachmentRequest;
import stirling.software.SPDF.model.api.misc.ExtractAttachmentsRequest;
import stirling.software.SPDF.model.api.misc.ExtractSingleAttachmentRequest;
import stirling.software.SPDF.model.api.misc.ListAttachmentsRequest;
import stirling.software.SPDF.model.api.misc.RenameAttachmentRequest;
import stirling.software.SPDF.service.AttachmentServiceInterface;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class AttachmentController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final AttachmentServiceInterface pdfAttachmentService;

    private final ConvertPDFToPDFA convertPDFToPDFA;

    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/add-attachments",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Add attachments to PDF",
            description = "This endpoint adds attachments to a PDF.")
    public ResponseEntity<Resource> addAttachments(@ModelAttribute AddAttachmentRequest request)
            throws Exception {
        MultipartFile fileInput = request.getFileInput();
        List<MultipartFile> attachments = request.getAttachments();
        boolean convertToPdfA3b = request.isConvertToPdfA3b();

        validateAttachmentRequest(attachments);

        String originalFileName = Filenames.toSimpleFileName(fileInput.getOriginalFilename());
        if (originalFileName == null || originalFileName.isEmpty()) {
            originalFileName = "document";
        }
        String baseFileName =
                originalFileName.contains(".")
                        ? originalFileName.substring(0, originalFileName.lastIndexOf('.'))
                        : originalFileName;

        if (convertToPdfA3b) {
            byte[] pdfaBytes;
            try (PDDocument document = pdfDocumentFactory.load(request, false)) {
                pdfaBytes = convertPDFToPDFA.convertPDDocumentToPDFA(document, "pdfa-3b");
            }

            try (PDDocument pdfaDocument = org.apache.pdfbox.Loader.loadPDF(pdfaBytes)) {
                pdfAttachmentService.addAttachment(pdfaDocument, attachments);

                convertPDFToPDFA.ensureEmbeddedFileCompliance(pdfaDocument);

                ConvertPDFToPDFA.fixType1FontCharSet(pdfaDocument);

                String outputFilename = baseFileName + "_with_attachments_PDFA-3b.pdf";
                return WebResponseUtils.pdfDocToWebResponse(
                        pdfaDocument, outputFilename, tempFileManager);
            }
        } else {
            try (PDDocument document = pdfDocumentFactory.load(request, false)) {
                pdfAttachmentService.addAttachment(document, attachments);
                return WebResponseUtils.pdfDocToWebResponse(
                        document,
                        GeneralUtils.generateFilename(
                                Filenames.toSimpleFileName(fileInput.getOriginalFilename()),
                                "_with_attachments.pdf"),
                        tempFileManager);
            }
        }
    }

    private void validateAttachmentRequest(List<MultipartFile> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.attachmentsRequired", "At least one attachment is required");
        }

        final long maxAttachmentSize = 50L * 1024 * 1024; // 50 MB per attachment
        final long maxTotalSize = 200L * 1024 * 1024; // 200 MB total

        long totalSize = 0;
        for (MultipartFile attachment : attachments) {
            if (attachment == null || attachment.isEmpty()) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.attachmentEmpty", "Attachment files cannot be null or empty");
            }
            if (attachment.getSize() > maxAttachmentSize) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.attachmentTooLarge",
                        "Attachment ''{0}'' exceeds maximum size of {1} bytes",
                        attachment.getOriginalFilename(),
                        maxAttachmentSize);
            }
            totalSize += attachment.getSize();
        }

        if (totalSize > maxTotalSize) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.totalAttachmentsTooLarge",
                    "Total attachment size {0} exceeds maximum of {1} bytes",
                    totalSize,
                    maxTotalSize);
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/extract-attachments",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @ToolIO(produces = ToolFormat.ZIP)
    @Operation(
            summary = "Extract attachments from PDF",
            description =
                    "This endpoint extracts all embedded attachments from a PDF into a ZIP archive.")
    public ResponseEntity<Resource> extractAttachments(
            @ModelAttribute ExtractAttachmentsRequest request) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(request, true)) {
            Optional<byte[]> extracted = pdfAttachmentService.extractAttachments(document);

            if (extracted.isEmpty()) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.noAttachmentsFound",
                        "No embedded attachments found in the provided PDF");
            }

            MultipartFile fileInput = request.getFileInput();
            String sourceName =
                    fileInput != null ? fileInput.getOriginalFilename() : request.getFileId();
            String outputName =
                    Filenames.toSimpleFileName(
                            GeneralUtils.generateFilename(sourceName, "_attachments.zip"));

            TempFile tempOut = tempFileManager.createManagedTempFile(".zip");
            try {
                Files.write(tempOut.getFile().toPath(), extracted.get());
            } catch (IOException e) {
                tempOut.close();
                throw e;
            }
            return WebResponseUtils.zipFileToWebResponse(tempOut, outputName);
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/list-attachments",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @ToolIO(produces = ToolFormat.JSON)
    @Operation(
            summary = "List attachments in PDF",
            description = "This endpoint lists all embedded attachments in a PDF.")
    public ResponseEntity<List<stirling.software.SPDF.model.api.misc.AttachmentInfo>>
            listAttachments(@ModelAttribute ListAttachmentsRequest request) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(request, true)) {
            List<stirling.software.SPDF.model.api.misc.AttachmentInfo> attachments =
                    pdfAttachmentService.listAttachments(document);

            return ResponseEntity.ok(attachments);
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/rename-attachment",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Rename attachment in PDF",
            description = "This endpoint renames an embedded attachment in a PDF.")
    public ResponseEntity<Resource> renameAttachment(
            @ModelAttribute RenameAttachmentRequest request) throws Exception {
        MultipartFile fileInput = request.getFileInput();
        String attachmentName = request.getAttachmentName();
        String newName = request.getNewName();

        if (attachmentName == null || attachmentName.isBlank()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.attachmentNameRequired", "Attachment name cannot be null or empty");
        }
        if (newName == null || newName.isBlank()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.newNameRequired", "New attachment name cannot be null or empty");
        }

        try (PDDocument document = pdfDocumentFactory.load(request, false)) {
            pdfAttachmentService.renameAttachment(document, attachmentName, newName);

            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(
                            Filenames.toSimpleFileName(fileInput.getOriginalFilename()),
                            "_attachment_renamed.pdf"),
                    tempFileManager);
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/delete-attachment",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Delete attachment from PDF",
            description = "This endpoint deletes an embedded attachment from a PDF.")
    public ResponseEntity<Resource> deleteAttachment(
            @ModelAttribute DeleteAttachmentRequest request) throws Exception {
        MultipartFile fileInput = request.getFileInput();
        String attachmentName = request.getAttachmentName();

        if (attachmentName == null || attachmentName.isBlank()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.attachmentNameRequired", "Attachment name cannot be null or empty");
        }

        try (PDDocument document = pdfDocumentFactory.load(request, false)) {
            pdfAttachmentService.deleteAttachment(document, attachmentName);

            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(
                            Filenames.toSimpleFileName(fileInput.getOriginalFilename()),
                            "_attachment_deleted.pdf"),
                    tempFileManager);
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/extract-single-attachment",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @ToolIO(produces = ToolFormat.ANY)
    @Operation(
            summary = "Extract a single attachment from PDF",
            description = "This endpoint extracts a single embedded attachment from a PDF by name.")
    public ResponseEntity<Resource> extractSingleAttachment(
            @ModelAttribute ExtractSingleAttachmentRequest request) throws IOException {
        String attachmentName = request.getAttachmentName();
        if (attachmentName == null || attachmentName.isBlank()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.attachmentNameRequired", "Attachment name cannot be null or empty");
        }

        try (PDDocument document = pdfDocumentFactory.load(request, true)) {
            Optional<byte[]> extracted =
                    pdfAttachmentService.extractSingleAttachment(document, attachmentName);

            if (extracted.isEmpty()) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.attachmentNotFound",
                        "Attachment ''{0}'' not found in the provided PDF",
                        attachmentName);
            }

            String simpleName = Filenames.toSimpleFileName(attachmentName);
            TempFile tempOut = tempFileManager.createManagedTempFile(".bin");
            try {
                Files.write(tempOut.getFile().toPath(), extracted.get());
            } catch (IOException e) {
                tempOut.close();
                throw e;
            }

            return WebResponseUtils.fileToWebResponse(
                    tempOut, simpleName, MediaType.APPLICATION_OCTET_STREAM);
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/batch-process-attachments",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Batch process attachments in PDF",
            description =
                    "This endpoint applies atomic batch renames, deletions, and additions to PDF attachments in a single pass.")
    public ResponseEntity<Resource> batchProcessAttachments(
            @ModelAttribute BatchAttachmentRequest request) throws Exception {
        MultipartFile fileInput = request.getFileInput();
        String opsJson = request.getOpsJson();
        List<MultipartFile> additions = request.getAttachments();
        boolean convertToPdfA3b = request.isConvertToPdfA3b();

        com.fasterxml.jackson.databind.ObjectMapper mapper =
                new com.fasterxml.jackson.databind.ObjectMapper();
        BatchOpsData opsData = null;
        if (opsJson != null && !opsJson.isBlank()) {
            try {
                opsData = mapper.readValue(opsJson, BatchOpsData.class);
            } catch (Exception e) {
                log.warn(
                        "Failed to parse opsJson for batch attachment processing: {}",
                        e.getMessage());
            }
        }

        try (PDDocument document = pdfDocumentFactory.load(request, false)) {
            if (opsData != null) {
                if (opsData.getDeletions() != null) {
                    for (String delName : opsData.getDeletions()) {
                        try {
                            pdfAttachmentService.deleteAttachment(document, delName);
                        } catch (Exception e) {
                            log.warn("Batch deletion of '{}' skipped: {}", delName, e.getMessage());
                        }
                    }
                }
                if (opsData.getRenames() != null) {
                    for (RenameOp renameOp : opsData.getRenames()) {
                        if (renameOp.getOldName() != null && renameOp.getNewName() != null) {
                            try {
                                pdfAttachmentService.renameAttachment(
                                        document, renameOp.getOldName(), renameOp.getNewName());
                            } catch (Exception e) {
                                log.warn(
                                        "Batch rename from '{}' to '{}' skipped: {}",
                                        renameOp.getOldName(),
                                        renameOp.getNewName(),
                                        e.getMessage());
                            }
                        }
                    }
                }
            }

            if (additions != null && !additions.isEmpty()) {
                pdfAttachmentService.addAttachment(document, additions);
            }

            String originalFileName = Filenames.toSimpleFileName(fileInput.getOriginalFilename());
            if (originalFileName == null || originalFileName.isEmpty()) {
                originalFileName = "document";
            }
            String baseFileName =
                    originalFileName.contains(".")
                            ? originalFileName.substring(0, originalFileName.lastIndexOf('.'))
                            : originalFileName;

            if (convertToPdfA3b) {
                byte[] pdfaBytes = convertPDFToPDFA.convertPDDocumentToPDFA(document, "pdfa-3b");
                try (PDDocument pdfaDocument = org.apache.pdfbox.Loader.loadPDF(pdfaBytes)) {
                    convertPDFToPDFA.ensureEmbeddedFileCompliance(pdfaDocument);
                    ConvertPDFToPDFA.fixType1FontCharSet(pdfaDocument);
                    String outputFilename = baseFileName + "_attachments_modified_PDFA-3b.pdf";
                    return WebResponseUtils.pdfDocToWebResponse(
                            pdfaDocument, outputFilename, tempFileManager);
                }
            } else {
                return WebResponseUtils.pdfDocToWebResponse(
                        document,
                        GeneralUtils.generateFilename(
                                Filenames.toSimpleFileName(fileInput.getOriginalFilename()),
                                "_attachments_modified.pdf"),
                        tempFileManager);
            }
        }
    }

    @lombok.Data
    public static class BatchOpsData {
        private List<RenameOp> renames;
        private List<String> deletions;
    }

    @lombok.Data
    public static class RenameOp {
        private String oldName;
        private String newName;
    }
}
