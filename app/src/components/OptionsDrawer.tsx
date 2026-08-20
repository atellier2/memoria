import { useEffect, type ReactNode } from 'react';

interface OptionsDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  navigation?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
}

export default function OptionsDrawer({
  open,
  onClose,
  title = 'Options',
  navigation,
  filters,
  actions,
}: OptionsDrawerProps) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>{title}</h3>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        {navigation && (
          <div className="drawer-section">
            <div className="drawer-section-label">Navigation</div>
            <div className="drawer-section-content">{navigation}</div>
          </div>
        )}
        {filters && (
          <div className="drawer-section">
            <div className="drawer-section-label">Filtres</div>
            <div className="drawer-section-content">{filters}</div>
          </div>
        )}
        {actions && (
          <div className="drawer-section">
            <div className="drawer-section-label">Actions</div>
            <div className="drawer-section-content">{actions}</div>
          </div>
        )}
      </div>
    </div>
  );
}
