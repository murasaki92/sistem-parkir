import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../lib/password";

test("password hashing is salted and verifiable", () => {
  const first = hashPassword("rahasia123");
  const second = hashPassword("rahasia123");
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
  assert.equal(verifyPassword("rahasia123", first), true);
  assert.equal(verifyPassword("salah", first), false);
  assert.equal(verifyPassword("rahasia123", "bukan-hash"), false);
});
