package stirling.software.SPDF.controller.web;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;

@Component
@ControllerAdvice
public class GlobalUploadLimitWebController {

    @Autowired() private long uploadLimit;

    @ModelAttribute("uploadLimit")
    public long populateUploadLimit() {
        return uploadLimit;
    }

    @ModelAttribute("uploadLimitReadable")
    public String populateReadableLimit() {
        return humanReadableByteCount(uploadLimit);
    }

    private String humanReadableByteCount(long bytes) {
        if (bytes < 1024) return bytes + " B";
        int exp = (int) (Math.log(bytes) / Math.log(1024));
        String pre = "KMGTPE".charAt(exp - 1) + "B";
        return String.format("%.1f %s", bytes / Math.pow(1024, exp), pre);
    }
}
