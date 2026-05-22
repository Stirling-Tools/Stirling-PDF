package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.Calendar;
import java.util.Map;
import java.util.Map.Entry;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.misc.MetadataRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.propertyeditor.StringToMapPropertyEditor;
import stirling.software.jpdfium.PdfDocument;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class MetadataController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    private String checkUndefined(String entry) {
        if ("undefined".equals(entry)) {
            return null;
        }
        return entry;
    }

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(Map.class, "allRequestParams", new StringToMapPropertyEditor());
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/update-metadata",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Update metadata of a PDF file",
            description =
                    "This endpoint allows you to update the metadata of a given PDF file. You can"
                            + " add, modify, or delete standard and custom metadata fields. Input:PDF"
                            + " Output:PDF Type:SISO")
    public ResponseEntity<Resource> metadata(@ModelAttribute MetadataRequest request)
            throws IOException {

        MultipartFile pdfFile = request.getFileInput();

        boolean deleteAll = Boolean.TRUE.equals(request.getDeleteAll());
        String author = request.getAuthor();
        String creationDate = request.getCreationDate();
        String creator = request.getCreator();
        String keywords = request.getKeywords();
        String modificationDate = request.getModificationDate();
        String producer = request.getProducer();
        String subject = request.getSubject();
        String title = request.getTitle();
        String trapped = request.getTrapped();

        Map<String, String> allRequestParams = request.getAllRequestParams();
        if (allRequestParams == null) {
            allRequestParams = new java.util.HashMap<String, String>();
        }

        // JPDFium pre-validate - cheap structural check before PDFBox parses.
        validateWithJpdfium(pdfFile);

        // PDFBox handles writes - JPDFium has no metadata write API.
        try (PDDocument document = pdfDocumentFactory.load(pdfFile, true)) {

            PDDocumentInformation info = document.getDocumentInformation();

            author = checkUndefined(author);
            creationDate = checkUndefined(creationDate);
            creator = checkUndefined(creator);
            keywords = checkUndefined(keywords);
            modificationDate = checkUndefined(modificationDate);
            producer = checkUndefined(producer);
            subject = checkUndefined(subject);
            title = checkUndefined(title);
            trapped = checkUndefined(trapped);

            if (deleteAll) {
                for (String key : info.getMetadataKeys()) {
                    info.setCustomMetadataValue(key, null);
                }
                document.getDocumentCatalog()
                        .getCOSObject()
                        .removeItem(COSName.getPDFName("Metadata"));
                document.getDocumentCatalog()
                        .getCOSObject()
                        .removeItem(COSName.getPDFName("PieceInfo"));
                author = null;
                creationDate = null;
                creator = null;
                keywords = null;
                modificationDate = null;
                producer = null;
                subject = null;
                title = null;
                trapped = null;
            } else {
                for (Entry<String, String> entry : allRequestParams.entrySet()) {
                    String key = entry.getKey();
                    if (!"Author".equalsIgnoreCase(key)
                            && !"CreationDate".equalsIgnoreCase(key)
                            && !"Creator".equalsIgnoreCase(key)
                            && !"Keywords".equalsIgnoreCase(key)
                            && !"modificationDate".equalsIgnoreCase(key)
                            && !"Producer".equalsIgnoreCase(key)
                            && !"Subject".equalsIgnoreCase(key)
                            && !"Title".equalsIgnoreCase(key)
                            && !"Trapped".equalsIgnoreCase(key)
                            && !key.contains("customKey")
                            && !key.contains("customValue")) {
                        info.setCustomMetadataValue(key, entry.getValue());
                    } else if (key.contains("customKey")) {
                        try {
                            int number =
                                    Integer.parseInt(
                                            RegexPatternUtils.getInstance()
                                                    .getNumericExtractionPattern()
                                                    .matcher(key)
                                                    .replaceAll(""));
                            String customKey = entry.getValue();
                            String customValue = allRequestParams.get("customValue" + number);
                            info.setCustomMetadataValue(customKey, customValue);
                        } catch (NumberFormatException e) {
                            log.warn("Skipping invalid custom key '{}': {}", key, e.getMessage());
                        }
                    }
                }
            }

            Calendar creationDateCal = PdfMetadataService.parseToCalendar(creationDate);
            info.setCreationDate(creationDateCal);

            Calendar modificationDateCal = PdfMetadataService.parseToCalendar(modificationDate);
            info.setModificationDate(modificationDateCal);
            info.setCreator(creator);
            info.setKeywords(keywords);
            info.setAuthor(author);
            info.setProducer(producer);
            info.setSubject(subject);
            info.setTitle(title);
            info.setTrapped(trapped);

            document.setDocumentInformation(info);
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.removeExtension(
                                    Filenames.toSimpleFileName(pdfFile.getOriginalFilename()))
                            + "_metadata.pdf",
                    tempFileManager);
        }
    }

    private void validateWithJpdfium(MultipartFile pdfFile) {
        byte[] bytes;
        try {
            bytes = pdfFile.getBytes();
        } catch (Exception e) {
            return;
        }
        if (bytes == null || bytes.length == 0) {
            return;
        }
        try (PdfDocument ignored = PdfDocument.open(bytes)) {
        } catch (Exception e) {
            ExceptionUtils.logException("JPDFium metadata pre-validate", e);
        }
    }
}
