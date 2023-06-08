import cv2
import numpy as np
import sys
import argparse

def is_blank_image(image_path, threshold=10, white_percent=99, white_value=255, blur_size=5):
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    
    if image is None:
        print(f"Error: Unable to read the image file: {image_path}")
        return False

    # Apply Gaussian blur to reduce noise
    blurred_image = cv2.GaussianBlur(image, (blur_size, blur_size), 0)

    _, thresholded_image = cv2.threshold(blurred_image, white_value - threshold, white_value, cv2.THRESH_BINARY)

    # Calculate the percentage of white pixels in the thresholded image
    white_pixels = 0
    total_pixels = thresholded_image.size
    for i in range(0, thresholded_image.shape[0], 2):
        for j in range(0, thresholded_image.shape[1], 2):
            if thresholded_image[i, j] == white_value:
                white_pixels += 1
            white_pixel_percentage = (white_pixels / (i * thresholded_image.shape[1] + j + 1)) * 100
            if white_pixel_percentage < white_percent:
                return False

    print(f"Page has white pixel percent of {white_pixel_percentage}")
    return True



if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Detect if an image is considered blank or not.')
    parser.add_argument('image_path', help='The path to the image file.')
    parser.add_argument('-t', '--threshold', type=int, default=10, help='Threshold for determining white pixels. The default value is 10.')
    parser.add_argument('-w', '--white_percent', type=float, default=99, help='The percentage of white pixels for an image to be considered blank. The default value is 99.')
    args = parser.parse_args()

    blank = is_blank_image(args.image_path, args.threshold, args.white_percent)

    if blank:
        # Return code 1: The image is considered blank.
        sys.exit(1)
    else:
        # Return code 0: The image is not considered blank.
        sys.exit(0)
