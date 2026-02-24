import json as json_module
import os
import requests
from behave import given, when, then
from pypdf import PdfWriter, PdfReader
from pypdf.errors import PdfReadError
import io
import random
import string
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
import mimetypes
import zipfile
import re
from PIL import Image, ImageDraw

API_HEADERS = {"X-API-KEY": "123456789"}

#########
# GIVEN #
#########


@given('I generate a PDF file as "{fileInput}"')
def step_generate_pdf(context, fileInput):
    context.param_name = fileInput
    context.file_name = "genericNonCustomisableName.pdf"
    # Generate a PDF with proper size and content (Letter size: 612x792 points)
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    # Add some text content so OCR and other tools can process it
    c.drawString(100, height - 100, "This is a test PDF document")
    c.showPage()
    c.save()

    with open(context.file_name, "wb") as f:
        f.write(buffer.getvalue())

    if not hasattr(context, "files"):
        context.files = {}
    context.files[context.param_name] = open(context.file_name, "rb")


@given('I use an example file at "{filePath}" as parameter "{fileInput}"')
def step_use_example_file(context, filePath, fileInput):
    context.param_name = fileInput
    context.file_name = filePath.split("/")[-1]
    if not hasattr(context, "files"):
        context.files = {}

    # Ensure the file exists before opening
    try:
        example_file = open(filePath, "rb")
        context.files[context.param_name] = example_file
    except FileNotFoundError:
        raise FileNotFoundError(f"The example file '{filePath}' does not exist.")


@given("the pdf contains {page_count:d} pages")
def step_pdf_contains_pages(context, page_count):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    for i in range(page_count):
        c.drawString(100, height - 100, f"Page {i + 1} of {page_count}")
        c.showPage()
    c.save()

    with open(context.file_name, "wb") as f:
        f.write(buffer.getvalue())
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


# Duplicate for now...
@given("the pdf contains {page_count:d} blank pages")
def step_pdf_contains_blank_pages(context, page_count):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    for i in range(page_count):
        c.showPage()
    c.save()

    with open(context.file_name, "wb") as f:
        f.write(buffer.getvalue())
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


def create_black_box_image(file_name, size):
    can = canvas.Canvas(file_name, pagesize=size)
    width, height = size
    can.setFillColorRGB(0, 0, 0)
    can.rect(0, 0, width, height, fill=1)
    can.showPage()
    can.save()


@given(
    "the pdf contains {image_count:d} images of size {width:d}x{height:d} on {page_count:d} pages"
)
def step_impl(context, image_count, width, height, page_count):
    context.param_name = "fileInput"
    context.file_name = "genericNonCustomisableName.pdf"
    create_pdf_with_images_and_boxes(
        context.file_name, image_count, page_count, width, height
    )
    if not hasattr(context, "files"):
        context.files = {}
    context.files[context.param_name] = open(context.file_name, "rb")


def add_black_boxes_to_image(image):
    if isinstance(image, str):
        image = Image.open(image)

    draw = ImageDraw.Draw(image)
    draw.rectangle([(0, 0), image.size], fill=(0, 0, 0))  # Fill image with black
    return image


