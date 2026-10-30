package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
import java.util.Map;
import java.util.zip.DeflaterOutputStream;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.filter.Filter;
import org.apache.pdfbox.filter.FilterFactory;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.Test;

import stirling.software.common.util.DecodedStreamLimit.BoundedFilter;
import stirling.software.common.util.ExceptionUtils.DecodedStreamTooLargeException;
import stirling.software.common.util.ExceptionUtils.ErrorCode;

class DecodedStreamLimitTest {

    private static final int CAP = 64 * 1024;

    @Test
    void aStreamDecodingPastTheCapIsRefused() throws IOException {
        Filter flate = new BoundedFilter(rawFlate(), () -> CAP);
        byte[] bomb = deflated(CAP + 1);

        assertThatThrownBy(
                        () ->
                                flate.decode(
                                        new ByteArrayInputStream(bomb),
                                        OutputStream.nullOutputStream(),
                                        new COSDictionary(),
                                        0))
                .isInstanceOfSatisfying(
                        DecodedStreamTooLargeException.class,
                        e ->
                                assertThat(e.getErrorCode())
                                        .isEqualTo(ErrorCode.DECODED_STREAM_TOO_LARGE.getCode()));
    }

    @Test
    void aStreamWithinTheCapDecodes() throws IOException {
        Filter flate = new BoundedFilter(rawFlate(), () -> CAP);
        ByteArrayOutputStream decoded = new ByteArrayOutputStream();

        flate.decode(new ByteArrayInputStream(deflated(CAP)), decoded, new COSDictionary(), 0);

        assertThat(decoded.size()).isEqualTo(CAP);
    }

    @Test
    void installWrapsEachFilterOnceAndKeepsEncodingWorking() throws IOException {
        DecodedStreamLimit.install();
        Filter flate = FilterFactory.INSTANCE.getFilter(COSName.FLATE_DECODE);
        DecodedStreamLimit.install();

        assertThat(flate).isInstanceOf(BoundedFilter.class);
        assertThat(FilterFactory.INSTANCE.getFilter(COSName.FLATE_DECODE)).isSameAs(flate);
        assertThat(FilterFactory.INSTANCE.getFilter(COSName.FLATE_DECODE_ABBREVIATION))
                .isSameAs(flate);
        try (PDDocument document = new PDDocument()) {
            PDImageXObject image =
                    LosslessFactory.createFromImage(
                            document, new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB));
            assertThat(image.getImage().getWidth()).isEqualTo(4);
        }
    }

    @Test
    void aContentStreamPastTheCapFailsTheRenderInsteadOfDrawingABlankPage() throws IOException {
        Map<COSName, Filter> registry = filterRegistry();
        Filter original = registry.get(COSName.FLATE_DECODE);
        registry.put(COSName.FLATE_DECODE, new BoundedFilter(rawFlate(), () -> CAP));
        try (PDDocument document = new PDDocument()) {
            COSStream content = document.getDocument().createCOSStream();
            try (OutputStream out = content.createRawOutputStream()) {
                out.write(deflated(CAP + 1));
            }
            // An array of filters takes PDFBox's buffered path, as any filter but a lone
            // FlateDecode does; a lone FlateDecode is streamed and never buffered.
            content.setItem(COSName.FILTER, new COSArray(List.of(COSName.FLATE_DECODE)));
            PDPage page = new PDPage();
            page.getCOSObject().setItem(COSName.CONTENTS, content);
            document.addPage(page);

            assertThatThrownBy(() -> new LimitedPDFRenderer(document).renderImage(0))
                    .isInstanceOf(DecodedStreamTooLargeException.class);
        } finally {
            registry.put(COSName.FLATE_DECODE, original);
        }
    }

    private static Map<COSName, Filter> filterRegistry() {
        try {
            return DecodedStreamLimit.filterRegistry();
        } catch (ReflectiveOperationException e) {
            throw new AssertionError("PDFBox's FilterFactory no longer has its filters map", e);
        }
    }

    /** Unwrapped even after another test installs the limit. */
    private static Filter rawFlate() {
        Filter flate = filterRegistry().get(COSName.FLATE_DECODE);
        return flate instanceof BoundedFilter bounded ? bounded.delegate() : flate;
    }

    private static byte[] deflated(int zeroBytes) throws IOException {
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        try (DeflaterOutputStream deflater = new DeflaterOutputStream(encoded)) {
            deflater.write(new byte[zeroBytes]);
        }
        return encoded.toByteArray();
    }
}
