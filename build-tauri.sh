#!/bin/bash

echo "🔨 Building Stirling PDF with Tauri integration..."

# Build the Java backend
echo "📦 Building Java backend..."
./gradlew bootJar

if [ $? -ne 0 ]; then
    echo "❌ Failed to build Java backend"
    exit 1
fi

echo "✅ Java backend built successfully"

# Copy the JAR to Tauri resources
echo "📋 Copying JAR file to Tauri resources..."
mkdir -p frontend/src-tauri/libs
cp build/libs/Stirling-PDF-*.jar frontend/src-tauri/libs/
if [ $? -eq 0 ]; then
    echo "✅ JAR copied successfully"
else
    echo "❌ Failed to copy JAR file"
    exit 1
fi


# Navigate to frontend and run Tauri
echo "🚀 Starting Tauri development server..."
cd frontend
npm run tauri dev