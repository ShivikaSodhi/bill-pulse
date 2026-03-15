import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bill Pulse',
  description: 'Live polls and Q&A for your events',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
