package stirling.software.common.util.misc;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.doc.PdfColorConverter;
import stirling.software.jpdfium.doc.PdfIccProfiles;
import stirling.software.jpdfium.doc.PdfShadingConverter;
import stirling.software.jpdfium.model.SaveOptions;

@Slf4j
public class ColorSpaceConversionStrategy extends ReplaceAndInvertColorStrategy {

    public ColorSpaceConversionStrategy(MultipartFile file, ReplaceAndInvert replaceAndInvert) {
        super(file, replaceAndInvert);
    }

    @Override
    public InputStreamResource replace() throws IOException {
        byte[] input = getFileInput().getBytes();
        try {
            if (CmykGhostscriptFallback.needsGhostscript(input)) {
                byte[] converted = CmykGhostscriptFallback.convert(input);
                log.info("Used Ghostscript fallback for an unsupported CMYK shading");
                return new InputStreamResource(new ByteArrayInputStream(converted));
            }
        } catch (IOException e) {
            throw new IOException(
                    "CMYK conversion needs Ghostscript for a shading that JPDFium does not convert; install Ghostscript or use a document with only Type 2 shadings",
                    e);
        }

        try (PdfDocument document = PdfDocument.open(input)) {
            byte[] cmykProfile = CmykProfileResolver.profile();
            PdfColorConverter.ColorConvertOptions options =
                    PdfColorConverter.ColorConvertOptions.builder()
                            .targetColorSpace(PdfColorConverter.ColorSpace.CMYK)
                            .iccProfile(
                                    cmykProfile != null
                                            ? cmykProfile
                                            : PdfIccProfiles.compactCmyk())
                            .convertForms(true)
                            .convertSpecialColors(true)
                            .convertLosslessImages(true)
                            .strictImages(true)
                            .build();

            int converted = PdfColorConverter.convert(document, options);
            log.info("Converted {} page objects to CMYK", converted);

            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.saveTo(output, SaveOptions.validated());
            byte[] convertedPdf = output.toByteArray();
            byte[] withCmykShadings = PdfShadingConverter.toCmyk(convertedPdf);
            return new InputStreamResource(
                    new ByteArrayInputStream(
                            withCmykShadings != null ? withCmykShadings : convertedPdf));
        } catch (RuntimeException e) {
            log.warn("CMYK color space conversion failed", e);
            throw new IOException("Failed to convert PDF to CMYK color space", e);
        }
    }
}
