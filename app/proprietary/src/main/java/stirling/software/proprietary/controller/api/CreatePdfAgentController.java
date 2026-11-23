package stirling.software.proprietary.controller.api;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.FileToPdf;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.model.api.ai.create.AiDocument;
import stirling.software.proprietary.service.AiDocumentHtmlRenderer;
import stirling.software.proprietary.service.AiFeatureGate;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Dispatchable tool that converts an AI-generated document model to a PDF.
 *
 * <p>Called by {@link stirling.software.proprietary.service.AiWorkflowService} when the engine
 * emits a {@code CREATE_PDF_FROM_HTML_AGENT} plan step. The engine supplies the document as
 * structured fields; the HTML is built here from a fixed template.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/ai/tools")
@RequiredArgsConstructor
@Tag(name = "AI Tools", description = "Dispatchable AI-backed tools.")
public class CreatePdfAgentController {

    private static final String BAD_DOCUMENT_REASON =
            "document must be JSON, not HTML or plain text: {title, sections: [{type:"
                    + " text|key_value|line_items|bullet_list|signature, heading?, body?, pairs?,"
                    + " columns?, rows?, totalRow?, items?, signatories?}]}";

    private final TempFileManager tempFileManager;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ApplicationProperties applicationProperties;
    private final ObjectMapper objectMapper;
    private final AiDocumentHtmlRenderer htmlRenderer;
    private final AiFeatureGate aiFeatureGate;

    @PostMapping(
            value = "/create-pdf-from-html-agent",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary =
                    "Lay out a designed PDF (invoice, letter, report) from a JSON document; no"
                            + " input file",
            description =
                    "Renders the structured document given as JSON in the document parameter (not"
                            + " HTML or plain text) through a fixed template and returns a PDF."
                            + " Dispatched by the AI workflow orchestrator as a plan step.")
    public ResponseEntity<Resource> createPdf(
            @Parameter(
                            description =
                                    "JSON text, not HTML: {title, subtitle?, referenceNumber?,"
                                            + " style?: {primaryColor, backgroundColor,"
                                            + " bodyTextColor}, sections: [{type, heading?,"
                                            + " ...}]} where type is text (body), key_value"
                                            + " (pairs: [[k,v]]), line_items (columns, rows:"
                                            + " [[...]], totalRow?), bullet_list (items) or"
                                            + " signature (signatories)")
                    @RequestParam("document")
                    String document,
            @Parameter(
                            description =
                                    "Name for the PDF, e.g. invoice-1042.pdf. Must end in .pdf,"
                                            + " otherwise generated-document.pdf is used.")
                    @RequestParam("filename")
                    String filename)
            throws Exception {
        if (!applicationProperties.getAiEngine().isEnabled()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        aiFeatureGate.requireCreatePdf();

        AiDocument model;
        try {
            model = objectMapper.readValue(document, AiDocument.class);
        } catch (JacksonException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, BAD_DOCUMENT_REASON);
        }

        String html = htmlRenderer.render(model);

        log.info("[create-pdf-agent] converting document to PDF — html_bytes={}", html.length());

        try (TempFile pdfFile = tempFileManager.createManagedTempFile(".pdf")) {
            Files.write(
                    pdfFile.getPath(),
                    FileToPdf.convertHtmlToPdf(
                            html.getBytes(StandardCharsets.UTF_8),
                            Duration.ofMinutes(
                                    applicationProperties
                                            .getProcessExecutor()
                                            .getTimeoutMinutes()
                                            .getOfficeConvertTimeoutMinutes()),
                            tempFileManager));

            String safeFilename = Filenames.toSimpleFileName(filename);
            if (safeFilename == null || safeFilename.isBlank() || !safeFilename.endsWith(".pdf")) {
                safeFilename = "generated-document.pdf";
            }

            // Stamp the standard Stirling metadata onto the converter output and write the result
            // straight to the response temp file. Loading from the file and saving to the file
            // avoids materialising the whole document as a byte[] twice (read-all + re-serialise),
            // which matters for large generated documents.
            TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
            try (PDDocument pdDocument = pdfDocumentFactory.load(pdfFile.getPath())) {
                pdDocument.save(tempOut.getPath().toFile());
            } catch (Exception e) {
                tempOut.close();
                throw e;
            }

            log.info(
                    "[create-pdf-agent] PDF ready — filename={} bytes={}",
                    safeFilename,
                    Files.size(tempOut.getPath()));

            return WebResponseUtils.pdfFileToWebResponse(tempOut, safeFilename);
        }
    }
}
