package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.method.HandlerMethod;

import io.swagger.v3.oas.models.Operation;

import stirling.software.common.config.swagger.ToolIOOperationCustomizer;

class ToolIOInputExtensionsTest {
    @ParameterizedTest
    @CsvSource(
            delimiter = ';',
            value = {
                "ConvertSvgToPDF;convertSvgToPdf;svg",
                "ConvertHtmlToPDF;HtmlToPdf;html,zip",
                "ConvertMarkdownToPdf;markdownToPdf;md,zip",
                "ConvertImgPDFController;convertCbzToPdf;cbz,zip",
                "ConvertImgPDFController;convertCbrToPdf;cbr,rar"
            })
    void converterRestrictionsOverrideBroadCategories(
            String controller, String method, String suffixes) throws Exception {
        assertEquals(List.of(suffixes.split(",")), inputExtensions(controller, method));
    }

    @Test
    void imageInputsFollowTheInstalledReaders() throws Exception {
        List<?> extensions = inputExtensions("ConvertImgPDFController", "convertToPdf");
        assertTrue(
                extensions.containsAll(
                        List.of("png", "jpg", "jpeg", "tiff", "webp", "psd", "wbmp")));
        assertFalse(extensions.contains("ai"));
        assertFalse(extensions.contains("eps"));
        assertFalse(extensions.contains("raw"));
    }

    private static List<?> inputExtensions(String controller, String methodName) throws Exception {
        Class<?> type =
                Class.forName("stirling.software.SPDF.controller.api.converters." + controller);
        Method method =
                Arrays.stream(type.getMethods())
                        .filter(candidate -> candidate.getName().equals(methodName))
                        .findFirst()
                        .orElseThrow();
        Operation operation =
                new ToolIOOperationCustomizer()
                        .customize(new Operation(), new HandlerMethod(type, method));
        Map<?, ?> declaration = (Map<?, ?>) operation.getExtensions().get("x-stirling-io");
        return (List<?>) declaration.get("inputExtensions");
    }
}
