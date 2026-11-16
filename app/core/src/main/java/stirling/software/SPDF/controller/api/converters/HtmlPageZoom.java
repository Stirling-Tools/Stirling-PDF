package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.util.Matrix;

import stirling.software.common.util.ExceptionUtils;

final class HtmlPageZoom {

    static final float MIN_ZOOM = 0.1f;
    static final float MAX_ZOOM = 10f;

    private static final float A4_WIDTH_MM = 210f;
    private static final float A4_HEIGHT_MM = 297f;
    private static final long MAX_PACKAGE_BYTES = 256L * 1024 * 1024;
    private static final byte[] UTF8_BOM = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};

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
        byte[] style = pageStyle(zoom);
        int bom = startsWithBom(html) ? UTF8_BOM.length : 0;
        byte[] out = new byte[html.length + style.length];
        System.arraycopy(html, 0, out, 0, bom);
        System.arraycopy(style, 0, out, bom, style.length);
        System.arraycopy(html, bom, out, bom + style.length, html.length - bom);
        return out;
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
            }
        }
    }

    private static PDRectangle scaled(PDRectangle box, float zoom) {
        return new PDRectangle(
                box.getLowerLeftX() * zoom,
                box.getLowerLeftY() * zoom,
                box.getWidth() * zoom,
                box.getHeight() * zoom);
    }

    private static byte[] pageStyle(float zoom) {
        return String.format(
                        Locale.ROOT,
                        "<style>@page{size:%.3fmm %.3fmm}</style>",
                        A4_WIDTH_MM / zoom,
                        A4_HEIGHT_MM / zoom)
                .getBytes(StandardCharsets.US_ASCII);
    }

    private static boolean startsWithBom(byte[] html) {
        return html.length >= UTF8_BOM.length
                && html[0] == UTF8_BOM[0]
                && html[1] == UTF8_BOM[1]
                && html[2] == UTF8_BOM[2];
    }

    private static boolean isHtml(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".html") || lower.endsWith(".htm");
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
