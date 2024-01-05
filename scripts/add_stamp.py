from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from io import BytesIO
from PIL import Image
from reportlab.lib.utils import ImageReader  # Import ImageReader from reportlab

def add_stamp_to_pdf(input_pdf_path, stamp_image_path, output_pdf_path, opacity=0.5):
    input_pdf = PdfReader(open(input_pdf_path, "rb"))
    output = PdfWriter()

    stamp = Image.open(stamp_image_path)
    stamp = stamp.convert("RGBA")

    # Create a new image with adjusted opacity
    stamp_with_opacity = Image.new("RGBA", stamp.size)
    for x in range(stamp.width):
        for y in range(stamp.height):
            r, g, b, a = stamp.getpixel((x, y))
            stamp_with_opacity.putpixel((x, y), (r, g, b, int(a * opacity) if opacity < 1.0 else a))

    for page_num in range(len(input_pdf.pages)):
        page = input_pdf.pages[page_num]

        # Get page dimensions using mediabox
        page_mediabox = page['/MediaBox']
        page_width = float(page_mediabox[2])
        page_height = float(page_mediabox[3])

        stamp_width, stamp_height = stamp.size

        # Calculate scaling factors to maintain original stamp size
        scale_x = page_width / stamp_width
        scale_y = page_height / stamp_height

        # Choose the smaller scale to maintain original stamp size within the page
        scale_factor = min(scale_x, scale_y)

        # Resize stamp image with adjusted opacity to match the scaled dimensions
        stamp_with_opacity_resized = stamp_with_opacity.resize((int(stamp_width * scale_factor), int(stamp_height * scale_factor)))

        # Create a PDF buffer for the stamped page
        stamped_page_buffer = BytesIO()
        c = canvas.Canvas(stamped_page_buffer, pagesize=(page_width, page_height))

        # Draw the stamp centered on the PDF page
        x_offset = (page_width - stamp_with_opacity_resized.width) / 2
        y_offset = (page_height - stamp_with_opacity_resized.height) / 2

        # Convert Image object to ReportLab's ImageReader
        stamp_buffer = BytesIO()
        stamp_with_opacity_resized.save(stamp_buffer, format="PNG")
        stamp_buffer.seek(0)
        stamp_reader = ImageReader(stamp_buffer)

        c.drawImage(stamp_reader, x_offset, y_offset, width=stamp_with_opacity_resized.width, height=stamp_with_opacity_resized.height, mask='auto', preserveAspectRatio=True)

        c.save()

        # Merge the stamped page with the original PDF content
        stamped_page = PdfReader(BytesIO(stamped_page_buffer.getvalue())).pages[0]
        stamped_page.merge_page(page)
        output.add_page(stamped_page)

    # Save the modified PDF
    with open(output_pdf_path, "wb") as output_pdf:
        output.write(output_pdf)

# Paths
input_pdf_path = "D:\Projects\Add_PDF_Stamp/input.pdf"
stamp_image_path = "D:\Projects\Add_PDF_Stamp/stamp.png"
output_pdf_path = "D:\Projects\Add_PDF_Stamp/output.pdf"

add_stamp_to_pdf(input_pdf_path, stamp_image_path, output_pdf_path, opacity=0.7)
