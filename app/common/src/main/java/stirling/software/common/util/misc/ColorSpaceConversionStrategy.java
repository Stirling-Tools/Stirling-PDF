package stirling.software.common.util.misc;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Set;

import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.doc.PdfColorConverter;
import stirling.software.jpdfium.doc.PdfIccProfiles;
import stirling.software.jpdfium.doc.PdfShadingConverter;
import stirling.software.jpdfium.model.FlattenMode;
import stirling.software.jpdfium.model.SaveOptions;

@Slf4j
public class ColorSpaceConversionStrategy extends ReplaceAndInvertColorStrategy {

    public ColorSpaceConversionStrategy(MultipartFile file, ReplaceAndInvert replaceAndInvert) {
        super(file, replaceAndInvert);
    }

    @Override
    public InputStreamResource replace() throws IOException {
        byte[] input = getFileInput().getBytes();
        Set<Integer> unsupportedShadingPages =
                CmykGhostscriptFallback.unsupportedShadingPages(input);
        if (!unsupportedShadingPages.isEmpty()) {
            try {
                byte[] converted = CmykGhostscriptFallback.convert(input);
                log.info("Used Ghostscript fallback for an unsupported CMYK shading");
                return new InputStreamResource(new ByteArrayInputStream(converted));
            } catch (IOException e) {
                log.warn(
                        "Ghostscript shading fallback failed; rasterizing {} page(s) at 300 dpi",
                        unsupportedShadingPages.size(),
                        e);
                input = rasterizePages(input, unsupportedShadingPages);
            }
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

    /**
     * Rasterizes pages with shadings JPDFium cannot rewrite and Ghostscript cannot process. The
     * affected pages become 300 dpi images, so CMYK output stays valid but loses selectable text.
     */
    private static byte[] rasterizePages(byte[] input, Set<Integer> pages) throws IOException {
        try (PdfDocument document = PdfDocument.open(input)) {
            int flattened = 0;
            for (int pageIndex : pages) {
                if (pageIndex >= 0 && pageIndex < document.pageCount()) {
                    document.flattenPage(pageIndex, FlattenMode.FULL, 300);
                    flattened++;
                }
            }
            if (flattened == 0) {
                throw new IOException("No page could be rasterized for unsupported CMYK shadings");
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.saveTo(output, SaveOptions.validated());
            return output.toByteArray();
        } catch (RuntimeException e) {
            throw new IOException("Could not rasterize pages with unsupported CMYK shadings", e);
        }
    }
}
