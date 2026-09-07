package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.lang.reflect.Method;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceGray;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.Test;

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

    private static COSArray indexed(byte[] palette) {
        COSArray cs = new COSArray();
        cs.add(COSName.INDEXED);
        cs.add(COSName.DEVICERGB);
        cs.add(COSInteger.get(1));
        cs.add(new COSString(palette));
        return cs;
    }
}
