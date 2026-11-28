const test = require("node:test");
const assert = require("node:assert");
const { dayShift } = require("../routes/newark");
test("cover line rings Joe 7 AM to 5 PM Eastern only", () => {
  const at = (iso) => dayShift(new Date(iso));
  assert.strictEqual(at("2026-12-01T06:59:00-05:00"), false);
  assert.strictEqual(at("2026-12-01T07:00:00-05:00"), true);
  assert.strictEqual(at("2026-12-01T16:59:00-05:00"), true);
  assert.strictEqual(at("2026-12-01T17:00:00-05:00"), false);
  assert.strictEqual(at("2027-06-01T07:00:00-04:00"), true);
});
