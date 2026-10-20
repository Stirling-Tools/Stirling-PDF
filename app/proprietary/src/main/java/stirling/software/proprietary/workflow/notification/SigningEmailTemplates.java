package stirling.software.proprietary.workflow.notification;

import java.util.List;

import org.springframework.web.util.HtmlUtils;

import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.workflow.model.ParticipantStatus;

/**
 * Subject and HTML body for each signing notification. Every value passed in is untrusted: bodies
 * HTML-escape it, and subjects strip control characters so a document name cannot inject a mail
 * header.
 */
final class SigningEmailTemplates {

    private static final int MAX_LISTED_NAMES = 10;
    private static final int MAX_SUBJECT_VALUE_LENGTH = 80;
    private static final int MAX_REASON_LENGTH = 500;

    // Light-theme values of the frontend tokens (frontend/editor/src/core/theme/colors.css),
    // inlined because email clients do not support CSS variables. BRAND is --c-brand, the fill of
    // the sign-in CTAs a recipient lands on.
    private static final String BRAND = "#af3434";
    private static final String TEXT_ON_BRAND = "#ffffff";
    private static final String TEXT = "#373530";
    private static final String TEXT_MUTED = "#4b5563";
    private static final String TEXT_SUBTLE = "#5d636d";
    private static final String BACKGROUND = "#f5f4f1";
    private static final String SURFACE = "#ffffff";
    private static final String BORDER = "#e5e7eb";
    private static final String FONT =
            "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

    record Email(String to, String subject, String html) {}

    /**
     * What the emails report about a session, counted when the email is prepared.
     *
     * @param awaiting display names of participants who have neither responded nor expired
     */
    record Summary(
            String documentName,
            String ownerName,
            String message,
            String dueDate,
            int participants,
            int signed,
            int declined,
            List<String> awaiting) {

        /** Nobody is left to respond, and at least one signature can be applied. */
        boolean readyToFinalize() {
            return awaiting.isEmpty() && signed > 0;
        }
    }

    private SigningEmailTemplates() {}

    /**
     * @param link where the participant signs, or null when no base URL is configured
     * @param guestLink whether {@code link} carries the participant's share token
     */
    static Email invitation(String to, Summary summary, String link, boolean guestLink) {
        String owner = summary.ownerName();
        StringBuilder body = new StringBuilder();
        body.append(
                paragraph(
                        escape(owner)
                                + " has asked you to sign "
                                + strong(summary.documentName())
                                + "."));
        if (hasText(summary.message())) {
            body.append(paragraph("Message from " + escape(owner) + ":"))
                    .append(quote(summary.message()));
        }
        if (hasText(summary.dueDate())) {
            body.append(paragraph("Please sign by " + escape(summary.dueDate()) + "."));
        }
        if (link == null) {
            body.append(paragraph("Sign in to Stirling PDF and open Shared Signing to review it."));
        }
        String note =
                guestLink
                        ? "This link lets anyone who has it sign as you, so do not forward this"
                                + " email."
                        : null;
        return new Email(
                to,
                subjectText(owner)
                        + " requested your signature on "
                        + quoted(summary.documentName()),
                layout(
                        "Your signature is requested",
                        body.toString(),
                        link,
                        "Review and sign",
                        note,
                        "You received this email because "
                                + owner
                                + " added you to a signing request in Stirling PDF."));
    }

