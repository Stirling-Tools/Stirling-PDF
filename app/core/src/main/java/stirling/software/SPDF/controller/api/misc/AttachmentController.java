package stirling.software.SPDF.controller.api.misc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
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
import stirling.software.SPDF.model.api.misc.DeleteAttachmentRequest;
import stirling.software.SPDF.model.api.misc.ExtractAttachmentsRequest;
import stirling.software.SPDF.model.api.misc.ListAttachmentsRequest;
import stirling.software.SPDF.model.api.misc.RenameAttachmentRequest;
import stirling.software.SPDF.service.AttachmentServiceInterface;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class AttachmentController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final AttachmentServiceInterface pdfAttachmentService;

    private final ConvertPDFToPDFA convertPDFToPDFA;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/add-attachments")
    @StandardPdfResponse
    @Operation(
            summary = "Add attachments to PDF",
            description =
                    "This endpoint adds attachments to a PDF. Input:PDF, Output:PDF Type:MISO")
    public ResponseEntity<byte[]> addAttachments(@ModelAttribute AddAttachmentRequest request)
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

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                pdfaDocument.save(baos);
                byte[] resultBytes = baos.toByteArray();

                String outputFilename = baseFileName + "_with_attachments_PDFA-3b.pdf";
                return WebResponseUtils.bytesToWebResponse(
                        resultBytes, outputFilename, MediaType.APPLICATION_PDF);
            }
        } else {
            try (PDDocument document = pdfDocumentFactory.load(request, false)) {
                pdfAttachmentService.addAttachment(document, attachments);
                return WebResponseUtils.pdfDocToWebResponse(
                        document,
                        GeneralUtils.generateFilename(
                                Filenames.toSimpleFileName(fileInput.getOriginalFilename()),
                                "_with_attachments.pdf"));
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
            value = "/extract-attachments")
    @Operation(
            summary = "Extract attachments from PDF",
            description =
                    "This endpoint extracts all embedded attachments from a PDF into a ZIP archive."
                            + " Input:PDF Output:ZIP Type:SISO")
    public ResponseEntity<byte[]> extractAttachments(
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

            return WebResponseUtils.bytesToWebResponse(
                    extracted.get(), outputName, MediaType.APPLICATION_OCTET_STREAM);
        }
    }

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/list-attachments")
    @Operation(
            summary = "List attachments in PDF",
            description =
                    "This endpoint lists all embedded attachments in a PDF. Input:PDF Output:JSON Type:SISO")
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
            value = "/rename-attachment")
    @StandardPdfResponse
    @Operation(
            summary = "Rename attachment in PDF",
            description =
                    "This endpoint renames an embedded attachment in a PDF. Input:PDF Output:PDF Type:MISO")
    public ResponseEntity<byte[]> renameAttachment(@ModelAttribute RenameAttachmentRequest request)
            throws Exception {
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
                            "_attachment_renamed.pdf"));
        }
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/delete-attachment")
    @StandardPdfResponse
    @Operation(
            summary = "Delete attachment from PDF",
            description =
                    "This endpoint deletes an embedded attachment from a PDF. Input:PDF Output:PDF Type:MISO")
    public ResponseEntity<byte[]> deleteAttachment(@ModelAttribute DeleteAttachmentRequest request)
            throws Exception {
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
                            "_attachment_deleted.pdf"));
        }
    }
}
