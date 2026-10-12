import {
  DAY_PART_HOURS,
  WEEKDAYS,
  type AvailabilitySlot,
  type DayPart,
  type Weekday,
} from "./options";

// Availability is entered in each person's own time zone. To compare two people
// we project every slot onto a shared UTC week made of 30-minute units.
const UNITS_PER_HOUR = 2;
const UNITS_PER_DAY = 24 * UNITS_PER_HOUR;
const UNITS_PER_WEEK = 7 * UNITS_PER_DAY;

/** Minutes the given zone is ahead of UTC at instant `at` (DST-aware). */
export function tzOffsetMinutes(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

export function parseSlot(slot: AvailabilitySlot): { day: Weekday; part: DayPart } {
  const [day, part] = slot.split("-") as [Weekday, DayPart];
  return { day, part };
}

function slotUnits(slot: AvailabilitySlot, offsetMinutes: number): number[] {
  const { day, part } = parseSlot(slot);
  const [start, end] = DAY_PART_HOURS[part];
  const dayIndex = WEEKDAYS.indexOf(day);
  const shift = Math.round(offsetMinutes / (60 / UNITS_PER_HOUR));
  const units: number[] = [];
  for (let u = start * UNITS_PER_HOUR; u < end * UNITS_PER_HOUR; u++) {
    const local = dayIndex * UNITS_PER_DAY + u;
    units.push((((local - shift) % UNITS_PER_WEEK) + UNITS_PER_WEEK) % UNITS_PER_WEEK);
  }
  return units;
}

export function slotsToUtcUnits(
  slots: AvailabilitySlot[],
  timeZone: string,
  at: Date,
): Set<number> {
  const offset = tzOffsetMinutes(timeZone, at);
  return new Set(slots.flatMap((s) => slotUnits(s, offset)));
}

export interface ScheduleOverlap {
  /** Total overlapping hours per week. */
  hours: number;
  /** The first person's slots (in their own time zone) that overlap at all. */
  overlappingSlots: AvailabilitySlot[];
}

export function scheduleOverlap(
  a: { slots: AvailabilitySlot[]; timeZone: string },
  b: { slots: AvailabilitySlot[]; timeZone: string },
  at: Date,
): ScheduleOverlap {
  const bUnits = slotsToUtcUnits(b.slots, b.timeZone, at);
  const aOffset = tzOffsetMinutes(a.timeZone, at);
  let units = 0;
  const overlappingSlots: AvailabilitySlot[] = [];
  for (const slot of a.slots) {
    const shared = slotUnits(slot, aOffset).filter((u) => bUnits.has(u)).length;
    if (shared > 0) overlappingSlots.push(slot);
    units += shared;
  }
  return { hours: units / UNITS_PER_HOUR, overlappingSlots };
}
