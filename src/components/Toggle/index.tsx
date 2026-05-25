import "./style.scss";

interface Props {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export default function Toggle({ on, onChange, label }: Props) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle${on ? " toggle--on" : ""}`}
    >
      <span className="toggle__thumb" />
    </button>
  );
}
