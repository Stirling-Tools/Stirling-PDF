package stirling.software.common.util.misc;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

@Slf4j
public class ColorSpaceConversionStrategy extends ReplaceAndInvertColorStrategy {

    public ColorSpaceConversionStrategy(MultipartFile file, ReplaceAndInvert replaceAndInvert) {
        super(file, replaceAndInvert);
    }

    @Override
    public InputStreamResource replace() throws IOException {
        Path tempInputFile = null;
        Path tempOutputFile = null;

        try {
            tempInputFile = Files.createTempFile("colorspace_input_", ".pdf");
            tempOutputFile = Files.createTempFile("colorspace_output_", ".pdf");

            Files.write(tempInputFile, getFileInput().getBytes());

            log.info("Starting CMYK color space conversion");

            List<String> command = new ArrayList<>();
            command.add("gs");
            command.add("-sDEVICE=pdfwrite");
            command.add("-dCompatibilityLevel=1.5");
            command.add("-dPDFSETTINGS=/prepress");
            command.add("-dNOPAUSE");
            command.add("-dQUIET");
            command.add("-dBATCH");
            command.add("-sProcessColorModel=DeviceCMYK");
            command.add("-sColorConversionStrategy=CMYK");
            command.add("-sColorConversionStrategyForImages=CMYK");
            command.add("-sOutputFile=" + tempOutputFile.toString());
            command.add(tempInputFile.toString());

            log.debug("Executing Ghostscript command for CMYK conversion: {}", command);

            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                            .runCommandWithOutputHandling(command);

            if (result.getRc() != 0) {
                log.error(
                        "Ghostscript CMYK conversion failed with return code: {}. Output: {}",
                        result.getRc(),
                        result.getMessages());
                throw new IOException(
                        "CMYK color space conversion failed: " + result.getMessages());
            }

            log.info("CMYK color space conversion completed successfully");

            byte[] pdfBytes = Files.readAllBytes(tempOutputFile);
            return new InputStreamResource(new ByteArrayInputStream(pdfBytes));

        } catch (Exception e) {
            log.warn("CMYK color space conversion failed", e);
            throw new IOException(
                    "Failed to convert PDF to CMYK color space: " + e.getMessage(), e);
        } finally {
            if (tempInputFile != null) {
                try {
                    Files.deleteIfExists(tempInputFile);
                } catch (IOException e) {
                    log.warn("Failed to delete temporary input file: {}", tempInputFile, e);
                }
            }
            if (tempOutputFile != null) {
                try {
                    Files.deleteIfExists(tempOutputFile);
                } catch (IOException e) {
                    log.warn("Failed to delete temporary output file: {}", tempOutputFile, e);
                }
            }
        }
    }
}
