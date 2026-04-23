package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.misc.AddCommentsRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.model.api.comments.AnnotationLocation;
import stirling.software.common.model.api.comments.StickyNoteSpec;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfAnnotationService;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * Deterministic Java tool: add sticky-note comments to a PDF at caller-supplied absolute positions.
 * Composable primitive used by AI agents (that generate the comment specs) and by any other caller
 * — Automate workflows, scripts, unit tests — that has comment positions and text already in hand.
 *
 * <p>Pairs with {@link PdfAnnotationService} which holds the PDFBox logic.
 */
@MiscApi
@RequiredArgsConstructor
public class AddCommentsController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final PdfAnnotationService pdfAnnotationService;
    private final ObjectMapper objectMapper;

    @AutoJobPostMapping(value = "/add-comments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @StandardPdfResponse
    @Operation(
            summary = "Add sticky-note comments to a PDF at specified positions",
            description =
                    "Attaches PDF Text (sticky-note) annotations to the document at the"
                            + " caller-supplied absolute positions. Deterministic — given the same"
                            + " input PDF and comments JSON, the output is bit-identical."
                            + " Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> addComments(@ModelAttribute AddCommentsRequest request)
            throws IOException {

        MultipartFile file = request.getFileInput();
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "fileInput is required");
        }
        String commentsJson = request.getComments();
        if (commentsJson == null || commentsJson.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "comments JSON is required");
        }

        List<CommentSpecDto> dtos;
        try {
            dtos = objectMapper.readValue(commentsJson, new TypeReference<>() {});
        } catch (JacksonException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "comments must be a JSON array of CommentSpec objects");
        }

        List<StickyNoteSpec> specs = dtos.stream().map(AddCommentsController::toSpec).toList();

        try (PDDocument document = pdfDocumentFactory.load(file)) {
            pdfAnnotationService.addStickyNotes(document, specs);

            TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
            try {
                document.save(tempOut.getFile());
            } catch (IOException e) {
                tempOut.close();
                throw e;
            }
            return WebResponseUtils.pdfFileToWebResponse(
                    tempOut,
                    GeneralUtils.generateFilename(file.getOriginalFilename(), "_commented.pdf"));
        }
    }

    private static StickyNoteSpec toSpec(CommentSpecDto d) {
        return new StickyNoteSpec(
                new AnnotationLocation(d.pageIndex, d.x, d.y, d.width, d.height),
                d.text,
                d.author,
                d.subject);
    }

    /**
     * Wire-format DTO for a single element in the {@code comments} JSON array. Flat record-like
     * shape keeps the JSON simple for humans, AI-engine plan parameters, and Automate steps alike.
     */
    private static final class CommentSpecDto {
        public int pageIndex;
        public float x;
        public float y;
        public float width;
        public float height;
        public String text;
        public String author;
        public String subject;
    }
}
