package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.List;

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
import stirling.software.SPDF.model.api.misc.AddAttachmentRequest;
import stirling.software.SPDF.service.AttachmentServiceInterface;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class AttachmentController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private final AttachmentServiceInterface pdfAttachmentService;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/add-attachments")
    @StandardPdfResponse
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
}
