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
import requests
import zipfile
import shutil
import re
from PIL import Image, ImageDraw

API_HEADERS = {
    'X-API-KEY': '123456789'
}

#########
# GIVEN #
#########

@given('I generate a PDF file as "{fileInput}"')
def step_generate_pdf(context, fileInput):
    context.param_name = fileInput
    context.file_name = "genericNonCustomisableName.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)  # Single blank page
    with open(context.file_name, 'wb') as f:
        writer.write(f)
    if not hasattr(context, 'files'):
        context.files = {}
    context.files[context.param_name] = open(context.file_name, 'rb')


@given('I use an example file at "{filePath}" as parameter "{fileInput}"')
def step_use_example_file(context, filePath, fileInput):
    context.param_name = fileInput
    context.file_name = filePath.split('/')[-1]
    if not hasattr(context, 'files'):
        context.files = {}

    # Ensure the file exists before opening
    try:
        example_file = open(filePath, 'rb')
        context.files[context.param_name] = example_file
    except FileNotFoundError:
        raise FileNotFoundError(f"The example file '{filePath}' does not exist.")

@given('the pdf contains {page_count:d} pages')
def step_pdf_contains_pages(context, page_count):
    writer = PdfWriter()
    for i in range(page_count):
        writer.add_blank_page(width=72, height=72)
    with open(context.file_name, 'wb') as f:
        writer.write(f)
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, 'rb')

# Duplicate for now...
@given('the pdf contains {page_count:d} blank pages')
def step_pdf_contains_blank_pages(context, page_count):
    writer = PdfWriter()
    for i in range(page_count):
        writer.add_blank_page(width=72, height=72)
    with open(context.file_name, 'wb') as f:
        writer.write(f)
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, 'rb')

def create_black_box_image(file_name, size):
    can = canvas.Canvas(file_name, pagesize=size)
    width, height = size
    can.setFillColorRGB(0, 0, 0)
    can.rect(0, 0, width, height, fill=1)
    can.showPage()
    can.save()

@given(u'the pdf contains {image_count:d} images of size {width:d}x{height:d} on {page_count:d} pages')
def step_impl(context, image_count, width, height, page_count):
    context.param_name = "fileInput"
    context.file_name = "genericNonCustomisableName.pdf"
    create_pdf_with_images_and_boxes(context.file_name, image_count, page_count, width, height)
    if not hasattr(context, 'files'):
        context.files = {}
    context.files[context.param_name] = open(context.file_name, 'rb')

def add_black_boxes_to_image(image):
    if isinstance(image, str):
        image = Image.open(image)

    draw = ImageDraw.Draw(image)
    draw.rectangle([(0, 0), image.size], fill=(0, 0, 0))  # Fill image with black
    return image

