package stirling.software.proprietary.formdetection.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.proprietary.formdetection.service.FormDetectionModelManager;

/**
 * Tests the serve controller's logic directly (status, headers, region bounds). Serializing a
 * ResourceRegion needs the full Spring resource converters, which standaloneSetup does not wire, so
 * exercising the method directly is both simpler and converter-independent.
 */
class FormDetectionModelServeControllerTest {

    private FormDetectionModelManager managerWith(Path model) {
        FormDetectionModelManager manager = Mockito.mock(FormDetectionModelManager.class);
        Mockito.when(manager.getActiveModelFile())
                .thenReturn(model == null ? Optional.empty() : Optional.of(model));
        Mockito.when(manager.getActiveEtag()).thenReturn(Optional.of("a".repeat(64)));
        return manager;
    }

    @Test
    void servesFullModelWithPublicCacheAndAcceptRanges(@TempDir Path dir) throws Exception {
        Path model = dir.resolve("m.onnx");
        Files.write(model, "abcdefghij".getBytes());

        ResponseEntity<Object> resp =
                new FormDetectionModelServeController(managerWith(model))
                        .serveModel(new HttpHeaders());

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("bytes", resp.getHeaders().getFirst(HttpHeaders.ACCEPT_RANGES));
        assertNotNull(resp.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL));
        assertTrue(resp.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL).contains("public"));
        assertNotNull(resp.getHeaders().getETag());
        assertTrue(resp.getBody() instanceof Resource);
    }

    @Test
    void servesRangeRequestAsSingleRegion(@TempDir Path dir) throws Exception {
        Path model = dir.resolve("m.onnx");
        Files.write(model, "abcdefghij".getBytes());
        HttpHeaders headers = new HttpHeaders();
        headers.setRange(List.of(HttpRange.createByteRange(0, 3)));

        ResponseEntity<Object> resp =
                new FormDetectionModelServeController(managerWith(model)).serveModel(headers);

        assertEquals(HttpStatus.PARTIAL_CONTENT, resp.getStatusCode());
        assertEquals("bytes", resp.getHeaders().getFirst(HttpHeaders.ACCEPT_RANGES));
        assertTrue(resp.getBody() instanceof ResourceRegion, "body should be a single region");
        ResourceRegion region = (ResourceRegion) resp.getBody();
        assertEquals(0L, region.getPosition());
        assertEquals(4L, region.getCount()); // bytes 0-3 inclusive
    }

    @Test
    void returns404WhenNoModelInstalled() throws Exception {
        ResponseEntity<Object> resp =
                new FormDetectionModelServeController(managerWith(null))
                        .serveModel(new HttpHeaders());
        assertEquals(HttpStatus.NOT_FOUND, resp.getStatusCode());
    }
}
