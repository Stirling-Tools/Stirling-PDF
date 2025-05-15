package stirling.software.SPDF.controller.api;

import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.general.RemoveHeaderFooterForm;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class RemoveHeaderFooterController {

    // private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/remove-header-footer", consumes = "multipart/form-data")
    @Operation(
            summary = "Removes headers and/or footers from a PDF document",
            description = "Remove header and/or footer")
    public String removeHeaderFooter(@ModelAttribute RemoveHeaderFooterForm form) {
        // Print the received message
        System.out.println("Received message: " + form.getMessage());

        // Respond with a message
        return "footer Removed";
    }
}
