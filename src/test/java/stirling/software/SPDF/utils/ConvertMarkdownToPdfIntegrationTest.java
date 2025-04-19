package stirling.software.SPDF.utils;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import net.bytebuddy.implementation.bytecode.Throw;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;

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
@AutoConfigureMockMvc(addFilters = false) // Skip security filters for integration test
public class ConvertMarkdownToPdfIntegrationTest {

    @Autowired private MockMvc mockMvc;

    /**
     * Test case: Valid Markdown file input
     *
     * <p>This test verifies that a proper Markdown file is converted successfully to PDF. If
     * weasyprint is missing, this test will be skipped automatically.
     */
    @Test
    public void convertValidMarkdownToPdf_shouldReturnPdfBytes() throws Exception {
        // Skip test automatically if weasyprint is missing
        try {
            ProcessBuilder pb = new ProcessBuilder("which", "weasyprint");
            Process process = pb.start();
            int exitCode = process.waitFor();
            org.junit.jupiter.api.Assumptions.assumeTrue(
                    exitCode == 0,
                    "Skipping test: weasyprint is not installed in this environment");
        } catch (Exception e) {
            org.junit.jupiter.api.Assumptions.assumeTrue(
                    false, "Skipping test: weasyprint availability check failed");
            return;
        }

        // Load sample Markdown file from test resources
        ClassPathResource markdownResource = new ClassPathResource("Markdown.md");
        MockMultipartFile mockFile =
                new MockMultipartFile(
                        "fileInput",
                        "Markdown.md",
                        "text/markdown",
                        markdownResource.getInputStream());

        mockMvc.perform(
                        multipart("/api/v1/convert/markdown/pdf")
                                .file(mockFile)
                                .contentType(MediaType.MULTIPART_FORM_DATA))
                .andExpect(status().isOk())
                .andExpect(
                        header().string("Content-Type", MediaType.APPLICATION_OCTET_STREAM_VALUE));
    }

    /**
     * Test case: Empty Markdown file
     *
     * <p>❌ This test will fail unless the source code explicitly checks for empty input. Source
     * code should handle fileInput.isEmpty() and return HTTP 400.
     */
    @Test
    public void convertEmptyMarkdownFile_shouldReturnError() throws Exception {
        MockMultipartFile emptyFile =
                new MockMultipartFile("fileInput", "empty.md", "text/markdown", new byte[0]);

        mockMvc.perform(
                        multipart("/api/v1/convert/markdown/pdf")
                                .file(emptyFile)
                                .contentType(MediaType.MULTIPART_FORM_DATA))
                .andExpect(status().isBadRequest());// but there is throws IO Exception

    }

    /**
     * Test case: Missing fileInput field
     *
     * <p>❌ This test will fail with NullPointerException unless the controller checks fileInput !=
     * null. Controller should return HTTP 400 Bad Request for missing file input.
     */
    @Test
    public void missingFileInput_shouldReturnError() throws Exception {
        mockMvc.perform(
                        multipart("/api/v1/convert/markdown/pdf")
                                .contentType(MediaType.MULTIPART_FORM_DATA))
                .andExpect(status().isBadRequest());// but there is throws IllegalArgument Exception
    }
}
