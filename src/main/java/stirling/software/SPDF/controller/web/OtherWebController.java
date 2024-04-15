package stirling.software.SPDF.controller.web;

import java.io.File;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.servlet.ModelAndView;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.config.security.AppUpdateShowService;

@Controller
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class OtherWebController {

    @Autowired private AppUpdateShowService appUpdateShowService;

    @GetMapping("/compress-pdf")
    @Hidden
    public String compressPdfForm(Model model) {
        model.addAttribute("currentPage", "compress-pdf");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/compress-pdf";
    }

    @GetMapping("/extract-image-scans")
    @Hidden
    public ModelAndView extractImageScansForm() {
        ModelAndView modelAndView = new ModelAndView("misc/extract-image-scans");
        modelAndView.addObject("currentPage", "extract-image-scans");
        modelAndView.addObject("showUpdate", appUpdateShowService.showUpdate());
        return modelAndView;
    }

    @GetMapping("/show-javascript")
    @Hidden
    public String extractJavascriptForm(Model model) {
        model.addAttribute("currentPage", "show-javascript");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/show-javascript";
    }

    @GetMapping("/stamp")
    @Hidden
    public String stampForm(Model model) {
        model.addAttribute("currentPage", "stamp");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/stamp";
    }

    @GetMapping("/add-page-numbers")
    @Hidden
    public String addPageNumbersForm(Model model) {
        model.addAttribute("currentPage", "add-page-numbers");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/add-page-numbers";
    }

    @GetMapping("/extract-images")
    @Hidden
    public String extractImagesForm(Model model) {
        model.addAttribute("currentPage", "extract-images");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/extract-images";
    }

    @GetMapping("/flatten")
    @Hidden
    public String flattenForm(Model model) {
        model.addAttribute("currentPage", "flatten");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/flatten";
    }

    @GetMapping("/change-metadata")
    @Hidden
    public String addWatermarkForm(Model model) {
        model.addAttribute("currentPage", "change-metadata");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/change-metadata";
    }

    @GetMapping("/compare")
    @Hidden
    public String compareForm(Model model) {
        model.addAttribute("currentPage", "compare");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/compare";
    }

    public List<String> getAvailableTesseractLanguages() {
        String tessdataDir = "/usr/share/tessdata";
        File[] files = new File(tessdataDir).listFiles();
        if (files == null) {
            return Collections.emptyList();
        }
        return Arrays.stream(files)
                .filter(file -> file.getName().endsWith(".traineddata"))
                .map(file -> file.getName().replace(".traineddata", ""))
                .filter(lang -> !lang.equalsIgnoreCase("osd"))
                .collect(Collectors.toList());
    }

    @GetMapping("/ocr-pdf")
    @Hidden
    public ModelAndView ocrPdfPage() {
        ModelAndView modelAndView = new ModelAndView("misc/ocr-pdf");
        List<String> languages = getAvailableTesseractLanguages();
        Collections.sort(languages);
        modelAndView.addObject("languages", languages);
        modelAndView.addObject("currentPage", "ocr-pdf");
        modelAndView.addObject("showUpdate", appUpdateShowService.showUpdate());
        return modelAndView;
    }

    @GetMapping("/add-image")
    @Hidden
    public String overlayImage(Model model) {
        model.addAttribute("currentPage", "add-image");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/add-image";
    }

    @GetMapping("/adjust-contrast")
    @Hidden
    public String contrast(Model model) {
        model.addAttribute("currentPage", "adjust-contrast");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/adjust-contrast";
    }

    @GetMapping("/repair")
    @Hidden
    public String repairForm(Model model) {
        model.addAttribute("currentPage", "repair");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/repair";
    }

    @GetMapping("/remove-blanks")
    @Hidden
    public String removeBlanksForm(Model model) {
        model.addAttribute("currentPage", "remove-blanks");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/remove-blanks";
    }

    @GetMapping("/remove-annotations")
    @Hidden
    public String removeAnnotationsForm(Model model) {
        model.addAttribute("currentPage", "remove-annotations");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/remove-annotations";
    }

    @GetMapping("/auto-crop")
    @Hidden
    public String autoCropForm(Model model) {
        model.addAttribute("currentPage", "auto-crop");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/auto-crop";
    }

    @GetMapping("/auto-rename")
    @Hidden
    public String autoRenameForm(Model model) {
        model.addAttribute("currentPage", "auto-rename");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "misc/auto-rename";
    }
}
