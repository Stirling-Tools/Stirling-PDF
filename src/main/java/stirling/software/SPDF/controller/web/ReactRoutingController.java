package stirling.software.SPDF.controller.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class ReactRoutingController {

    @GetMapping(
            value = {
                "/{path:^(?!api|static|robots\\.txt|favicon\\.ico).*}",
                "/**/{path:^(?!.*\\.).*}"
            })
    public String forwardToIndex() {
        return "forward:/index.html";
    }
}