    /**
     * @param signed true for a signature, false for a decline
     * @param declineReason shown only for a decline, and only when not blank
     * @param link the requester's Shared Signing page, or null when no base URL is configured
     */
    static Email response(
            String to,
            Summary summary,
            String responderName,
            boolean signed,
            String declineReason,
            String link) {
        String action = signed ? " signed " : " declined to sign ";
        StringBuilder body = new StringBuilder();
        body.append(
                paragraph(escape(responderName) + action + strong(summary.documentName()) + "."));
        if (!signed && hasText(declineReason)) {
            body.append(paragraph("Their reason:"))
                    .append(quote(truncate(declineReason.strip(), MAX_REASON_LENGTH)));
        }
        body.append(progress(summary)).append(paragraph(nextStep(summary)));
        if (link == null) {
            body.append(paragraph("Sign in to Stirling PDF and open Shared Signing to review it."));
        }
        boolean ready = summary.readyToFinalize();
        String subject =
                ready
                        ? quoted(summary.documentName()) + " is ready to finalize"
                        : subjectText(responderName) + action + quoted(summary.documentName());
        String heading =
                ready ? "Ready to finalize" : signed ? "New signature" : "Signature declined";
        return new Email(
                to,
                subject,
                layout(
                        heading,
                        body.toString(),
                        link,
                        ready ? "Review and finalize" : "Open Shared Signing",
                        null,
                        "You received this email because you requested signatures on "
                                + summary.documentName()
                                + " in Stirling PDF."));
    }

    /**
     * @param recipientStatus the recipient's status when the session was finalized
     * @param link where the recipient downloads the signed PDF, or null when no base URL is
     *     configured
     * @param guestLink whether {@code link} carries the participant's share token
     */
    static Email completion(
            String to,
            Summary summary,
            ParticipantStatus recipientStatus,
            String link,
            boolean guestLink) {
        String owner = summary.ownerName();
        StringBuilder body = new StringBuilder();
        body.append(
                paragraph(escape(owner) + " finalized " + strong(summary.documentName()) + "."));
        body.append(
                paragraph(
                        "Signatures included: "
                                + summary.signed()
                                + " of "
                                + summary.participants()));
        body.append(
                paragraph(
                        switch (recipientStatus) {
                            case SIGNED -> "Your signature is included.";
                            case DECLINED ->
                                    "You declined this request, so your signature is not"
                                            + " included.";
                            default ->
                                    "The request closed before you signed, so your signature is"
                                            + " not included. You do not need to do anything"
                                            + " else.";
                        }));
        if (link == null) {
            body.append(
                    paragraph(
                            "Sign in to Stirling PDF and open Shared Signing to download the"
                                    + " signed document."));
        }
        return new Email(
                to,
                quoted(summary.documentName()) + " has been finalized",
                layout(
                        "Document finalized",
                        body.toString(),
                        link,
                        "View signed document",
                        guestLink
                                ? "This link opens the signed document for anyone who has it, so"
                                        + " do not forward this email."
                                : null,
                        "You received this email because you were a participant in a signing"
                                + " request from "
                                + owner
                                + " in Stirling PDF."));
    }

    private static String progress(Summary summary) {
        StringBuilder lines =
                new StringBuilder("Signed: " + summary.signed() + " of " + summary.participants());
        if (summary.declined() > 0) {
            lines.append("<br>Declined: ").append(summary.declined());
        }
        if (!summary.awaiting().isEmpty()) {
            lines.append("<br>Awaiting: ")
                    .append(summary.awaiting().size())
                    .append(" (")
                    .append(names(summary.awaiting()))
                    .append(")");
        }
        return paragraph(lines.toString());
    }

    private static String nextStep(Summary summary) {
        if (summary.readyToFinalize()) {
            return "Everyone has responded, so the document is ready to finalize.";
        }
        if (summary.awaiting().isEmpty()) {
            return "Everyone declined, so there is nothing to finalize.";
        }
        if (summary.signed() > 0) {
            return "You can finalize now, but anyone who has not signed yet will be left out.";
        }
        return "The document can be finalized once someone signs.";
    }

    private static String names(List<String> names) {
        String listed =
                String.join(
                        ", ",
                        names.stream()
                                .limit(MAX_LISTED_NAMES)
                                .map(SigningEmailTemplates::escape)
                                .toList());
        int rest = names.size() - MAX_LISTED_NAMES;
        return rest > 0 ? listed + " and " + rest + " more" : listed;
    }

