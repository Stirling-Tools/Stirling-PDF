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
@AutoConfigureMockMvc(addFilters = false) // Skip security filters
public class ConvertMarkdownToPdfIntegrationTest {

    @Autowired private MockMvc mockMvc;

    /**
     * Integration test for converting Markdown to PDF.
     *
     * <p>Note: This test requires weasyprint to be installed in the system. It will automatically
     * skip in environments where weasyprint is not available, so it's designed to be safe to run in
     * CI environments.
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

        // Load sample Markdown file from resources
        ClassPathResource markdownResource = new ClassPathResource("Markdown.md");
        MockMultipartFile mockFile =
                new MockMultipartFile(
                        "fileInput",
                        "Markdown.md",
                        "text/markdown",
                        markdownResource.getInputStream());

        // Test the conversion endpoint
        mockMvc.perform(
                        multipart("/api/v1/convert/markdown/pdf")
                                .file(mockFile)
                                .contentType(MediaType.MULTIPART_FORM_DATA))
                .andExpect(status().isOk())
                .andExpect(
                        header().string("Content-Type", MediaType.APPLICATION_OCTET_STREAM_VALUE));
    }
}
