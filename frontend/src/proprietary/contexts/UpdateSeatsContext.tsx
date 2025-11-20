import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import licenseService, { LicenseInfo } from '@app/services/licenseService';
import UpdateSeatsModal from '@app/components/shared/UpdateSeatsModal';
import { userManagementService } from '@app/services/userManagementService';
import { alert } from '@app/components/toast';
import { useLicense } from '@app/contexts/LicenseContext';
import { resyncExistingLicense } from '@app/utils/licenseCheckoutUtils';

export interface UpdateSeatsOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface UpdateSeatsContextValue {
  openUpdateSeats: (options?: UpdateSeatsOptions) => Promise<void>;
  closeUpdateSeats: () => void;
  isOpen: boolean;
  isLoading: boolean;
}

const UpdateSeatsContext = createContext<UpdateSeatsContextValue | undefined>(undefined);

interface UpdateSeatsProviderProps {
  children: ReactNode;
}

export const UpdateSeatsProvider: React.FC<UpdateSeatsProviderProps> = ({ children }) => {
  const { t } = useTranslation();
  const { refetchLicense } = useLicense();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSeats, setCurrentSeats] = useState<number>(1);
  const [minimumSeats, setMinimumSeats] = useState<number>(1);
  const [currentOptions, setCurrentOptions] = useState<UpdateSeatsOptions>({});

  // Handle return from Stripe billing portal
  useEffect(() => {
    const handleBillingReturn = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const seatsUpdated = urlParams.get('seats_updated');

      if (seatsUpdated === 'true') {
        console.log('Seats updated successfully, syncing license with Keygen');

        // Clear URL parameters
        window.history.replaceState({}, '', window.location.pathname);

        try {
          // Wait a moment for Stripe webhook to process
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Resync license with Keygen (not just local fetch)
          console.log('Seat update detected - resyncing license with Keygen');
          const activation = await resyncExistingLicense();

          if (activation.success) {
            console.log('License synced successfully after seat update');

            // Refresh global license context
            await refetchLicense();

            // Get updated license info for notification
            const updatedLicense = await licenseService.getLicenseInfo();

            alert({
              alertType: 'success',
              title: t('billing.seatsUpdated', 'Seats Updated'),
              message: t(
                'billing.seatsUpdatedMessage',
                'Your enterprise seats have been updated to {{seats}}',
                { seats: updatedLicense.maxUsers }
              ),
            });
          } else {
            throw new Error(activation.error || 'Failed to sync license');
          }
        } catch (error) {
          console.error('Failed to sync license after seat update:', error);
          alert({
            alertType: 'warning',
            title: t('billing.updateProcessing', 'Update Processing'),
            message: t(
              'billing.updateProcessingMessage',
              'Your seat update is being processed. Please refresh in a few moments.'
            ),
          });
        }
      }
    };

    handleBillingReturn();
  }, [t, refetchLicense]);

  const openUpdateSeats = useCallback(async (options: UpdateSeatsOptions = {}) => {
    try {
      setIsLoading(true);

      // Fetch current license info and user count
      const [licenseInfo, userData] = await Promise.all([
        licenseService.getLicenseInfo(),
        userManagementService.getUsers(),
      ]);

      // Validate this is an enterprise license
      if (!licenseInfo || licenseInfo.licenseType !== 'ENTERPRISE') {
        throw new Error(
          t('billing.notEnterprise', 'Seat management is only available for enterprise licenses')
        );
      }

      const currentLicenseSeats = licenseInfo.maxUsers || 1;
      const currentUserCount = userData.totalUsers || 0;

      // Minimum seats must be at least the current number of users
      const calculatedMinSeats = Math.max(currentUserCount, 1);

      console.log(
        `Opening seat update: current seats=${currentLicenseSeats}, current users=${currentUserCount}, minimum=${calculatedMinSeats}`
      );

      setCurrentSeats(currentLicenseSeats);
      setMinimumSeats(calculatedMinSeats);
      setCurrentOptions(options);
      setIsOpen(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to open seat update';
      console.error('Error opening seat update:', errorMessage);
      alert({
        alertType: 'error',
        title: t('common.error', 'Error'),
        message: errorMessage,
      });
      options.onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const closeUpdateSeats = useCallback(() => {
    setIsOpen(false);
    setCurrentOptions({});

    // Refetch license after modal closes to update UI
    refetchLicense();
  }, [refetchLicense]);

  const handleUpdateSeats = useCallback(
    async (newSeatCount: number): Promise<string> => {
      try {
        // Get current license key
        const licenseInfo = await licenseService.getLicenseInfo();
        if (!licenseInfo?.licenseKey) {
          throw new Error('No license key found');
        }

        console.log(`Updating seats from ${currentSeats} to ${newSeatCount}`);

        // Call manage-billing function with new seat count
        const portalUrl = await licenseService.updateEnterpriseSeats(
          newSeatCount,
          licenseInfo.licenseKey
        );

        return portalUrl;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update seats';
        console.error('Error updating seats:', errorMessage);
        currentOptions.onError?.(errorMessage);
        throw err;
      }
    },
    [currentSeats, currentOptions]
  );

  const handleSuccess = useCallback(() => {
    console.log('Seat update initiated successfully');
    currentOptions.onSuccess?.();
  }, [currentOptions]);

  const handleError = useCallback(
    (error: string) => {
      console.error('Seat update error:', error);
      currentOptions.onError?.(error);
    },
    [currentOptions]
  );

  return (
    <UpdateSeatsContext.Provider
      value={{
        openUpdateSeats,
        closeUpdateSeats,
        isOpen,
        isLoading,
      }}
    >
      {children}
      <UpdateSeatsModal
        opened={isOpen}
        onClose={closeUpdateSeats}
        currentSeats={currentSeats}
        minimumSeats={minimumSeats}
        onSuccess={handleSuccess}
        onError={handleError}
        onUpdateSeats={handleUpdateSeats}
      />
    </UpdateSeatsContext.Provider>
  );
};

export const useUpdateSeats = (): UpdateSeatsContextValue => {
  const context = useContext(UpdateSeatsContext);
  if (!context) {
    throw new Error('useUpdateSeats must be used within an UpdateSeatsProvider');
  }
  return context;
};

export default UpdateSeatsContext;
