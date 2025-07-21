"""
Author: Ludy87
Description: This script converts a PDF file to WebP images. It includes functionality to resize images if they exceed specified dimensions and handle conversion of PDF pages to WebP format.

Example
-------
To convert a PDF file to WebP images with each page as a separate WebP file:
    python script.py input.pdf output_directory

To convert a PDF file to a single WebP image:
    python script.py input.pdf output_directory --single

To adjust the DPI resolution for rendering PDF pages:
    python script.py input.pdf output_directory --dpi 150
"""

import argparse
import os
from pdf2image import convert_from_path
from PIL import Image


def resize_image(input_image_path, output_image_path, max_size=(16383, 16383)):
    """
    Resize the image if its dimensions exceed the maximum allowed size and save it as WebP.

    Parameters
    ----------
    input_image_path : str
        Path to the input image file.
    output_image_path : str
        Path where the output WebP image will be saved.
    max_size : tuple of int, optional
        Maximum allowed dimensions for the image (width, height). Default is (16383, 16383).

    Returns
    -------
    None
    """
    try:
        # Open the image
        image = Image.open(input_image_path)
        width, height = image.size
        max_width, max_height = max_size

        # Check if the image dimensions exceed the maximum allowed dimensions
        if width > max_width or height > max_height:
            # Calculate the scaling ratio
            ratio = min(max_width / width, max_height / height)
            new_width = int(width * ratio)
            new_height = int(height * ratio)

            # Resize the image
            resized_image = image.resize((new_width, new_height), Image.LANCZOS)
            resized_image.save(output_image_path, format="WEBP", quality=100)
            print(
                f"The image was successfully resized to ({new_width}, {new_height}) and saved as WebP: {output_image_path}"
            )
        else:
            # If dimensions are within the allowed limits, save the image directly
            image.save(output_image_path, format="WEBP", quality=100)
            print(f"The image was successfully saved as WebP: {output_image_path}")
    except Exception as e:
        print(f"An error occurred: {e}")


def convert_image_to_webp(input_image, output_file):
    """
    Convert an image to WebP format, resizing it if it exceeds the maximum dimensions.

    Parameters
    ----------
    input_image : str
        Path to the input image file.
    output_file : str
        Path where the output WebP image will be saved.

    Returns
    -------
    None
    """
    # Resize the image if it exceeds the maximum dimensions
    resize_image(input_image, output_file, max_size=(16383, 16383))


def pdf_to_webp(pdf_path, output_dir, dpi=300):
    """
    Convert each page of a PDF file to WebP images.

    Parameters
    ----------
    pdf_path : str
        Path to the input PDF file.
    output_dir : str
        Directory where the WebP images will be saved.
    dpi : int, optional
        DPI resolution for rendering PDF pages. Default is 300.

    Returns
    -------
    None
    """
    # Convert the PDF to a list of images
    images = convert_from_path(pdf_path, dpi=dpi)

    for page_number, image in enumerate(images):
        # Define temporary PNG path
        temp_png_path = os.path.join(output_dir, f"temp_page_{page_number + 1}.png")
        image.save(temp_png_path, format="PNG")

        # Define the output path for WebP
        output_path = os.path.join(output_dir, f"page_{page_number + 1}.webp")

        # Convert PNG to WebP
        convert_image_to_webp(temp_png_path, output_path)

        # Delete the temporary PNG file
        os.remove(temp_png_path)


def main(pdf_image_path, output_dir, dpi=300, single_images_flag=False):
    """
    Main function to handle conversion from PDF to WebP images.

    Parameters
    ----------
    pdf_image_path : str
        Path to the input PDF file or image.
    output_dir : str
        Directory where the WebP images will be saved.
    dpi : int, optional
        DPI resolution for rendering PDF pages. Default is 300.
    single_images_flag : bool, optional
        If True, combine all pages into a single WebP image. Default is False.

    Returns
    -------
    None
    """
    if single_images_flag:
        # Combine all pages into a single WebP image
        output_path = os.path.join(output_dir, "combined_image.webp")
        convert_image_to_webp(pdf_image_path, output_path)
    else:
        # Convert each PDF page to a separate WebP image
        pdf_to_webp(pdf_image_path, output_dir, dpi)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert a PDF file to WebP images.")
    parser.add_argument("pdf_path", help="The path to the input PDF file.")
    parser.add_argument(
        "output_dir", help="The directory where the WebP images should be saved."
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=300,
        help="The DPI resolution for rendering the PDF pages (default: 300).",
    )
    parser.add_argument(
        "--single",
        action="store_true",
        help="Combine all pages into a single WebP image.",
    )
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    main(
        args.pdf_path,
        args.output_dir,
        dpi=args.dpi,
        single_images_flag=args.single,
    )
