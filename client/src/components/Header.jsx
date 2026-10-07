import { Moon, Download, Trash2 } from "lucide-react";

export default function Header({ dark, onToggleTheme, onExport, onClear }) {
  return (
    <header>
      <div className="logo">
        <img src="https://cdn-icons-png.flaticon.com/512/4712/4712035.png" alt="AI Assistant" />
        <div>
          <h2>AI Assistant</h2>
          <span className="status">🟢 Online</span>
        </div>
      </div>
      <div className="actions">
        <button
          id="toggle-theme"
          type="button"
          aria-label="Toggle dark mode"
          aria-pressed={dark}
          title="Toggle theme"
          onClick={onToggleTheme}
        >
          <Moon aria-hidden="true" />
        </button>
        <button type="button" aria-label="Export chat as a text file" title="Export" onClick={onExport}>
          <Download aria-hidden="true" />
        </button>
        <button type="button" aria-label="Clear chat" title="Clear" onClick={onClear}>
          <Trash2 aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
