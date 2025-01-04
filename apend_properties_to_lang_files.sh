#!/bin/bash

# Description: This script appends a multi-line string to the end of all the files in the folder that end with _[A-Za-z][A-Za-z].properties

cd src/main/resources

# The multi-line string to append to the end of the file with EOF
STRING_TO_APPEND=$(cat <<EOF

#Template strings image to pdf

imageToPDF.templates=Templates
imageToPDF.selectLabel.templates=Templates Options (Enabled only when templates are selected in fitOptions)
imageToPDF.selectText.templates.1=1x2
imageToPDF.selectText.templates.2=2x2
imageToPDF.selectText.templates.3=2x3
EOF
)

# Loop through all the files in the folder that end with .properties
for file in *_[A-Za-z][A-Za-z].properties
do
    # Append the multi-line string with a newline to the end of the file
    echo "$STRING_TO_APPEND" >> "$file"
done
