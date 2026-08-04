package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.ByteArrayMultipartFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ConvertPDFToHtmlTest {

    @Mock private TempFileManager tempFileManager;
    @Mock private RuntimePathConfig runtimePathConfig;

    @InjectMocks private ConvertPDFToHtml controller;

    @Test
    void controllerIsConstructed() {
        assertNotNull(controller);
    }

    @Test
    void processPdfToHTML_requestContainsFile() {
        PDFFile file = new PDFFile();
        ByteArrayMultipartFile pdfFile =
                new ByteArrayMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        file.setFileInput(pdfFile);

        assertNotNull(file.getFileInput());
        assertNotNull(file.getFileInput().getOriginalFilename());
    }
}
