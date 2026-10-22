import { serializeTimeCommitment, serializeTiming } from "./payload";

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function schoolNeedFormInput(form: FormData) {
  const expectedVersion = form.get("expectedVersion");
  return {
    category: form.get("category"),
    title: form.get("title"),
    purpose: form.get("purpose"),
    requestedHelp: form.get("requestedHelp"),
    timeCommitment: serializeTimeCommitment(
      text(form, "timeCommitmentAmount"),
      text(form, "timeCommitmentUnit"),
      text(form, "timeCommitmentFrequency")
    ),
    timing: serializeTiming(text(form, "timingFrom"), text(form, "timingUntil")),
    locationMode: form.get("locationMode"),
    locationDetails: form.get("locationDetails"),
    staffContactUserId: form.get("staffContactUserId"),
    participationTerms: form.get("participationTerms"),
    paidDetails: form.get("paidDetails"),
    initiativeLink: text(form, "initiativeLink"),
    ...(expectedVersion ? { expectedVersion } : {}),
  };
}
