package stirling.software.SPDF.utils;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "spring.security.enabled=false",
            "security.enableLogin=false",
            "security.csrfDisabled=true",
            "system.enableUrlToPDF=false",
            "system.enableAlphaFunctionality=false",
            "system.disableSanitize=false"
        })
@AutoConfigureMockMvc(addFilters = false)
public class ConvertPDFToMarkdownIntegrationTest {

    @Autowired private MockMvc mockMvc;

    /** 正常 PDF 转换 Markdown */
    @Test
    public void convertValidPdfToMarkdown_shouldReturnMarkdownBytes() throws Exception {
        ClassPathResource pdfResource = new ClassPathResource("sample/sample.pdf");
        MockMultipartFile mockFile =
                new MockMultipartFile(
                        "fileInput", "sample.pdf", "application/pdf", pdfResource.getInputStream());

        mockMvc.perform(
                        multipart("/api/v1/convert/pdf/markdown")
                                .file(mockFile)
                                .contentType(MediaType.MULTIPART_FORM_DATA))
                .andExpect(status().isOk())
                .andExpect(
                        header().string("Content-Type", MediaType.APPLICATION_OCTET_STREAM_VALUE));
    }

    /**
     * This test verifies the behavior when an empty PDF file is uploaded.
     *
     * <p>❌ This test fails because the source code does NOT check whether the uploaded file is
     * empty. It directly tries to parse it with PDFBox, which throws an IOException.
     *
     * <p>✅ Expected behavior: The controller should check `fileInput.isEmpty()` and return HTTP 400
     * Bad Request.
     */
    @Test
    public void convertEmptyPdfFile_shouldReturnError() throws Exception {
        MockMultipartFile emptyFile =
                new MockMultipartFile("fileInput", "empty.pdf", "application/pdf", new byte[0]);

        mockMvc.perform(
                        multipart("/api/v1/convert/pdf/markdown")
                                .file(emptyFile)
                                .contentType(MediaType.MULTIPART_FORM_DATA))
                .andExpect(status().isBadRequest());
    }

    /**
     * This test verifies the behavior when no `fileInput` field is provided in the request.
     *
     * <p>❌ This test fails because the source code does NOT check whether `fileInput` is null. It
     * tries to access `fileInput.getOriginalFilename()` without null-check, causing
     * NullPointerException.
     *
     * <p>✅ Expected behavior: The controller should check if `fileInput == null` and return HTTP
     * 400 Bad Request with a meaningful error message like "Missing file input".
     */
        @Test
        public void missingFileInput_shouldReturnError() throws Exception {
            mockMvc.perform(
                            multipart("/api/v1/convert/pdf/markdown")
                                    .contentType(MediaType.MULTIPART_FORM_DATA))
                    .andExpect(status().isBadRequest());
        }

    /** MIME 类型错误应失败 */
    @Test
    public void convertWrongMimeType_shouldReturnError() throws Exception {
        MockMultipartFile wrongMimeFile =
                new MockMultipartFile(
                        "fileInput",
                        "notpdf.txt",
                        "text/plain",
                        "Not a real PDF.".getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(
                        multipart("/api/v1/convert/pdf/markdown")
                                .file(wrongMimeFile)
                                .contentType(MediaType.MULTIPART_FORM_DATA))
                .andExpect(status().isBadRequest());
    }
}
