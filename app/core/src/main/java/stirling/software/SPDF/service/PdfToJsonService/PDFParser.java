package stirling.software.SPDF.service.PdfToJsonService;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

// Assurez-vous que toutes les classes utilitaires (PDFProcessor, Element, Tuple, FontStyle)
// sont bien dans le même package (stirling.software.SPDF.service.PdfToJsonService)
@Service
public class PDFParser {
    private final TempFileManager tempFileManager;

    public PDFParser(TempFileManager tempFileManager) {
        this.tempFileManager = tempFileManager;
    }

    // Signature simplifiée : ne prend plus que le fichier d'entrée
    public ResponseEntity<byte[]> processPdfToJson(MultipartFile inputFile) throws IOException {

        // ----------------------------------------------------
        // VALEURS DE STRUCTURE CODÉES EN DUR (COMME DEMANDÉ)
        // ----------------------------------------------------
        final String rootHeader = "h2"; // Défaut si non personnalisable
        final int maxHeader = 6; // Défaut si non personnalisable
        // ----------------------------------------------------

        if (inputFile.isEmpty()) {
            return ResponseEntity.badRequest().body("Le fichier d'entrée est vide.".getBytes());
        }

        // 1. Détermination du nom du fichier de sortie
        String originalFilename = inputFile.getOriginalFilename();
        String outputFileName =
                originalFilename != null
                        ? originalFilename.replaceFirst("(?i)\\.pdf$", ".json")
                        : "output.json";

        try (TempFile inputFileTemp = new TempFile(tempFileManager, ".pdf");
                // Un TempFile est suffisant pour la sortie JSON
                TempFile outputFileTemp = new TempFile(tempFileManager, ".json")) {

            Path tempInputFile = inputFileTemp.getPath();
            Path tempOutputFile = outputFileTemp.getPath();

            // 2. Sauvegarde du fichier téléchargé dans le temporaire
            inputFile.transferTo(tempInputFile);

            List<String> dropTags = new ArrayList<>();
            byte[] jsonBytes;

            try (PDDocument document = Loader.loadPDF(tempInputFile.toFile())) {

                // 3. Logique de Conversion (inchangée)

                Map<String, Object> fontResult = PDFProcessor.fonts(document, false);
                @SuppressWarnings("unchecked")
                List<Map.Entry<String, Integer>> fontCounts =
                        (List<Map.Entry<String, Integer>>) fontResult.get("fontCounts");
                @SuppressWarnings("unchecked")
                Map<String, FontStyle> styles = (Map<String, FontStyle>) fontResult.get("styles");

                Map<String, String> sizeTag = PDFProcessor.fontTags(fontCounts, styles);
                List<String> elements = PDFProcessor.headersPara(document, sizeTag);

                // Utilisation des valeurs codées en dur
                Tuple<List<Element>, List<Element>> result =
                        PDFProcessor.makeNestedJson(elements, maxHeader, rootHeader, dropTags);

                List<Element> nested = result.first;

                // 4. Sérialisation en JSON
                String json = PDFProcessor.serializeToJson(nested);

                // Écriture dans le fichier temporaire de sortie
                Files.write(tempOutputFile, json.getBytes(StandardCharsets.UTF_8));

                // Lecture des bytes finaux
                jsonBytes = Files.readAllBytes(tempOutputFile);

            } catch (Exception e) {
                System.err.println("Error processing PDF: " + e.getMessage());
                e.printStackTrace();
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(
                                ("Erreur de traitement PDF : " + e.getMessage())
                                        .getBytes(StandardCharsets.UTF_8));
            }

            // 5. Construction de la ResponseEntity
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setContentDispositionFormData("attachment", outputFileName);

            return new ResponseEntity<>(jsonBytes, headers, HttpStatus.OK);

        } catch (Exception e) {
            System.err.println("File handling error: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                            "Erreur interne lors de la gestion des fichiers."
                                    .getBytes(StandardCharsets.UTF_8));
        }
    }
}
