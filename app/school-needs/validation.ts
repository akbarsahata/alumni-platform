import {
  schoolNeedFieldOrder,
  schoolNeedFormSchema,
  type SchoolNeedFieldErrors,
  type SchoolNeedFieldName,
} from "./schema";

export { schoolNeedFieldOrder };
export type { SchoolNeedFieldErrors, SchoolNeedFieldName };

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const fieldNames = new Set<string>(schoolNeedFieldOrder);

export function validateSchoolNeedForm(form: FormData): SchoolNeedFieldErrors {
  const input = Object.fromEntries(schoolNeedFieldOrder.map((name) => [name, text(form, name)]));
  const result = schoolNeedFormSchema.safeParse(input);
  if (result.success) return {};

  const errors: SchoolNeedFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || !fieldNames.has(field)) continue;
    const name = field as SchoolNeedFieldName;
    if (!errors[name]) errors[name] = issue.message;
  }
  return errors;
}
