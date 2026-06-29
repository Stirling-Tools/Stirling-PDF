import React from "react";
import { Button, type ButtonProps } from "@shared/components/Button";
import { useTranslation } from "react-i18next";
import { useUpdateSeats } from "@app/contexts/UpdateSeatsContext";

interface UpdateSeatsButtonProps extends Omit<
  ButtonProps,
  "onClick" | "loading" | "onError" | "onSuccess"
> {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const UpdateSeatsButton: React.FC<UpdateSeatsButtonProps> = ({
  onSuccess,
  onError,
  ...buttonProps
}) => {
  const { t } = useTranslation();
  const { openUpdateSeats, isLoading } = useUpdateSeats();

  const handleClick = async () => {
    await openUpdateSeats({
      onSuccess,
      onError,
    });
  };

  return (
    <Button
      variant="secondary"
      onClick={handleClick}
      loading={isLoading}
      {...buttonProps}
    >
      {t("billing.updateSeats", "Update Seats")}
    </Button>
  );
};

export default UpdateSeatsButton;
