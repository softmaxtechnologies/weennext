import './globals.css';

export const metadata = {
  title: 'Ween - Samriddhi Group',
  description: 'Premium products by Samriddhi Group | Created by Softmax',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}