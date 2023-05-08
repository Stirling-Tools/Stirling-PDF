package stirling.software.SPDF.controller.web;

import java.io.File;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.servlet.ModelAndView;

import io.swagger.v3.oas.annotations.Hidden;

@Controller
public class OtherWebController {
    @GetMapping("/compress-pdf")
    @Hidden
    public String compressPdfForm(Model model) {
        model.addAttribute("currentPage", "compress-pdf");
        return "other/compress-pdf";
    }
    
    @GetMapping("/extract-image-scans")
    @Hidden
    public ModelAndView extractImageScansForm() {
        ModelAndView modelAndView = new ModelAndView("other/extract-image-scans");
        modelAndView.addObject("currentPage", "extract-image-scans");
        return modelAndView;
    }

    @GetMapping("/extract-images")
    @Hidden
    public String extractImagesForm(Model model) {
        model.addAttribute("currentPage", "extract-images");
        return "other/extract-images";
    }
    
    @GetMapping("/flatten")
    @Hidden
    public String flattenForm(Model model) {
        model.addAttribute("currentPage", "flatten");
        return "other/flatten";
    }
    
    

    @GetMapping("/change-metadata")
    @Hidden
    public String addWatermarkForm(Model model) {
        model.addAttribute("currentPage", "change-metadata");
        return "other/change-metadata";
    }
    
    
    public List<String> getAvailableTesseractLanguages() {
        String tessdataDir = "/usr/share/tesseract-ocr/4.00/tessdata";
        File[] files = new File(tessdataDir).listFiles();
        if (files == null) {
            return Collections.emptyList();
        }
        return Arrays.stream(files).filter(file -> file.getName().endsWith(".traineddata")).map(file -> file.getName().replace(".traineddata", ""))
                .filter(lang -> !lang.equalsIgnoreCase("osd")).collect(Collectors.toList());
    }

    @GetMapping("/ocr-pdf")
    @Hidden
    public ModelAndView ocrPdfPage() {
        ModelAndView modelAndView = new ModelAndView("other/ocr-pdf");
        modelAndView.addObject("languages", getAvailableTesseractLanguages());
        modelAndView.addObject("currentPage", "ocr-pdf");
        return modelAndView;
    }
    

    @GetMapping("/add-image")
    @Hidden
    public String overlayImage(Model model) {
        model.addAttribute("currentPage", "add-image");
        return "other/add-image";
    }
    
    @GetMapping("/adjust-contrast")
    @Hidden
    public String contrast(Model model) {
        model.addAttribute("currentPage", "adjust-contrast");
        return "other/adjust-contrast";
    }
    
    @GetMapping("/repair")
    @Hidden
    public String repairForm(Model model) {
        model.addAttribute("currentPage", "repair");
        return "other/repair";
    }
    
    @GetMapping("/remove-blanks")
    @Hidden
    public String removeBlanksForm(Model model) {
        model.addAttribute("currentPage", "remove-blanks");
        return "other/remove-blanks";
    }
    
}
