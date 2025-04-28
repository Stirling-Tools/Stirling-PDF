package stirling.software.SPDF.controller.api.misc;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.cos.*;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Slf4j
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class UnlockPDFFormsController {
    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @Autowired
    public UnlockPDFFormsController(CustomPDFDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/unlock-pdf-forms")
    @Operation(
            summary = "Remove read-only property from form fields",
            description =
                    "Removing read-only property from form fields making them fillable"
                            + "Input:PDF, Output:PDF. Type:SISO")
    public ResponseEntity<byte[]> unlockPDFForms(@ModelAttribute PDFFile file) {
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
                        if (xfaBase instanceof COSStream xfaStream) {
                            InputStream is = xfaStream.createInputStream();
                            ByteArrayOutputStream baos = new ByteArrayOutputStream();
                            is.transferTo(baos);
                            String xml = baos.toString(StandardCharsets.UTF_8);

                            xml = xml.replaceAll("access\\s*=\\s*\"readOnly\"", "access=\"open\"");

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
                                            xml.replaceAll(
                                                    "access\\s*=\\s*\"readOnly\"",
                                                    "access=\"open\"");

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
                    file.getFileInput().getOriginalFilename().replaceFirst("[.][^.]+$", "")
                            + "_unlocked_forms.pdf";
            return WebResponseUtils.pdfDocToWebResponse(
                    document, Filenames.toSimpleFileName(mergedFileName));
        } catch (Exception e) {
            log.error(e.getMessage(), e);
        }
        return null;
    }
}
