import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@app/auth/UseSession';
import { useTranslation } from 'react-i18next';
import { useLogoPath } from '@app/hooks/useLogoPath';

export default function LoggedInState() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const logoPath = useLogoPath();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/');
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f3f4f6',
      padding: '16px'
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        padding: '32px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
            <img
              src={logoPath}
              alt="Stirling PDF Logo"
              style={{ width: '64px', height: '64px', objectFit: 'contain' }}
            />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669', marginBottom: '8px' }}>
            {t('login.youAreLoggedIn')}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            {t('login.email')}: {user?.email}
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            Redirecting to home...
          </p>
        </div>
      </div>
    </div>
  );
}
