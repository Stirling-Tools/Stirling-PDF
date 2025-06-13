package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
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

import stirling.software.SPDF.model.api.general.RemoveHeaderFooterForm;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Slf4j
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class RemoveHeaderFooterController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/remove-header-footer", consumes = "multipart/form-data")
    @Operation(
            summary = "Removes headers and/or footers from a PDF document",
            description = "Remove header and/or footer")
    public ResponseEntity<byte[]> removeHeaderFooter(@ModelAttribute RemoveHeaderFooterForm form)
            throws IOException {

        MultipartFile pdfFile = form.getFileInput();

        String pagesToDelete = form.getPages();
        List<Integer> pagesToRemove = new ArrayList<>();
        PDDocument sourceDoc = pdfDocumentFactory.load(pdfFile);
        PDDocument newDoc = new PDDocument();
        LayerUtility layerUtility = new LayerUtility(newDoc);

        String sufix;
        // Respond with a message
        if (form.isRemoveHeader()) {
            if (form.isRemoveFooter()) {
                sufix = "_removed_header_footer.pdf";
            } else sufix = "_removed_header.pdf";
        } else if (form.isRemoveFooter()) {
            sufix = "_removed_footer.pdf";
        } else {
            return ResponseEntity.badRequest()
                    .body("No header or footer removal options selected".getBytes());
        }

        if (pagesToDelete == null || pagesToDelete.isEmpty()) {
            for (int i = 0; i < sourceDoc.getNumberOfPages(); i++) {
                pagesToRemove.add(i);
            }
        } else { // Split the page order string into an array of page numbers or range of numbers
            String[] pageOrderArr = pagesToDelete.split(",");

            pagesToRemove =
                    GeneralUtils.parsePageList(pageOrderArr, sourceDoc.getNumberOfPages(), false);

            Collections.sort(pagesToRemove);
        }

        for (int pageIndex = 0; pageIndex < sourceDoc.getNumberOfPages(); pageIndex++) {
            PDPage sourcePage = sourceDoc.getPage(pageIndex);
            PDRectangle mediaBox = sourcePage.getMediaBox();

            PDPage newPage = new PDPage(mediaBox);
            newDoc.addPage(newPage);

            try (PDPageContentStream cs =
                    new PDPageContentStream(newDoc, newPage, AppendMode.OVERWRITE, true, true)) {
                PDFormXObject formXObject = layerUtility.importPageAsForm(sourceDoc, pageIndex);

                // Save the current graphics state to restore later
                cs.saveGraphicsState();

                if (pagesToRemove.contains(pageIndex)) {
                    Float[][] zones = getRemovalZonesForPage(form, sourcePage);
                    if (zones != null && zones.length > 0) {
                        cs.addRect(0, 0, mediaBox.getWidth(), mediaBox.getHeight());
                        // Add rectangles for each zone to remove (header/footer areas)
                        // These will be subtracted from the base rectangle using even-odd clipping
                        // rule
                        for (Float[] zone : zones) {
                            if (zone != null && zone.length == 4) {
                                cs.addRect(zone[0], zone[1], zone[2], zone[3]);
                            }
                        }

                        cs.clipEvenOdd();
                    }
                }

                cs.drawForm(formXObject);
                // Restore the graphics state to ensure the clipping is applied correctly
                cs.restoreGraphicsState();
            }
        }
        return WebResponseUtils.pdfDocToWebResponse(
                newDoc,
                Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + sufix);
    }

    /**
     * Builds the zones for the header and footer removal based on the form data and the page.
     *
     * @param form The form containing the removal settings.
     * @param page The PDF page to process.
     * @return A 2D array of Float representing the zones to remove.
     */
    private Float[][] getRemovalZonesForPage(RemoveHeaderFooterForm form, PDPage page) {
        float w = page.getMediaBox().getWidth();
        float h = page.getMediaBox().getHeight();
        Float[][] zones = null;

        boolean removeHeader = form.isRemoveHeader();
        boolean removeFooter = form.isRemoveFooter();
        zones = new Float[removeHeader && removeFooter ? 2 : 1][];
        if (removeHeader) {

            Float headerH = form.getHeaderMargin();
            if (headerH == -1) {
                headerH = form.getHeaderCustomValue(); // Default value if 'custom' is specified
            }
            zones[0] = new Float[] {0f, h - headerH, w, headerH};
        }
        if (removeFooter) {

            Float footerH = form.getFooterMargin();
            if (footerH == -1) {
                footerH = form.getFooterCustomValue(); // Default value if 'custom' is specified
            }
            zones[zones[0] == null ? 0 : 1] = new Float[] {0f, 0f, w, footerH};
        }

        return zones;
    }
}
