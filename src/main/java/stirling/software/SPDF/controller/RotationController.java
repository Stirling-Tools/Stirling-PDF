package stirling.software.SPDF.controller;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class RotationController {

	private static final Logger logger = LoggerFactory.getLogger(RotationController.class);

	@GetMapping("/rotate-pdf")
	public String rotatePdfForm(Model model) {
		model.addAttribute("currentPage", "rotate-pdf");
		return "rotate-pdf";
	}

	@PostMapping("/rotate-pdf")
	public ResponseEntity<byte[]> rotatePDF(@RequestParam("fileInput") MultipartFile pdfFile,
			@RequestParam("angle") Integer angle) throws IOException {

		// Load the PDF document
		PDDocument document = PDDocument.load(pdfFile.getBytes());

		// Get the list of pages in the document
		PDPageTree pages = document.getPages();

		for (PDPage page : pages) {
			page.setRotation(page.getRotation() + angle);
		}

		return PdfUtils.pdfDocToWebResponse(document, pdfFile.getName() + "_rotated.pdf");

	}

}
