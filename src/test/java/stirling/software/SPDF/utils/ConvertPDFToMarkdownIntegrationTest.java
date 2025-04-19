package stirling.software.SPDF.utils;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

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
@AutoConfigureMockMvc(addFilters = false) // 跳过安全过滤器
public class ConvertPDFToMarkdownIntegrationTest {

    @Autowired private MockMvc mockMvc;

    @Test
    public void convertValidPdfToMarkdown_shouldReturnMarkdownBytes() throws Exception {
        // Load sample PDF file from resources
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

    // The Markdown to PDF integration test is omitted because it requires weasyprint, which
    // is unlikely to be available in the test environment. The unit test in
    // ConvertMarkdownToPdfTest.java already tests the controller logic thoroughly with mocks.
}
