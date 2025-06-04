package stirling.software.SPDF.controller.api.misc;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import stirling.software.common.service.CustomPDFDocumentFactory;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class AttachmentsController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = "multipart/form-data", value = "/add-attachments")
    public ResponseEntity<byte[]> addAttachments(
            String fileName, String attachmentName, byte[] attachmentData) {
        // Implementation for adding attachments to a PDF file
        // This is a placeholder method and should be implemented as per requirements.
        return ResponseEntity.ok()
                .header("Content-Disposition", "attachment; filename=\"" + fileName + "\"")
                .body(attachmentData);
    }
}
