package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageXYZDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.junit.jupiter.api.Test;

class HtmlPageZoomTest {

    @Test
    void scalesPagesLinksAndOutlineDestinations() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage first = new PDPage(new PDRectangle(300, 420));
            PDPage second = new PDPage(new PDRectangle(300, 420));
            document.addPage(first);
            document.addPage(second);

            PDPageXYZDestination linkTarget = destination(second, 30, 200);
            PDAnnotationLink link = new PDAnnotationLink();
            link.setRectangle(new PDRectangle(10, 10, 50, 20));
            link.setDestination(linkTarget);
            first.getAnnotations().add(link);

            PDDocumentOutline outline = new PDDocumentOutline();
            PDOutlineItem item = new PDOutlineItem();
            item.setDestination(destination(second, 0, 150));
            outline.addLast(item);
            document.getDocumentCatalog().setDocumentOutline(outline);

            HtmlPageZoom.scaleToZoom(document, 2f);

            assertThat(second.getMediaBox().getHeight()).isEqualTo(840f);
            assertThat(link.getRectangle().getLowerLeftX()).isEqualTo(20f);
            PDPageXYZDestination scaledLink = (PDPageXYZDestination) link.getDestination();
            assertThat(scaledLink.getLeft()).isEqualTo(60);
            assertThat(scaledLink.getTop()).isEqualTo(400);
            PDPageXYZDestination scaledOutline = (PDPageXYZDestination) item.getDestination();
            assertThat(scaledOutline.getTop()).isEqualTo(300);
        }
    }

    @Test
    void appendedStyleMatchesAUtf16ByteOrderMark() {
        byte[] html = ("﻿<html><body>x</body></html>").getBytes(StandardCharsets.UTF_16LE);

        String result = new String(HtmlPageZoom.layOutPage(html, 2f), StandardCharsets.UTF_16LE);

        assertThat(result).startsWith("﻿<html>").contains("@page{size:105.000mm 148.500mm}");
    }

    @Test
    void styleGoesInsideTheDocumentBeforeTheClosingTag() {
        byte[] html = "<HTML><body>x</body></HTML>\n".getBytes(StandardCharsets.UTF_8);

        String result = new String(HtmlPageZoom.layOutPage(html, 2f), StandardCharsets.UTF_8);

        assertThat(result)
                .isEqualTo(
                        "<HTML><body>x</body><style>@page{size:105.000mm 148.500mm}</style>"
                                + "</HTML>\n");
    }

    private static PDPageXYZDestination destination(PDPage page, int left, int top) {
        PDPageXYZDestination destination = new PDPageXYZDestination();
        destination.setPage(page);
        destination.setLeft(left);
        destination.setTop(top);
        return destination;
    }
}
