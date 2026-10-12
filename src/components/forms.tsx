"use client";

import { startTransition, useActionState, useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { idle, type ActionState } from "@/lib/action-state";
import { DAY_PARTS, WEEKDAYS, type AvailabilitySlot } from "@/lib/domain/options";
import { getMessages } from "@/lib/i18n";

const m = getMessages();

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Wraps useActionState and submits without React's automatic form reset, so
 * users keep what they typed when validation fails.
 */
export function useActionForm(action: Action) {
  const [state, formAction, pending] = useActionState(action, idle);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  };
  return { state, formAction, pending, onSubmit };
}

export function FormMessage({ state }: { state: ActionState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") ref.current?.focus();
  }, [state]);
  if (state.status === "idle" || !state.message) return null;
  const ok = state.status === "success";
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={ok ? "status" : "alert"}
      className={`rounded-xl border px-4 py-3 text-sm ${
        ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"
      }`}
    >
      {state.message}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel = m.common.saving,
  className = "btn-primary",
  name,
  value,
  pending: pendingProp,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending} name={name} value={value}>
      {pending && (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" />
        </svg>
      )}
      {pending ? pendingLabel : children}
    </button>
  );
}

function ErrorText({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-red-700">
      {errors.join(" ")}
    </p>
  );
}

function Hint({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1 text-sm text-muted">
      {children}
    </p>
  );
}

interface FieldProps {
  name: string;
  label: string;
  hint?: ReactNode;
  errors?: string[];
  required?: boolean;
}

function LabelText({ label, required }: { label: string; required?: boolean }) {
  return (
    <>
      {label}
      {!required && <span className="ml-1 font-normal text-muted">({m.common.optional})</span>}
    </>
  );
}

export function TextField({
  name,
  label,
  hint,
  errors,
  required,
  ...rest
}: FieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, errors?.length && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        <LabelText label={label} required={required} />
      </label>
      <Hint id={`${id}-hint`}>{hint}</Hint>
      <input
        id={id}
        name={name}
        required={required}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy}
        className="input mt-1.5"
        {...rest}
      />
      <ErrorText id={`${id}-err`} errors={errors} />
    </div>
  );
}

export function TextArea({
  name,
  label,
  hint,
  errors,
  required,
  ...rest
}: FieldProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, errors?.length && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        <LabelText label={label} required={required} />
      </label>
      <Hint id={`${id}-hint`}>{hint}</Hint>
      <textarea
        id={id}
        name={name}
        required={required}
        rows={4}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy}
        className="input mt-1.5"
        {...rest}
      />
      <ErrorText id={`${id}-err`} errors={errors} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  hint,
  errors,
  required,
  options,
  defaultValue,
  placeholder = "Select…",
}: FieldProps & { options: { value: string; label: string }[]; defaultValue?: string; placeholder?: string }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, errors?.length && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        <LabelText label={label} required={required} />
      </label>
      <Hint id={`${id}-hint`}>{hint}</Hint>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy}
        className="input mt-1.5"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ErrorText id={`${id}-err`} errors={errors} />
    </div>
  );
}

export function CheckboxGroup({
  name,
  label,
  hint,
  errors,
  required,
  options,
  defaultValue = [],
  columns = 2,
}: FieldProps & { options: { value: string; label: string }[]; defaultValue?: readonly string[]; columns?: 1 | 2 | 3 }) {
  const id = useId();
  const cols = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" }[columns];
  return (
    <fieldset aria-describedby={[hint && `${id}-hint`, errors?.length && `${id}-err`].filter(Boolean).join(" ") || undefined}>
      <legend className="text-sm font-semibold text-ink">
        <LabelText label={label} required={required} />
      </legend>
      <Hint id={`${id}-hint`}>{hint}</Hint>
      <div className={`mt-2 grid gap-2 ${cols}`}>
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-white px-3 py-2 text-sm hover:border-brand-200 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={defaultValue.includes(o.value)}
              className="size-4 accent-brand-700"
            />
            {o.label}
          </label>
        ))}
      </div>
      <ErrorText id={`${id}-err`} errors={errors} />
    </fieldset>
  );
}

export function RadioGroup({
  name,
  label,
  hint,
  errors,
  options,
  defaultValue,
}: FieldProps & { options: { value: string; label: string; description?: string }[]; defaultValue?: string }) {
  const id = useId();
  return (
    <fieldset aria-describedby={[hint && `${id}-hint`, errors?.length && `${id}-err`].filter(Boolean).join(" ") || undefined}>
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <Hint id={`${id}-hint`}>{hint}</Hint>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer gap-2.5 rounded-lg border border-line bg-white px-3 py-2.5 text-sm hover:border-brand-200 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
          >
            <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} required className="mt-1 size-4 accent-brand-700" />
            <span>
              <span className="font-semibold">{o.label}</span>
              {o.description && <span className="block text-muted">{o.description}</span>}
            </span>
          </label>
        ))}
      </div>
      <ErrorText id={`${id}-err`} errors={errors} />
    </fieldset>
  );
}

export function Toggle({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: ReactNode; defaultChecked?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-white p-3">
      <input id={id} type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-4 accent-brand-700" aria-describedby={hint ? `${id}-hint` : undefined} />
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        <Hint id={`${id}-hint`}>{hint}</Hint>
      </div>
    </div>
  );
}

const DAY_NAMES: Record<(typeof WEEKDAYS)[number], string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export function AvailabilityGrid({
  name = "availability",
  defaultValue = [],
  errors,
}: {
  name?: string;
  defaultValue?: readonly AvailabilitySlot[];
  errors?: string[];
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={`${id}-hint${errors?.length ? ` ${id}-err` : ""}`}>
      <legend className="text-sm font-semibold text-ink">Usual weekly availability</legend>
      <Hint id={`${id}-hint`}>In your own time zone. We convert time zones when comparing schedules.</Hint>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[22rem] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <td />
              {DAY_PARTS.map((p) => (
                <th key={p} scope="col" className="px-1 pb-1 text-left font-medium text-muted">
                  {m.dayParts[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((d) => (
              <tr key={d}>
                <th scope="row" className="pr-2 text-left font-medium">
                  <abbr title={DAY_NAMES[d]} className="no-underline">
                    {m.weekdays[d]}
                  </abbr>
                </th>
                {DAY_PARTS.map((p) => {
                  const slot = `${d}-${p}` as AvailabilitySlot;
                  return (
                    <td key={p}>
                      <label className="flex h-10 cursor-pointer items-center justify-center rounded-lg border border-line bg-white hover:border-brand-200 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-600 has-[:checked]:text-white has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-500">
                        <input type="checkbox" name={name} value={slot} defaultChecked={defaultValue.includes(slot)} className="peer sr-only" />
                        <span className="sr-only">
                          {DAY_NAMES[d]} {m.dayPartsShort[p]}
                        </span>
                        <span aria-hidden="true" className="text-xs opacity-0 peer-checked:opacity-100">
                          ✓
                        </span>
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrorText id={`${id}-err`} errors={errors} />
    </fieldset>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2 className="font-serif text-xl font-semibold text-brand-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

export const opts = <K extends string>(keys: readonly K[], labels: Record<K, string>) =>
  keys.map((k) => ({ value: k, label: labels[k] }));
