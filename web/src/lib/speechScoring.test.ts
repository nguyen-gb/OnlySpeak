import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreSpeechAccuracy } from "./speechScoring";

test("an exact transcript scores 100", () => {
  assert.equal(scoreSpeechAccuracy("I like English", "I like English").score, 100);
});

test("reordered words cannot score 100", () => {
  assert.ok(scoreSpeechAccuracy("I like cats", "cats like I").score < 100);
});

test("one spoken word cannot satisfy duplicate expected words", () => {
  const result = scoreSpeechAccuracy("very very good", "very good");
  assert.ok(result.score < 100);
  assert.equal(result.wordDetails.filter(({ matched }) => matched).length, 2);
});

test("extra words reduce the score", () => {
  const result = scoreSpeechAccuracy("hello there", "hello extra there");
  assert.equal(result.score, 50);
  assert.deepEqual(
    result.wordDetails.filter(({ inserted }) => inserted).map(({ word }) => word),
    ["extra"]
  );
});

test("minor recognition spelling differences receive partial credit", () => {
  const result = scoreSpeechAccuracy("speaking", "speeking");
  assert.ok(result.score > 0 && result.score < 100);
});

test("blank expected text has a deterministic zero score", () => {
  assert.equal(scoreSpeechAccuracy("", "anything").score, 0);
});
