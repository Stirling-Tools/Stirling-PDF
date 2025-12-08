import React, { createContext, useContext, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface AdminTourOrchestrationContextType {
  // State management
  saveAdminState: () => void;
  restoreAdminState: () => void;

  // Modal & navigation
  openConfigModal: () => void;
  closeConfigModal: () => void;
  navigateToSection: (section: string) => void;
  scrollNavToSection: (section: string) => void;

  // Section-specific actions
  scrollToSetting: (settingId: string) => void;
}

const AdminTourOrchestrationContext = createContext<AdminTourOrchestrationContextType | undefined>(undefined);

export const AdminTourOrchestrationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Store the user's location before tour starts
  const savedLocationRef = useRef<string>('');

  const saveAdminState = useCallback(() => {
    savedLocationRef.current = location.pathname;
    console.log('Saving admin state, location:', location.pathname);
  }, [location.pathname]);

  const restoreAdminState = useCallback(() => {
    console.log('Restoring admin state, saved location:', savedLocationRef.current);

    // Navigate back to saved location or home
    const targetPath = savedLocationRef.current || '/';
    navigate(targetPath, { replace: true });

    savedLocationRef.current = '';
  }, [navigate]);

  const openConfigModal = useCallback(() => {
    // Navigate to settings overview to open the modal
    navigate('/settings/overview');
  }, [navigate]);

  const closeConfigModal = useCallback(() => {
    // Navigate back to home to close the modal
    navigate('/', { replace: true });
  }, [navigate]);

  const navigateToSection = useCallback((section: string) => {
    navigate(`/settings/${section}`);
  }, [navigate]);

  const scrollNavToSection = useCallback((section: string): Promise<void> => {
    return new Promise((resolve) => {
      const navElement = document.querySelector(`[data-tour="admin-${section}-nav"]`) as HTMLElement;
      const scrollContainer = document.querySelector('.modal-nav-scroll') as HTMLElement;

      if (navElement && scrollContainer) {
        // Get the position of the nav element relative to the scroll container
        const navTop = navElement.offsetTop;
        const containerHeight = scrollContainer.clientHeight;
        const navHeight = navElement.offsetHeight;

        // Calculate scroll position to center the element
        const scrollTo = navTop - (containerHeight / 2) + (navHeight / 2);

        // Instant scroll to avoid timing issues
        scrollContainer.scrollTo({
          top: Math.max(0, scrollTo),
          behavior: 'auto'
        });

        // Use multiple animation frames to ensure browser has fully updated
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
      } else {
        resolve();
      }
    });
  }, []);

  const scrollToSetting = useCallback((settingId: string) => {
    // Wait for the DOM to update, then scroll to the setting
    setTimeout(() => {
      const element = document.querySelector(`[data-tour="${settingId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
  }, []);

  const value: AdminTourOrchestrationContextType = {
    saveAdminState,
    restoreAdminState,
    openConfigModal,
    closeConfigModal,
    navigateToSection,
    scrollNavToSection,
    scrollToSetting,
  };

  return (
    <AdminTourOrchestrationContext.Provider value={value}>
      {children}
    </AdminTourOrchestrationContext.Provider>
  );
};

export const useAdminTourOrchestration = (): AdminTourOrchestrationContextType => {
  const context = useContext(AdminTourOrchestrationContext);
  if (!context) {
    throw new Error('useAdminTourOrchestration must be used within AdminTourOrchestrationProvider');
  }
  return context;
};
