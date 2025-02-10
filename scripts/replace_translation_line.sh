#!/bin/bash

translation_key="pdfToPDFA.credit"
old_value="qpdf"
new_value="liibreoffice"

for file in ../src/main/resources/messages_*.properties; do
  sed -i "/^$translation_key=/s/$old_value/$new_value/" "$file"
  echo "Updated $file"
done
