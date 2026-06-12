package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;
import java.util.Map.Entry;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
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
import stirling.software.SPDF.model.api.misc.MetadataRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@MiscApi
@Slf4j
@ApplicationScoped
@Path("/api/v1/misc")
@RequiredArgsConstructor
public class MetadataController {

    // MIGRATION (Spring -> JAX-RS): the @InitBinder + StringToMapPropertyEditor that turned the
    // "allRequestParams" form field (a JSON string) into a Map is replaced by parsing the same JSON
    // string with this Jackson mapper inside the handler (see parseAllRequestParams). This mirrors
    // StringToMapPropertyEditor exactly (HashMap<String, String> via TypeReference).
    private static final ObjectMapper OBJECT_MAPPER = JsonMapper.builder().build();

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    private String checkUndefined(String entry) {
        // Check if the string is "undefined"
        if ("undefined".equals(entry)) {
            // Return null if it is
            return null;
        }
        // Return the original string if it's not "undefined"
        return entry;
    }

    /**
     * MIGRATION (Spring -> JAX-RS): port of {@code StringToMapPropertyEditor}. The "allRequestParams"
     * form field is a JSON object string; parse it into a {@code Map<String, String>}, returning an
     * empty map when the field is absent/blank.
     */
    private Map<String, String> parseAllRequestParams(String allRequestParamsJson) {
        if (allRequestParamsJson == null || allRequestParamsJson.isBlank()) {
            return new HashMap<>();
        }
        try {
            TypeReference<HashMap<String, String>> typeRef = new TypeReference<>() {};
            return OBJECT_MAPPER.readValue(allRequestParamsJson, typeRef);
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "Failed to convert java.lang.String to java.util.Map", e);
        }
    }

    @POST
    @Path("/update-metadata")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/update-metadata",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Update metadata of a PDF file",
            description =
                    "This endpoint allows you to update the metadata of a given PDF file. You can"
                            + " add, modify, or delete standard and custom metadata fields. Input:PDF"
                            + " Output:PDF Type:SISO")
    public Response metadata(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("deleteAll") Boolean deleteAllParam,
            @RestForm("author") String author,
            @RestForm("creationDate") String creationDate,
            @RestForm("creator") String creator,
            @RestForm("keywords") String keywords,
            @RestForm("modificationDate") String modificationDate,
            @RestForm("producer") String producer,
            @RestForm("subject") String subject,
            @RestForm("title") String title,
            @RestForm("trapped") String trapped,
            @RestForm("allRequestParams") String allRequestParamsJson)
            throws IOException {

        // Rebuild the request model from the multipart form fields (mirrors the former
        // @ModelAttribute MetadataRequest binding).
        MetadataRequest request = new MetadataRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setDeleteAll(deleteAllParam);
        request.setAuthor(author);
        request.setCreationDate(creationDate);
        request.setCreator(creator);
        request.setKeywords(keywords);
        request.setModificationDate(modificationDate);
        request.setProducer(producer);
        request.setSubject(subject);
        request.setTitle(title);
        request.setTrapped(trapped);
        request.setAllRequestParams(parseAllRequestParams(allRequestParamsJson));

        // Extract PDF file from the request object
        MultipartFile pdfFile = request.getFileInput();

        // Extract metadata information
        boolean deleteAll = Boolean.TRUE.equals(request.getDeleteAll());
        author = request.getAuthor();
        creationDate = request.getCreationDate();
        creator = request.getCreator();
        keywords = request.getKeywords();
        modificationDate = request.getModificationDate();
        producer = request.getProducer();
        subject = request.getSubject();
        title = request.getTitle();
        trapped = request.getTrapped();

        // Extract additional custom parameters
        Map<String, String> allRequestParams = request.getAllRequestParams();
        if (allRequestParams == null) {
            allRequestParams = new java.util.HashMap<String, String>();
        }
        // Load the PDF file into a PDDocument with proper resource management
        try (PDDocument document = pdfDocumentFactory.load(pdfFile, true)) {

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
                // Iterate through the request parameters and set the metadata values
                for (Entry<String, String> entry : allRequestParams.entrySet()) {
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
                            // Skip invalid custom key entries that don't have valid numeric
                            // suffixes
                            log.warn("Skipping invalid custom key '{}': {}", key, e.getMessage());
                        }
                    }
                }
            }
            // Set creation date using utility method
            Calendar creationDateCal = PdfMetadataService.parseToCalendar(creationDate);
            info.setCreationDate(creationDateCal);

            // Set modification date using utility method
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
}
