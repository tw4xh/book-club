"use client";

import type { InputHTMLAttributes } from "react";

type ValidatedInputProps = InputHTMLAttributes<HTMLInputElement> & {
  requiredMessage?: string;
  patternMessage?: string;
  typeMessage?: string;
  tooShortMessage?: string;
};

export function ValidatedInput({
  requiredMessage,
  patternMessage,
  typeMessage,
  tooShortMessage,
  onInvalid,
  onInput,
  ...props
}: ValidatedInputProps) {
  return (
    <input
      {...props}
      onInvalid={(event) => {
        const input = event.currentTarget;
        if (input.validity.valueMissing && requiredMessage) {
          input.setCustomValidity(requiredMessage);
        } else if (input.validity.typeMismatch && typeMessage) {
          input.setCustomValidity(typeMessage);
        } else if (input.validity.patternMismatch && patternMessage) {
          input.setCustomValidity(patternMessage);
        } else if (input.validity.tooShort && tooShortMessage) {
          input.setCustomValidity(tooShortMessage);
        } else {
          input.setCustomValidity("");
        }
        onInvalid?.(event);
      }}
      onInput={(event) => {
        event.currentTarget.setCustomValidity("");
        onInput?.(event);
      }}
    />
  );
}
