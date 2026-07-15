import { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import Poule from './pages/Poule';
import Etappes from './pages/Etappes';
import Rennerpunten from './pages/Rennerpunten';
import Ploegen from './pages/Ploegen';
import Spelregels from './pages/Spelregels';
import EtappeBeheer from './pages/EtappeBeheer';

// Navigation items (public site only — beheer is bereikbaar via /admin,
// achter login; bewust niet in de publieke navigatie)
const navItems = [
  { path: '/poule', label: 'Poule' },
  { path: '/etappes', label: 'Etappes' },
  { path: '/rennerpunten', label: 'Rennerpunten' },
  { path: '/ploegen', label: 'Ploegen' },
  { path: '/spelregels', label: 'Spelregels' },
];

// Animated hamburger icon
const AnimatedMenuIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <div className="flex flex-col justify-center items-center w-6 h-5 gap-1">
    <span className={`block w-full h-0.5 bg-white transition-all duration-300 ${isOpen ? 'rotate-45 translate-y-[0.4rem]' : ''}`} />
    <span className={`block w-full h-0.5 bg-white transition-all duration-300 ${isOpen ? 'opacity-0' : ''}`} />
    <span className={`block w-full h-0.5 bg-white transition-all duration-300 ${isOpen ? '-rotate-45 -translate-y-[0.4rem]' : ''}`} />
  </div>
);

// Navigation component
function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { pathname } = useLocation();

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);

  const linkClass = (path: string) => {
    const isActive = pathname === path || (path === '/poule' && pathname === '/');
    if (mobileMenuOpen) {
      return `block py-3 px-4 rounded transition-colors ${
        isActive ? 'text-tdf-accent font-semibold bg-gray-700/50' : 'text-white hover:bg-gray-700/30'
      }`;
    }
    return `transition duration-300 ${
      isActive ? 'text-tdf-accent font-semibold' : 'text-white hover:text-tdf-accent'
    }`;
  };

  return (
    <nav className="bg-gray-800 p-4 shadow-md">
      <div className="max-w-7xl mx-auto">
        {/* Mobile Header */}
        <div className="flex justify-between items-center lg:hidden">
          <span className="text-white font-bold text-lg">TdF Poule</span>
          <button
            onClick={toggleMobileMenu}
            className="text-white p-2 hover:bg-gray-700 rounded"
            aria-label="Toggle menu"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <AnimatedMenuIcon isOpen={mobileMenuOpen} />
          </button>
        </div>

        {/* Desktop Links */}
        <ul className="hidden lg:flex justify-center space-x-12">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link to={item.path} className={linkClass(item.path)}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <ul className="lg:hidden mt-4 space-y-1 pt-4 border-t border-gray-700">
            {navItems.map((item) => (
              <li key={item.path}>
                <Link to={item.path} onClick={() => setMobileMenuOpen(false)} className={linkClass(item.path)}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}

// App component
function App() {
  return (
    <BrowserRouter>
      <Navigation />
      <main className="max-w-7xl mx-auto">
        <Routes>
          <Route path="/" element={<Poule />} />
          <Route path="/poule" element={<Poule />} />
          <Route path="/etappes" element={<Etappes />} />
          <Route path="/rennerpunten" element={<Rennerpunten />} />
          <Route path="/ploegen" element={<Ploegen />} />
          <Route path="/spelregels" element={<Spelregels />} />
          <Route path="/admin" element={<EtappeBeheer />} />
          <Route path="/EtappeBeheer" element={<EtappeBeheer />} />

          {/* Redirect the previous PascalCase routes to the new lowercase ones. */}
          <Route path="/Klassement" element={<Navigate to="/poule" replace />} />
          <Route path="/Etappes" element={<Navigate to="/etappes" replace />} />
          <Route path="/RennerPunten" element={<Navigate to="/rennerpunten" replace />} />
          <Route path="/TeamSelectie" element={<Navigate to="/ploegen" replace />} />
          <Route path="/OverDezePoule" element={<Navigate to="/spelregels" replace />} />

          {/* Unknown paths (incl. lowercase typos) fall back to the home page. */}
          <Route path="*" element={<Navigate to="/poule" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;