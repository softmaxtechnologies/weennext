import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SITE_NAME, SITE_DESCRIPTION, SITE_URL } from '@/lib/utils';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Premium Household Products Online`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'Samruddhi Group of Industries',
    'Ween',
    'Samruddhi Group of Industries Ween',
    'household products online',
    'detergent online India',
    'cleaning products Shajapur',
  ],
  openGraph: {
    title: `${SITE_NAME} | Premium Household Products Online`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [{ url: '/logo.png' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | Premium Household Products Online`,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-[#F0F4F8] dark:bg-slate-950 transition-colors duration-300">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
