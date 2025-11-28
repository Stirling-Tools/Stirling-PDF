package stirling.software.proprietary.service;

import jakarta.imageio.ImageIO;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.stereotype.Service;
import stirling.software.common.service.LineArtConversionService;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

@Slf4j
@Service
public class ImageMagickLineArtConversionService implements LineArtConversionService {

    @Override
    public PDImageXObject convertImageToLineArt(
            PDDocument doc, PDImageXObject originalImage, double threshold, int edgeLevel)
            throws IOException {

        Path inputImage = Files.createTempFile("lineart_image_input_", ".png");
        Path outputImage = Files.createTempFile("lineart_image_output_", ".tiff");

        try {
            ImageIO.write(originalImage.getImage(), "png", inputImage.toFile());

            List<String> command = new ArrayList<>();
            command.add("magick");
            command.add(inputImage.toString());
            command.add("-colorspace");
            command.add("Gray");

            // Edge-aware line art conversion using ImageMagick's built-in operators.
            // -edge/-negate/-normalize are standard convert options (IM v6+/v7) that
            // accentuate outlines before thresholding to a bilevel image.
            command.add("-edge");
            command.add(String.valueOf(edgeLevel));
            command.add("-negate");
            command.add("-normalize");

            command.add("-type");
            command.add("Bilevel");
            command.add("-threshold");
            command.add(String.format(Locale.ROOT, "%.1f%%", threshold));
            command.add("-compress");
            command.add("Group4");
            command.add(outputImage.toString());

            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.IMAGEMAGICK)
                            .runCommandWithOutputHandling(command);

            if (result.getRc() != 0) {
                log.warn("ImageMagick line art conversion failed with return code: {}", result.getRc());
                throw new IOException("ImageMagick line art conversion failed");
            }

            byte[] convertedBytes = Files.readAllBytes(outputImage);
            return PDImageXObject.createFromByteArray(
                    doc, convertedBytes, originalImage.getCOSObject().toString());
        } catch (Exception e) {
            log.warn("ImageMagick line art conversion failed", e);
            throw new IOException("ImageMagick line art conversion failed", e);
        } finally {
            Files.deleteIfExists(inputImage);
            Files.deleteIfExists(outputImage);
        }
    }
}
