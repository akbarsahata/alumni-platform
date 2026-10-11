export function schoolNeedFormInput(form: FormData) {
  const expectedVersion = form.get("expectedVersion");
  return {
    category: form.get("category"),
    title: form.get("title"),
    purpose: form.get("purpose"),
    requestedHelp: form.get("requestedHelp"),
    timeCommitment: form.get("timeCommitment"),
    timing: form.get("timing"),
    deadline: form.get("deadline") || null,
    locationMode: form.get("locationMode"),
    locationDetails: form.get("locationDetails"),
    staffContactUserId: form.get("staffContactUserId"),
    participationTerms: form.get("participationTerms"),
    paidDetails: form.get("paidDetails"),
    initiativeLink: form.get("initiativeLink"),
    ...(expectedVersion ? { expectedVersion } : {}),
  };
}
