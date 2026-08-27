package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.Calendar;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.misc.MetadataRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.propertyeditor.StringToMapPropertyEditor;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class MetadataController {

    private static final Set<String> STANDARD_KEYS =
            Set.of(
                    "author",
                    "creationdate",
                    "creator",
                    "keywords",
                    "modificationdate",
                    "moddate",
                    "producer",
                    "subject",
                    "title",
                    "trapped",
                    "deleteall",
                    "fileinput",
                    "allrequestparams");

    private static final Pattern CUSTOM_KEY_PATTERN = Pattern.compile("^customKey(\\d*)$");
    private static final Pattern BRACKET_PARAM_PATTERN =
            Pattern.compile("^allRequestParams\\[([^\\]]+)\\]$");

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final PdfMetadataService pdfMetadataService;

    private String checkUndefined(String entry) {
        return "undefined".equals(entry) ? null : entry;
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
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Update metadata of a PDF file",
            description =
                    "This endpoint allows you to update the metadata of a given PDF file. You can"
                            + " add, modify, or delete standard and custom metadata fields.")
    public ResponseEntity<Resource> metadata(
            @ModelAttribute MetadataRequest request, HttpServletRequest servletRequest)
            throws IOException {

        MultipartFile pdfFile = request.getFileInput();

        boolean deleteAll = Boolean.TRUE.equals(request.getDeleteAll());
        String author = checkUndefined(request.getAuthor());
        String creationDate = checkUndefined(request.getCreationDate());
        String creator = checkUndefined(request.getCreator());
        String keywords = checkUndefined(request.getKeywords());
        String modificationDate = checkUndefined(request.getModificationDate());
        String producer = checkUndefined(request.getProducer());
        String subject = checkUndefined(request.getSubject());
        String title = checkUndefined(request.getTitle());
        String trapped = checkUndefined(request.getTrapped());

        Map<String, String> rawParams = new LinkedHashMap<>();
        if (request.getAllRequestParams() != null) {
            rawParams.putAll(request.getAllRequestParams());
        }
        if (servletRequest != null) {
            Map<String, String[]> parameterMap = servletRequest.getParameterMap();
            if (parameterMap != null) {
                for (Entry<String, String[]> entry : parameterMap.entrySet()) {
                    String paramName = entry.getKey();
                    String[] values = entry.getValue();
                    String paramValue = (values != null && values.length > 0) ? values[0] : "";

                    Matcher bracketMatcher = BRACKET_PARAM_PATTERN.matcher(paramName);
                    if (bracketMatcher.matches()) {
                        rawParams.put(bracketMatcher.group(1), paramValue);
                    } else if (!STANDARD_KEYS.contains(paramName.toLowerCase(Locale.ROOT))) {
                        rawParams.put(paramName, paramValue);
                    }
                }
            }
        }

        Map<String, String> customMetadata = new LinkedHashMap<>();
        for (Entry<String, String> entry : rawParams.entrySet()) {
            String key = entry.getKey();
            Matcher matcher = CUSTOM_KEY_PATTERN.matcher(key);
            if (matcher.matches()) {
                String suffix = matcher.group(1);
                String customKey = entry.getValue();
                String customValue = rawParams.get("customValue" + suffix);
                if (customKey != null && !customKey.trim().isEmpty()) {
                    customMetadata.put(customKey.trim(), customValue != null ? customValue : "");
                }
            } else if (!key.startsWith("customValue")
                    && !STANDARD_KEYS.contains(key.toLowerCase(Locale.ROOT))) {
                if (!key.trim().isEmpty()) {
                    customMetadata.put(key.trim(), entry.getValue());
                }
            }
        }

        try (PDDocument document = pdfDocumentFactory.load(pdfFile, true)) {

            PDDocumentInformation info = document.getDocumentInformation();
            if (info == null) {
                info = new PDDocumentInformation();
                document.setDocumentInformation(info);
            }

            if (deleteAll) {
                Set<String> existingKeys = info.getMetadataKeys();
                if (existingKeys != null) {
                    for (String key : existingKeys) {
                        info.setCustomMetadataValue(key, null);
                    }
                }
                PDDocumentCatalog catalog = document.getDocumentCatalog();
                if (catalog != null) {
                    catalog.setMetadata(null);
                    if (catalog.getCOSObject() != null) {
                        catalog.getCOSObject().removeItem(COSName.getPDFName("PieceInfo"));
                    }
                }
                info.setAuthor(null);
                info.setCreationDate(null);
                info.setCreator(null);
                info.setKeywords(null);
                info.setModificationDate(null);
                info.setProducer(null);
                info.setSubject(null);
                info.setTitle(null);
                info.setTrapped(null);
            } else {
                Set<String> existingKeys = info.getMetadataKeys();
                if (existingKeys != null) {
                    for (String existingKey : existingKeys) {
                        if (!STANDARD_KEYS.contains(existingKey.toLowerCase(Locale.ROOT))
                                && !PdfMetadataService.CLASSIFICATION_KEY.equalsIgnoreCase(
                                        existingKey)) {
                            boolean retained =
                                    customMetadata.keySet().stream()
                                            .anyMatch(k -> k.equalsIgnoreCase(existingKey));
                            if (!retained) {
                                info.setCustomMetadataValue(existingKey, null);
                            }
                        }
                    }
                }

                for (Entry<String, String> entry : customMetadata.entrySet()) {
                    info.setCustomMetadataValue(entry.getKey(), entry.getValue());
                }

                Calendar creationDateCal = PdfMetadataService.parseToCalendar(creationDate);
                if (creationDateCal != null) {
                    info.setCreationDate(creationDateCal);
                } else if (creationDate != null
                        && (creationDate.isBlank() || "undefined".equalsIgnoreCase(creationDate))) {
                    info.setCreationDate(null);
                }

                Calendar modificationDateCal = PdfMetadataService.parseToCalendar(modificationDate);
                if (modificationDateCal != null) {
                    info.setModificationDate(modificationDateCal);
                } else if (modificationDate != null
                        && (modificationDate.isBlank()
                                || "undefined".equalsIgnoreCase(modificationDate))) {
                    info.setModificationDate(null);
                }

                info.setCreator(creator);
                info.setKeywords(keywords);
                info.setAuthor(author);
                info.setProducer(producer);
                info.setSubject(subject);
                info.setTitle(title);

                String normalizedTrapped = null;
                if ("true".equalsIgnoreCase(trapped)) {
                    normalizedTrapped = "True";
                } else if ("false".equalsIgnoreCase(trapped)) {
                    normalizedTrapped = "False";
                } else if ("unknown".equalsIgnoreCase(trapped)) {
                    normalizedTrapped = "Unknown";
                }
                info.setTrapped(normalizedTrapped);

                pdfMetadataService.synchronizeXmpMetadata(document, customMetadata);
            }

            document.setDocumentInformation(info);
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.removeExtension(
                                    Filenames.toSimpleFileName(pdfFile.getOriginalFilename()))
                            + "_metadata.pdf",
                    tempFileManager);
        }
    }

    public ResponseEntity<Resource> metadata(MetadataRequest request) throws IOException {
        return metadata(request, null);
    }
}
