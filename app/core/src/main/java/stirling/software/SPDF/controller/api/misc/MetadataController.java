package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Map.Entry;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.MetadataRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Slf4j
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class MetadataController {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final int MAX_LOG_LENGTH = 200;

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private static String checkUndefined(String entry) {
        // Check if the string is "undefined"
        if ("undefined".equals(entry)) {
            // Return null if it is
            return null;
        }
        // Return the original string if it's not "undefined"
        return entry;
    }

    private static Map<String, String> parseAllRequestParams(String allRequestParamsString) {
        Map<String, String> paramsMap = null;

        if (allRequestParamsString != null && !allRequestParamsString.trim().isEmpty()) {
            try {
                TypeReference<Map<String, String>> typeRef = new TypeReference<>() {};
                paramsMap = OBJECT_MAPPER.readValue(allRequestParamsString, typeRef);
            } catch (Exception e) {
                String truncatedInput =
                        allRequestParamsString.length() > MAX_LOG_LENGTH
                                ? allRequestParamsString.substring(0, MAX_LOG_LENGTH) + "..."
                                : allRequestParamsString;
                log.warn(
                        "Failed to parse allRequestParams JSON string. Expected format: {{\"key\": \"value\"}}. "
                                + "Received: '{}'. Error: {}",
                        truncatedInput,
                        e.getMessage());
                paramsMap = new HashMap<>();
            }
        }

        return paramsMap;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/update-metadata")
    @Operation(
            summary = "Update metadata of a PDF file",
            description =
                    "This endpoint allows you to update the metadata of a given PDF file. You can"
                            + " add, modify, or delete standard and custom metadata fields. Input:PDF"
                            + " Output:PDF Type:SISO")
    public ResponseEntity<byte[]> metadata(
            @ModelAttribute MetadataRequest request,
            @Parameter(
                            description =
                                    "Optional JSON string containing custom metadata as key-value pairs. "
                                            + "Format: {\"customKey1\": \"value1\", \"customKey2\": \"value2\"}. "
                                            + "Standard metadata fields (Author, Creator, etc.) should be provided "
                                            + "as separate form parameters. Custom keys starting with 'customKey' "
                                            + "will be paired with corresponding 'customValue' entries.",
                            example =
                                    "{\"Department\": \"Engineering\", \"Project\": \"PDF Tools\"}")
                    @RequestParam(required = false)
                    String allRequestParams)
            throws IOException {

        // Extract PDF file from the request object
        MultipartFile pdfFile = request.getFileInput();

        // Extract metadata information
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

        // Extract additional custom parameters
        Map<String, String> allRequestParamsMap = parseAllRequestParams(allRequestParams);
        if (allRequestParamsMap == null) {
            allRequestParamsMap = new HashMap<>();
        }
        // Load the PDF file into a PDDocument
        PDDocument document = pdfDocumentFactory.load(pdfFile, true);

        // Get the document information from the PDF
        PDDocumentInformation info = document.getDocumentInformation();

        // Check if each metadata value is "undefined" and set it to null if it is
        author = checkUndefined(author);
        creationDate = checkUndefined(creationDate);
        creator = checkUndefined(creator);
        keywords = checkUndefined(keywords);
        modificationDate = checkUndefined(modificationDate);
        producer = checkUndefined(producer);
        subject = checkUndefined(subject);
        title = checkUndefined(title);
        trapped = checkUndefined(trapped);

        // If the "deleteAll" flag is set, remove all metadata from the document
        // information
        if (deleteAll) {
            for (String key : info.getMetadataKeys()) {
                info.setCustomMetadataValue(key, null);
            }
            // Remove metadata from the PDF history
            document.getDocumentCatalog().getCOSObject().removeItem(COSName.getPDFName("Metadata"));
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
            // Iterate through the request parameters and set the metadata values
            for (Entry<String, String> entry : allRequestParamsMap.entrySet()) {
                String key = entry.getKey();
                // Check if the key is a standard metadata key
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
                    int number =
                            Integer.parseInt(
                                    RegexPatternUtils.getInstance()
                                            .getNumericExtractionPattern()
                                            .matcher(key)
                                            .replaceAll(""));
                    String customKey = entry.getValue();
                    String customValue = allRequestParamsMap.get("customValue" + number);
                    info.setCustomMetadataValue(customKey, customValue);
                }
            }
        }
        info.setCreationDate(
                PdfMetadataService.toCalendar(
                        PdfMetadataService.parseToZonedDateTime(creationDate)));
        info.setModificationDate(
                PdfMetadataService.toCalendar(
                        PdfMetadataService.parseToZonedDateTime(modificationDate)));
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
                        + "_metadata.pdf");
    }
}
