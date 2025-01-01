#!/bin/bash # Iterate over all files starting with "messages" in the current directory for file in messages*; do
  # Check if the file exists and is not a directory if [ -f "$file" ]; then
    # Append the line after the line starting with 'pdfToImage.custom' awk '/^pdfToImage.custom/ { print; print "pdfToImage.customPageNumber=Custom Page Number (number must be within the valid range of 1 to the total number 
    of pages in the PDF)"; next }1' "$file" > temp_file && mv temp_file "$file" echo "Updated file: $file"
  fi
done

