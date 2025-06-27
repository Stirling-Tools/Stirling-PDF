package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.multipdf.PDFCloneUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
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
        PDDocument sourceDoc = pdfDocumentFactory.load(pdfFile);
        PDDocument newDoc = pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc);
        String pagesToDelete = form.getPages();
        List<Integer> pagesToRemove = new ArrayList<>();
        String sufix;

        if (form.isRemoveHeader()) {
            if (form.isRemoveFooter()) {
                sufix = "_removed_header_footer.pdf";
            } else sufix = "_removed_header.pdf";
        } else if (form.isRemoveFooter()) {
            sufix = "_removed_footer.pdf";
        } else {
            throw new IllegalArgumentException("Header and/or footer removal must be selected");
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

        // Used to clone the old PDF document to a new one, preserving the original document
        // structure and properties
        PDFCloneUtility cloner;
        try {
            Constructor<PDFCloneUtility> constructor =
                    PDFCloneUtility.class.getDeclaredConstructor(PDDocument.class);
            // Enable access to protected constructor
            constructor.setAccessible(true);
            cloner = constructor.newInstance(newDoc);
        } catch (Exception e) {
            throw new RuntimeException("Failed to clone the old PDF document to a new one: ", e);
        }

        for (int pageIndex = 0; pageIndex < sourceDoc.getNumberOfPages(); pageIndex++) {
            PDPage sourcePage = sourceDoc.getPage(pageIndex);
            PDPage newPage =
                    new PDPage(
                            (COSDictionary) cloner.cloneForNewDocument(sourcePage.getCOSObject()));
            newDoc.addPage(newPage);

            if (pagesToRemove.contains(pageIndex)) {
                PDRectangle mediaBox = newPage.getMediaBox();
                Float[][] zones = getRemovalZonesForPage(form, newPage);

                // Extract original content streams
                List<PDStream> oldStreams = extractContentStreams(newPage);

                newPage.setContents(new ArrayList<>());

                COSStream combinedStream = new COSStream();
                try (OutputStream out = combinedStream.createOutputStream()) {
                    for (PDStream stream : oldStreams) {
                        out.write(stream.toByteArray());
                    }
                }

                PDFormXObject formXObject = new PDFormXObject(combinedStream);
                formXObject.setResources(newPage.getResources());
                formXObject.setBBox(mediaBox);
                formXObject.setFormType(1); // Required form type

                try (PDPageContentStream cs =
                        new PDPageContentStream(
                                newDoc, newPage, AppendMode.OVERWRITE, true, true)) {
                    // Save the current graphics state to restore later
                    cs.saveGraphicsState();

                    if (zones != null && zones.length > 0) {
                        cs.addRect(0, 0, mediaBox.getWidth(), mediaBox.getHeight());
                        // Add rectangles for each zone to remove (header/footer areas)
                        // These will be subtracted from the base rectangle using even-odd clipping
                        // rule
                        for (Float[] zone : zones) {
                            cs.addRect(zone[0], zone[1], zone[2], zone[3]);
                        }
                        cs.clipEvenOdd();
                    }

                    cs.drawForm(formXObject);
                    // Restore the graphics state to ensure the clipping is applied correctly
                    cs.restoreGraphicsState();
                }
            }
        }
        return WebResponseUtils.pdfDocToWebResponse(
                newDoc,
                Filenames.toSimpleFileName(pdfFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + sufix);
    }

    private List<PDStream> extractContentStreams(PDPage page) {
        List<PDStream> streams = new ArrayList<>();
        COSBase contents = page.getCOSObject().getDictionaryObject("Contents");

        if (contents instanceof COSStream cosStream) {
            streams.add(new PDStream(cosStream));
        } else if (contents instanceof COSArray cosArray) {
            for (int i = 0; i < cosArray.size(); i++) {
                COSBase item = cosArray.get(i);
                if (item instanceof COSStream itemStream) {
                    streams.add(new PDStream(itemStream));
                }
            }
        }
        return streams;
    }

    /**
     * Builds the zones for the header and footer removal based on the form data and the page.
     *
     * @param form The form containing the removal settings.
     * @param page The PDF page to process.
     * @return A 2D array of Float representing the zones to remove.
     */
    private Float[][] getRemovalZonesForPage(RemoveHeaderFooterForm form, PDPage page) {
        PDRectangle mediaBox = page.getMediaBox();
        float w = mediaBox.getWidth();
        float h = mediaBox.getHeight();
        int rotation = page.getRotation();
        boolean removeHeader = form.isRemoveHeader();
        boolean removeFooter = form.isRemoveFooter();
        Float[][] zones = new Float[removeHeader && removeFooter ? 2 : 1][];
        int zoneIdx = 0;

        if (removeHeader) {

            Float headerH = form.getHeaderMargin();
            if (headerH == -1) {
                headerH = form.getHeaderCustomValue(); // Default value if 'custom' is specified
            }

            Float[] rawZone;
            if (rotation == 90 || rotation == 270) {
                rawZone = new Float[] {0f, w - headerH, h, headerH};
            } else {
                rawZone = new Float[] {0f, h - headerH, w, headerH};
            }
            zones[zoneIdx++] = rotateZone(rawZone, mediaBox, rotation);
        }

        if (removeFooter) {

            Float footerH = form.getFooterMargin();
            if (footerH == -1) {
                footerH = form.getFooterCustomValue(); // Default value if 'custom' is specified
            }

            Float[] rawZone;
            if (rotation == 90 || rotation == 270) {
                rawZone = new Float[] {0f, 0f, h, footerH};
            } else {
                rawZone = new Float[] {0f, 0f, w, footerH};
            }
            zones[zoneIdx] = rotateZone(rawZone, mediaBox, rotation);
        }
        return zones;
    }

    private Float[] rotateZone(Float[] zone, PDRectangle mediaBox, int rotation) {
        float x = zone[0];
        float y = zone[1];
        float w = zone[2];
        float h = zone[3];
        return switch (rotation) {
            case 90 -> new Float[] {mediaBox.getWidth() - y - h, x, h, w};
            case 180 ->
                    new Float[] {mediaBox.getWidth() - x - w, mediaBox.getHeight() - y - h, w, h};
            case 270 -> new Float[] {y, mediaBox.getHeight() - x - w, h, w};
            default -> new Float[] {x, y, w, h};
        };
    }
}
