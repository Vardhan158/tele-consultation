import test from "node:test";
import assert from "node:assert/strict";
import { appointmentCategory, canJoinAppointment } from "../src/lib/appointmentRules.js";

const now = Date.parse("2026-11-16T04:30:00Z");
const appointment = { status: "confirmed", payment_status: "captured", starts_at: "2026-11-16T10:00:00+05:30", ends_at: "2026-11-16T10:30:00+05:30", join_window_minutes: 15 };
test("confirmed paid appointments move from upcoming to past by scheduled end", () => {
  assert.equal(appointmentCategory(appointment, now), "upcoming");
  assert.equal(appointmentCategory(appointment, now + 31 * 60000), "past");
});
test("status categories preserve completed, cancelled, pending and uppercase appointments", () => {
  for (const [status, category] of [["completed", "past"], ["cancelled", "cancelled"], ["no_show", "past"], ["pending_payment", "upcoming"], ["CONFIRMED", "upcoming"]]) {
    assert.equal(appointmentCategory({ ...appointment, status }, now), category);
  }
});
test("join follows configured window including exact boundaries and timezone offsets", () => {
  for (const [minutes, expected] of [[-16, false], [-15, true], [0, true], [30, true], [31, false]]) {
    assert.equal(canJoinAppointment(appointment, now + minutes * 60000), expected);
  }
});
test("payment alone cannot authorize cancelled, completed or pending appointments", () => {
  for (const status of ["cancelled", "completed", "pending_payment", "requested"]) {
    assert.equal(canJoinAppointment({ ...appointment, status }, now), false);
  }
  for (const payment_status of ["pending", "failed", "refunded"]) {
    assert.equal(canJoinAppointment({ ...appointment, payment_status }, now), false);
  }
});
test("free and paid active appointments can join; missing timing fails closed", () => {
  for (const payment_status of ["captured", "success", "not_required", "no_payment_required", "not_needed"]) {
    assert.equal(canJoinAppointment({ ...appointment, payment_status }, now), true);
  }
  assert.equal(canJoinAppointment({ ...appointment, starts_at: "invalid" }, now), false);
  assert.equal(canJoinAppointment({ ...appointment, join_window_minutes: undefined }, now), false);
});
