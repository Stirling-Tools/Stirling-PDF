import React, { useState, useEffect } from 'react';
import { Box, ScrollArea, ActionIcon, Tooltip } from '@mantine/core';
import { LocalIcon } from '../shared/LocalIcon';

interface ThumbnailSidebarProps {
  visible: boolean;
  onToggle: () => void;
  colorScheme: 'light' | 'dark' | 'auto';
}

export function ThumbnailSidebar({ visible, onToggle, colorScheme }: ThumbnailSidebarProps) {
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const [thumbnails, setThumbnails] = useState<{ [key: number]: string }>({});
  const [totalPages, setTotalPages] = useState<number>(0);

  // Convert color scheme
  const actualColorScheme = colorScheme === 'auto' ? 'light' : colorScheme;

  // Get total pages from scroll API
  useEffect(() => {
    const scrollAPI = (window as any).embedPdfScroll;
    if (scrollAPI && scrollAPI.totalPages) {
      setTotalPages(scrollAPI.totalPages);
    }
  }, [visible]);

  // Generate thumbnails when sidebar becomes visible
  useEffect(() => {
    if (!visible || totalPages === 0) return;

    const thumbnailAPI = (window as any).embedPdfThumbnail?.thumbnailAPI;
    console.log('📄 ThumbnailSidebar useEffect triggered:', {
      visible,
      thumbnailAPI: !!thumbnailAPI,
      totalPages,
      existingThumbnails: Object.keys(thumbnails).length
    });
    
    if (!thumbnailAPI) return;

    const generateThumbnails = async () => {
      console.log('📄 Starting thumbnail generation for', totalPages, 'pages');
      
      for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        if (thumbnails[pageIndex]) continue; // Skip if already generated

        try {
          console.log('📄 Attempting to generate thumbnail for page', pageIndex + 1);
          const thumbTask = thumbnailAPI.renderThumb(pageIndex, 1.0);
          console.log('📄 Received thumbTask:', thumbTask);
          
          // Convert Task to Promise and handle properly
          thumbTask.toPromise().then((thumbBlob: Blob) => {
            console.log('📄 Thumbnail generated successfully for page', pageIndex + 1, 'blob:', thumbBlob);
            const thumbUrl = URL.createObjectURL(thumbBlob);
            console.log('📄 Created blob URL:', thumbUrl);
            
            setThumbnails(prev => ({
              ...prev,
              [pageIndex]: thumbUrl
            }));
          }).catch((error: any) => {
            console.error('📄 Failed to generate thumbnail for page', pageIndex + 1, error);
            setThumbnails(prev => ({
              ...prev,
              [pageIndex]: 'error'
            }));
          });
          
        } catch (error) {
          console.error('Failed to generate thumbnail for page', pageIndex + 1, error);
          // Set a placeholder or error state
          setThumbnails(prev => ({
            ...prev,
            [pageIndex]: 'error'
          }));
        }
      }
    };

    generateThumbnails();

    // Cleanup blob URLs when component unmounts
    return () => {
      Object.values(thumbnails).forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [visible, totalPages, thumbnails]);

  const handlePageClick = (pageIndex: number) => {
    const pageNumber = pageIndex + 1; // Convert to 1-based
    setSelectedPage(pageNumber);
    
    // Use scroll API to navigate to page
    const scrollAPI = (window as any).embedPdfScroll;
    if (scrollAPI && scrollAPI.scrollToPage) {
      scrollAPI.scrollToPage(pageNumber);
    }
  };

  return (
    <>
      {/* Thumbnail Sidebar */}
      {visible && (
        <Box
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            bottom: 0,
            width: '15rem',
            backgroundColor: actualColorScheme === 'dark' ? '#1a1b1e' : '#f8f9fa',
            borderLeft: `1px solid ${actualColorScheme === 'dark' ? '#373A40' : '#e9ecef'}`,
            zIndex: 998,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.1)'
          }}
        >
          {/* Thumbnails Container */}
          <ScrollArea style={{ flex: 1 }}>
            <Box p="sm">
              <div style={{ 
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {Array.from({ length: totalPages }, (_, pageIndex) => (
                  <Box
                    key={pageIndex}
                    onClick={() => handlePageClick(pageIndex)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '8px',
                      padding: '8px',
                      backgroundColor: selectedPage === pageIndex + 1
                        ? (actualColorScheme === 'dark' ? '#364FC7' : '#e7f5ff')
                        : 'transparent',
                      border: selectedPage === pageIndex + 1 
                        ? '2px solid #1c7ed6'
                        : '2px solid transparent',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedPage !== pageIndex + 1) {
                        e.currentTarget.style.backgroundColor = actualColorScheme === 'dark' ? '#25262b' : '#f1f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedPage !== pageIndex + 1) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    {/* Thumbnail Image */}
                    {thumbnails[pageIndex] && thumbnails[pageIndex] !== 'error' ? (
                      <img 
                        src={thumbnails[pageIndex]}
                        alt={`Page ${pageIndex + 1} thumbnail`}
                        style={{
                          maxWidth: '100%',
                          height: 'auto',
                          borderRadius: '4px',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                          border: `1px solid ${actualColorScheme === 'dark' ? '#373A40' : '#e9ecef'}`
                        }}
                      />
                    ) : thumbnails[pageIndex] === 'error' ? (
                      <div style={{
                        width: '11.5rem',
                        height: '15rem',
                        backgroundColor: actualColorScheme === 'dark' ? '#2d1b1b' : '#ffebee',
                        border: `1px solid ${actualColorScheme === 'dark' ? '#5d3737' : '#ffcdd2'}`,
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#d32f2f',
                        fontSize: '12px'
                      }}>
                        Failed
                      </div>
                    ) : (
                      <div style={{
                        width: '11.5rem',
                        height: '15rem',
                        backgroundColor: actualColorScheme === 'dark' ? '#25262b' : '#f8f9fa',
                        border: `1px solid ${actualColorScheme === 'dark' ? '#373A40' : '#e9ecef'}`,
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: actualColorScheme === 'dark' ? '#adb5bd' : '#6c757d',
                        fontSize: '12px'
                      }}>
                        Loading...
                      </div>
                    )}
                    
                    {/* Page Number */}
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: selectedPage === pageIndex + 1
                        ? (actualColorScheme === 'dark' ? '#ffffff' : '#1c7ed6')
                        : (actualColorScheme === 'dark' ? '#adb5bd' : '#6c757d')
                    }}>
                      Page {pageIndex + 1}
                    </div>
                  </Box>
                ))}
              </div>
            </Box>
          </ScrollArea>
        </Box>
      )}
    </>
  );
}