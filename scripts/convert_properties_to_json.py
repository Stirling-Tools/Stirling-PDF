#!/usr/bin/env python3
"""
Convert Java .properties files to JSON for react-i18next
Preserves hierarchical structure and handles special cases
"""

import os
import json
import re
from pathlib import Path

def properties_to_dict(file_path):
    """Convert .properties file to nested dictionary"""
    result = {}
    
    with open(file_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            
            # Skip empty lines and comments
            if not line or line.startswith('#'):
                continue
                
            # Handle key=value pairs
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                
                # Handle multiline values (ending with \)
                while value.endswith('\\'):
                    next_line = next(f, '').strip()
                    value = value[:-1] + next_line
                
                # Create nested structure from dot notation
                set_nested_value(result, key, value)
    
    return result

def set_nested_value(dictionary, key_path, value):
    """Set value in nested dictionary using dot notation"""
    keys = key_path.split('.')
    current = dictionary
    
    for key in keys[:-1]:
        if key not in current:
            current[key] = {}
        elif not isinstance(current[key], dict):
            # Convert existing string value to nested object
            old_value = current[key]
            current[key] = {"_value": old_value}
        current = current[key]
    
    final_key = keys[-1]
    if final_key in current and isinstance(current[final_key], dict):
        # If the final key already exists as an object, store the value under "_value"
        current[final_key]["_value"] = value
    else:
        current[final_key] = value

def convert_all_properties():
    """Convert all messages_*.properties files to JSON"""
    
    # Get project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    resources_dir = project_root / 'src' / 'main' / 'resources'
    output_dir = project_root / 'frontend' / 'public' / 'locales'
    
    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Find all .properties files
    properties_files = list(resources_dir.glob('messages*.properties'))
    
    converted_count = 0
    
    for props_file in properties_files:
        # Extract locale from filename
        filename = props_file.name
        if filename == 'messages.properties':
            locale = 'en'  # Default locale
        else:
            # Extract locale from messages_en_US.properties format
            locale_match = re.match(r'messages_(.+)\.properties', filename)
            if locale_match:
                locale = locale_match.group(1)
                # Convert Java locale format to standard (en_US -> en-US)
                locale = locale.replace('_', '-')
            else:
                continue
        
        print(f"Converting {filename} -> {locale}.json")
        
        # Convert to dictionary
        data = properties_to_dict(props_file)
        
        # Create locale directory
        locale_dir = output_dir / locale
        locale_dir.mkdir(exist_ok=True)
        
        # Write translation.json (react-i18next default namespace)
        output_file = locale_dir / 'translation.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        converted_count += 1
    
    print(f"\nConverted {converted_count} language files to {output_dir}")
    print("Languages available:", [d.name for d in output_dir.iterdir() if d.is_dir()])

if __name__ == '__main__':
    convert_all_properties()