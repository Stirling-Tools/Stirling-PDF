import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import "@shared/components/Dropdown.css";

type Alignment = "start" | "end";

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  menuId: string;
  align: Alignment;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdownCtx(): DropdownContextValue {
  const ctx = useContext(DropdownContext);
  if (!ctx)
    throw new Error(
      "Dropdown subcomponents must be used inside <Dropdown.Root>",
    );
  return ctx;
}

export interface DropdownRootProps {
  /** Controlled open state. Omit for uncontrolled. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Alignment of the menu relative to the trigger. */
  align?: Alignment;
  children: ReactNode;
  className?: string;
}

function Root({
  open: openProp,
  defaultOpen,
  onOpenChange,
  align = "end",
  children,
  className,
}: DropdownRootProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolled;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const triggerRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // Click-outside + Escape close.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const value = useMemo<DropdownContextValue>(
    () => ({ open, setOpen, triggerRef, menuId, align }),
    [open, setOpen, menuId, align],
  );

  return (
    <DropdownContext.Provider value={value}>
      <div
        ref={containerRef}
        className={["sui-dd", className ?? ""].filter(Boolean).join(" ")}
      >
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export interface DropdownTriggerProps {
  /** A single button-like element. Receives onClick + aria props. */
  children: ReactElement<{
    onClick?: (e: React.MouseEvent) => void;
    "aria-haspopup"?: string;
    "aria-expanded"?: boolean;
    "aria-controls"?: string;
    ref?: React.Ref<unknown>;
  }>;
}

function Trigger({ children }: DropdownTriggerProps) {
  const { open, setOpen, triggerRef, menuId } = useDropdownCtx();
  if (!isValidElement(children)) {
    throw new Error(
      "Dropdown.Trigger requires exactly one React element child",
    );
  }
  return cloneElement(children, {
    ref: triggerRef as React.Ref<unknown>,
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      setOpen(!open);
    },
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": menuId,
  });
}

export interface DropdownMenuProps {
  children: ReactNode;
  className?: string;
  /** Optional min-width override (px or CSS length). */
  width?: string | number;
}

function Menu({ children, className, width }: DropdownMenuProps) {
  const { open, menuId, align } = useDropdownCtx();
  if (!open) return null;
  const style =
    width !== undefined
      ? { minWidth: typeof width === "number" ? `${width}px` : width }
      : undefined;
  return (
    <div
      id={menuId}
      role="menu"
      className={["sui-dd__menu", `sui-dd__menu--${align}`, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}

export interface DropdownItemProps {
  onSelect?: () => void;
  /** Active visual state (e.g. current value in a switcher). */
  active?: boolean;
  disabled?: boolean;
  /** Optional leading visual. */
  leading?: ReactNode;
  /** Optional trailing visual (kbd hint, badge, etc). */
  trailing?: ReactNode;
  children?: ReactNode;
  className?: string;
}

function Item({
  onSelect,
  active,
  disabled,
  leading,
  trailing,
  children,
  className,
}: DropdownItemProps) {
  const { setOpen } = useDropdownCtx();
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-current={active ? "true" : undefined}
      className={[
        "sui-dd__item",
        active ? "is-active" : "",
        disabled ? "is-disabled" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        setOpen(false);
      }}
    >
      {leading && <span className="sui-dd__item-leading">{leading}</span>}
      <span className="sui-dd__item-label">{children}</span>
      {trailing && <span className="sui-dd__item-trailing">{trailing}</span>}
    </button>
  );
}

function Divider() {
  return <div className="sui-dd__divider" role="separator" aria-hidden />;
}

export const Dropdown = {
  Root,
  Trigger,
  Menu,
  Item,
  Divider,
};
