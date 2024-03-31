package stirling.software.SPDF.controller.api.security;

import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.security.AddPasswordRequest;
import stirling.software.SPDF.model.api.security.PDFPasswordRequest;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
public class PasswordController {

    private static final Logger logger = LoggerFactory.getLogger(PasswordController.class);
    private MultipartFile fileInput;

    @PostMapping(consumes = "multipart/form-data", value = "/remove-password")
    @Operation(summary = "Remove password from a PDF file")
    public ResponseEntity<byte[]> removePassword(@ModelAttribute PDFPasswordRequest request)
            throws IOException {
        fileInput = request.getFileInput();
        return handlePasswordOperation(request.getPassword(), true);
    }

    @PostMapping(consumes = "multipart/form-data", value = "/add-password")
    @Operation(summary = "Add password to a PDF file")
    public ResponseEntity<byte[]> addPassword(@ModelAttribute AddPasswordRequest request)
            throws IOException {
        fileInput = request.getFileInput();
        return handlePasswordOperation(request.getPassword(), false);
    }

    private ResponseEntity<byte[]> handlePasswordOperation(String password, boolean removePassword)
            throws IOException {
        PDDocument document = Loader.loadPDF(fileInput.getBytes(), password);
        if (removePassword) {
            document.setAllSecurityToBeRemoved(true);
            return WebResponseUtils.pdfDocToWebResponse(
                    document, getOutputFileName("_password_removed.pdf"));
        } else {
            PasswordHandler passwordHandler = new PasswordHandler(document, password);
            return passwordHandler.handlePassword();
        }
    }

    private String getOutputFileName(String suffix) {
        return Filenames.toSimpleFileName(fileInput.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "")
                + suffix;
    }

    private static class PasswordHandler {
        private final PDDocument document;
        private final String password;

        public PasswordHandler(PDDocument document, String password) {
            this.document = document;
            this.password = password;
        }

        public ResponseEntity<byte[]> handlePassword() throws IOException {
            // Perform password protection operations here
            return null; // Return appropriate ResponseEntity
        }
    }
}
