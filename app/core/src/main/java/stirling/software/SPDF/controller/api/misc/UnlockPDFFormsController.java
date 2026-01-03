package stirling.software.SPDF.controller.api.misc;

import java.beans.PropertyEditorSupport;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.cos.*;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.FileStorage;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class UnlockPDFFormsController {
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final FileStorage fileStorage;

    /**
     * Initialize data binder for multipart file uploads. This method registers a custom editor for
     * MultipartFile to handle file uploads. It sets the MultipartFile to null if the uploaded file
     * is empty. This is necessary to avoid binding errors when the file is not present.
     */
    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                MultipartFile.class,
                new PropertyEditorSupport() {
                    @Override
                    public void setAsText(String text) throws IllegalArgumentException {
                        setValue(null);
                    }
                });
    }

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/unlock-pdf-forms")
    @StandardPdfResponse
    @Operation(
            summary = "Remove read-only property from form fields",
            description =
                    "Removing read-only property from form fields making them fillable"
                            + "Input:PDF, Output:PDF. Type:SISO")
    public ResponseEntity<byte[]> unlockPDFForms(@Valid @ModelAttribute PDFFile request)
            throws IOException {
        // Validate input
        MultipartFile inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
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
                            InputStream is = xfaStream.createInputStream();
                            ByteArrayOutputStream baos = new ByteArrayOutputStream();
                            is.transferTo(baos);
                            String xml = baos.toString(StandardCharsets.UTF_8);

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
                                    InputStream is = stream.createInputStream();
                                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                                    is.transferTo(baos);
                                    String xml = baos.toString(StandardCharsets.UTF_8);

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
                            inputFile.getOriginalFilename(), "_unlocked_forms.pdf");
            return WebResponseUtils.pdfDocToWebResponse(
                    document, Filenames.toSimpleFileName(mergedFileName));
        } catch (Exception e) {
            log.error(e.getMessage(), e);
        }
        return null;
    }
}