def create_pdf_with_images_and_boxes(file_name, image_count, page_count, image_width, image_height):
    page_width, page_height = max(letter[0], image_width), max(letter[1], image_height)
    boxes_per_page = image_count // page_count + (1 if image_count % page_count != 0 else 0)

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
            dummy_image = Image.new('RGB', (image_width, image_height), color='white')  # Create a white image
            dummy_image = add_black_boxes_to_image(dummy_image)  # Add black boxes

            # Convert the PIL Image to bytes to pass to drawImage
            image_bytes = io.BytesIO()
            dummy_image.save(image_bytes, format='PNG')
            image_bytes.seek(0)

            # Check if the image fits in the current page dimensions
            x = (i % (page_width // image_width)) * image_width
            y = page_height - (((i % (page_height // image_height)) + 1) * image_height)

            if x + image_width > page_width or y < 0:
                break

            # Add the image to the PDF
            can.drawImage(ImageReader(image_bytes), x, y, width=image_width, height=image_height)
            box_counter += 1

        can.showPage()
        can.save()
        packet.seek(0)
        new_pdf = PdfReader(packet)
        writer.add_page(new_pdf.pages[0])

    # Write the PDF to file
    with open(file_name, 'wb') as f:
        writer.write(f)

    # Clean up temporary image files
    for i in range(image_count):
        temp_image_path = f"temp_image_{i}.png"
        if os.path.exists(temp_image_path):
            os.remove(temp_image_path)

@given('the pdf contains {image_count:d} images on {page_count:d} pages')
def step_pdf_contains_images(context, image_count, page_count):
    if not hasattr(context, 'param_name'):
        context.param_name = "default"
    context.file_name = "genericNonCustomisableName.pdf"
    create_pdf_with_black_boxes(context.file_name, image_count, page_count)
    if not hasattr(context, 'files'):
        context.files = {}
    if context.param_name in context.files:
        context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, 'rb')

@given('the pdf contains {page_count:d} pages with random text')
def step_pdf_contains_pages_with_random_text(context, page_count):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    for _ in range(page_count):
        text = ''.join(random.choices(string.ascii_letters + string.digits, k=100))
        c.drawString(100, height - 100, text)
        c.showPage()

    c.save()

    with open(context.file_name, 'wb') as f:
        f.write(buffer.getvalue())

    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, 'rb')

@given('the pdf pages all contain the text "{text}"')
def step_pdf_pages_contain_text(context, text):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    for _ in range(len(PdfReader(context.file_name).pages)):
        c.drawString(100, height - 100, text)
        c.showPage()

    c.save()

    with open(context.file_name, 'wb') as f:
        f.write(buffer.getvalue())

    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, 'rb')

@given('the pdf is encrypted with password "{password}"')
def step_encrypt_pdf(context, password):
    writer = PdfWriter()
    reader = PdfReader(context.file_name)
    for i in range(len(reader.pages)):
        writer.add_page(reader.pages[i])
    writer.encrypt(password)
    with open(context.file_name, 'wb') as f:
        writer.write(f)
    context.files[context.param_name].close()
    context.files[context.param_name] = open(context.file_name, 'rb')

@given('the request data is')
def step_request_data(context):
    context.request_data = eval(context.text)

@given('the request data includes')
def step_request_data_table(context):
    context.request_data = {row['parameter']: row['value'] for row in context.table}

@given('save the generated PDF file as "{filename}" for debugging')
def save_generated_pdf(context, filename):
    with open(filename, 'wb') as f:
        f.write(context.files[context.param_name].read())
    print(f"Saved generated PDF content to {filename}")

########
# WHEN #
########

@when('I send a GET request to "{endpoint}"')
def step_send_get_request(context, endpoint):
    base_url = "http://localhost:8080"
    full_url = f"{base_url}{endpoint}"
    response = requests.get(full_url, headers=API_HEADERS)
    context.response = response

@when('I send a GET request to "{endpoint}" with parameters')
def step_send_get_request_with_params(context, endpoint):
    base_url = "http://localhost:8080"
    params = {row['parameter']: row['value'] for row in context.table}
    full_url = f"{base_url}{endpoint}"
    response = requests.get(full_url, params=params, headers=API_HEADERS)
    context.response = response

@when('I send the API request to the endpoint "{endpoint}"')
def step_send_api_request(context, endpoint):
    url = f"http://localhost:8080{endpoint}"
    files = context.files if hasattr(context, 'files') else {}

    if not hasattr(context, 'request_data') or context.request_data is None:
        context.request_data = {}

    form_data = []
    for key, value in context.request_data.items():
        form_data.append((key, (None, value)))

    for key, file in files.items():
        mime_type, _ = mimetypes.guess_type(file.name)
        mime_type = mime_type or 'application/octet-stream'
        print(f"form_data {file.name} with {mime_type}")
        form_data.append((key, (file.name, file, mime_type)))

    response = requests.post(url, files=form_data, headers=API_HEADERS)
    context.response = response

########
# THEN #
########

@then('the response content type should be "{content_type}"')
def step_check_response_content_type(context, content_type):
    actual_content_type = context.response.headers.get('Content-Type', '')
    assert actual_content_type.startswith(content_type), f"Expected {content_type} but got {actual_content_type}. Response content: {context.response.content}"

@then('the response file should have size greater than {size:d}')
def step_check_response_file_size(context, size):
    response_file = io.BytesIO(context.response.content)
    assert len(response_file.getvalue()) > size

@then('the response PDF is not passworded')
def step_check_response_pdf_not_passworded(context):
    response_file = io.BytesIO(context.response.content)
    reader = PdfReader(response_file)
    assert not reader.is_encrypted

@then('the response PDF is passworded')
def step_check_response_pdf_passworded(context):
    response_file = io.BytesIO(context.response.content)
    try:
        reader = PdfReader(response_file)
        assert reader.is_encrypted
    except PdfReadError as e:
        raise AssertionError(f"Failed to read PDF: {str(e)}. Response content: {context.response.content}")
    except Exception as e:
        raise AssertionError(f"An error occurred: {str(e)}. Response content: {context.response.content}")

@then('the response status code should be {status_code:d}')
def step_check_response_status_code(context, status_code):
    assert context.response.status_code == status_code, f"Expected status code {status_code} but got {context.response.status_code}"

@then('the response should contain error message "{message}"')
def step_check_response_error_message(context, message):
    response_json = context.response.json()
    assert response_json.get('error') == message, f"Expected error message '{message}' but got '{response_json.get('error')}'"

@then('the response PDF should contain {page_count:d} pages')
def step_check_response_pdf_page_count(context, page_count):
    response_file = io.BytesIO(context.response.content)
    reader = PdfReader(response_file)
    assert len(reader.pages) == page_count, f"Expected {page_count} pages but got {len(reader.pages)} pages"

@then('the response PDF metadata should include "{metadata_key}" as "{metadata_value}"')
def step_check_response_pdf_metadata(context, metadata_key, metadata_value):
    response_file = io.BytesIO(context.response.content)
    reader = PdfReader(response_file)
    metadata = reader.metadata
    assert metadata.get("/" + metadata_key) == metadata_value, f"Expected {metadata_key} to be '{metadata_value}' but got '{metadata.get(metadata_key)}'"

@then('the response file should have extension "{extension}"')
def step_check_response_file_extension(context, extension):
    content_disposition = context.response.headers.get('Content-Disposition', '')
    filename = ""
    if content_disposition:
        parts = content_disposition.split(';')
        for part in parts:
            if part.strip().startswith('filename'):
                filename = part.split('=')[1].strip().strip('"')
                break
    assert filename.endswith(extension), f"Expected file extension {extension} but got {filename}. Response content: {context.response.content}"

@then('save the response file as "{filename}" for debugging')
def step_save_response_file(context, filename):
    with open(filename, 'wb') as f:
        f.write(context.response.content)
    print(f"Saved response content to {filename}")

@then('the response PDF should contain {page_count:d} pages')
def step_check_response_pdf_page_count(context, page_count):
    response_file = io.BytesIO(context.response.content)
    reader = PdfReader(io.BytesIO(response_file.getvalue()))
    actual_page_count = len(reader.pages)
    assert actual_page_count == page_count, f"Expected {page_count} pages but got {actual_page_count} pages"

@then('the response ZIP should contain {file_count:d} files')
def step_check_response_zip_file_count(context, file_count):
    response_file = io.BytesIO(context.response.content)
    with zipfile.ZipFile(io.BytesIO(response_file.getvalue())) as zip_file:
        actual_file_count = len(zip_file.namelist())
    assert actual_file_count == file_count, f"Expected {file_count} files but got {actual_file_count} files"

@then('the response ZIP file should contain {doc_count:d} documents each having {pages_per_doc:d} pages')
def step_check_response_zip_doc_page_count(context, doc_count, pages_per_doc):
    response_file = io.BytesIO(context.response.content)
    with zipfile.ZipFile(io.BytesIO(response_file.getvalue())) as zip_file:
        actual_doc_count = len(zip_file.namelist())
        assert actual_doc_count == doc_count, f"Expected {doc_count} documents but got {actual_doc_count} documents"

        for file_name in zip_file.namelist():
            with zip_file.open(file_name) as pdf_file:
                reader = PdfReader(pdf_file)
                actual_pages_per_doc = len(reader.pages)
                assert actual_pages_per_doc == pages_per_doc, f"Expected {pages_per_doc} pages per document but got {actual_pages_per_doc} pages in document {file_name}"

@then('the JSON value of "{key}" should be "{expected_value}"')
def step_check_json_value(context, key, expected_value):
    actual_value = context.response.json().get(key)
    assert actual_value == expected_value, \
        f"Expected JSON value for '{key}' to be '{expected_value}' but got '{actual_value}'"

@then('JSON list entry containing "{identifier_key}" as "{identifier_value}" should have "{target_key}" as "{target_value}"')
def step_check_json_list_entry(context, identifier_key, identifier_self, target_key, target_value):
    json_response = context.response.json()
    for entry in json_response:
        if entry.get(identifier_key) == identifier_value:
            assert entry.get(target_key) == target_value, \
                f"Expected {target_key} to be {target_value} in entry where {identifier_key} is {identifier_value}, but found {entry.get(target_key)}"
            break
    else:
        raise AssertionError(f"No entry with {identifier_key} as {identifier_value} found")

@then('the response should match the regex "{pattern}"')
def step_response_matches_regex(context, pattern):
    response_text = context.response.text
    assert re.match(pattern, response_text), \
        f"Response '{response_text}' does not match the expected pattern '{pattern}'"
