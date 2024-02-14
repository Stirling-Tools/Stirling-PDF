import argparse
import sys
import cv2
import numpy as np
import os

def find_photo_boundaries(image, background_color, tolerance=30, min_area=10000, min_contour_area=500):
    mask = cv2.inRange(image, background_color - tolerance, background_color + tolerance)
    mask = cv2.bitwise_not(mask)
    kernel = np.ones((5,5),np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=2)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    photo_boundaries = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        contour_area = cv2.contourArea(contour)
        if area >= min_area and contour_area >= min_contour_area:
            photo_boundaries.append((x, y, w, h))

    return photo_boundaries

def estimate_background_color(image, sample_points=5):
    h, w, _ = image.shape
    points = [
        (0, 0),
        (w - 1, 0),
        (w - 1, h - 1),
        (0, h - 1),
        (w // 2, h // 2),
    ]

    colors = []
    for x, y in points:
        colors.append(image[y, x])

    return np.median(colors, axis=0)

def auto_rotate(image, angle_threshold=1):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLines(edges, 1, np.pi / 180, 200)

    if lines is None:
        return image

    # compute the median angle of the lines
    angles = []
    for rho, theta in lines[:, 0]:
        angles.append((theta * 180) / np.pi - 90)

    angle = np.median(angles)

    if abs(angle) < angle_threshold:
        return image

    (h, w) = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)




def crop_borders(image, border_color, tolerance=30):
    mask = cv2.inRange(image, border_color - tolerance, border_color + tolerance)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if len(contours) == 0:
        return image

    largest_contour = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest_contour)

    return image[y:y+h, x:x+w]

def split_photos(input_file, output_directory, tolerance=30, min_area=10000, min_contour_area=500, angle_threshold=10, border_size=0):
    image = cv2.imread(input_file)
    background_color = estimate_background_color(image)

    # Add a constant border around the image
    image = cv2.copyMakeBorder(image, border_size, border_size, border_size, border_size, cv2.BORDER_CONSTANT, value=background_color)

    photo_boundaries = find_photo_boundaries(image, background_color, tolerance)

    if not os.path.exists(output_directory):
        os.makedirs(output_directory)

    # Get the input file's base name without the extension
    input_file_basename = os.path.splitext(os.path.basename(input_file))[0]

    for idx, (x, y, w, h) in enumerate(photo_boundaries):
        cropped_image = image[y:y+h, x:x+w]
        cropped_image = auto_rotate(cropped_image, angle_threshold)

        # Remove the added border
        cropped_image = cropped_image[border_size:-border_size, border_size:-border_size]

        output_path = os.path.join(output_directory, f"{input_file_basename}_{idx+1}.png")
        cv2.imwrite(output_path, cropped_image)
        print(f"Saved {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Split photos in an image")
    parser.add_argument("input_file", help="The input scanned image containing multiple photos.")
    parser.add_argument("output_directory", help="The directory where the result images should be placed.")
    parser.add_argument("--tolerance", type=int, default=30, help="Determines the range of color variation around the estimated background color (default: 30).")
    parser.add_argument("--min_area", type=int, default=10000, help="Sets the minimum area threshold for a photo (default: 10000).")
    parser.add_argument("--min_contour_area", type=int, default=500, help="Sets the minimum contour area threshold for a photo (default: 500).")
    parser.add_argument("--angle_threshold", type=int, default=10, help="Sets the minimum absolute angle required for the image to be rotated (default: 10).")
    parser.add_argument("--border_size", type=int, default=0, help="Sets the size of the border added and removed to prevent white borders in the output (default: 0).")

    args = parser.parse_args()

    split_photos(args.input_file, args.output_directory, tolerance=args.tolerance, min_area=args.min_area, min_contour_area=args.min_contour_area, angle_threshold=args.angle_threshold, border_size=args.border_size)
