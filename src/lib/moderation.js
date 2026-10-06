export const moderationActionLabels = {
  posting: "posting",
  commenting: "commenting",
  appreciating: "appreciating",
  messaging: "messaging",
  friend_requests: "sending friend requests",
  calls: "placing calls",
};

export function describeModerationRestriction(action, error) {
  const rawMessage = error?.message || "";
  if (!rawMessage) return "This action is not available right now.";

  const lower = rawMessage.toLowerCase();
  if (["banned", "suspended", "restricted"].some((term) => lower.includes(term))) {
    return rawMessage;
  }

  if (lower.includes("row-level security policy")) {
    const label = moderationActionLabels[action] || "this action";
    return `Your account is currently restricted from ${label}.`;
  }

  return rawMessage;
}
