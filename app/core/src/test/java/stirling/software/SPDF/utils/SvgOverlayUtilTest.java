package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

class SvgOverlayUtilTest {

    @Test
    void isSvgImage_withSvgTag_returnsTrue() {
        byte[] bytes =
                "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>".getBytes(StandardCharsets.UTF_8);
        assertTrue(SvgOverlayUtil.isSvgImage(bytes));
    }

    @Test
    void isSvgImage_withXmlDeclarationAndSvg_returnsTrue() {
        byte[] bytes =
                "<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"
                        .getBytes(StandardCharsets.UTF_8);
        assertTrue(SvgOverlayUtil.isSvgImage(bytes));
    }

    @Test
    void isSvgImage_withUpperCaseSvgTag_returnsTrue() {
        byte[] bytes =
                "<SVG xmlns=\"http://www.w3.org/2000/svg\"></SVG>".getBytes(StandardCharsets.UTF_8);
        assertTrue(SvgOverlayUtil.isSvgImage(bytes));
    }

    @Test
    void isSvgImage_withNull_returnsFalse() {
        assertFalse(SvgOverlayUtil.isSvgImage(null));
    }

    @Test
    void isSvgImage_withEmptyArray_returnsFalse() {
        assertFalse(SvgOverlayUtil.isSvgImage(new byte[0]));
    }

    @Test
    void isSvgImage_withTooShortArray_returnsFalse() {
        assertFalse(SvgOverlayUtil.isSvgImage(new byte[] {1, 2, 3, 4}));
    }

    @Test
    void isSvgImage_withNonSvgContent_returnsFalse() {
        byte[] bytes = "<html><body>Hello</body></html>".getBytes(StandardCharsets.UTF_8);
        assertFalse(SvgOverlayUtil.isSvgImage(bytes));
    }

    @Test
    void isSvgImage_withXmlButNoSvg_returnsFalse() {
        byte[] bytes = "<?xml version=\"1.0\"?><html></html>".getBytes(StandardCharsets.UTF_8);
        assertFalse(SvgOverlayUtil.isSvgImage(bytes));
    }

    @Test
    void isSvgImage_withPdfBytes_returnsFalse() {
        byte[] bytes =
                "%PDF-1.4 some content here that is not SVG".getBytes(StandardCharsets.UTF_8);
        assertFalse(SvgOverlayUtil.isSvgImage(bytes));
    }

    @Test
    void isSvgImage_withSvgDeepInContent_withinFirst200Chars_returnsTrue() {
        String prefix = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>  ";
        String svgContent = "<svg width=\"100\" height=\"100\"></svg>";
        byte[] bytes = (prefix + svgContent).getBytes(StandardCharsets.UTF_8);
        assertTrue(SvgOverlayUtil.isSvgImage(bytes));
    }

    @Test
    void isSvgImage_withBinaryContent_returnsFalse() {
        byte[] bytes =
                new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}; // PNG header
        assertFalse(SvgOverlayUtil.isSvgImage(bytes));
    }
}
