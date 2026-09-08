package stirling.software.SPDF.controller.api.misc;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.cos.*;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
public class UnlockPDFFormsController {

    private static final int MAX_XFA_BYTES = 32 * 1024 * 1024;

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    public UnlockPDFFormsController(
            CustomPDFDocumentFactory pdfDocumentFactory, TempFileManager tempFileManager) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.tempFileManager = tempFileManager;
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/unlock-pdf-forms",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Remove read-only property from form fields",
            description = "Removing read-only property from form fields making them fillable")
    public ResponseEntity<Resource> unlockPDFForms(@ModelAttribute PDFFile file) {
        try (PDDocument document = pdfDocumentFactory.load(file)) {
            PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm();

            if (acroForm != null) {
                acroForm.setNeedAppearances(true);

                for (PDField field : acroForm.getFieldTree()) {
                    COSDictionary dict = field.getCOSObject();
                    if (dict.containsKey(COSName.getPDFName("Lock"))) {
                        dict.removeItem(COSName.getPDFName("Lock"));
                    }
                    int currentFlags = field.getFieldFlags();
                    if ((currentFlags & 1) == 1) {
                        int newFlags = currentFlags & ~1;
                        field.setFieldFlags(newFlags);
                    }
                }

                COSBase xfaBase = acroForm.getCOSObject().getDictionaryObject(COSName.XFA);
                if (xfaBase != null) {
                    try {
                        var accessReadOnlyPattern =
                                RegexPatternUtils.getInstance().getAccessReadOnlyPattern();
                        if (xfaBase instanceof COSStream xfaStream) {
                            String xml = readXfaXml(xfaStream, MAX_XFA_BYTES);

                            xml = accessReadOnlyPattern.matcher(xml).replaceAll("access=\"open\"");

                            PDStream newStream =
                                    new PDStream(
                                            document,
                                            new ByteArrayInputStream(
                                                    xml.getBytes(StandardCharsets.UTF_8)));
                            acroForm.getCOSObject().setItem(COSName.XFA, newStream.getCOSObject());
                        } else if (xfaBase instanceof COSArray xfaArray) {
                            for (int i = 0; i < xfaArray.size(); i += 2) {
                                COSBase namePart = xfaArray.getObject(i);
                                COSBase streamPart = xfaArray.getObject(i + 1);
                                if (namePart instanceof COSString
                                        && streamPart instanceof COSStream stream) {
                                    String xml = readXfaXml(stream, MAX_XFA_BYTES);

                                    xml =
                                            accessReadOnlyPattern
                                                    .matcher(xml)
                                                    .replaceAll("access=\"open\"");

                                    PDStream newStream =
                                            new PDStream(
                                                    document,
                                                    new ByteArrayInputStream(
                                                            xml.getBytes(StandardCharsets.UTF_8)));
                                    xfaArray.set(i + 1, newStream.getCOSObject());
                                }
                            }
                        }
                    } catch (Exception e) {
                        log.error("exception", e);
                    }
                }
            }
            String mergedFileName =
                    GeneralUtils.generateFilename(
                            file.getFileInput().getOriginalFilename(), "_unlocked_forms.pdf");
            return WebResponseUtils.pdfDocToWebResponse(
                    document, Filenames.toSimpleFileName(mergedFileName), tempFileManager);
        } catch (Exception e) {
            log.error(e.getMessage(), e);
        }
        return null;
    }

    /**
     * XFA form XML, decoded from a PDF stream whose expansion is attacker-controlled: an object
     * stream of a few KB can inflate to gigabytes, so the read stops at {@code maxBytes} instead of
     * sizing the buffer from the compressed input.
     */
    static String readXfaXml(COSStream stream, int maxBytes) throws IOException {
        try (InputStream is = stream.createInputStream()) {
            byte[] bytes = is.readNBytes(maxBytes + 1);
            if (bytes.length > maxBytes) {
                throw new IOException(
                        "XFA form data exceeds the maximum supported size of "
                                + maxBytes
                                + " bytes");
            }
            return new String(bytes, StandardCharsets.UTF_8);
        }
    }
}
