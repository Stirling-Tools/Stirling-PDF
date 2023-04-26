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

def auto_rotate(image, angle_threshold=10):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    ret, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if len(contours) == 0:
        return image

    largest_contour = max(contours, key=cv2.contourArea)
    mu = cv2.moments(largest_contour)
    
    if mu["m00"] == 0:
        return image
    
    x_centroid = int(mu["m10"] / mu["m00"])
    y_centroid = int(mu["m01"] / mu["m00"])

    coords = np.column_stack(np.where(binary > 0))
    u, _, vt = np.linalg.svd(coords - np.array([[y_centroid, x_centroid]]), full_matrices=False)

    angle = np.arctan2(u[1, 0], u[0, 0]) * 180 / np.pi

    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

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
    
def split_photos(input_file, output_directory, tolerance=30, min_area=10000, min_contour_area=500, angle_threshold=10, border_size=10):
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
    if len(sys.argv) < 2:
        print("Usage: python3 split_photos.py <input_file> <output_directory> [tolerance] [min_area] [min_contour_area] [angle_threshold] [border_size]")
        print("\nParameters:")
        print("  <input_file>       - The input scanned image containing multiple photos.")
        print("  <output_directory> - The directory where the result images should be placed.")
        print("  [tolerance]        - Optional. Determines the range of color variation around the estimated background color (default: 30).")
        print("  [min_area]         - Optional. Sets the minimum area threshold for a photo (default: 10000).")
        print("  [min_contour_area] - Optional. Sets the minimum contour area threshold for a photo (default: 500).")
        print("  [angle_threshold]  - Optional. Sets the minimum absolute angle required for the image to be rotated (default: 10).")
        print("  [border_size]      - Optional. Sets the size of the border added and removed to prevent white borders in the output (default: 10).")
        sys.exit(1)

    input_file = sys.argv[1]
    output_directory = sys.argv[2]
    tolerance = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    min_area = int(sys.argv[4]) if len(sys.argv) > 4 else 8000
    min_contour_area = int(sys.argv[5]) if len(sys.argv) > 5 else 500
    angle_threshold = int(sys.argv[6]) if len(sys.argv) > 6 else 60
    split_photos(input_file, output_directory, tolerance=tolerance, min_area=min_area, min_contour_area=min_contour_area, angle_threshold=angle_threshold)
