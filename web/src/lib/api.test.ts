import assert from "node:assert/strict";
import { test } from "node:test";
import { getErrorMessage } from "./api";

test("FastAPI validation details are flattened into useful field messages", () => {
  const error = {
    isAxiosError: true,
    message: "Request failed with status code 422",
    response: {
      data: {
        detail: [
          { loc: ["body", "title"], msg: "String should have at most 255 characters" },
          { loc: ["body", "lines", 0, "text_en"], msg: "Field required" },
        ],
      },
    },
  };

  assert.equal(
    getErrorMessage(error),
    "title: String should have at most 255 characters; lines.0.text_en: Field required"
  );
});
