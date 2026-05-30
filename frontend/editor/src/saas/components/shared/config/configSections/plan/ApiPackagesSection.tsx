import React from "react";
import { Button, Card, Text, Stack, Flex, Slider } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CreditsPack } from "@app/components/shared/StripeCheckoutSaas";

interface ApiPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  description: string;
}

interface ApiPackagesSectionProps {
  apiPackages: ApiPackage[];
  selectedCredits: number;
  onSelectedCreditsChange: (value: number) => void;
  onCreditPurchaseClick: (creditsPack: CreditsPack) => void;
}

const ApiPackagesSection: React.FC<ApiPackagesSectionProps> = ({
  apiPackages,
  selectedCredits,
  onSelectedCreditsChange,
  onCreditPurchaseClick,
}) => {
  const { t } = useTranslation();

  return (
    <div>
      <h3
        style={{
          margin: 0,
          color: "var(--mantine-color-text)",
          fontSize: "1rem",
        }}
      >
        {t("plan.apiPackages.title", "API Credit Packages")}
      </h3>
      <p
        style={{
          margin: "0.25rem 0 1rem 0",
          color: "var(--mantine-color-dimmed)",
          fontSize: "0.875rem",
        }}
      >
        {t(
          "plan.apiPackages.subtitle",
          "Purchase API credits for your applications",
        )}
      </p>

      <Card padding="xl" radius="md" className="mb-4">
        <Stack gap="xl">
          {/* Credits Selection */}
          <div>
            <Text size="lg" fw={600} mb="md">
              {t("plan.selectCredits", "Select Credit Amount")}
            </Text>

            <div className="px-4">
              <Slider
                value={selectedCredits}
                onChange={onSelectedCreditsChange}
                onChangeEnd={(value) =>
                  onSelectedCreditsChange(Math.round(value))
                }
                min={0}
                max={3}
                step={0.01}
                marks={[
                  { value: 0, label: "100" },
                  { value: 1, label: "500" },
                  { value: 2, label: "1K" },
                  { value: 3, label: "5K" },
                ]}
                size="lg"
                className="mb-6"
                label={null}
              />
            </div>
          </div>

          {/* Selected Package Display */}
          <Flex gap={"xl"} justify="space-between" align="center">
            <div>
              <Text size="xl" fw={700}>
                {apiPackages[
                  Math.round(selectedCredits)
                ].credits.toLocaleString()}{" "}
                Credits
              </Text>
              <Text size="sm" c="dimmed">
                {apiPackages[Math.round(selectedCredits)].description}
              </Text>
            </div>

            <div className="">
              <Text size="xl" fw={700}>
                {apiPackages[Math.round(selectedCredits)].currency}
                {apiPackages[Math.round(selectedCredits)].price}
              </Text>
              <Text size="sm" c="dimmed">
                {t("plan.totalCost", "Total Cost")}
              </Text>
            </div>

            <Button
              size="lg"
              onClick={() =>
                onCreditPurchaseClick(
                  apiPackages[Math.round(selectedCredits)].id as CreditsPack,
                )
              }
            >
              {t("plan.purchase", "Purchase")}
            </Button>
          </Flex>
        </Stack>
      </Card>
    </div>
  );
};

export default ApiPackagesSection;
