import type { Metadata } from 'next';
import './globals.css';
import { Inter, Playfair_Display } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-serif', style: ['italic'] });

export const metadata: Metadata = {
  title: 'NetRun - AI Revenue Recovery',
  description: 'AI that stops retrying harder and starts waiting for payday',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`} suppressHydrationWarning>
      <body className="bg-[#F8FAFC] text-[#0F172A] antialiased selection:bg-[#1D4ED8] selection:text-white relative">
        {children}
      </body>
    </html>
  );
}
