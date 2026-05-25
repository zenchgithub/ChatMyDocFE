import { Download, X } from "lucide-react";
import "./style.scss";

interface Props {
  onDismiss: () => void;
}

export default function InstallBanner({ onDismiss }: Props) {
  return (
    <div className="install-banner">
      <div className="install-banner__message">
        <Download size={14} />
        <span>
          Install <strong>ChatMyDocs.ai</strong> as an app for quick access to your document brain
        </span>
      </div>
      <div className="install-banner__actions">
        <button className="install-banner__btn">Install App</button>
        <button className="install-banner__close" onClick={onDismiss} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
