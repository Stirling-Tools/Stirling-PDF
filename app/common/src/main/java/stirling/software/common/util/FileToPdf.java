package stirling.software.common.util;

import java.io.IOException;
import java.nio.file.Files;
import java.time.Duration;

import lombok.experimental.UtilityClass;

import stirling.software.officeconvert.topdf.OfficeToPdf;

/** HTML to PDF in process through Stirling Office Convert, with no network or file access. */
@UtilityClass
public class FileToPdf {

    public static byte[] convertHtmlToPdf(
            byte[] html, Duration timeout, TempFileManager tempFileManager) throws IOException {
        try (TempFile in = new TempFile(tempFileManager, ".html");
                TempFile out = new TempFile(tempFileManager, ".pdf")) {
            Files.write(in.getPath(), html);
            OfficeToPdf.Result result =
                    OfficeToPdf.convert(
                            in.getPath(),
                            out.getPath(),
                            OfficeToPdf.Options.defaults().timeout(timeout));
            if (result.truncated() || result.pageLimitReached()) {
                throw new IOException("Only part of the document could be converted");
            }
            return Files.readAllBytes(out.getPath());
        }
    }
}
