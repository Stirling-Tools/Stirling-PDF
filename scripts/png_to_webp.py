import argparse
import cv2
import os
import fitz  # PyMuPDF


def convert_png_to_webp(input_file, output_file, quality=100):
    # Read the PNG image
    image = cv2.imread(input_file, cv2.IMREAD_UNCHANGED)

    # Check if the image was successfully read
    if image is None:
        print(f"Error: The image {input_file} could not be read.")
        return

    # Check if the output directory exists
    output_dir = os.path.dirname(output_file)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    print(f"Image {input_file} successfully loaded with dimensions: {image.shape}")

    # Save the image as a WebP with the specified quality
    success = cv2.imwrite(output_file, image, [cv2.IMWRITE_WEBP_QUALITY, quality])

    if success:
        print(f"The image was successfully saved as WebP: {output_file}")
    else:
        print("Error: The image could not be saved as WebP.")


def pdf_to_webp(pdf_path, output_dir, quality=100, dpi=300):
    # Open the PDF document
    pdf_document = fitz.open(pdf_path)

    for page_number in range(len(pdf_document)):
        # Extract the page as an image
        page = pdf_document.load_page(page_number)
        pix = page.get_pixmap(dpi=dpi)

        # Save the image as a temporary PNG file
        temp_png_path = os.path.join(output_dir, f"temp_page_{page_number + 1}.png")
        with open(temp_png_path, "wb") as f:
            f.write(pix.tobytes("png"))

        # Convert the PNG file to WebP
        output_path = os.path.join(output_dir, f"page_{page_number + 1}.webp")
        convert_png_to_webp(temp_png_path, output_path, quality=quality)

        # Delete the temporary PNG file
        os.remove(temp_png_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert a PDF file to WebP images.")
    parser.add_argument(
        "pdf_path",
        help="The path to the input PDF file.",
    )
    parser.add_argument(
        "output_dir",
        help="The directory where the WebP images should be saved.",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=100,
        help="The quality of the WebP output (default: 100).",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=300,
        help="The DPI resolution for rendering the PDF pages (default: 300).",
    )

    args = parser.parse_args()

    # Create the output directory if it doesn't exist
    os.makedirs(args.output_dir, exist_ok=True)

    # Convert the PDF file to WebP images
    pdf_to_webp(args.pdf_path, args.output_dir, quality=args.quality, dpi=args.dpi)
