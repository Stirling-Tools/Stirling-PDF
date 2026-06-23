import { useTranslation } from "react-i18next";
import { Card, Chip } from "@shared/components";
import type { Role } from "@portal/api/users";
import "@portal/views/Users.css";

interface RolesGridProps {
  roles: Role[];
}

/** Reference catalogue of the org roles and what each one can do. */
export function RolesGrid({ roles }: RolesGridProps) {
  const { t } = useTranslation();
  return (
    <section className="portal-users__roles">
      <header className="portal-users__section-head">
        <h2 className="portal-users__section-title">
          {t("users.roles.title")}
        </h2>
        <p className="portal-users__section-sub">{t("users.roles.subtitle")}</p>
      </header>
      <div className="portal-users__roles-grid">
        {roles.map((role) => (
          <Card key={role.id} padding="default" className="portal-users__role">
            <div className="portal-users__role-head">
              <Chip tone={role.tone} size="sm">
                {role.label}
              </Chip>
            </div>
            <p className="portal-users__role-summary">{role.summary}</p>
            <ul className="portal-users__role-perms">
              {role.permissions.map((perm) => (
                <li key={perm}>{perm}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}
