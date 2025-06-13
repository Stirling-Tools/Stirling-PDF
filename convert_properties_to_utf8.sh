#!/bin/bash

# Check if iconv is installed
if ! command -v iconv &> /dev/null; then
    echo "Error: iconv is required but not installed."
    exit 1
fi

# Directory containing property files
PROP_DIR="stirling-pdf/src/main/resources"

# List of files to convert
FILES=(
    "stirling-pdf/src/main/resources/messages_az_AZ.properties"
    "stirling-pdf/src/main/resources/messages_ca_CA.properties"
    "stirling-pdf/src/main/resources/messages_cs_CZ.properties"
    "stirling-pdf/src/main/resources/messages_da_DK.properties"
    "stirling-pdf/src/main/resources/messages_de_DE.properties"
    "stirling-pdf/src/main/resources/messages_es_ES.properties"
    "stirling-pdf/src/main/resources/messages_fr_FR.properties"
    "stirling-pdf/src/main/resources/messages_ga_IE.properties"
    "stirling-pdf/src/main/resources/messages_hu_HU.properties"
    "stirling-pdf/src/main/resources/messages_it_IT.properties"
    "stirling-pdf/src/main/resources/messages_nl_NL.properties"
    "stirling-pdf/src/main/resources/messages_no_NB.properties"
    "stirling-pdf/src/main/resources/messages_pl_PL.properties"
    "stirling-pdf/src/main/resources/messages_pt_BR.properties"
    "stirling-pdf/src/main/resources/messages_pt_PT.properties"
    "stirling-pdf/src/main/resources/messages_ro_RO.properties"
    "stirling-pdf/src/main/resources/messages_ru_RU.properties"
    "stirling-pdf/src/main/resources/messages_sk_SK.properties"
    "stirling-pdf/src/main/resources/messages_sv_SE.properties"
    "stirling-pdf/src/main/resources/messages_tr_TR.properties"
    "stirling-pdf/src/main/resources/messages_uk_UA.properties"
    "stirling-pdf/src/main/resources/messages_vi_VN.properties"
)

for file in "${FILES[@]}"; do
    echo "Processing $file..."
    
    # Create a backup of the original file
    cp "$file" "${file}.bak"
    
    # Convert from ISO-8859-1 to UTF-8
    iconv -f ISO-8859-1 -t UTF-8 "${file}.bak" > "$file"
    
    # Check if conversion was successful
    if [ $? -eq 0 ]; then
        echo "Successfully converted $file to UTF-8"
        # Verify the file is now UTF-8
        file "$file"
    else
        echo "Failed to convert $file, restoring backup"
        mv "${file}.bak" "$file"
    fi
done

echo "All files processed."