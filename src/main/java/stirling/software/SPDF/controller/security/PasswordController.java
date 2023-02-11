package stirling.software.SPDF.controller.security;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
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
public class PasswordController {

    private static final Logger logger = LoggerFactory.getLogger(PasswordController.class);

    @GetMapping("/add-password")
    public String addPasswordForm(Model model) {
        model.addAttribute("currentPage", "add-password");
        return "security/add-password";
    }

    @GetMapping("/remove-password")
    public String removePasswordForm(Model model) {
        model.addAttribute("currentPage", "remove-password");
        return "security/remove-password";
    }

    @GetMapping("/change-permissions")
    public String permissionsForm(Model model) {
        model.addAttribute("currentPage", "change-permissions");
        return "security/change-permissions";
    }

    @PostMapping("/remove-password")
    public ResponseEntity<byte[]> compressPDF(@RequestParam("fileInput") MultipartFile fileInput, @RequestParam(name = "password") String password) throws IOException {
        PDDocument document = PDDocument.load(fileInput.getBytes(), password);
        document.setAllSecurityToBeRemoved(true);
        return PdfUtils.pdfDocToWebResponse(document, fileInput.getName() + "_password_removed.pdf");
    }

    @PostMapping("/add-password")
    public ResponseEntity<byte[]> compressPDF(@RequestParam("fileInput") MultipartFile fileInput, @RequestParam(defaultValue = "", name = "password") String password,
            @RequestParam(defaultValue = "128", name = "keyLength") int keyLength, @RequestParam(defaultValue = "false", name = "canAssembleDocument") boolean canAssembleDocument,
            @RequestParam(defaultValue = "false", name = "canExtractContent") boolean canExtractContent,
            @RequestParam(defaultValue = "false", name = "canExtractForAccessibility") boolean canExtractForAccessibility,
            @RequestParam(defaultValue = "false", name = "canFillInForm") boolean canFillInForm, @RequestParam(defaultValue = "false", name = "canModify") boolean canModify,
            @RequestParam(defaultValue = "false", name = "canModifyAnnotations") boolean canModifyAnnotations,
            @RequestParam(defaultValue = "false", name = "canPrint") boolean canPrint, @RequestParam(defaultValue = "false", name = "canPrintFaithful") boolean canPrintFaithful)
            throws IOException {

        PDDocument document = PDDocument.load(fileInput.getBytes());
        AccessPermission ap = new AccessPermission();

        ap.setCanAssembleDocument(!canAssembleDocument);
        ap.setCanExtractContent(!canExtractContent);
        ap.setCanExtractForAccessibility(!canExtractForAccessibility);
        ap.setCanFillInForm(!canFillInForm);
        ap.setCanModify(!canModify);
        ap.setCanModifyAnnotations(!canModifyAnnotations);
        ap.setCanPrint(!canPrint);
        ap.setCanPrintFaithful(!canPrintFaithful);
        StandardProtectionPolicy spp = new StandardProtectionPolicy(password, password, ap);
        spp.setEncryptionKeyLength(keyLength);

        spp.setPermissions(ap);

        document.protect(spp);

        return PdfUtils.pdfDocToWebResponse(document, fileInput.getName() + "_passworded.pdf");
    }

}
