package stirling.software.SPDF.controller.converters;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.xmp.XMPException;

import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
@Controller
public class ConvertPDFToPDFA {

	@GetMapping("/pdf-to-pdfa")
    public String pdfToPdfAForm(Model model) {
        model.addAttribute("currentPage", "pdf-to-pdfa");
        return "pdf-to-pdfa";
    }

    
    @PostMapping("/pdf-to-pdfa")
    public ResponseEntity<byte[]> pdfToPdfA(
            @RequestParam("fileInput") MultipartFile inputFile) throws IOException, InterruptedException {

    	
        // Save the uploaded file to a temporary location
        Path tempInputFile = Files.createTempFile("input_", ".pdf");
        inputFile.transferTo(tempInputFile.toFile());

        // Prepare the output file path
        Path tempOutputFile = Files.createTempFile("output_", ".pdf");

        // Prepare the OCRmyPDF command
        List<String> command = new ArrayList<>();
        command.add("ocrmypdf");
        command.add("--skip-text");
        command.add("--tesseract-timeout=0");
        command.add("--output-type");
        command.add("pdfa");
        command.add(tempInputFile.toString());
        command.add(tempOutputFile.toString());

        int returnCode = ProcessExecutor.getInstance(ProcessExecutor.Processes.OCR_MY_PDF).runCommandWithOutputHandling(command);
        
        // Read the optimized PDF file
        byte[] pdfBytes = Files.readAllBytes(tempOutputFile);

        // Clean up the temporary files
        Files.delete(tempInputFile);
        Files.delete(tempOutputFile);

        // Return the optimized PDF as a response
        String outputFilename = inputFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_PDFA.pdf";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", outputFilename);
        return ResponseEntity.ok().headers(headers).body(pdfBytes);
}


}
