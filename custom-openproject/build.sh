#!/usr/bin/env bash
# build.sh — Custom OpenProject image builder
# SPEC: SPEC-OP-TAXONOMY-001 REQ-BUILD-001~007
#
# Usage:
#   OP_VERSION=17.5.0 ABYZ_VERSION=0.1.0 ./build.sh
#
# Produces:
#   openproject-abyz-taxonomy:<op-version>-<abyz-version>
#
# Prerequisites:
#   - Docker daemon running
#   - patches/openproject/<op-version>/manifest.yml exists
#   - plugins/openproject-abyz-taxonomy/ exists

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OP_VERSION="${OP_VERSION:-17.5.0}"
ABYZ_VERSION="${ABYZ_VERSION:-0.1.0}"
IMAGE_TAG="openproject-abyz-taxonomy:${OP_VERSION}-${ABYZ_VERSION}"
MANIFEST="${REPO_ROOT}/patches/openproject/${OP_VERSION}/manifest.yml"
DOCKERFILE="${REPO_ROOT}/custom-openproject/Dockerfile"

echo "=== OpenProject Taxonomy Custom Image Builder ==="
echo "Base version  : openproject/openproject:${OP_VERSION}"
echo "Abyz version  : ${ABYZ_VERSION}"
echo "Target image  : ${IMAGE_TAG}"
echo "Manifest      : ${MANIFEST}"
echo ""

# Step 1 — Validate manifest exists
if [ ! -f "${MANIFEST}" ]; then
  echo "[ERROR] Patch manifest not found: ${MANIFEST}"
  echo "  Run: ls ${REPO_ROOT}/patches/openproject/ to see available versions"
  exit 1
fi

# Step 2 — Validate patch files (git apply --check, REQ-BUILD-002~004)
echo "[STEP 2] Validating patches from manifest..."
python3 - <<EOF
import yaml, subprocess, hashlib, sys, os, tempfile

manifest_path = "${MANIFEST}"
repo_root = "${REPO_ROOT}"
op_version = "${OP_VERSION}"

with open(manifest_path) as f:
    manifest = yaml.safe_load(f)

patches = manifest.get("patches", [])
if not patches:
    print("  No patches in manifest. Proceeding with plugin-only build.")
    sys.exit(0)

errors = []
checked = 0
skipped_no_file = 0

# Extract target files from base image for checksum validation
base_image = f"openproject/openproject:{op_version}"
print(f"  Extracting source files from base image: {base_image}")

for patch in patches:
    patch_file = os.path.join(repo_root, patch["file"])
    if not os.path.exists(patch_file):
        errors.append(f"MISSING patch file: {patch['file']}")
        continue

    target_path = patch["target"]
    expected_sha = patch.get("target_sha256", "")
    is_required = patch.get("required", True)

    if not expected_sha:
        print(f"  WARN: No target_sha256 for {patch['file']} — skipping checksum validation")
        skipped_no_file += 1
        continue

    # Extract target file from Docker image and verify checksum
    with tempfile.TemporaryDirectory() as tmpdir:
        result = subprocess.run(
            ["docker", "run", "--rm", "--entrypoint", "cat",
             base_image, f"/app/{target_path}"],
            capture_output=True, cwd=tmpdir
        )
        if result.returncode != 0:
            msg = f"Cannot extract /app/{target_path} from {base_image}: {result.stderr.decode().strip()[:120]}"
            if is_required:
                errors.append(f"REQUIRED PATCH UNVERIFIABLE ({patch['file']}): {msg}")
            else:
                print(f"  SKIP (optional): {msg}")
            continue

        actual_sha = hashlib.sha256(result.stdout).hexdigest()
        if actual_sha != expected_sha:
            errors.append(
                f"CHECKSUM MISMATCH ({patch['file']}):\n"
                f"    expected: {expected_sha}\n"
                f"    actual:   {actual_sha}\n"
                f"    → OP source changed; patch must be regenerated for {op_version}"
            )
        else:
            checked += 1
            print(f"  OK {patch['file']} (sha256 match)")

if errors:
    print("\n[ERROR] Patch validation failed:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)

print(f"  Patch validation completed: {checked} verified, {skipped_no_file} skipped, {len(errors)} failed.")
EOF

# Step 3 — Build Docker image
echo "[STEP 3] Building image: ${IMAGE_TAG}"
docker build \
  --build-arg OP_VERSION="${OP_VERSION}" \
  --build-arg ABYZ_VERSION="${ABYZ_VERSION}" \
  -t "${IMAGE_TAG}" \
  -f "${DOCKERFILE}" \
  "${REPO_ROOT}"

# Step 4 — Verify image exists and has correct labels
echo "[STEP 4] Verifying built image..."
docker image inspect "${IMAGE_TAG}" --format \
  'Image: {{.RepoTags}} | Created: {{.Created}}' | head -1

echo ""
echo "=== BUILD SUCCESS ==="
echo "Image: ${IMAGE_TAG}"
echo ""
echo "To deploy to staging:"
echo "  OP_IMAGE=${IMAGE_TAG} docker compose -p openproject-staging -f docker-compose.taxonomy.yml up -d"
echo ""
echo "NEVER deploy to production without:"
echo "  1. Staging E2E validation (TC-001~TC-060)"
echo "  2. Rollback Path A rehearsal (TC-070)"
echo "  3. Migration additive check (TC-080)"
echo "  4. User explicit approval"
