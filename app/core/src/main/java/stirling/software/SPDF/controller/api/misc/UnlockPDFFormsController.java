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
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Path("/api/v1/misc")
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
public class UnlockPDFFormsController {
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @POST
    @Path("/unlock-pdf-forms")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/unlock-pdf-forms",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Remove read-only property from form fields",
            description =
                    "Removing read-only property from form fields making them fillable"
                            + "Input:PDF, Output:PDF. Type:SISO")
    public Response unlockPDFForms(
            @RestForm("fileInput") FileUpload fileUpload, @RestForm("fileId") String fileId) {
        PDFFile file = new PDFFile();
        file.setFileInput(FileUploadMultipartFile.of(fileUpload));
        file.setFileId(fileId);

        MultipartFile fileInput = file.getFileInput();

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
                            fileInput.getOriginalFilename(), "_unlocked_forms.pdf");
            return WebResponseUtils.pdfDocToWebResponse(
                    document, Filenames.toSimpleFileName(mergedFileName), tempFileManager);
        } catch (Exception e) {
            log.error(e.getMessage(), e);
        }
        return null;
    }
}
