export function profileIsCurrent(confirmedAt: string | null, now = Date.now()) {
  if (!confirmedAt) return false;
  const anniversary = new Date(confirmedAt);
  const month = anniversary.getUTCMonth();
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  if (anniversary.getUTCMonth() !== month) anniversary.setUTCDate(0);
  return now < anniversary.getTime();
}

export function profileEligibilityReason(input: {
  membershipStatus: string;
  participation: boolean;
  availability: string | null;
  confirmedAt: string | null;
  introduction: string;
  expertiseTags: readonly string[];
  helpTypes: readonly string[];
  deletionRequestedAt?: string | null;
}) {
  if (input.membershipStatus !== "approved") return "membership";
  if (input.deletionRequestedAt) return "deletion";
  if (!input.participation) return "participation";
  if (input.availability === "unavailable") return "unavailable";
  if (!profileIsCurrent(input.confirmedAt)) return "stale";
  if (
    !input.introduction.trim() ||
    !["available", "limited"].includes(input.availability ?? "") ||
    !input.expertiseTags.length ||
    !input.helpTypes.length
  )
    return "incomplete";
  return null;
}
