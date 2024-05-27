import os
import requests
from behave import given, when, then
from PyPDF2 import PdfWriter, PdfReader
import io
import random
import string
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import mimetypes
import requests
import zipfile
import shutil

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

    response = requests.post(url, files=form_data)
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
