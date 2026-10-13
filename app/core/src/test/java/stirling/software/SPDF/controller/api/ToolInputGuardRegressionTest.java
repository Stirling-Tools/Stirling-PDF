package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.controller.api.misc.StampController;
import stirling.software.SPDF.controller.api.security.WatermarkController;
import stirling.software.SPDF.model.api.general.SplitPdfBySizeOrCountRequest;
import stirling.software.SPDF.model.api.misc.AddStampRequest;
import stirling.software.SPDF.model.api.security.AddWatermarkRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

class ToolInputGuardRegressionTest {
    private final CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
    private final TempFileManager temps = mock(TempFileManager.class);

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "image"})
    void emptyStampImageIsAnInputError(String type) {
        AddStampRequest request = new AddStampRequest();
        request.setFileInput(
                new MockMultipartFile("fileInput", "in.pdf", "application/pdf", new byte[] {1}));
        request.setStampType(type);
        request.setStampImage(new MockMultipartFile("stampImage", new byte[0]));
        assertThrows(
                IllegalArgumentException.class,
                () -> new StampController(factory, temps).addStamp(request));
        verifyNoInteractions(factory);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "image"})
    void emptyWatermarkImageIsAnInputError(String type) {
        AddWatermarkRequest request = new AddWatermarkRequest();
        request.setFileInput(
                new MockMultipartFile("fileInput", "in.pdf", "application/pdf", new byte[] {1}));
        request.setWatermarkType(type);
        request.setWatermarkImage(new MockMultipartFile("watermarkImage", new byte[0]));
        assertThrows(
                IllegalArgumentException.class,
                () -> new WatermarkController(factory, temps).addWatermark(request));
        verifyNoInteractions(factory);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2})
    void countSplittingRequiresAnExplicitNumericValue(int type) {
        SplitPdfBySizeOrCountRequest request = new SplitPdfBySizeOrCountRequest();
        request.setSplitType(type);
        assertThrows(
                IllegalArgumentException.class,
                () -> new SplitPdfBySizeController(factory, temps).autoSplitPdf(request));
        verifyNoInteractions(factory, temps);
    }
}
