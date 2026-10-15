package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.ObjectMapper;

/** Which endpoints need an input file, so file-less ones (create-pdf, url-to-pdf) can run. */
class McpFileParametersTest {

    @SuppressWarnings("unused")
    static class Handlers {
        public void plainFile(@RequestParam("fileInput") MultipartFile file) {}

        public void fileInRequest(WithFile request) {}

        public void fileListInRequest(WithFileList request) {}

        public void noFile(@RequestParam("document") String document, NoFile request) {}
    }

    @SuppressWarnings("unused")
    static class WithFile {
        MultipartFile fileInput;
    }

    @SuppressWarnings("unused")
    static class WithFileList {
        List<MultipartFile> files;
    }

    @SuppressWarnings("unused")
    static class NoFile {
        String urlInput;
    }

    @Test
    void endpointsWithAFileParameterOrFieldTakeAFile() throws Exception {
        assertTrue(McpFileParameters.takesFile(meta("plainFile", MultipartFile.class)));
        assertTrue(McpFileParameters.takesFile(meta("fileInRequest", WithFile.class)));
        assertTrue(McpFileParameters.takesFile(meta("fileListInRequest", WithFileList.class)));
    }

    @Test
    void endpointsWithoutAnyFileRunWithoutInput() throws Exception {
        assertFalse(McpFileParameters.takesFile(meta("noFile", String.class, NoFile.class)));
    }

    private static OperationMeta meta(String method, Class<?>... types) throws Exception {
        HandlerMethod handler =
                new HandlerMethod(new Handlers(), Handlers.class.getMethod(method, types));
        return new OperationMeta(
                method,
                OperationCategory.MISC,
                method,
                new ObjectMapper().createObjectNode(),
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/misc/" + method,
                handler);
    }
}
