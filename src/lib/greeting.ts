/**
 * The mentor home greeting. First name only, because the full name is already
 * in the menu drawer and the header chip.
 */
export function greetingFor(fullName: string, now: Date = new Date()): string {
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = fullName.trim().split(/\s+/)[0] || fullName;
  return `Good ${timeOfDay}, ${firstName}`;
}
