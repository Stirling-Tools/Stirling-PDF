package stirling.software.SPDF.controller;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

@Controller
public class PdfController {

	private static final Logger logger = LoggerFactory.getLogger(PdfController.class);

	@GetMapping("/")
	public String root(Model model) {
		return "redirect:/home";
	}

	@GetMapping("/merge-pdfs")
	public String hello(Model model) {
		model.addAttribute("currentPage", "merge-pdfs");
		return "merge-pdfs";
	}

	@GetMapping("/home")
	public String home(Model model) {
		model.addAttribute("currentPage", "home");
		return "home";
	}

	@PostMapping("/merge-pdfs")
	public ResponseEntity<InputStreamResource> mergePdfs(@RequestParam("fileInput") MultipartFile[] files)
			throws IOException {
		// Read the input PDF files into PDDocument objects
		List<PDDocument> documents = new ArrayList<>();

		// Loop through the files array and read each file into a PDDocument
		for (MultipartFile file : files) {
			documents.add(PDDocument.load(file.getInputStream()));
		}

		PDDocument mergedDoc = mergeDocuments(documents);
		ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
		mergedDoc.save(byteArrayOutputStream);
		mergedDoc.close();

		// Create an InputStreamResource from the merged PDF
		InputStreamResource resource = new InputStreamResource(
				new ByteArrayInputStream(byteArrayOutputStream.toByteArray()));

		// Return the merged PDF as a response
		return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).body(resource);
	}

	private PDDocument mergeDocuments(List<PDDocument> documents) throws IOException {
		// Create a new empty document
		PDDocument mergedDoc = new PDDocument();

		// Iterate over the list of documents and add their pages to the merged document
		for (PDDocument doc : documents) {
			// Get all pages from the current document
			PDPageTree pages = doc.getPages();
			// Iterate over the pages and add them to the merged document
			for (PDPage page : pages) {
				mergedDoc.addPage(page);
			}
		}

		// Return the merged document
		return mergedDoc;
	}

}