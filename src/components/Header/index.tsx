import { useState, useRef, useEffect } from "react";
import { Menu, Sun, Moon, Settings, LogOut, ChevronDown } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import LogoMark from "../LogoMark";
import "./style.scss";

interface Props {
  isDark: boolean;
  planningModel: string;
  onThemeToggle: () => void;
  onMenuToggle: () => void;
  onSettingsClick: () => void;
  user: User;
  onSignOut: () => void;
}

export default function Header({
  isDark,
  planningModel,
  onThemeToggle,
  onMenuToggle,
  onSettingsClick,
  user,
  onSignOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = (user.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="header">
      <div className="header__left">
        <button className="header__menu-btn" onClick={onMenuToggle} aria-label="Toggle menu">
          <Menu size={20} />
        </button>
        <div className="header__brand">
          <LogoMark size={28} />
          <span className="header__brand-name">
            ChatMyDocs<span className="header__brand-accent">.ai</span>
          </span>
        </div>
        <div className="header__model-badge">
          <span className="header__model-dot" />
          <span>Model:</span>
          <span className="header__model-name">{planningModel}</span>
        </div>
      </div>

      <div className="header__right">
        <button className="header__icon-btn" onClick={onThemeToggle} aria-label="Toggle theme">
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="header__admin-btn" onClick={onSettingsClick}>
          <Settings size={14} />
          <span>Admin</span>
        </button>

        <div className="header__user" ref={ref}>
          <button
            className="header__avatar-btn"
            onClick={() => setOpen((o) => !o)}
            aria-label="User menu"
            aria-expanded={open}
          >
            <span className="header__avatar">{initials}</span>
            <ChevronDown size={12} className={`header__chevron${open ? " header__chevron--open" : ""}`} />
          </button>

          {open && (
            <div className="header__dropdown">
              <div className="header__dropdown-email">{user.email}</div>
              <hr className="header__dropdown-divider" />
              <button
                className="header__dropdown-item header__dropdown-item--danger"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
              >
                <LogOut size={13} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
