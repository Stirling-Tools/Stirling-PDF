package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.action.PDAction;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionGoTo;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageFitHeightDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageFitRectangleDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageFitWidthDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination.PDPageXYZDestination;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.util.Matrix;

import stirling.software.common.util.ExceptionUtils;

final class HtmlPageZoom {

    static final float MIN_ZOOM = 0.1f;
    static final float MAX_ZOOM = 8f;

    private static final float A4_WIDTH_MM = 210f;
    private static final float A4_HEIGHT_MM = 297f;
    private static final long MAX_PACKAGE_BYTES = 256L * 1024 * 1024;

    private HtmlPageZoom() {}

    static boolean applies(float zoom) {
        if (!(zoom > 0) || zoom == 1f) {
            return false;
        }
        if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidZoom",
                    "Zoom must be between {0} and {1} (got {2}).",
                    MIN_ZOOM,
                    MAX_ZOOM,
                    zoom);
        }
        return true;
    }

    static byte[] layOutPage(byte[] html, float zoom) {
        Charset charset = textCharset(html);
        String document = new String(html, charset);
        int at = closingHtmlTag(document);
        return (document.substring(0, at) + pageStyle(zoom) + document.substring(at))
                .getBytes(charset);
    }

    private static int closingHtmlTag(String document) {
        int closing = document.length();
        int i = 0;
        while (i < document.length()) {
            if (startsWithIgnoreCase(document, i, "<!--")) {
                i = after(document, i + 4, "-->");
            } else if (startsWithIgnoreCase(document, i, "<![CDATA[")) {
                i = after(document, i + 9, "]]>");
            } else if (startsWithIgnoreCase(document, i, "<script")) {
                i = after(document, i + 7, "</script");
            } else if (startsWithIgnoreCase(document, i, "<style")) {
                i = after(document, i + 6, "</style");
            } else {
                if (startsWithIgnoreCase(document, i, "</html")) {
                    closing = i;
                }
                i++;
            }
        }
        return closing;
    }

    private static int after(String document, int from, String end) {
        for (int i = from; i <= document.length() - end.length(); i++) {
            if (startsWithIgnoreCase(document, i, end)) {
                return i + end.length();
            }
        }
        return document.length();
    }

    private static boolean startsWithIgnoreCase(String document, int at, String prefix) {
        return document.regionMatches(true, at, prefix, 0, prefix.length());
    }

    static byte[] layOutPackage(byte[] zip, float zoom) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(zip.length + 1024);
        long total = 0;
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip));
                ZipOutputStream out = new ZipOutputStream(buffer)) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                out.putNextEntry(new ZipEntry(entry.getName()));
                if (!entry.isDirectory()) {
                    if (isHtml(entry.getName())) {
                        byte[] page = readLimited(in, MAX_PACKAGE_BYTES - total);
                        total += page.length;
                        out.write(layOutPage(page, zoom));
                    } else {
                        total += copyLimited(in, out, MAX_PACKAGE_BYTES - total);
                    }
                }
                out.closeEntry();
            }
        }
        return buffer.toByteArray();
    }

    static void scaleToZoom(PDDocument document, float zoom) throws IOException {
        Set<COSBase> scaledDestinations = Collections.newSetFromMap(new IdentityHashMap<>());
        for (PDPage page : document.getPages()) {
            try (PDPageContentStream content =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.PREPEND, true)) {
                content.transform(Matrix.getScaleInstance(zoom, zoom));
            }
            PDRectangle mediaBox = scaled(page.getMediaBox(), zoom);
            page.setMediaBox(mediaBox);
            page.setCropBox(mediaBox);
            for (PDAnnotation annotation : page.getAnnotations()) {
                PDRectangle rectangle = annotation.getRectangle();
                if (rectangle != null) {
                    annotation.setRectangle(scaled(rectangle, zoom));
                }
                if (annotation instanceof PDAnnotationLink link) {
                    scaleDestination(link.getDestination(), zoom, scaledDestinations);
                    scaleDestination(link.getAction(), zoom, scaledDestinations);
                }
            }
        }
        PDDocumentOutline outline = document.getDocumentCatalog().getDocumentOutline();
        if (outline != null) {
            scaleOutline(outline.children(), zoom, scaledDestinations);
        }
    }

    private static void scaleOutline(
            Iterable<PDOutlineItem> items, float zoom, Set<COSBase> scaledDestinations)
            throws IOException {
        for (PDOutlineItem item : items) {
            scaleDestination(item.getDestination(), zoom, scaledDestinations);
            scaleDestination(item.getAction(), zoom, scaledDestinations);
            scaleOutline(item.children(), zoom, scaledDestinations);
        }
    }

    private static void scaleDestination(
            PDAction action, float zoom, Set<COSBase> scaledDestinations) throws IOException {
        if (action instanceof PDActionGoTo goTo) {
            scaleDestination(goTo.getDestination(), zoom, scaledDestinations);
        }
    }

    private static void scaleDestination(
            PDDestination destination, float zoom, Set<COSBase> scaledDestinations) {
        if (!(destination instanceof PDPageDestination pageDestination)
                || !scaledDestinations.add(pageDestination.getCOSObject())) {
            return;
        }
        switch (pageDestination) {
            case PDPageXYZDestination xyz -> {
                xyz.setLeft(scaled(xyz.getLeft(), zoom));
                xyz.setTop(scaled(xyz.getTop(), zoom));
            }
            case PDPageFitWidthDestination fitWidth ->
                    fitWidth.setTop(scaled(fitWidth.getTop(), zoom));
            case PDPageFitHeightDestination fitHeight ->
                    fitHeight.setLeft(scaled(fitHeight.getLeft(), zoom));
            case PDPageFitRectangleDestination rectangle -> {
                rectangle.setLeft(scaled(rectangle.getLeft(), zoom));
                rectangle.setBottom(scaled(rectangle.getBottom(), zoom));
                rectangle.setRight(scaled(rectangle.getRight(), zoom));
                rectangle.setTop(scaled(rectangle.getTop(), zoom));
            }
            default -> {}
        }
    }

    private static int scaled(int coordinate, float zoom) {
        return coordinate == -1 ? -1 : Math.round(coordinate * zoom);
    }

    private static PDRectangle scaled(PDRectangle box, float zoom) {
        return new PDRectangle(
                box.getLowerLeftX() * zoom,
                box.getLowerLeftY() * zoom,
                box.getWidth() * zoom,
                box.getHeight() * zoom);
    }

    private static String pageStyle(float zoom) {
        return String.format(
                Locale.ROOT,
                "<style>@page{size:%.3fmm %.3fmm}</style>",
                A4_WIDTH_MM / zoom,
                A4_HEIGHT_MM / zoom);
    }

    private static Charset textCharset(byte[] html) {
        if (html.length >= 2 && (html[0] & 0xFF) == 0xFF && (html[1] & 0xFF) == 0xFE) {
            return StandardCharsets.UTF_16LE;
        }
        if (html.length >= 2 && (html[0] & 0xFF) == 0xFE && (html[1] & 0xFF) == 0xFF) {
            return StandardCharsets.UTF_16BE;
        }
        return StandardCharsets.ISO_8859_1;
    }

    private static boolean isHtml(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".html") || lower.endsWith(".htm") || lower.endsWith(".xhtml");
    }

    private static byte[] readLimited(InputStream in, long remaining) throws IOException {
        ByteArrayOutputStream page = new ByteArrayOutputStream();
        copyLimited(in, page, remaining);
        return page.toByteArray();
    }

    private static long copyLimited(InputStream in, OutputStream out, long remaining)
            throws IOException {
        byte[] chunk = new byte[8192];
        long copied = 0;
        int read;
        while ((read = in.read(chunk)) != -1) {
            copied += read;
            if (copied > remaining) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.zipTooLarge",
                        "The ZIP file expands to more than {0} MB.",
                        MAX_PACKAGE_BYTES / (1024 * 1024));
            }
            out.write(chunk, 0, read);
        }
        return copied;
    }
}
