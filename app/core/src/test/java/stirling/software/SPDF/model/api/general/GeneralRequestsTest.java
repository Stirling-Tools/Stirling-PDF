package stirling.software.SPDF.model.api.general;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class GeneralRequestsTest {

    @Nested
    @DisplayName("RotatePDFRequest")
    class Rotate {

        @Test
        @DisplayName("defaults to 90 degrees")
        void defaultAngle() {
            assertThat(new RotatePDFRequest().getAngle()).isEqualTo(90);
        }

        @Test
        @DisplayName("angle setter and equality including inherited fileInput")
        void setterAndEquality() {
            RotatePDFRequest a = new RotatePDFRequest();
            a.setAngle(180);
            a.setFileInput(new MockMultipartFile("f", new byte[] {1}));

            RotatePDFRequest b = new RotatePDFRequest();
            b.setAngle(180);
            b.setFileInput(a.getFileInput());

            assertThat(a.getAngle()).isEqualTo(180);
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
            assertThat(a.toString()).contains("RotatePDFRequest");
        }
    }

    @Nested
    @DisplayName("ScalePagesRequest")
    class Scale {

        @Test
        @DisplayName("scale factor and inherited page size round-trip")
        void roundTrip() {
            ScalePagesRequest req = new ScalePagesRequest();
            req.setScaleFactor(1.5f);
            req.setPageSize("A4");

            assertThat(req.getScaleFactor()).isEqualTo(1.5f);
            assertThat(req.getPageSize()).isEqualTo("A4");
            assertThat(req.getOrientation()).isEqualTo("PORTRAIT");
        }

        @Test
        @DisplayName("equality differs when scale differs")
        void equalityDiffers() {
            ScalePagesRequest a = new ScalePagesRequest();
            a.setScaleFactor(1f);
            ScalePagesRequest b = new ScalePagesRequest();
            b.setScaleFactor(2f);

            assertThat(a).isNotEqualTo(b);
        }
    }

    @Nested
    @DisplayName("CropPdfForm")
    class Crop {

        @Test
        @DisplayName("boolean defaults: removeDataOutsideCrop=true, autoCrop=false")
        void defaults() {
            CropPdfForm form = new CropPdfForm();
            assertThat(form.isRemoveDataOutsideCrop()).isTrue();
            assertThat(form.isAutoCrop()).isFalse();
        }

        @Test
        @DisplayName("coordinate accessors round-trip")
        void coordinates() {
            CropPdfForm form = new CropPdfForm();
            form.setX(1f);
            form.setY(2f);
            form.setWidth(100f);
            form.setHeight(200f);
            form.setAutoCrop(true);
            form.setRemoveDataOutsideCrop(false);

            assertThat(form.getX()).isEqualTo(1f);
            assertThat(form.getY()).isEqualTo(2f);
            assertThat(form.getWidth()).isEqualTo(100f);
            assertThat(form.getHeight()).isEqualTo(200f);
            assertThat(form.isAutoCrop()).isTrue();
            assertThat(form.isRemoveDataOutsideCrop()).isFalse();
            assertThat(form.toString()).contains("CropPdfForm");
        }
    }

    @Nested
    @DisplayName("BookletImpositionRequest")
    class Booklet {

        @Test
        @DisplayName("defaults are applied")
        void defaults() {
            BookletImpositionRequest req = new BookletImpositionRequest();
            assertThat(req.getPagesPerSheet()).isEqualTo(2);
            assertThat(req.getAddBorder()).isFalse();
            assertThat(req.getSpineLocation()).isEqualTo("LEFT");
            assertThat(req.getAddGutter()).isFalse();
            assertThat(req.getGutterSize()).isEqualTo(12f);
            assertThat(req.getDoubleSided()).isTrue();
            assertThat(req.getDuplexPass()).isEqualTo("BOTH");
            assertThat(req.getFlipOnShortEdge()).isFalse();
        }

        @Test
        @DisplayName("setters and equality")
        void setters() {
            BookletImpositionRequest a = new BookletImpositionRequest();
            a.setSpineLocation("RIGHT");
            a.setAddGutter(true);
            a.setGutterSize(20f);
            a.setDuplexPass("FIRST");
            BookletImpositionRequest b = new BookletImpositionRequest();
            b.setSpineLocation("RIGHT");
            b.setAddGutter(true);
            b.setGutterSize(20f);
            b.setDuplexPass("FIRST");

            assertThat(a.getSpineLocation()).isEqualTo("RIGHT");
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        }
    }

    @Nested
    @DisplayName("PosterPdfRequest")
    class Poster {

        @Test
        @DisplayName("defaults are applied")
        void defaults() {
            PosterPdfRequest req = new PosterPdfRequest();
            assertThat(req.getPageSize()).isEqualTo("A4");
            assertThat(req.getXFactor()).isEqualTo(2);
            assertThat(req.getYFactor()).isEqualTo(2);
            assertThat(req.isRightToLeft()).isFalse();
        }

        @Test
        @DisplayName("setters round-trip")
        void setters() {
            PosterPdfRequest req = new PosterPdfRequest();
            req.setPageSize("A3");
            req.setXFactor(3);
            req.setYFactor(4);
            req.setRightToLeft(true);

            assertThat(req.getPageSize()).isEqualTo("A3");
            assertThat(req.getXFactor()).isEqualTo(3);
            assertThat(req.getYFactor()).isEqualTo(4);
            assertThat(req.isRightToLeft()).isTrue();
            assertThat(req.toString()).contains("PosterPdfRequest");
        }
    }

    @Nested
    @DisplayName("MergeMultiplePagesRequest")
    class MergeMultiple {

        @Test
        @DisplayName("pagesPerSheet defaults to 2 and accessors round-trip")
        void roundTrip() {
            MergeMultiplePagesRequest req = new MergeMultiplePagesRequest();
            assertThat(req.getPagesPerSheet()).isEqualTo(2);

            req.setMode("grid");
            req.setArrangement("a");
            req.setReadingDirection("ltr");
            req.setRows(3);
            req.setCols(2);
            req.setOrientation("PORTRAIT");
            req.setInnerMargin(10);
            req.setTopMargin(1);
            req.setBottomMargin(2);
            req.setLeftMargin(3);
            req.setRightMargin(4);
            req.setBorderWidth(2);
            req.setAddBorder(true);

            assertThat(req.getMode()).isEqualTo("grid");
            assertThat(req.getRows()).isEqualTo(3);
            assertThat(req.getCols()).isEqualTo(2);
            assertThat(req.getInnerMargin()).isEqualTo(10);
            assertThat(req.getBorderWidth()).isEqualTo(2);
            assertThat(req.getAddBorder()).isTrue();
            assertThat(req.toString()).contains("MergeMultiplePagesRequest");
        }
    }

    @Nested
    @DisplayName("OverlayPdfsRequest")
    class Overlay {

        @Test
        @DisplayName("accessors round-trip")
        void roundTrip() {
            OverlayPdfsRequest req = new OverlayPdfsRequest();
            req.setOverlayMode("interleave");
            req.setCounts(new int[] {1, 2});
            req.setOverlayPosition(1);

            assertThat(req.getOverlayMode()).isEqualTo("interleave");
            assertThat(req.getCounts()).containsExactly(1, 2);
            assertThat(req.getOverlayPosition()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("RearrangePagesRequest")
    class Rearrange {

        @Test
        @DisplayName("custom mode and inherited page numbers round-trip")
        void roundTrip() {
            RearrangePagesRequest req = new RearrangePagesRequest();
            req.setCustomMode("REVERSE_ORDER");
            req.setPageNumbers("1,2,3");

            assertThat(req.getCustomMode()).isEqualTo("REVERSE_ORDER");
            assertThat(req.getPageNumbers()).isEqualTo("1,2,3");
        }
    }

    @Nested
    @DisplayName("SplitPdfBySizeOrCountRequest")
    class SplitBySizeOrCount {

        @Test
        @DisplayName("split type and value round-trip")
        void roundTrip() {
            SplitPdfBySizeOrCountRequest req = new SplitPdfBySizeOrCountRequest();
            req.setSplitType(1);
            req.setSplitValue("10MB");

            assertThat(req.getSplitType()).isEqualTo(1);
            assertThat(req.getSplitValue()).isEqualTo("10MB");
            assertThat(req.toString()).contains("SplitPdfBySizeOrCountRequest");
        }
    }
}
