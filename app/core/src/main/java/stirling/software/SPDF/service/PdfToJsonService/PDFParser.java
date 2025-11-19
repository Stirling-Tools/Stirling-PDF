package stirling.software.SPDF.service.PdfToJsonService;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.ResponseEntity;

import stirling.software.common.util.TempDirectory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.file.Path;
import java.util.*;

public class PDFParser {
    private final TempFileManager tempFileManager;

    public PDFParser(TempFileManager tempFileManager) {
        this.tempFileManager = tempFileManager;
    }

    public ResponseEntity<byte[]> processPdfToJson(MultiPartFile inputFile) throws IOException, InterruptedException {
       
           // String inputFile = "/home/loqman-ouagague/Desktop/pdftojson_real/src/main/java/org/example/test.pdf";
            //String outputFile = "output/" + inputFile.replace(".pdf", ".json").replaceAll(".*/", "");
            try (TempFile inputFileTemp = new TempFile(tempFileManager, ".pdf");
                TempDirectory outputDirTemp = new TempDirectory(tempFileManager)) {

            Path tempInputFile = inputFileTemp.getPath();
            Path tempOutputDir = outputDirTemp.getPath();

            // Save the uploaded file to a temporary location
            inputFile.transferTo(tempInputFile);
            String rootHeader = "h2";
            int maxHeader = 6;
        List<String> dropTags = new ArrayList<>();

            try (PDDocument document = Loader.loadPDF(tempInputFile.toFile())) {
                // Get font information
                Map<String, Object> fontResult = PDFProcessor.fonts(document, false);
                @SuppressWarnings("unchecked")
                List<Map.Entry<String, Integer>> fontCounts =
                        (List<Map.Entry<String, Integer>>) fontResult.get("fontCounts");
                @SuppressWarnings("unchecked")
                Map<String, FontStyle> styles = (Map<String, FontStyle>) fontResult.get("styles");

                // Get font tags
                Map<String, String> sizeTag = PDFProcessor.fontTags(fontCounts, styles);

                // Extract headers and paragraphs
                List<String> elements = PDFProcessor.headersPara(document, sizeTag);

                // Debug: print first few elements
                System.out.println("First 10 extracted elements:");
                for (int i = 0; i < Math.min(10, elements.size()); i++) {
                    System.out.println("[" + i + "]: " + elements.get(i));
                }

                // Create nested structure
                Tuple<List<Element>, List<Element>> result =
                        PDFProcessor.makeNestedJson(elements, maxHeader, rootHeader, dropTags);

                List<Element> nested = result.first;
                List<Element> flat = result.second;


                System.out.println("Writing to " + outputFile + " [" + nested.size() + "] elements");

                // Use manual serialization to avoid circular references
                File outputDir = new File("output");
                if (!outputDir.exists()) {
                    outputDir.mkdirs();
                }

                try (FileWriter writer = new FileWriter(outputFile)) {
                    String json = PDFProcessor.serializeToJson(nested);
                    writer.write(json);
                }

                System.out.println("Successfully created JSON output!");

            } catch (IOException e) {
                System.err.println("Error processing PDF: " + e.getMessage());
                e.printStackTrace();
            }
        } 


    }
}