def create_pdf_with_images_and_boxes(
    file_name, image_count, page_count, image_width, image_height
):
    page_width, page_height = max(letter[0], image_width), max(letter[1], image_height)
    boxes_per_page = image_count // page_count + (
        1 if image_count % page_count != 0 else 0
    )

    writer = PdfWriter()
    box_counter = 0

    for page in range(page_count):
        packet = io.BytesIO()
        can = canvas.Canvas(packet, pagesize=(page_width, page_height))

        for i in range(boxes_per_page):
            if box_counter >= image_count:
                break

            # Simulating a dynamic image creation (replace this with your actual image creation logic)
            # For demonstration, we'll create a simple black image
            dummy_image = Image.new(
                "RGB", (image_width, image_height), color="white"
            )  # Create a white image
            dummy_image = add_black_boxes_to_image(dummy_image)  # Add black boxes

            # Convert the PIL Image to bytes to pass to drawImage
            image_bytes = io.BytesIO()
            dummy_image.save(image_bytes, format="PNG")
            image_bytes.seek(0)

            # Check if the image fits in the current page dimensions
            x = (i % (page_width // image_width)) * image_width
            y = page_height - (((i % (page_height // image_height)) + 1) * image_height)

            if x + image_width > page_width or y < 0:
                break

            # Add the image to the PDF
            can.drawImage(
                ImageReader(image_bytes), x, y, width=image_width, height=image_height
            )
            box_counter += 1

        can.showPage()
        can.save()
        packet.seek(0)
        new_pdf = PdfReader(packet)
        writer.add_page(new_pdf.pages[0])

    # Write the PDF to file
    with open(file_name, "wb") as f:
        writer.write(f)

    # Clean up temporary image files
    for i in range(image_count):
        temp_image_path = f"temp_image_{i}.png"
        if os.path.exists(temp_image_path):
            os.remove(temp_image_path)


@given("the pdf contains {image_count:d} images on {page_count:d} pages")
def step_pdf_contains_images(context, image_count, page_count):
    if not hasattr(context, "param_name"):
        context.param_name = "default"
    context.file_name = "genericNonCustomisableName.pdf"
    create_pdf_with_black_boxes(context.file_name, image_count, page_count)
    if not hasattr(context, "files"):
        context.files = {}
    if context.param_name in context.files:
        context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


def create_pdf_with_black_boxes(file_name, image_count, page_count):

    page_width, page_height = letter
    writer = PdfWriter()
    box_counter = 0

    for page in range(page_count):
        packet = io.BytesIO()
        can = canvas.Canvas(packet, pagesize=(page_width, page_height))

        boxes_per_page = image_count // page_count + (
            1 if image_count % page_count != 0 else 0
        )
        for i in range(boxes_per_page):
            if box_counter >= image_count:
                break

            # Create a black box image
            dummy_image = Image.new("RGB", (100, 100), color="black")
            image_bytes = io.BytesIO()
            dummy_image.save(image_bytes, format="PNG")
            image_bytes.seek(0)

            x = (i % (page_width // 100)) * 100
            y = page_height - (((i % (page_height // 100)) + 1) * 100)

            if x + 100 > page_width or y < 0:
                break

            can.drawImage(ImageReader(image_bytes), x, y, width=100, height=100)
            box_counter += 1

        can.showPage()
        can.save()
        packet.seek(0)
        new_pdf = PdfReader(packet)
        writer.add_page(new_pdf.pages[0])

    with open(file_name, "wb") as f:
        writer.write(f)


@given("the pdf contains {page_count:d} pages with random text")
def step_pdf_contains_pages_with_random_text(context, page_count):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    for _ in range(page_count):
        text = "".join(random.choices(string.ascii_letters + string.digits, k=100))
        c.drawString(100, height - 100, text)
        c.showPage()

    c.save()

    with open(context.file_name, "wb") as f:
        f.write(buffer.getvalue())

    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


@given('the pdf pages all contain the text "{text}"')
def step_pdf_pages_contain_text(context, text):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    for _ in range(len(PdfReader(context.file_name).pages)):
        c.drawString(100, height - 100, text)
        c.showPage()

    c.save()

    with open(context.file_name, "wb") as f:
        f.write(buffer.getvalue())

    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


@given('the pdf is encrypted with password "{password}"')
def step_encrypt_pdf(context, password):
    writer = PdfWriter()
    reader = PdfReader(context.file_name)
    for i in range(len(reader.pages)):
        writer.add_page(reader.pages[i])
    writer.encrypt(password)
    with open(context.file_name, "wb") as f:
        writer.write(f)
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


@given("the request data is")
def step_request_data(context):
    context.request_data = eval(context.text)


@given("the request data includes")
def step_request_data_table(context):
    context.request_data = {row["parameter"]: row["value"] for row in context.table}


@given('save the generated PDF file as "{filename}" for debugging')
def save_generated_pdf(context, filename):
    with open(filename, "wb") as f:
        f.write(context.files[context.param_name].read())
    print(f"Saved generated PDF content to {filename}")


# ---------------------------------------------------------------------------
# Multi-file accumulation steps (same parameter key sent multiple times)
# ---------------------------------------------------------------------------


@given('I also generate a PDF file as "{param}"')
def step_also_generate_pdf(context, param):
    """Add an additional generated PDF under the given parameter name (supports duplicate keys)."""
    count = sum(1 for k, _ in getattr(context, "multi_files", []) if k == param)
    file_name = f"genericNonCustomisableName_extra_{param}_{count}.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    with open(file_name, "wb") as f:
        writer.write(f)
    if not hasattr(context, "multi_files"):
        context.multi_files = []
    context.multi_files.append((param, open(file_name, "rb")))


@given('I also use an example file at "{filePath}" as parameter "{param}"')
def step_also_use_example_file(context, filePath, param):
    """Add an additional file from exampleFiles under the given parameter name."""
    if not hasattr(context, "multi_files"):
        context.multi_files = []
    try:
        context.multi_files.append((param, open(filePath, "rb")))
    except FileNotFoundError:
        raise FileNotFoundError(f"The example file '{filePath}' does not exist.")


# ---------------------------------------------------------------------------
# Non-PDF file generation steps
# ---------------------------------------------------------------------------


@given('I generate a PNG image file as "{param}"')
def step_generate_png(context, param):
    """Generate a simple coloured PNG and register it under the given parameter name."""
    file_name = f"genericNonCustomisableName_{param}.png"
    img = Image.new("RGB", (200, 200), color=(73, 109, 137))
    draw = ImageDraw.Draw(img)
    draw.rectangle([50, 50, 150, 150], fill=(255, 165, 0))
    draw.ellipse([75, 75, 125, 125], fill=(255, 255, 255))
    img.save(file_name, format="PNG")
    if not hasattr(context, "files"):
        context.files = {}
    context.files[param] = open(file_name, "rb")
    context.param_name = param
    context.file_name = file_name


@given('I also generate a PNG image file as "{param}"')
def step_also_generate_png(context, param):
    """Add an additional PNG image under the given parameter name (supports duplicate keys)."""
    count = sum(1 for k, _ in getattr(context, "multi_files", []) if k == param)
    file_name = f"genericNonCustomisableName_extra_{param}_{count}.png"
    img = Image.new("RGB", (200, 200), color=(count * 60 + 40, 100, 180))
    draw = ImageDraw.Draw(img)
    draw.rectangle([30, 30, 170, 170], fill=(200 - count * 30, 150, 50))
    img.save(file_name, format="PNG")
    if not hasattr(context, "multi_files"):
        context.multi_files = []
    context.multi_files.append((param, open(file_name, "rb")))


@given('I generate an SVG file as "{param}"')
def step_generate_svg(context, param):
    """Generate a minimal SVG file and register it under the given parameter name."""
    file_name = f"genericNonCustomisableName_{param}.svg"
    svg_content = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">\n'
        '  <rect width="200" height="200" fill="#4a90e2"/>\n'
        '  <circle cx="100" cy="100" r="60" fill="#f5a623"/>\n'
        '  <text x="100" y="107" font-size="16" text-anchor="middle" fill="white">Test SVG</text>\n'
        "</svg>\n"
    )
    with open(file_name, "w", encoding="utf-8") as f:
        f.write(svg_content)
    if not hasattr(context, "files"):
        context.files = {}
    context.files[param] = open(file_name, "rb")
    context.param_name = param
    context.file_name = file_name


@given('I also generate an SVG file as "{param}"')
def step_also_generate_svg(context, param):
    """Add an additional SVG under the given parameter name (supports duplicate keys)."""
    count = sum(1 for k, _ in getattr(context, "multi_files", []) if k == param)
    file_name = f"genericNonCustomisableName_extra_{param}_{count}.svg"
    svg_content = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">\n'
        f'  <rect width="150" height="150" fill="hsl({count * 60}, 70%, 50%)"/>\n'
        '  <polygon points="75,20 140,130 10,130" fill="white" opacity="0.6"/>\n'
        "</svg>\n"
    )
    with open(file_name, "w", encoding="utf-8") as f:
        f.write(svg_content)
    if not hasattr(context, "multi_files"):
        context.multi_files = []
    context.multi_files.append((param, open(file_name, "rb")))


@given('I generate an EML email file as "{param}"')
def step_generate_eml(context, param):
    """Generate a minimal RFC-2822 EML file and register it under the given parameter name."""
    file_name = f"genericNonCustomisableName_{param}.eml"
    eml_content = (
        "MIME-Version: 1.0\r\n"
        "Date: Thu, 19 Feb 2026 10:00:00 +0000\r\n"
        "Message-ID: <test123@example.com>\r\n"
        "From: sender@example.com\r\n"
        "To: recipient@example.com\r\n"
        "Subject: Test Email for PDF Conversion\r\n"
        "Content-Type: text/plain; charset=UTF-8\r\n"
        "\r\n"
        "This is a test email body.\r\n"
        "It contains multiple lines of text.\r\n"
        "Used for EML to PDF conversion testing.\r\n"
    )
    with open(file_name, "w", encoding="utf-8") as f:
        f.write(eml_content)
    if not hasattr(context, "files"):
        context.files = {}
    context.files[param] = open(file_name, "rb")
    context.param_name = param
    context.file_name = file_name


@given('I generate a CBZ comic archive file as "{param}"')
def step_generate_cbz(context, param):
    """Generate a CBZ file (ZIP of PNG images) and register it under the given parameter name."""
    file_name = f"genericNonCustomisableName_{param}.cbz"
    with zipfile.ZipFile(file_name, "w") as cbz:
        for i in range(3):
            img = Image.new("RGB", (200, 300), color=(i * 60 + 40, 120, 200 - i * 50))
            draw = ImageDraw.Draw(img)
            draw.rectangle([20, 20, 180, 280], outline=(0, 0, 0), width=3)
            draw.rectangle([40, 40, 160, 100], fill=(200, 200, 255))
            img_bytes = io.BytesIO()
            img.save(img_bytes, format="PNG")
            cbz.writestr(f"page_{i + 1:03d}.png", img_bytes.getvalue())
    if not hasattr(context, "files"):
        context.files = {}
    context.files[param] = open(file_name, "rb")
    context.param_name = param
    context.file_name = file_name


# ---------------------------------------------------------------------------
# PDF modification steps
# ---------------------------------------------------------------------------


@given("the pdf has form fields")
def step_pdf_has_form_fields(context):
    """Create a PDF with a basic AcroForm text field on each page."""
    reader = PdfReader(context.file_name)
    page_count = len(reader.pages)
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    w, h = letter
    for i in range(page_count):
        c.acroForm.textfield(
            name=f"field_{i + 1}",
            tooltip=f"Field {i + 1}",
            x=72,
            y=h - 72,
            width=200,
            height=20,
            forceBorder=True,
        )
        c.showPage()
    c.save()
    with open(context.file_name, "wb") as f:
        f.write(buffer.getvalue())
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


@given('the pdf has an attachment named "{attachment_name}"')
def step_pdf_has_attachment(context, attachment_name):
    """Embed a small text attachment into the current PDF."""
    reader = PdfReader(context.file_name)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    attachment_bytes = (
        f"Attachment: {attachment_name}\nThis is test attachment content.".encode("utf-8")
    )
    writer.add_attachment(attachment_name, attachment_bytes)
    with open(context.file_name, "wb") as f:
        writer.write(f)
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


@given("the pdf has bookmarks")
def step_pdf_has_bookmarks(context):
    """Add one top-level outline/bookmark entry per page to the current PDF."""
    reader = PdfReader(context.file_name)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    for i in range(len(reader.pages)):
        writer.add_outline_item(f"Chapter {i + 1}", i)
    with open(context.file_name, "wb") as f:
        writer.write(f)
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


@given("the pdf has a Stirling-PDF QR code split marker on page {page_num:d}")
def step_pdf_has_qr_split_marker(context, page_num):
    """Replace page page_num (1-indexed) with a page containing a Stirling-PDF QR code."""
    try:
        import qrcode as _qrcode
    except ImportError:
        raise ImportError(
            "qrcode package is required for this step. "
            "Install with: pip install 'qrcode[pil]'"
        )
    reader = PdfReader(context.file_name)
    qr = _qrcode.QRCode(box_size=4, border=2)
    qr.add_data("https://github.com/Stirling-Tools/Stirling-PDF")
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    qr_bytes = io.BytesIO()
    qr_img.save(qr_bytes, format="PNG")
    qr_bytes.seek(0)
    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        if i + 1 == page_num:
            packet = io.BytesIO()
            can = canvas.Canvas(packet, pagesize=letter)
            w, h = letter
            can.drawImage(
                ImageReader(qr_bytes), (w - 100) / 2, (h - 100) / 2, width=100, height=100
            )
            can.showPage()
            can.save()
            packet.seek(0)
            qr_pdf = PdfReader(packet)
            writer.add_page(qr_pdf.pages[0])
        else:
            writer.add_page(page)
    with open(context.file_name, "wb") as f:
        writer.write(f)
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, "rb")


# ---------------------------------------------------------------------------
# JSON multipart part steps  (@RequestPart endpoints like /form/fill)
# ---------------------------------------------------------------------------


@given('the request includes a JSON part "{part_name}" with content "{json_content}"')
def step_request_json_part(context, part_name, json_content):
    """Register a JSON multipart part (sent with Content-Type: application/json)."""
    if not hasattr(context, "json_parts"):
        context.json_parts = {}
    context.json_parts[part_name] = json_content


########
# WHEN #
########


@when('I send a GET request to "{endpoint}"')
def step_send_get_request(context, endpoint):
    base_url = "http://localhost:8080"
    full_url = f"{base_url}{endpoint}"
    response = requests.get(full_url, headers=API_HEADERS, timeout=60)
    context.response = response


@when('I send a GET request to "{endpoint}" with parameters')
def step_send_get_request_with_params(context, endpoint):
    base_url = "http://localhost:8080"
    params = {row["parameter"]: row["value"] for row in context.table}
    full_url = f"{base_url}{endpoint}"
    response = requests.get(full_url, params=params, headers=API_HEADERS, timeout=60)
    context.response = response


@when('I send the API request to the endpoint "{endpoint}"')
def step_send_api_request(context, endpoint):
    url = f"http://localhost:8080{endpoint}"
    files = context.files if hasattr(context, "files") else {}

    if not hasattr(context, "request_data") or context.request_data is None:
        context.request_data = {}

    form_data = []
    for key, value in context.request_data.items():
        # Handle list parameters (like 'languages') - send multiple form fields
        # Split comma-separated values or treat single values as single-item lists
        if key == "languages":
            # Split by comma if present, otherwise treat as single value
            values = [v.strip() for v in value.split(",")] if "," in value else [value]
            for val in values:
                form_data.append((key, (None, val)))
        else:
            form_data.append((key, (None, value)))

    for key, file in files.items():
        mime_type, _ = mimetypes.guess_type(file.name)
        mime_type = mime_type or "application/octet-stream"
        print(f"form_data {file.name} with {mime_type}")
        form_data.append((key, (file.name, file, mime_type)))

    # Multi-file entries (duplicate keys for MultipartFile[] endpoints, e.g. merge-pdfs)
    for key, file in getattr(context, "multi_files", []):
        mime_type, _ = mimetypes.guess_type(file.name)
        mime_type = mime_type or "application/octet-stream"
        print(f"form_data (multi) {file.name} with {mime_type}")
        form_data.append((key, (file.name, file, mime_type)))

    # JSON multipart parts for @RequestPart endpoints (e.g. /form/fill)
    for part_name, json_content in getattr(context, "json_parts", {}).items():
        form_data.append((part_name, (None, json_content, "application/json")))

    # Set timeout to 300 seconds (5 minutes) to prevent infinite hangs
    print(f"Sending POST request to {endpoint} with timeout=300s")
    response = requests.post(url, files=form_data, headers=API_HEADERS, timeout=300)
    context.response = response


########
# THEN #
########


@then('the response content type should be "{content_type}"')
def step_check_response_content_type(context, content_type):
    actual_content_type = context.response.headers.get("Content-Type", "")
    assert actual_content_type.startswith(
        content_type
    ), f"Expected {content_type} but got {actual_content_type}. Response content: {context.response.content}"


@then("the response file should have size greater than {size:d}")
def step_check_response_file_size(context, size):
    response_file = io.BytesIO(context.response.content)
    assert len(response_file.getvalue()) > size


@then("the response PDF is not passworded")
def step_check_response_pdf_not_passworded(context):
    response_file = io.BytesIO(context.response.content)
    reader = PdfReader(response_file)
    assert not reader.is_encrypted


@then("the response PDF is passworded")
def step_check_response_pdf_passworded(context):
    response_file = io.BytesIO(context.response.content)
    try:
        reader = PdfReader(response_file)
        assert reader.is_encrypted
    except PdfReadError as e:
        raise AssertionError(
            f"Failed to read PDF: {str(e)}. Response content: {context.response.content}"
        )
    except Exception as e:
        raise AssertionError(
            f"An error occurred: {str(e)}. Response content: {context.response.content}"
        )


@then("the response status code should be {status_code:d}")
def step_check_response_status_code(context, status_code):
    assert (
        context.response.status_code == status_code
    ), f"Expected status code {status_code} but got {context.response.status_code}"


@then('the response should contain error message "{message}"')
def step_check_response_error_message(context, message):
    response_json = context.response.json()
    # Check for error message in both "error" (old format) and "detail" (RFC 7807 ProblemDetail)
    error_message = response_json.get("error") or response_json.get("detail")
    assert (
        error_message == message
    ), f"Expected error message '{message}' but got '{error_message}'"


@then('the response PDF metadata should include "{metadata_key}" as "{metadata_value}"')
def step_check_response_pdf_metadata(context, metadata_key, metadata_value):
    response_file = io.BytesIO(context.response.content)
    reader = PdfReader(response_file)
    metadata = reader.metadata
    assert (
        metadata.get("/" + metadata_key) == metadata_value
    ), f"Expected {metadata_key} to be '{metadata_value}' but got '{metadata.get(metadata_key)}'"


@then('the response file should have extension "{extension}"')
def step_check_response_file_extension(context, extension):
    content_disposition = context.response.headers.get("Content-Disposition", "")
    filename = ""
    if content_disposition:
        parts = content_disposition.split(";")
        for part in parts:
            if part.strip().startswith("filename"):
                filename = part.split("=")[1].strip().strip('"')
                break
    assert filename.endswith(
        extension
    ), f"Expected file extension {extension} but got {filename}. Response content: {context.response.content}"


@then('save the response file as "{filename}" for debugging')
def step_save_response_file(context, filename):
    with open(filename, "wb") as f:
        f.write(context.response.content)
    print(f"Saved response content to {filename}")


@then("the response PDF should contain {page_count:d} pages")
def step_check_response_pdf_page_count(context, page_count):
    response_file = io.BytesIO(context.response.content)
    reader = PdfReader(io.BytesIO(response_file.getvalue()))
    actual_page_count = len(reader.pages)
    assert (
        actual_page_count == page_count
    ), f"Expected {page_count} pages but got {actual_page_count} pages"


@then("the response ZIP should contain {file_count:d} files")
def step_check_response_zip_file_count(context, file_count):
    response_file = io.BytesIO(context.response.content)
    with zipfile.ZipFile(io.BytesIO(response_file.getvalue())) as zip_file:
        actual_file_count = len(zip_file.namelist())
    assert (
        actual_file_count == file_count
    ), f"Expected {file_count} files but got {actual_file_count} files"


@then(
    "the response ZIP file should contain {doc_count:d} documents each having {pages_per_doc:d} pages"
)
def step_check_response_zip_doc_page_count(context, doc_count, pages_per_doc):
    response_file = io.BytesIO(context.response.content)
    with zipfile.ZipFile(io.BytesIO(response_file.getvalue())) as zip_file:
        actual_doc_count = len(zip_file.namelist())
        assert (
            actual_doc_count == doc_count
        ), f"Expected {doc_count} documents but got {actual_doc_count} documents"

        for file_name in zip_file.namelist():
            with zip_file.open(file_name) as pdf_file:
                reader = PdfReader(pdf_file)
                actual_pages_per_doc = len(reader.pages)
                assert (
                    actual_pages_per_doc == pages_per_doc
                ), f"Expected {pages_per_doc} pages per document but got {actual_pages_per_doc} pages in document {file_name}"


@then('the JSON value of "{key}" should be "{expected_value}"')
def step_check_json_value(context, key, expected_value):
    actual_value = context.response.json().get(key)
    assert (
        actual_value == expected_value
    ), f"Expected JSON value for '{key}' to be '{expected_value}' but got '{actual_value}'"


@then(
    'JSON list entry containing "{identifier_key}" as "{identifier_value}" should have "{target_key}" as "{target_value}"'
)
def step_check_json_list_entry(
    context, identifier_key, identifier_self, target_key, target_value
):
    json_response = context.response.json()
    for entry in json_response:
        if entry.get(identifier_key) == identifier_value:
            assert (
                entry.get(target_key) == target_value
            ), f"Expected {target_key} to be {target_value} in entry where {identifier_key} is {identifier_value}, but found {entry.get(target_key)}"
            break
    else:
        raise AssertionError(
            f"No entry with {identifier_key} as {identifier_value} found"
        )


@then('the response should match the regex "{pattern}"')
def step_response_matches_regex(context, pattern):
    response_text = context.response.text
    assert re.match(
        pattern, response_text
    ), f"Response '{response_text}' does not match the expected pattern '{pattern}'"