    /**
     * {@code body} is trusted HTML; every other argument is escaped here. Tables rather than divs
     * because Outlook's Word renderer ignores widths and padding on divs.
     */
    private static String layout(
            String heading,
            String body,
            String link,
            String linkLabel,
            String linkNote,
            String footer) {
        StringBuilder action = new StringBuilder();
        if (link != null) {
            String href = escape(link);
            action.append(
                    """
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 12px;">
                    <tr><td style="border-radius:8px;background-color:%1$s;">
                    <a href="%2$s" style="display:inline-block;padding:12px 22px;border-radius:8px;font-family:%3$s;font-size:15px;font-weight:600;line-height:1.2;color:%4$s;text-decoration:none;">%5$s</a>
                    </td></tr>
                    </table>
                    <p style="margin:0;font-size:13px;color:%6$s;word-break:break-all;">Or copy this link into your browser: <a href="%2$s" style="color:%1$s;">%2$s</a></p>
                    """
                            .formatted(
                                    BRAND,
                                    href,
                                    FONT,
                                    TEXT_ON_BRAND,
                                    escape(linkLabel),
                                    TEXT_MUTED));
            if (linkNote != null) {
                action.append(
                        "<p style=\"margin:12px 0 0;font-size:13px;color:%s;\">%s</p>"
                                .formatted(TEXT_MUTED, escape(linkNote)));
            }
        }
        return """
                <!doctype html>
                <html lang="en">
                <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="color-scheme" content="light only">
                <meta name="supported-color-schemes" content="light only">
                <title>%1$s</title>
                </head>
                <body style="margin:0;padding:0;background-color:%2$s;">
                <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="background-color:%2$s;">
                <tr><td align="center" style="padding:32px 12px;">
                <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%%;max-width:560px;background-color:%3$s;border:1px solid %4$s;border-radius:8px;">
                <tr><td style="padding:28px 32px 0;"><img src="cid:%5$s" width="89" height="32" alt="Stirling" style="display:block;width:89px;height:32px;border:0;"></td></tr>
                <tr><td style="padding:24px 32px 32px;font-family:%6$s;font-size:15px;line-height:1.6;color:%7$s;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:600;color:%7$s;">%1$s</h1>
                %8$s%9$s
                </td></tr>
                <tr><td style="padding:16px 32px 20px;border-top:1px solid %4$s;font-family:%6$s;font-size:12px;line-height:1.5;color:%10$s;">%11$s</td></tr>
                </table>
                </td></tr>
                </table>
                </body>
                </html>
                """
                .formatted(
                        escape(heading),
                        BACKGROUND,
                        SURFACE,
                        BORDER,
                        EmailService.BRAND_LOGO_CONTENT_ID,
                        FONT,
                        TEXT,
                        body,
                        action,
                        TEXT_SUBTLE,
                        escape(footer));
    }

    private static String paragraph(String html) {
        return "<p style=\"margin:0 0 12px;\">" + html + "</p>";
    }

    private static String strong(String text) {
        return "<strong>" + escape(text) + "</strong>";
    }

    private static String quote(String text) {
        return ("<div style=\"margin:0 0 12px;padding:10px 14px;border-left:3px solid %s;"
                        + "background-color:%s;color:%s;\">%s</div>")
                .formatted(BORDER, BACKGROUND, TEXT, escape(text).replaceAll("\\R", "<br>"));
    }

    private static String escape(String text) {
        return text == null ? "" : HtmlUtils.htmlEscape(text);
    }

    private static String subjectText(String value) {
        String flat = value == null ? "" : value.replaceAll("[\\p{Cntrl}\\s]+", " ").strip();
        return truncate(flat, MAX_SUBJECT_VALUE_LENGTH);
    }

    private static String quoted(String value) {
        return "\"" + subjectText(value) + "\"";
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max - 3) + "...";
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
