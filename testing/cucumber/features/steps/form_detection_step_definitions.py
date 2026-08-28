import io

from behave import given, then
from pypdf import PdfReader
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

FIELD_TYPES = {"text", "checkbox", "radio", "signature"}


def _draw_form_page(c, width, height, title):
    """Draw a printed form: ruled entry boxes, checkbox squares and a signature line.

    The detector works off the rendered page, so the page has to *look* like a form -
    an AcroForm-only PDF gives it nothing to see.
    """
    c.setFont("Helvetica-Bold", 16)
    c.drawString(60, height - 70, title)

    c.setFont("Helvetica", 11)
    labels = [
        "First name",
        "Last name",
        "Email address",
        "Street address",
        "City",
        "Postcode",
    ]
    y = height - 120
    for label in labels:
        c.drawString(60, y + 5, f"{label}:")
        c.rect(200, y, 320, 22)
        y -= 42

    c.drawString(60, y + 5, "Contact me by:")
    for offset, choice in enumerate(("Email", "Post", "Phone")):
        x = 200 + offset * 110
        c.rect(x, y, 14, 14)
        c.drawString(x + 22, y + 3, choice)
    y -= 60

    c.drawString(60, y + 5, "Signature:")
    c.line(200, y, 520, y)
    c.drawString(60, y - 40, "Date:")
    c.rect(200, y - 45, 150, 22)


@given("the pdf looks like a printed form")
def step_pdf_looks_like_a_form(context):
    """Replace the current PDF with a single-page form the detector can find fields on."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    _draw_form_page(c, width, height, "Membership application")
    c.showPage()
    c.save()

    with open(context.file_name, "wb") as f:
        f.write(buffer.getvalue())
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


@given("the pdf looks like a printed form on {page_count:d} pages")
def step_pdf_looks_like_a_form_multipage(context, page_count):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    for i in range(page_count):
        _draw_form_page(c, width, height, f"Membership application - part {i + 1}")
        c.showPage()
    c.save()

    with open(context.file_name, "wb") as f:
        f.write(buffer.getvalue())
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


@then("the response should contain at least {count:d} detected fields")
def step_response_has_detections(context, count):
    detections = context.response.json().get("detections")
    assert detections is not None, (
        f"Response has no 'detections' key: {context.response.text[:400]}"
    )
    assert len(detections) >= count, (
        f"Expected at least {count} detections but got {len(detections)}: {detections}"
    )


@then("every detected field should be a usable field box")
def step_detections_are_usable(context):
    """Guard the wire contract the frontend applies straight into an AcroForm."""
    detections = context.response.json().get("detections") or []
    page_count = len(PdfReader(context.file_name).pages)
    for index, field in enumerate(detections):
        where = f"detection {index}: {field}"
        assert field.get("type") in FIELD_TYPES, f"unknown type in {where}"
        page = field.get("page")
        assert isinstance(page, int) and 0 <= page < page_count, f"bad page in {where}"
        rect = field.get("rectInPdfPoints") or {}
        assert rect.get("w", 0) > 0 and rect.get("h", 0) > 0, f"empty rect in {where}"
        confidence = field.get("confidence")
        assert 0 <= confidence <= 1, f"confidence out of range in {where}"


@then("every detected field should have confidence of at least {threshold:f}")
def step_detections_respect_threshold(context, threshold):
    detections = context.response.json().get("detections") or []
    below = [f for f in detections if f["confidence"] < threshold]
    assert not below, f"{len(below)} detections below {threshold}: {below[:3]}"


@then("the response PDF should contain at least {count:d} form fields")
def step_response_pdf_has_form_fields(context, count):
    reader = PdfReader(io.BytesIO(context.response.content))
    fields = reader.get_fields() or {}
    assert len(fields) >= count, (
        f"Expected at least {count} AcroForm fields but got {len(fields)}: {list(fields)}"
    )
