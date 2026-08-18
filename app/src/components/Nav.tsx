import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function initialsFromEmail(email: string) {
  return email.slice(0, 2).toUpperCase();
}

export default function Nav() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <nav className="nav">
      <Link to="/" className="brand">
        Memoria
      </Link>
      <div className="nav-actions">
        {user ? (
          <>
            <Link to="/cards/new">Nouvelle carte</Link>
            <div className="user-menu" ref={menuRef}>
              <button
                type="button"
                className="user-menu-trigger"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="user-avatar" aria-hidden="true">
                  {initialsFromEmail(user.email ?? '?')}
                </span>
              </button>
              {menuOpen && (
                <div className="user-menu-panel" role="menu">
                  <div className="user-menu-email">{user.email}</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="user-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                  >
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <Link to="/login">Se connecter</Link>
        )}
      </div>
    </nav>
  );
}
