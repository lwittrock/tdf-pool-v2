import { type ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

function Layout({ children, title, subtitle }: LayoutProps) {
  return (
    <div className="min-h-screen py-4 px-4 sm:px-6 lg:px-32 bg-tdf-bg">
      <header className="mb-6 sm:mb-12 text-center">
        <h1 className="text-2xl sm:text-3xl lg:text-5xl font-bold text-tdf-primary">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm sm:text-base text-tdf-text-secondary mt-2">
            {subtitle}
          </p>
        )}
      </header>
      {children}

      <footer className="mt-12 sm:mt-16 pt-6 border-t border-gray-200 text-center text-xs text-tdf-text-secondary">
        <p>© {new Date().getFullYear()} Lars Wittrock</p>
        <p className="mt-1">Onofficieel poulespel · niet geaffilieerd met A.S.O. of de Tour de France</p>
      </footer>
    </div>
  );
}

export default Layout;