import { useState, useEffect } from 'react';
import { Box, ScrollArea } from '@mantine/core';
import { useViewer } from '@app/contexts/ViewerContext';
import { PrivateContent } from '@app/components/shared/PrivateContent';

interface ThumbnailSidebarProps {
  visible: boolean;
  onToggle: () => void;
  activeFileIndex?: number;
}

export function ThumbnailSidebar({ visible, onToggle: _onToggle, activeFileIndex }: ThumbnailSidebarProps) {
  const { getScrollState, scrollActions, getThumbnailAPI } = useViewer();
  const [thumbnails, setThumbnails] = useState<{ [key: number]: string }>({});

  const scrollState = getScrollState();
  const thumbnailAPI = getThumbnailAPI();

  // Clear thumbnails when active file changes
  useEffect(() => {
    // Revoke old blob URLs to prevent memory leaks
    Object.values(thumbnails).forEach((thumbUrl) => {
      if (typeof thumbUrl === 'string' && thumbUrl.startsWith('blob:')) {
        URL.revokeObjectURL(thumbUrl);
      }
    });
    setThumbnails({});
  }, [activeFileIndex]);

  // Clear thumbnails when sidebar closes and revoke blob URLs to prevent memory leaks
  useEffect(() => {
    if (!visible) {
      Object.values(thumbnails).forEach((thumbUrl) => {
        // Only revoke if it's a blob URL (not 'error')
        if (typeof thumbUrl === 'string' && thumbUrl.startsWith('blob:')) {
          URL.revokeObjectURL(thumbUrl);
        }
      });
      setThumbnails({});
    }
  }, [visible]); // Remove thumbnails from dependency to prevent infinite loop

  // Generate thumbnails when sidebar becomes visible
  useEffect(() => {
    if (!visible || scrollState.totalPages === 0) return;
    if (!thumbnailAPI) return;

    const generateThumbnails = async () => {
      for (let pageIndex = 0; pageIndex < scrollState.totalPages; pageIndex++) {
        if (thumbnails[pageIndex]) continue; // Skip if already generated

        try {
          const thumbTask = thumbnailAPI.renderThumb(pageIndex, 1.0);

          // Convert Task to Promise and handle properly
          thumbTask.toPromise().then((thumbBlob: Blob) => {
            const thumbUrl = URL.createObjectURL(thumbBlob);

            setThumbnails(prev => ({
              ...prev,
              [pageIndex]: thumbUrl
            }));
          }).catch((error: any) => {
            console.error('Failed to generate thumbnail for page', pageIndex + 1, error);
            setThumbnails(prev => ({
              ...prev,
              [pageIndex]: 'error'
            }));
          });

        } catch (error) {
          console.error('Failed to generate thumbnail for page', pageIndex + 1, error);
          setThumbnails(prev => ({
            ...prev,
            [pageIndex]: 'error'
          }));
        }
      }
    };

    generateThumbnails();
  }, [visible, scrollState.totalPages, thumbnailAPI]);

  const handlePageClick = (pageIndex: number) => {
    const pageNumber = pageIndex + 1; // Convert to 1-based
    scrollActions.scrollToPage(pageNumber);
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
            backgroundColor: 'var(--bg-surface)',
            borderLeft: '1px solid var(--border-subtle)',
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
                {Array.from({ length: scrollState.totalPages }, (_, pageIndex) => (
                  <Box
                    key={pageIndex}
                    onClick={() => handlePageClick(pageIndex)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '8px',
                      padding: '8px',
                      backgroundColor: scrollState.currentPage === pageIndex + 1
                        ? 'var(--color-primary-100)'
                        : 'transparent',
                      border: scrollState.currentPage === pageIndex + 1
                        ? '2px solid var(--color-primary-500)'
                        : '2px solid transparent',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onMouseEnter={(e) => {
                      if (scrollState.currentPage !== pageIndex + 1) {
                        e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (scrollState.currentPage !== pageIndex + 1) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    {/* Thumbnail Image */}
                    {thumbnails[pageIndex] && thumbnails[pageIndex] !== 'error' ? (
                      <PrivateContent>
                        <img
                          src={thumbnails[pageIndex]}
                          alt={`Page ${pageIndex + 1} thumbnail`}
                          style={{
                            maxWidth: '100%',
                            height: 'auto',
                            borderRadius: '4px',
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                            border: '1px solid var(--border-subtle)'
                          }}
                        />
                      </PrivateContent>
                    ) : thumbnails[pageIndex] === 'error' ? (
                      <div style={{
                        width: '11.5rem',
                        height: '15rem',
                        backgroundColor: 'var(--color-red-50)',
                        border: '1px solid var(--color-red-200)',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-red-500)',
                        fontSize: '12px'
                      }}>
                        Failed
                      </div>
                    ) : (
                      <div style={{
                        width: '11.5rem',
                        height: '15rem',
                        backgroundColor: 'var(--bg-muted)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '12px'
                      }}>
                        Loading...
                      </div>
                    )}

                    {/* Page Number */}
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: scrollState.currentPage === pageIndex + 1
                        ? 'var(--color-primary-500)'
                        : 'var(--text-muted)'
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
