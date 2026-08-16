import React from 'react';
import { getUIButtonClasses } from '../utils/uiSystem';
import type { UIButtonVariant } from '../utils/uiSystem';

interface ButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: UIButtonVariant;
  disabled?: boolean;
  className?: string;
  /** Required when the button renders an icon only, so it still has an accessible name. */
  ariaLabel?: string;
  ariaPressed?: boolean;
}

export const Button = ({
  children,
  onClick,
  variant = 'neutral',
  disabled = false,
  className = '',
  ariaLabel,
  ariaPressed
}: ButtonProps) => {
  const ui = getUIButtonClasses({ variant, disabled });

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={`${ui.base} ${ui.variant} ${ui.state} ${className}`}
    >
      <div className="relative z-10 flex items-center justify-center gap-2 drop-shadow-sm">
        {children}
      </div>
    </button>
  );
};
