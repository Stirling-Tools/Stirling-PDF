import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import "@app/ui/Dropdown.css";

type Alignment = "start" | "end";

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  /** The portaled menu element, so click-outside can exclude it. */
  menuRef: React.RefObject<HTMLDivElement | null>;
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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // Click-outside + Escape close. The menu is portaled to <body>, so it is not
  // inside containerRef - check it separately or a click on it would close the
  // menu before the item's handler runs.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !(menuRef.current && menuRef.current.contains(target))
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
    () => ({ open, setOpen, triggerRef, menuRef, menuId, align }),
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
  const { open, menuId, align, triggerRef, menuRef } = useDropdownCtx();
  // Fixed position tracked to the trigger. Portaling to <body> keeps the menu
  // out of any `overflow` ancestor (e.g. a table's horizontal scroll area),
  // which would otherwise clip it and add a scrollbar.
  const [pos, setPos] = useState<{
    top: number;
    left?: number;
    right?: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = r.bottom + 4;
      setPos(
        align === "end"
          ? { top, right: window.innerWidth - r.right }
          : { top, left: r.left },
      );
    };
    place();
    // Track the trigger while scrolling/resizing (capture catches inner scrollers).
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, align, triggerRef]);

  if (!open || !pos) return null;
  const style: React.CSSProperties = {
    position: "fixed",
    top: pos.top,
    left: pos.left,
    right: pos.right,
    ...(width !== undefined
      ? { minWidth: typeof width === "number" ? `${width}px` : width }
      : {}),
  };
  return createPortal(
    <div
      id={menuId}
      role="menu"
      ref={menuRef}
      className={["sui-dd__menu", className ?? ""].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </div>,
    document.body,
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
