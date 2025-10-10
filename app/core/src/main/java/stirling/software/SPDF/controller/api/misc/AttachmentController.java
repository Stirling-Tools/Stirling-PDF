package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
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

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.AddAttachmentRequest;
import stirling.software.SPDF.model.api.misc.ExtractAttachmentsRequest;
import stirling.software.SPDF.service.AttachmentServiceInterface;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class AttachmentController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final AttachmentServiceInterface pdfAttachmentService;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/add-attachments")
    @Operation(
            summary = "Add attachments to PDF",
            description =
                    "This endpoint adds attachments to a PDF. Input:PDF, Output:PDF Type:MISO")
    public ResponseEntity<byte[]> addAttachments(@ModelAttribute AddAttachmentRequest request)
            throws IOException {
        MultipartFile fileInput = request.getFileInput();
        List<MultipartFile> attachments = request.getAttachments();

        PDDocument document =
                pdfAttachmentService.addAttachment(
                        pdfDocumentFactory.load(fileInput, false), attachments);

        return WebResponseUtils.pdfDocToWebResponse(
                document,
                GeneralUtils.generateFilename(
                        Filenames.toSimpleFileName(fileInput.getOriginalFilename()),
                        "_with_attachments.pdf"));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/extract-attachments")
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
}
