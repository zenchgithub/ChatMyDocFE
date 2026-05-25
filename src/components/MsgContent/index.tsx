import { renderInline } from "../../utils/helpers";
import "./style.scss";

interface Props {
  content: string;
  onCit?: (n: number) => void;
}

export default function MsgContent({ content, onCit }: Props) {
  const lines = content.split("\n");
  return (
    <div className="msg-content">
      {lines.map((line, idx) => {
        if (!line.trim()) return null;
        const isBullet = line.startsWith("- ");
        const text = isBullet ? line.slice(2) : line;
        return (
          <div key={idx} className="msg-content__line">
            {isBullet && <span className="msg-content__bullet-dot">•</span>}
            <p style={{ margin: 0 }}>{renderInline(text, onCit)}</p>
          </div>
        );
      })}
    </div>
  );
}
