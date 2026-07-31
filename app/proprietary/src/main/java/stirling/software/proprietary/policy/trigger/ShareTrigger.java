package stirling.software.proprietary.policy.trigger;

import org.springframework.stereotype.Service;

/** Fires at egress; evaluated inline, so nothing runs in the background. */
@Service
public class ShareTrigger implements PolicyTrigger {

    public static final String TYPE = "share";

    @Override
    public String type() {
        return TYPE;
    }
}
