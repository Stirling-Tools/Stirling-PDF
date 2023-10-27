import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stirlingtools.pdf',
  appName: 'StirlingPDF',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
