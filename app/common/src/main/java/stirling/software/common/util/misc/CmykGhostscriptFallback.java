package stirling.software.common.util.misc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.function.PDFunction;
import org.apache.pdfbox.pdmodel.common.function.PDFunctionType2;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.pattern.PDAbstractPattern;
import org.apache.pdfbox.pdmodel.graphics.pattern.PDShadingPattern;
import org.apache.pdfbox.pdmodel.graphics.shading.PDShading;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

/**
 * Handles the CMYK cases JPDFium's shading rewrite cannot cover yet.
 *
 * <p>JPDFium converts axial shadings whose function is a three-component {@link PDFunctionType2}.
 * Other shading types or functions are left untouched by the in-process pass; Ghostscript is used
 * for those documents only, when it is installed. A failure here is non-fatal and the caller can
 * continue with the in-process result.
 */
@Slf4j
public final class CmykGhostscriptFallback {

    private CmykGhostscriptFallback() {}

    /** True when the PDF contains a shading JPDFium's simple Type 2 rewrite does not cover. */
    public static boolean needsGhostscript(byte[] pdf) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            for (PDPage page : document.getPages()) {
                if (hasUnsupportedShading(page.getResources(), 0)) return true;
            }
        }
        return false;
    }

    /**
     * Converts with Ghostscript's CMYK writer. The caller should only use this for documents where
     * {@link #needsGhostscript(byte[])} is true and must treat an {@link IOException} as a signal
     * to continue with the in-process conversion.
     */
    public static byte[] convert(byte[] pdf) throws IOException {
        Path input = Files.createTempFile("stirling-cmyk-", ".pdf");
        Path output = Files.createTempFile("stirling-cmyk-", ".pdf");
        try {
            Files.write(input, pdf);
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
            command.add("-sOutputFile=" + output);
            command.add(input.toString());

            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                            .runCommandWithOutputHandling(command);
            if (result.getRc() != 0) {
                throw new IOException(
                        "Ghostscript CMYK fallback failed with return code "
                                + result.getRc()
                                + ": "
                                + result.getMessages());
            }
            byte[] converted = Files.readAllBytes(output);
            if (converted.length == 0) {
                throw new IOException("Ghostscript CMYK fallback produced an empty PDF");
            }
            return converted;
        } catch (IOException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Ghostscript CMYK fallback was interrupted", e);
        } catch (RuntimeException e) {
            throw new IOException("Ghostscript CMYK fallback failed", e);
        } finally {
            try {
                Files.deleteIfExists(input);
            } catch (IOException e) {
                log.debug("Could not delete temporary CMYK input {}", input, e);
            }
            try {
                Files.deleteIfExists(output);
            } catch (IOException e) {
                log.debug("Could not delete temporary CMYK output {}", output, e);
            }
        }
    }

    private static boolean hasUnsupportedShading(PDResources resources, int depth)
            throws IOException {
        if (resources == null || depth > 8) return false;
        for (COSName name : resources.getShadingNames()) {
            PDShading shading = resources.getShading(name);
            if (isUnsupported(shading)) return true;
        }
        for (COSName name : resources.getPatternNames()) {
            PDAbstractPattern pattern = resources.getPattern(name);
            if (pattern instanceof PDShadingPattern shadingPattern
                    && isUnsupported(shadingPattern.getShading())) {
                return true;
            }
        }
        for (COSName name : resources.getXObjectNames()) {
            if (resources.getXObject(name) instanceof PDFormXObject form
                    && hasUnsupportedShading(form.getResources(), depth + 1)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isUnsupported(PDShading shading) throws IOException {
        if (shading.getShadingType() != PDShading.SHADING_TYPE2) return true;
        PDFunction function = shading.getFunction();
        if (!(function instanceof PDFunctionType2 type2)) return true;
        return type2.getC0().size() != 3 || type2.getC1().size() != 3;
    }
}
