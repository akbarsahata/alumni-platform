import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  schoolNeedFieldOrder,
  validateSchoolNeedForm,
  type SchoolNeedFieldErrors,
  type SchoolNeedFieldName,
} from "./validation";

const dependentFields: Partial<Record<SchoolNeedFieldName, SchoolNeedFieldName[]>> = {
  timingFrom: ["timingUntil"],
  locationMode: ["locationDetails"],
  participationTerms: ["paidDetails"],
};

function focusFirstInvalid(form: HTMLFormElement, errors: SchoolNeedFieldErrors) {
  const first = schoolNeedFieldOrder.find((name) => errors[name]);
  if (!first) return;
  const element = form.elements.namedItem(first);
  if (!(element instanceof HTMLElement)) return;
  element.focus();
  element.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function useSchoolNeedFormValidation() {
  const [errors, setErrors] = useState<SchoolNeedFieldErrors>({});

  function handleFieldEvent(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.getAttribute("name")) return;
    const name = target.getAttribute("name") as SchoolNeedFieldName;
    const names = [name, ...(dependentFields[name] ?? [])];
    setErrors((current) => {
      if (!names.some((candidate) => current[candidate])) return current;
      const next = { ...current };
      for (const candidate of names) delete next[candidate];
      return next;
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const next = validateSchoolNeedForm(new FormData(event.currentTarget));
    if (Object.keys(next).length) {
      event.preventDefault();
      setErrors(next);
      focusFirstInvalid(event.currentTarget, next);
      toast.error("Periksa kembali isian yang ditandai.", {
        id: "school-need-feedback",
        toasterId: "school-needs",
      });
      return;
    }
    setErrors({});
  }

  return {
    errors,
    formProps: {
      noValidate: true,
      onSubmit,
      onInput: handleFieldEvent,
      onChange: handleFieldEvent,
    },
  };
}
