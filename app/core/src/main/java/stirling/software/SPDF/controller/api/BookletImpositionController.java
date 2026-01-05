package stirling.software.SPDF.controller.api;

import java.awt.*;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.general.BookletImpositionRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class BookletImpositionController {

    private static final Pattern FILE_EXTENSION_PATTERN = Pattern.compile("[.][^.]+$");
    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @AutoJobPostMapping(
            value = "/booklet-imposition",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Create a booklet with proper page imposition",
            description =
                    "This operation combines page reordering for booklet printing with multi-page layout. "
                            + "It rearranges pages in the correct order for booklet printing and places multiple pages "
                            + "on each sheet for proper folding and binding. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> createBookletImposition(
            @ModelAttribute BookletImpositionRequest request) throws IOException {

        MultipartFile file = request.getFileInput();
        int pagesPerSheet = request.getPagesPerSheet();
        boolean addBorder = Boolean.TRUE.equals(request.getAddBorder());
        String spineLocation =
                request.getSpineLocation() != null ? request.getSpineLocation() : "LEFT";
        boolean addGutter = Boolean.TRUE.equals(request.getAddGutter());
        float gutterSize = request.getGutterSize();
        boolean doubleSided = Boolean.TRUE.equals(request.getDoubleSided());
        String duplexPass = request.getDuplexPass() != null ? request.getDuplexPass() : "BOTH";
        boolean flipOnShortEdge = Boolean.TRUE.equals(request.getFlipOnShortEdge());

        // Validate pages per sheet for booklet - only 2-up landscape is proper booklet
        if (pagesPerSheet != 2) {
            throw new IllegalArgumentException(
                    "Booklet printing uses 2 pages per side (landscape). For 4-up, use the N-up feature.");
        }

        PDDocument sourceDocument = pdfDocumentFactory.load(file);
        int totalPages = sourceDocument.getNumberOfPages();

        // Create proper booklet with signature-based page ordering
        PDDocument newDocument =
                createSaddleBooklet(
                        sourceDocument,
                        totalPages,
                        addBorder,
                        spineLocation,
                        addGutter,
                        gutterSize,
                        doubleSided,
                        duplexPass,
                        flipOnShortEdge);

        sourceDocument.close();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        newDocument.save(baos);
        newDocument.close();

        byte[] result = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(
                result,
                FILE_EXTENSION_PATTERN
                                .matcher(Filenames.toSimpleFileName(file.getOriginalFilename()))
                                .replaceFirst("")
                        + "_booklet.pdf");
    }

    private static int padToMultipleOf4(int n) {
        return (n + 3) / 4 * 4;
    }

    private static class Side {
        final int left, right;
        final boolean isBack;

        Side(int left, int right, boolean isBack) {
            this.left = left;
            this.right = right;
            this.isBack = isBack;
        }
    }

    private static List<Side> saddleStitchSides(
            int totalPagesOriginal,
            boolean doubleSided,
            String duplexPass,
            boolean flipOnShortEdge) {
        int N = padToMultipleOf4(totalPagesOriginal);
        List<Side> out = new ArrayList<>();
        int sheets = N / 4;

        for (int s = 0; s < sheets; s++) {
            int a = N - 1 - (s * 2); // left, front
            int b = (s * 2); // right, front
            int c = (s * 2) + 1; // left, back
            int d = N - 2 - (s * 2); // right, back

            // clamp to -1 (blank) if >= totalPagesOriginal
            a = (a < totalPagesOriginal) ? a : -1;
            b = (b < totalPagesOriginal) ? b : -1;
            c = (c < totalPagesOriginal) ? c : -1;
            d = (d < totalPagesOriginal) ? d : -1;

            // Handle duplex pass selection
            boolean includeFront = "BOTH".equals(duplexPass) || "FIRST".equals(duplexPass);
            boolean includeBack = "BOTH".equals(duplexPass) || "SECOND".equals(duplexPass);

            if (includeFront) {
                out.add(new Side(a, b, false)); // front side
            }

            if (includeBack) {
                // For short-edge duplex, swap back-side left/right
                // Note: flipOnShortEdge is ignored in manual duplex mode since users physically
                // flip the stack
                if (doubleSided && flipOnShortEdge) {
                    out.add(new Side(d, c, true)); // swapped back side (automatic duplex only)
                } else {
                    out.add(new Side(c, d, true)); // normal back side
                }
            }
        }
        return out;
    }

    private PDDocument createSaddleBooklet(
            PDDocument src,
            int totalPages,
            boolean addBorder,
            String spineLocation,
            boolean addGutter,
            float gutterSize,
            boolean doubleSided,
            String duplexPass,
            boolean flipOnShortEdge)
            throws IOException {

        PDDocument dst = pdfDocumentFactory.createNewDocumentBasedOnOldDocument(src);

        // Derive paper size from source document's first page CropBox
        PDRectangle srcBox = src.getPage(0).getCropBox();
        PDRectangle portraitPaper = new PDRectangle(srcBox.getWidth(), srcBox.getHeight());
        // Force landscape for booklet (Acrobat booklet uses landscape paper to fold to portrait)
        PDRectangle pageSize = new PDRectangle(portraitPaper.getHeight(), portraitPaper.getWidth());

        // Validate and clamp gutter size
        if (gutterSize < 0) gutterSize = 0;
        if (gutterSize >= pageSize.getWidth() / 2f) gutterSize = pageSize.getWidth() / 2f - 1f;

        List<Side> sides = saddleStitchSides(totalPages, doubleSided, duplexPass, flipOnShortEdge);

        for (Side side : sides) {
            PDPage out = new PDPage(pageSize);
            dst.addPage(out);

            float cellW = pageSize.getWidth() / 2f;
            float cellH = pageSize.getHeight();

            // For RIGHT spine (RTL), swap left/right placements
            boolean rtl = "RIGHT".equalsIgnoreCase(spineLocation);
            int leftCol = rtl ? 1 : 0;
            int rightCol = rtl ? 0 : 1;

            // Apply gutter margins with centered gap option
            float g = addGutter ? gutterSize : 0f;
            float leftCellX = leftCol * cellW + (g / 2f);
            float rightCellX = rightCol * cellW - (g / 2f);
            float leftCellW = cellW - (g / 2f);
            float rightCellW = cellW - (g / 2f);

            // Create LayerUtility once per page for efficiency
            LayerUtility layerUtility = new LayerUtility(dst);

            try (PDPageContentStream cs =
                    new PDPageContentStream(
                            dst, out, PDPageContentStream.AppendMode.APPEND, true, true)) {

                if (addBorder) {
                    cs.setLineWidth(1.5f);
                    cs.setStrokingColor(Color.BLACK);
                }

                // draw left cell
                drawCell(
                        src,
                        dst,
                        cs,
                        layerUtility,
                        side.left,
                        leftCellX,
                        0f,
                        leftCellW,
                        cellH,
                        addBorder);
                // draw right cell
                drawCell(
                        src,
                        dst,
                        cs,
                        layerUtility,
                        side.right,
                        rightCellX,
                        0f,
                        rightCellW,
                        cellH,
                        addBorder);
            }
        }
        return dst;
    }

    private void drawCell(
            PDDocument src,
            PDDocument dst,
            PDPageContentStream cs,
            LayerUtility layerUtility,
            int pageIndex,
            float cellX,
            float cellY,
            float cellW,
            float cellH,
            boolean addBorder)
            throws IOException {

        if (pageIndex < 0) {
            // Draw border for blank cell if needed
            if (addBorder) {
                cs.addRect(cellX, cellY, cellW, cellH);
                cs.stroke();
            }
            return;
        }

        PDPage srcPage = src.getPage(pageIndex);
        PDRectangle r = srcPage.getCropBox(); // Use CropBox instead of MediaBox
        int rot = (srcPage.getRotation() + 360) % 360;

        // Calculate scale factors, accounting for rotation
        float sx = cellW / r.getWidth();
        float sy = cellH / r.getHeight();
        float s = Math.min(sx, sy);

        // If rotated 90/270 degrees, swap dimensions for fitting
        if (rot == 90 || rot == 270) {
            sx = cellW / r.getHeight();
            sy = cellH / r.getWidth();
            s = Math.min(sx, sy);
        }

        float drawnW = (rot == 90 || rot == 270) ? r.getHeight() * s : r.getWidth() * s;
        float drawnH = (rot == 90 || rot == 270) ? r.getWidth() * s : r.getHeight() * s;

        // Center in cell, accounting for CropBox offset
        float tx = cellX + (cellW - drawnW) / 2f - r.getLowerLeftX() * s;
        float ty = cellY + (cellH - drawnH) / 2f - r.getLowerLeftY() * s;

        cs.saveGraphicsState();
        cs.transform(Matrix.getTranslateInstance(tx, ty));
        cs.transform(Matrix.getScaleInstance(s, s));

        // Apply rotation if needed (rotate about origin), then translate to keep in cell
        switch (rot) {
            case 90:
                cs.transform(Matrix.getRotateInstance(Math.PI / 2, 0, 0));
                // After 90° CCW, the content spans x in [-r.getHeight(), 0] and y in [0,
                // r.getWidth()]
                cs.transform(Matrix.getTranslateInstance(0, -r.getWidth()));
                break;
            case 180:
                cs.transform(Matrix.getRotateInstance(Math.PI, 0, 0));
                cs.transform(Matrix.getTranslateInstance(-r.getWidth(), -r.getHeight()));
                break;
            case 270:
                cs.transform(Matrix.getRotateInstance(3 * Math.PI / 2, 0, 0));
                // After 270° CCW, the content spans x in [0, r.getHeight()] and y in
                // [-r.getWidth(), 0]
                cs.transform(Matrix.getTranslateInstance(-r.getHeight(), 0));
                break;
            default:
                // 0°: no-op
        }

        // Reuse LayerUtility passed from caller
        PDFormXObject form = layerUtility.importPageAsForm(src, pageIndex);
        cs.drawForm(form);

        cs.restoreGraphicsState();

        // Draw border on top of form to ensure visibility
        if (addBorder) {
            cs.addRect(cellX, cellY, cellW, cellH);
            cs.stroke();
        }
    }
}
