#!/usr/bin/env node

const baseUrl = process.env.OP_BASE_URL || "http://localhost:8087";
const apiToken = process.env.OP_E2E_API_TOKEN;
const projectIdentifier = process.env.OP_VALIDATE_PROJECT_IDENTIFIER || "PROJ6";
const defaultTaxonomyCodes = [
  "ra.common.eudamed_product_registration",
  "ra.misc",
  "ra.overseas_registration_followup",
  "ra.project_certification.retrofit_hnx_r1",
  "ra.regulatory_maintenance",
  "ra.regulatory_response",
];
const taxonomyCodes = (() => {
  if (process.env.OP_VALIDATE_TAXONOMY_CODES) {
    return process.env.OP_VALIDATE_TAXONOMY_CODES.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  if (process.env.OP_VALIDATE_TAXONOMY_CODE) return [process.env.OP_VALIDATE_TAXONOMY_CODE];
  return defaultTaxonomyCodes;
})();
const hostHeader = process.env.OP_HOST_HEADER || "";
const selfTest = process.env.OP_VALIDATE_SELF_TEST === "1";

if (!apiToken && !selfTest) {
  throw new Error("OP_E2E_API_TOKEN is required");
}

function url(relativePath) {
  return new URL(relativePath, baseUrl).toString();
}

function alternateIdentifierCase(value) {
  const text = String(value || "");
  const lower = text.toLowerCase();
  return text === lower ? text.toUpperCase() : lower;
}

async function postValidate(body) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`apikey:${apiToken}`).toString("base64")}`,
  };
  if (hostHeader) headers.Host = hostHeader;

  const response = await fetch(url("/api/v3/abyz_taxonomy/validate"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, body: json };
}

function assert(condition, message, detail) {
  if (!condition) {
    const suffix = detail ? `: ${JSON.stringify(detail)}` : "";
    throw new Error(`${message}${suffix}`);
  }
  console.log(`OK ${message}`);
}

function runSelfTest() {
  assert(defaultTaxonomyCodes.includes("ra.common.eudamed_product_registration"), "default codes include EUDAMED taxonomy");
  assert(defaultTaxonomyCodes.includes("ra.overseas_registration_followup"), "default codes include overseas follow-up taxonomy");
  assert(new Set(defaultTaxonomyCodes).size === defaultTaxonomyCodes.length, "default codes are unique");
  assert(taxonomyCodes.length > 0, "resolved taxonomy code list is not empty");
  assert(alternateIdentifierCase("PROJ6") === "proj6", "alternate projectIdentifier case lowers uppercase identifiers");
  assert(alternateIdentifierCase("proj6") === "PROJ6", "alternate projectIdentifier case uppers lowercase identifiers");
  console.log(`Abyz taxonomy validate contract self-test passed (${taxonomyCodes.join(", ")})`);
}

(async () => {
  if (selfTest) {
    runSelfTest();
    return;
  }

  assert(taxonomyCodes.length > 0, "taxonomy code list is not empty");
  for (const taxonomyCode of taxonomyCodes) {
    const valid = await postValidate({ taxonomyCode, projectIdentifier });
    assert(valid.status === 200, `${taxonomyCode} returns HTTP 200`, valid);
    assert(valid.body.valid === true, `${taxonomyCode} returns valid=true`, valid.body);
    assert(valid.body.nodeKind === "wp_section", `${taxonomyCode} is a wp_section`, valid.body);
    assert(valid.body.defaults?.taxonomyCode === taxonomyCode, `${taxonomyCode} returns matching defaults`, valid.body);
  }

  const alternateProjectIdentifier = alternateIdentifierCase(projectIdentifier);
  if (alternateProjectIdentifier !== projectIdentifier) {
    const validAlternateCase = await postValidate({
      taxonomyCode: taxonomyCodes[0],
      projectIdentifier: alternateProjectIdentifier,
    });
    assert(validAlternateCase.status === 200, "projectIdentifier lookup is case-insensitive", validAlternateCase);
    assert(validAlternateCase.body.valid === true, "case-insensitive projectIdentifier returns valid=true", validAlternateCase.body);
    assert(
      validAlternateCase.body.defaults?.taxonomyCode === taxonomyCodes[0],
      "case-insensitive projectIdentifier returns matching defaults",
      validAlternateCase.body
    );
  }

  const missing = await postValidate({ projectIdentifier });
  assert(missing.status === 422, "missing taxonomyCode returns HTTP 422", missing);
  assert(missing.body.valid === false, "missing taxonomyCode returns valid=false", missing.body);
  assert((missing.body.errors || []).includes("taxonomyCode is required"), "missing taxonomyCode returns required error", missing.body);

  const unknown = await postValidate({ taxonomyCode: "ra.unknown", projectIdentifier });
  assert(unknown.status === 422, "unknown taxonomyCode returns HTTP 422", unknown);
  assert(unknown.body.valid === false, "unknown taxonomyCode returns valid=false", unknown.body);
  assert((unknown.body.errors || []).includes("taxonomyCode is unknown"), "unknown taxonomyCode returns unknown error", unknown.body);

  console.log(`Abyz taxonomy validate contract passed (${taxonomyCodes.join(", ")})`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
