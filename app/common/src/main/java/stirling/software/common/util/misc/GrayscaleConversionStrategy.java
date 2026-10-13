package stirling.software.common.util.misc;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.doc.PdfColorConverter;

@Slf4j
public class GrayscaleConversionStrategy extends ReplaceAndInvertColorStrategy {

    private final TempFileManager tempFileManager;

    public GrayscaleConversionStrategy(
            MultipartFile file,
            ReplaceAndInvert replaceAndInvert,
            TempFileManager tempFileManager) {
        super(file, replaceAndInvert);
        this.tempFileManager = tempFileManager;
    }

    @Override
    public InputStreamResource replace() throws IOException {
        try (TempFile tempInput = new TempFile(tempFileManager, ".pdf");
                TempFile tempOutput = new TempFile(tempFileManager, ".pdf")) {

            Path tempInputFile = tempInput.getPath();
            Path tempOutputFile = tempOutput.getPath();

            Files.write(tempInputFile, getFileInput().getBytes());

            log.info("Starting grayscale color conversion");

            try (PdfDocument document = PdfDocument.open(tempInputFile)) {
                int converted = PdfColorConverter.toGrayscale(document);
                log.info("Converted {} objects to grayscale", converted);
                document.save(tempOutputFile);
            }

            byte[] pdfBytes = Files.readAllBytes(tempOutputFile);
            return new InputStreamResource(new ByteArrayInputStream(pdfBytes));

        } catch (Exception e) {
            log.warn("Grayscale color conversion failed", e);
            throw new IOException("Failed to convert PDF to grayscale: " + e.getMessage(), e);
        }
    }
}
