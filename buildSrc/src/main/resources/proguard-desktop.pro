-dontobfuscate
-dontoptimize
-keepdirectories
-ignorewarnings
-dontwarn **

-keepattributes *Annotation*,Signature,Exceptions,InnerClasses,EnclosingMethod,MethodParameters,SourceFile,LineNumberTable

-keep public class stirling.software.SPDF.SPDFApplication {
    public static void main(java.lang.String[]);
}

-keep @interface * { *; }
-keep class stirling.software.** { *; }
-keep class org.springframework.** { *; }
-keep class org.eclipse.jetty.** { *; }
-keep class ch.qos.logback.** { *; }
-keep class org.slf4j.** { *; }
-keep class org.apache.logging.log4j.** { *; }
-keep class org.apache.commons.logging.** { *; }
-keepclassmembers enum * { *; }

# JBoss Logging resolves generated message logger/bundle implementations by name.
-keep class **_$logger { *; }
-keep class **_$bundle { *; }

# XmlBeans instantiates schema impls by name through generated TypeSystemHolder metadata.
-keep class schemaorg_apache_xmlbeans.** { *; }
-keep class org.apache.xmlbeans.** { *; }
-keep class org.openxmlformats.schemas.**.impl.** { *; }

# JAXB reaches parts of its own runtime through reflection (ReflectionNavigator, Utils).
-keep class com.sun.xml.bind.** { *; }
-keep class org.glassfish.jaxb.** { *; }

# PDFBox instantiates security handlers by name with policy constructors.
-keep class org.apache.pdfbox.pdmodel.encryption.** { *; }

# Removed classes whose names survive as string constants (reflection targets).
-keep class com.github.jaiimageio.** { *; }
-keep class com.twelvemonkeys.** { *; }
-keep class org.bouncycastle.jce.provider.** { *; }
-keep class jakarta.xml.bind.** { *; }
-keep class org.apache.commons.collections4.functors.** { *; }
