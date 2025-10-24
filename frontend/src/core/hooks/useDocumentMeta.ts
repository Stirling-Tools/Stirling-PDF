import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface MetaOptions {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
}

export const useDocumentMeta = (meta: MetaOptions) => {
  const { i18n } = useTranslation();
  
  useEffect(() => {
    const originalTitle = document.title;
    const originalDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    
    // Store original OpenGraph values for cleanup
    const ogProperties = ['og:site_name', 'og:locale', 'og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:url', 'og:type'];
    const originalOgValues = new Map<string, string | null>();
    
    ogProperties.forEach(property => {
      const element = document.querySelector(`meta[property="${property}"]`);
      originalOgValues.set(property, element?.getAttribute('content') || null);
    });
    
    // Update title
    if (meta.title) {
      document.title = meta.title;
    }
    
    // Update or create meta tags
    const updateOrCreateMeta = (name: string, content: string) => {
      let metaElement = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      if (!metaElement) {
        metaElement = document.createElement('meta');
        metaElement.name = name;
        document.head.appendChild(metaElement);
      }
      metaElement.content = content;
    };

    const updateOrCreateProperty = (property: string, content: string) => {
      let metaElement = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!metaElement) {
        metaElement = document.createElement('meta');
        metaElement.setAttribute('property', property);
        document.head.appendChild(metaElement);
      }
      metaElement.content = content;
    };

    // Update meta tags
    if (meta.description) {
      updateOrCreateMeta('description', meta.description);
    }

    // Update OpenGraph tags
    updateOrCreateProperty('og:site_name', 'Stirling PDF');
    updateOrCreateProperty('og:locale', i18n.language.replace('-', '_'));
    
    if (meta.ogTitle) {
      updateOrCreateProperty('og:title', meta.ogTitle);
    }
    if (meta.ogDescription) {
      updateOrCreateProperty('og:description', meta.ogDescription);
    }
    if (meta.ogImage) {
      updateOrCreateProperty('og:image', meta.ogImage);
      updateOrCreateProperty('og:image:width', '1200');
      updateOrCreateProperty('og:image:height', '630');
    }
    if (meta.ogUrl) {
      updateOrCreateProperty('og:url', meta.ogUrl);
    }
    // Always set og:type to website
    updateOrCreateProperty('og:type', 'website');

    // Cleanup function to restore original values
    return () => {
      document.title = originalTitle;
      if (originalDescription) {
        updateOrCreateMeta('description', originalDescription);
      }
      
      // Restore or remove OpenGraph tags
      originalOgValues.forEach((originalValue, property) => {
        const element = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
        if (element) {
          if (originalValue !== null) {
            element.content = originalValue;
          } else {
            element.remove();
          }
        }
      });
    };
  }, [meta.title, meta.description, meta.ogTitle, meta.ogDescription, meta.ogImage, meta.ogUrl, i18n.language]);
};