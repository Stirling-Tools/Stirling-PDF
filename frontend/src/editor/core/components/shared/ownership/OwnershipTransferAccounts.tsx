import { useTranslation } from "react-i18next";
import type { OwnershipTransferFlow } from "@app/components/shared/ownership/useOwnershipTransfer";
import { Combobox } from "@mantine/core";
import { Icon } from "@app/ui/Icon";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

/** Keeps local identity separate from the editable cloud account; focusing only loads candidates. */
export function OwnershipTransferAccounts({
  flow,
}: {
  flow: OwnershipTransferFlow;
}) {
  const { t } = useTranslation();
  const {
    status,
    local,
    ownerAccount,
    linked,
    canSelectCloud,
    partial,
    picker,
    search,
    busy,
    editEmail,
    members,
    cloudEmail,
  } = flow;
  return (
    <>
      {status && (
        <div className="ownership-flow__accounts">
          <div>
            <span>
              {local
                ? t("ownership.serverAccount", "Server account")
                : t("ownership.newOwnerLabel", "New owner")}
            </span>
            <strong title={ownerAccount}>{ownerAccount}</strong>
          </div>
          {local && linked && (
            <div>
              <label
                className="ownership-flow__account-label"
                htmlFor="ownership-cloud-email"
              >
                {t("ownership.cloudAccount", "Stirling account")}
              </label>
              {canSelectCloud && !partial ? (
                <Combobox
                  store={picker}
                  zIndex={Z_INDEX_OVER_CONFIG_MODAL + 2}
                  onOptionSubmit={(value) => flow.selectMember(Number(value))}
                >
                  <div className="ownership-flow__picker">
                    <Combobox.Target withExpandedAttribute>
                      <input
                        id="ownership-cloud-email"
                        role="combobox"
                        className="ownership-flow__search"
                        value={search}
                        readOnly={busy}
                        autoComplete="off"
                        placeholder={t(
                          "ownership.searchEmail",
                          "Search or enter an email",
                        )}
                        onChange={(event) => editEmail(event.target.value)}
                        onFocus={flow.focusAccount}
                        onClick={() => picker.openDropdown()}
                        onBlur={() => picker.closeDropdown()}
                        onKeyDown={(event) => {
                          if (event.key === "Escape" && picker.dropdownOpened)
                            event.stopPropagation();
                        }}
                      />
                    </Combobox.Target>
                    <span className="ownership-flow__chevron">
                      <Icon name="chevron-down" size={16} />
                    </span>
                    <Combobox.Dropdown className="ownership-flow__dropdown">
                      <Combobox.Options className="ownership-flow__options">
                        {members.map((member) => (
                          <Combobox.Option
                            key={member.id}
                            value={String(member.id)}
                            title={member.email}
                            disabled={busy}
                            className="ownership-flow__option"
                          >
                            {member.email}
                          </Combobox.Option>
                        ))}
                        {!members.length && (
                          <Combobox.Empty>
                            {t(
                              "ownership.noEmailMatches",
                              "No matching members. Enter an email to invite.",
                            )}
                          </Combobox.Empty>
                        )}
                      </Combobox.Options>
                    </Combobox.Dropdown>
                  </div>
                </Combobox>
              ) : (
                <strong title={cloudEmail ?? undefined}>{cloudEmail}</strong>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
