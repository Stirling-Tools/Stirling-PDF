import argparse
import os
from pdf2image import convert_from_path
from PIL import Image


def convert_image_to_webp(input_image, output_file, quality=100):
    # Open the image using Pillow
    image = Image.open(input_image)

    # Convert the image to WebP format and save it with the specified quality
    image.save(output_file, format="WEBP", quality=quality)

    print(f"The image was successfully saved as WebP: {output_file}")


def pdf_to_webp(pdf_path, output_dir, quality=100, dpi=300):
    # Convert PDF to a list of images
    images = convert_from_path(pdf_path, dpi=dpi)

    for page_number, image in enumerate(images):
        # Define temporary PNG path
        temp_png_path = os.path.join(output_dir, f"temp_page_{page_number + 1}.png")
        image.save(temp_png_path, format="PNG")

        # Define output WebP path
        output_path = os.path.join(output_dir, f"page_{page_number + 1}.webp")

        # Convert PNG to WebP
        convert_image_to_webp(temp_png_path, output_path, quality=quality)

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
