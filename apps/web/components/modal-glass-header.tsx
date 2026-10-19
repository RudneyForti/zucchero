import { X } from "lucide-react";
import type { ReactNode } from "react";

type ModalGlassHeaderProps = {
  title: ReactNode;
  titleId?: string;
  eyebrow?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  disabled?: boolean;
};

export function ModalGlassHeader({
  title,
  titleId,
  eyebrow,
  closeLabel,
  onClose,
  disabled = false,
}: ModalGlassHeaderProps) {
  return (
    <header className="modal-glass-header">
      <div className="modal-glass-heading">
        {eyebrow ? <span>{eyebrow}</span> : null}
        <strong id={titleId}>{title}</strong>
      </div>
      <button
        className="dialog-close"
        type="button"
        aria-label={closeLabel}
        disabled={disabled}
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </button>
    </header>
  );
}
