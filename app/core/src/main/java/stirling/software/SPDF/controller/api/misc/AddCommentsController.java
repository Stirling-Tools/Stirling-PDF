package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

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
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.misc.AddCommentsRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.model.api.comments.AnnotationLocation;
import stirling.software.common.model.api.comments.StickyNoteSpec;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfAnnotationService;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfTextLocator;
import stirling.software.common.util.PdfTextLocator.MatchedBox;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * Deterministic Java tool: add sticky-note comments to a PDF at caller-supplied positions.
 * Composable primitive used by AI agents (that generate comment specs) and by any other caller —
 * Automate workflows, scripts, unit tests — that has comment positions and text in hand.
 *
 * <p>Each {@code CommentSpec} element accepts either absolute coordinates ({@code x, y, width,
 * height}) or an {@code anchorText} hint. When {@code anchorText} is present, the tool scans the
 * target page, finds the first line whose text contains the needle (tolerant match — case and
 * punctuation insensitive), and anchors the sticky-note icon at that line's bounding box. Falls
 * back to the supplied coordinates when no match is found.
 *
 * <p>Pairs with {@link PdfAnnotationService} (annotation creation) and {@link PdfTextLocator}
 * (anchor resolution).
 */
@Slf4j
@MiscApi
@RequiredArgsConstructor
public class AddCommentsController {

    /** Sticky-note icon size in PDF user-space units. Matches the agents' default. */
    private static final float ANCHOR_ICON_SIZE = 20f;

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final PdfAnnotationService pdfAnnotationService;
    private final PdfTextLocator pdfTextLocator;
    private final ObjectMapper objectMapper;

    @AutoJobPostMapping(value = "/add-comments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @StandardPdfResponse
    @Operation(
            summary = "Add sticky-note comments to a PDF at specified positions or anchored text",
            description =
                    "Attaches PDF Text (sticky-note) annotations to the document."
                            + " Each CommentSpec can either supply absolute coordinates or an"
                            + " `anchorText` hint; when provided, the tool locates the first matching"
                            + " line on the target page and anchors the icon there (falling back to"
                            + " the coordinates if no match). Input:PDF Output:PDF Type:SISO")
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

        try (PDDocument document = pdfDocumentFactory.load(file)) {
            List<StickyNoteSpec> specs = resolveSpecs(document, dtos);
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

    /**
     * Convert the wire DTOs into {@link StickyNoteSpec}s, resolving any {@code anchorText} hints
     * against the PDF. Each spec is resolved independently so a miss falls back locally without
     * affecting other specs.
     */
    private List<StickyNoteSpec> resolveSpecs(PDDocument document, List<CommentSpecDto> dtos) {
        List<StickyNoteSpec> specs = new ArrayList<>(dtos.size());
        for (CommentSpecDto dto : dtos) {
            specs.add(toSpec(document, dto));
        }
        return specs;
    }

    private StickyNoteSpec toSpec(PDDocument document, CommentSpecDto d) {
        AnnotationLocation location = resolveLocation(document, d);
        return new StickyNoteSpec(location, d.text, d.author, d.subject);
    }

    private AnnotationLocation resolveLocation(PDDocument document, CommentSpecDto d) {
        if (d.anchorText == null || d.anchorText.isBlank()) {
            return new AnnotationLocation(d.pageIndex, d.x, d.y, d.width, d.height);
        }
        Optional<MatchedBox> match = pdfTextLocator.findOnPage(document, d.pageIndex, d.anchorText);
        if (match.isEmpty()) {
            log.debug(
                    "add-comments: no match for anchorText {!r} on page {}; using fallback coords",
                    d.anchorText,
                    d.pageIndex);
            return new AnnotationLocation(d.pageIndex, d.x, d.y, d.width, d.height);
        }
        MatchedBox box = match.get();
        // Anchor the icon at the top-left of the matched line, matching the convention used by
        // PdfCommentAgentOrchestrator for its chunk-based placement.
        float iconX = box.x();
        float iconY = box.y() + box.height() - ANCHOR_ICON_SIZE;
        return new AnnotationLocation(
                d.pageIndex, iconX, iconY, ANCHOR_ICON_SIZE, ANCHOR_ICON_SIZE);
    }

    /**
     * Wire-format DTO for a single element in the {@code comments} JSON array. Flat record-like
     * shape keeps the JSON simple for humans, AI-engine plan parameters, and Automate steps alike.
     *
     * <p>{@code anchorText} is optional. When present, the server locates the first line on {@code
     * pageIndex} containing that text (tolerant match) and places the icon there; the {@code
     * x/y/width/height} act as fallback when no match is found.
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
        public String anchorText;
    }
}
