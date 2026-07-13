"use client";

import { useState } from "react";
import type { InputHTMLAttributes, KeyboardEvent } from "react";
import { ValidatedInput } from "@/components/ValidatedInput";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  requiredMessage?: string;
  tooShortMessage?: string;
  showLabel: string;
  hideLabel: string;
  capsLockLabel: string;
};

export function PasswordInput({
  className,
  showLabel,
  hideLabel,
  capsLockLabel,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const updateCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState("CapsLock"));
  };

  return (
    <div className="relative">
      <ValidatedInput
        {...props}
        type={visible ? "text" : "password"}
        className={`${className ?? ""} pr-24`}
        onKeyDown={(event) => {
          updateCapsLock(event);
          props.onKeyDown?.(event);
        }}
        onKeyUp={(event) => {
          updateCapsLock(event);
          props.onKeyUp?.(event);
        }}
        onBlur={(event) => {
          setCapsLock(false);
          props.onBlur?.(event);
        }}
      />
      {capsLock ? (
        <span
          className="absolute right-12 top-1/2 -translate-y-1/2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200"
          title={capsLockLabel}
          aria-label={capsLockLabel}
        >
          ⇪
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-sm text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
      >
        {visible ? "🙈" : "👁"}
      </button>
    </div>
  );
}
