package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.lang.reflect.Method;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.cos.COSObjectKey;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceGray;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.controller.api.misc.ExtractImagesController.ImageFingerprints;

class ExtractImagesDedupKeyTest {

    private static String key(PDImageXObject image) throws Exception {
        Method m =
                ExtractImagesController.class.getDeclaredMethod(
                        "imageContentKey", PDImageXObject.class);
        m.setAccessible(true);
        return (String) m.invoke(null, image);
    }

    private static BufferedImage solid(int type, Color c) {
        BufferedImage img = new BufferedImage(40, 30, type);
        Graphics2D g = img.createGraphics();
        g.setColor(c);
        g.fillRect(0, 0, 40, 30);
        g.dispose();
        return img;
    }

    @Test
    void argbWithSoftMask_twoIdenticalEmbeds_sameKey() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            BufferedImage img = solid(BufferedImage.TYPE_INT_ARGB, new Color(30, 90, 180, 128));
            PDImageXObject a = LosslessFactory.createFromImage(doc, img);
            PDImageXObject b = LosslessFactory.createFromImage(doc, img);
            assertThat(a.getCOSObject().getItem(COSName.SMASK)).isNotNull();
            assertThat(key(a)).isEqualTo(key(b));
        }
    }

    @Test
    void sameBytesDifferentPalette_differentKeys() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            byte[] raw = {0x00, 0x01, 0x00, 0x01};
            PDImageXObject a =
                    new PDImageXObject(
                            doc,
                            new ByteArrayInputStream(raw),
                            COSName.FLATE_DECODE,
                            4,
                            1,
                            8,
                            PDDeviceGray.INSTANCE);
            PDImageXObject b =
                    new PDImageXObject(
                            doc,
                            new ByteArrayInputStream(raw),
                            COSName.FLATE_DECODE,
                            4,
                            1,
                            8,
                            PDDeviceGray.INSTANCE);
            a.getCOSObject()
                    .setItem(
                            COSName.COLORSPACE,
                            indexed(new byte[] {(byte) 0xFF, 0, 0, 0, (byte) 0xFF, 0}));
            b.getCOSObject()
                    .setItem(
                            COSName.COLORSPACE,
                            indexed(new byte[] {0, 0, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, 0}));
            assertThat(key(a)).isNotEqualTo(key(b));
        }
    }

    @Test
    void sameBytesDifferentDecodeParms_differentKeys() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            byte[] raw = {0x02, 0x0A, 0x14, 0x1E};
            PDImageXObject a =
                    new PDImageXObject(
                            doc,
                            new ByteArrayInputStream(raw),
                            COSName.FLATE_DECODE,
                            4,
                            1,
                            8,
                            PDDeviceGray.INSTANCE);
            PDImageXObject b =
                    new PDImageXObject(
                            doc,
                            new ByteArrayInputStream(raw),
                            COSName.FLATE_DECODE,
                            4,
                            1,
                            8,
                            PDDeviceGray.INSTANCE);
            org.apache.pdfbox.cos.COSDictionary parms = new org.apache.pdfbox.cos.COSDictionary();
            parms.setInt(COSName.PREDICTOR, 12);
            parms.setInt(COSName.COLORS, 1);
            parms.setInt(COSName.COLUMNS, 4);
            parms.setInt(COSName.BITS_PER_COMPONENT, 8);
            b.getCOSObject().setItem(COSName.DECODE_PARMS, parms);
            assertThat(key(a)).isNotEqualTo(key(b));
        }
    }

    @Test
    void sameBytesDifferentSoftMask_differentKeys() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            BufferedImage base = solid(BufferedImage.TYPE_INT_RGB, new Color(10, 20, 30));
            PDImageXObject a = JPEGFactory.createFromImage(doc, base);
            PDImageXObject b = JPEGFactory.createFromImage(doc, base);
            assertThat(key(a)).isEqualTo(key(b));

            byte[] maskA = new byte[40 * 30];
            byte[] maskB = new byte[40 * 30];
            java.util.Arrays.fill(maskB, (byte) 0x7F);
            b.getCOSObject()
                    .setItem(
                            COSName.SMASK,
                            new PDImageXObject(
                                            doc,
                                            new ByteArrayInputStream(maskB),
                                            COSName.FLATE_DECODE,
                                            40,
                                            30,
                                            8,
                                            PDDeviceGray.INSTANCE)
                                    .getCOSObject());
            a.getCOSObject()
                    .setItem(
                            COSName.SMASK,
                            new PDImageXObject(
                                            doc,
                                            new ByteArrayInputStream(maskA),
                                            COSName.FLATE_DECODE,
                                            40,
                                            30,
                                            8,
                                            PDDeviceGray.INSTANCE)
                                    .getCOSObject());
            assertThat(key(a)).isNotEqualTo(key(b));
        }
    }

    @Test
    void iccLikeIndirectColorSpace_twoIdenticalEmbeds_sameKey() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            byte[] raw = {0x01, 0x02, 0x03, 0x04};
            PDImageXObject a =
                    new PDImageXObject(
                            doc,
                            new ByteArrayInputStream(raw),
                            COSName.FLATE_DECODE,
                            4,
                            1,
                            8,
                            PDDeviceRGB.INSTANCE);
            PDImageXObject b =
                    new PDImageXObject(
                            doc,
                            new ByteArrayInputStream(raw),
                            COSName.FLATE_DECODE,
                            4,
                            1,
                            8,
                            PDDeviceRGB.INSTANCE);
            a.getCOSObject().setItem(COSName.COLORSPACE, indexed(new byte[] {1, 2, 3, 4, 5, 6}));
            b.getCOSObject().setItem(COSName.COLORSPACE, indexed(new byte[] {1, 2, 3, 4, 5, 6}));
            assertThat(key(a)).isEqualTo(key(b));
        }
    }

    @Test
    void sharedSubGraph_isWalkedOncePerObject() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDImageXObject image =
                    new PDImageXObject(
                            doc,
                            new ByteArrayInputStream(new byte[] {0x01, 0x02, 0x03, 0x04}),
                            COSName.FLATE_DECODE,
                            4,
                            1,
                            8,
                            PDDeviceGray.INSTANCE);
            image.getCOSObject().setItem(COSName.DECODE_PARMS, sharedChild(16, 4));

            assertTimeoutPreemptively(
                    Duration.ofSeconds(5), () -> assertThat(key(image)).isNotNull());
        }
    }

    @Test
    void oversizedObjectGraph_isRejectedRatherThanWalked() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDImageXObject image =
                    new PDImageXObject(
                            doc,
                            new ByteArrayInputStream(new byte[] {0x01, 0x02, 0x03, 0x04}),
                            COSName.FLATE_DECODE,
                            4,
                            1,
                            8,
                            PDDeviceGray.INSTANCE);
            image.getCOSObject().setItem(COSName.DECODE_PARMS, wideDictionary(5000));

            assertThatThrownBy(() -> key(image)).hasRootCauseInstanceOf(IOException.class);
        }
    }

    @Test
    void softMaskMatteOnlyDifference_differentKeys() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            BufferedImage img = solid(BufferedImage.TYPE_INT_RGB, new Color(10, 20, 30));
            PDImageXObject a = JPEGFactory.createFromImage(doc, img);
            PDImageXObject b = JPEGFactory.createFromImage(doc, img);
            a.getCOSObject().setItem(COSName.SMASK, softMask(doc).getCOSObject());

            COSDictionary maskWithMatte = softMask(doc).getCOSObject();
            COSArray matte = new COSArray();
            matte.add(new COSFloat(0.25f));
            matte.add(new COSFloat(0.5f));
            matte.add(new COSFloat(0.75f));
            maskWithMatte.setItem(COSName.MATTE, matte);
            b.getCOSObject().setItem(COSName.SMASK, maskWithMatte);

            assertThat(key(a)).isNotEqualTo(key(b));
        }
    }

    /**
     * The fallback key for an image that cannot be fingerprinted must be exact rather than a hash
     * of the object, so two unfingerprintable images can never collapse into one zip entry. A
     * per-document sequence is exact; anything derived from the object's own identity is not, which
     * is what a second run over fresh objects catches.
     */
    @Test
    void unfingerprintableImages_getExactPerDocumentFallbackKeys() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            List<String> first = fallbackKeys(doc, 3);
            List<String> second = fallbackKeys(doc, 3);

            assertThat(first).doesNotHaveDuplicates().isEqualTo(second);
        }
    }

    @Test
    void unfingerprintableImage_isFirstOccurrenceOnlyOnce() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            ImageFingerprints fingerprints = new ImageFingerprints();
            PDImageXObject image = unfingerprintable(doc);

            assertThat(fingerprints.isFirstOccurrence(image)).isTrue();
            assertThat(fingerprints.isFirstOccurrence(image)).isFalse();
            assertThat(fingerprints.isFirstOccurrence(unfingerprintable(doc))).isTrue();
        }
    }

    private static List<String> fallbackKeys(PDDocument doc, int images) throws IOException {
        ImageFingerprints fingerprints = new ImageFingerprints();
        List<String> keys = new ArrayList<>();
        for (int i = 0; i < images; i++) {
            keys.add(fingerprints.keyFor(unfingerprintable(doc)));
        }
        return keys;
    }

    private static PDImageXObject unfingerprintable(PDDocument doc) throws IOException {
        PDImageXObject image =
                new PDImageXObject(
                        doc,
                        new ByteArrayInputStream(new byte[] {0x01, 0x02, 0x03, 0x04}),
                        COSName.FLATE_DECODE,
                        4,
                        1,
                        8,
                        PDDeviceGray.INSTANCE);
        image.getCOSObject().setItem(COSName.DECODE_PARMS, wideDictionary(5000));
        return image;
    }

    private static PDImageXObject softMask(PDDocument doc) throws IOException {
        byte[] mask = new byte[40 * 30];
        java.util.Arrays.fill(mask, (byte) 0x40);
        return new PDImageXObject(
                doc,
                new ByteArrayInputStream(mask),
                COSName.FLATE_DECODE,
                40,
                30,
                8,
                PDDeviceGray.INSTANCE);
    }

    @Test
    void metadataOnlyDifference_sameKey() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            BufferedImage img = solid(BufferedImage.TYPE_INT_RGB, new Color(10, 20, 30));
            PDImageXObject a = JPEGFactory.createFromImage(doc, img);
            PDImageXObject b = JPEGFactory.createFromImage(doc, img);
            b.getCOSObject().setItem(COSName.METADATA, wideDictionary(8));
            assertThat(key(a)).isEqualTo(key(b));
        }
    }

    /**
     * A chain of {@code levels} dictionaries in which every one of a node's {@code fanOut} entries
     * points at the same child object, so a walk that forgets a node once it leaves it re-walks the
     * child once per incoming edge.
     */
    private static COSObject sharedChild(int levels, int fanOut) {
        COSObject node = new COSObject(new COSDictionary(), new COSObjectKey(levels + 1L, 0));
        for (int level = levels; level >= 1; level--) {
            COSDictionary dictionary = new COSDictionary();
            for (int edge = 0; edge < fanOut; edge++) {
                dictionary.setItem(COSName.getPDFName("Edge" + edge), node);
            }
            node = new COSObject(dictionary, new COSObjectKey(level, 0));
        }
        return node;
    }

    private static COSDictionary wideDictionary(int entries) {
        COSDictionary dictionary = new COSDictionary();
        for (int i = 0; i < entries; i++) {
            dictionary.setInt(COSName.getPDFName("K" + i), i);
        }
        return dictionary;
    }

    private static COSArray indexed(byte[] palette) {
        COSArray cs = new COSArray();
        cs.add(COSName.INDEXED);
        cs.add(COSName.DEVICERGB);
        cs.add(COSInteger.get(1));
        cs.add(new COSString(palette));
        return cs;
    }
}
