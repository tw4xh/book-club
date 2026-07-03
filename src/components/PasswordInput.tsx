"use client";

import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { ValidatedInput } from "@/components/ValidatedInput";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  requiredMessage?: string;
  tooShortMessage?: string;
  showLabel: string;
  hideLabel: string;
};

export function PasswordInput({
  className,
  showLabel,
  hideLabel,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <ValidatedInput
        {...props}
        type={visible ? "text" : "password"}
        className={`${className ?? ""} pr-12`}
      />
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
