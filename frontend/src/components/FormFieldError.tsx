import type { ReactNode } from "react";

type Props = {
  message?: string | null;
  id?: string;
};

export function FormFieldError({ message, id }: Props) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-red-600" role="alert">
      {message}
    </p>
  );
}

type HintProps = {
  children: ReactNode;
  id?: string;
};

export function FormFieldHint({ children, id }: HintProps) {
  return (
    <p id={id} className="mt-1 text-xs leading-relaxed text-slate-500">
      {children}
    </p>
  );
}

export function invalidFieldClass(hasError: boolean, baseClass: string): string {
  return hasError ? `${baseClass} border-red-400 focus:border-red-500 focus:ring-red-200/70` : baseClass;
}
