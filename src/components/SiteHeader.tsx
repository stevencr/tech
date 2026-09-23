import { NavLink } from 'react-router-dom';

type SiteHeaderProps = {
  theme: 'dark' | 'light';
  onThemeChange: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
};

export function SiteHeader({
  theme,
  onThemeChange,
  menuOpen,
  onMenuToggle,
}: SiteHeaderProps) {
  return (
    <header className="site-header">
      <button
        className="menu-toggle"
        aria-label={menuOpen ? 'Close article menu' : 'Open article menu'}
        aria-expanded={menuOpen}
        onClick={onMenuToggle}
      >
        <span />
        <span />
        <span />
      </button>

      <NavLink className="brand" to="/">
        <span className="brand__mark">&lt;/&gt;</span>
        <span>
          <span className="brand__name">Tech Notes</span>
          <span className="brand__tagline">by Steven Cranfield</span>
        </span>
      </NavLink>

      <div className="header-actions">
        <button
          className="theme-toggle"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={onThemeChange}
        >
          <span className="theme-toggle__icon">{theme === 'light' ? '☾' : '☀'}</span>
        </button>
        <span className="brand__status">
          <span /> Developer journal
        </span>
      </div>
    </header>
  );
}
