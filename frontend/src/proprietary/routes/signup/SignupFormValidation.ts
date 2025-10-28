import { useTranslation } from 'react-i18next';

export interface SignupFieldErrors {
  name?: string
  email?: string
  password?: string
  confirmPassword?: string
}

export interface SignupValidationResult {
  isValid: boolean
  error: string | null
  fieldErrors?: SignupFieldErrors
}

export const useSignupFormValidation = () => {
  const { t } = useTranslation();

  const validateSignupForm = (
    email: string,
    password: string,
    confirmPassword: string,
    name?: string
  ): SignupValidationResult => {
    const fieldErrors: SignupFieldErrors = {};

    // Validate name
    if (name !== undefined && name !== null && !name.trim()) {
      fieldErrors.name = t('signup.nameRequired', 'Name is required');
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      fieldErrors.email = t('signup.emailRequired', 'Email is required');
    } else if (!emailRegex.test(email)) {
      fieldErrors.email = t('signup.invalidEmail');
    }

    // Validate password
    if (!password) {
      fieldErrors.password = t('signup.passwordRequired', 'Password is required');
    } else if (password.length < 6) {
      fieldErrors.password = t('signup.passwordTooShort');
    }

    // Validate confirm password
    if (!confirmPassword) {
      fieldErrors.confirmPassword = t('signup.confirmPasswordRequired', 'Please confirm your password');
    } else if (password !== confirmPassword) {
      fieldErrors.confirmPassword = t('signup.passwordsDoNotMatch');
    }

    const hasErrors = Object.keys(fieldErrors).length > 0;

    return {
      isValid: !hasErrors,
      error: null, // Don't show generic error, field errors are more specific
      fieldErrors: hasErrors ? fieldErrors : undefined
    };
  };

  return {
    validateSignupForm
  };
};