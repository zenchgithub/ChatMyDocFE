import { MessageSquare } from "lucide-react";
import "./style.scss";

interface Props {
  size?: number;
  variant?: "default" | "lg";
}

export default function LogoMark({ size = 28, variant = "default" }: Props) {
  const radius = variant === "lg" ? size * 0.25 : size * 0.222;
  return (
    <div
      className={`logo-mark${variant === "lg" ? " logo-mark--lg" : ""}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <MessageSquare
        style={{ width: size * 0.5, height: size * 0.5 }}
        className="text-white"
        strokeWidth={2}
      />
    </div>
  );
}
