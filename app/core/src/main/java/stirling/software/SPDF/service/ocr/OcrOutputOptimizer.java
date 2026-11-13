package stirling.software.SPDF.service.ocr;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
import java.util.zip.Deflater;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNull;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

/**
 * Output passes OCRmyPDF applies after OCR: its default optimisation re-wraps JPEG streams in Flate
 * when that is smaller (lossless, since the JPEG bytes are untouched), and --remove-images-after
 * drops every image so only the text layer and vector content remain.
 */
public final class OcrOutputOptimizer {

    /** Ignore wins below this, so viewers are not asked to undo two filters for nothing. */
    private static final double MIN_SAVING = 0.02;

    private OcrOutputOptimizer() {}

    /** Returns the bytes saved. */
    public static long deflateJpegs(PDDocument document) throws IOException {
        long saved = 0;
        Set<COSStream> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (PDPage page : document.getPages()) {
            saved += deflateJpegs(page.getResources(), seen);
        }
        return saved;
    }

    private static long deflateJpegs(PDResources resources, Set<COSStream> seen)
            throws IOException {
        if (resources == null) return 0;
        long saved = 0;
        for (COSName name : resources.getXObjectNames()) {
            PDXObject xobject = resources.getXObject(name);
            if (xobject instanceof PDFormXObject form) {
                if (seen.add(form.getCOSObject())) saved += deflateJpegs(form.getResources(), seen);
            } else if (xobject instanceof PDImageXObject image && seen.add(image.getCOSObject())) {
                saved += deflateJpeg(image.getCOSObject());
            }
        }
        return saved;
    }

    private static long deflateJpeg(COSStream stream) throws IOException {
        if (!COSName.DCT_DECODE.equals(stream.getDictionaryObject(COSName.FILTER))) return 0;
        byte[] raw;
        try (InputStream in = stream.createRawInputStream()) {
            raw = in.readAllBytes();
        }
        byte[] deflated = deflate(raw);
        if (deflated.length > raw.length * (1 - MIN_SAVING)) return 0;
        COSBase params = stream.getDictionaryObject(COSName.DECODE_PARMS);
        try (OutputStream out = stream.createRawOutputStream()) {
            out.write(deflated);
        }
        COSArray filters = new COSArray();
        filters.add(COSName.FLATE_DECODE);
        filters.add(COSName.DCT_DECODE);
        stream.setItem(COSName.FILTER, filters);
        if (params != null) {
            COSArray parms = new COSArray();
            parms.add(COSNull.NULL);
            parms.add(params);
            stream.setItem(COSName.DECODE_PARMS, parms);
        }
        return raw.length - deflated.length;
    }

    private static byte[] deflate(byte[] data) {
        Deflater deflater = new Deflater(Deflater.BEST_COMPRESSION);
        try {
            deflater.setInput(data);
            deflater.finish();
            ByteArrayOutputStream out = new ByteArrayOutputStream(data.length / 2 + 64);
            byte[] buffer = new byte[64 * 1024];
            while (!deflater.finished()) out.write(buffer, 0, deflater.deflate(buffer));
            return out.toByteArray();
        } finally {
            deflater.end();
        }
    }

    /**
     * Swaps every image XObject for an empty form, as Ghostscript's FILTERIMAGE does for the server
     * path. Inline images in content streams are left alone.
     */
    public static void removeImages(PDDocument document) throws IOException {
        Set<COSStream> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        PDFormXObject empty = new PDFormXObject(document);
        empty.setBBox(new PDRectangle(0, 0, 0, 0));
        empty.setResources(new PDResources());
        for (PDPage page : document.getPages()) {
            removeImages(page.getResources(), empty, seen);
        }
    }

    private static void removeImages(
            PDResources resources, PDFormXObject empty, Set<COSStream> seen) throws IOException {
        if (resources == null) return;
        for (COSName name : resources.getXObjectNames()) {
            PDXObject xobject = resources.getXObject(name);
            if (xobject instanceof PDImageXObject) {
                resources.put(name, empty);
            } else if (xobject instanceof PDFormXObject form && seen.add(form.getCOSObject())) {
                removeImages(form.getResources(), empty, seen);
            }
        }
    }
}
