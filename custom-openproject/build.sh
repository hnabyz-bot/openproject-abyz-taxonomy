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
import yaml, subprocess, hashlib, sys, os

manifest_path = "${MANIFEST}"
repo_root = "${REPO_ROOT}"

with open(manifest_path) as f:
    manifest = yaml.safe_load(f)

patches = manifest.get("patches", [])
if not patches:
    print("  No patches in manifest. Proceeding with plugin-only build.")
    sys.exit(0)

errors = []
for patch in patches:
    patch_file = os.path.join(repo_root, patch["file"])
    if not os.path.exists(patch_file):
        errors.append(f"MISSING patch file: {patch_file}")
        continue

    result = subprocess.run(
        ["git", "apply", "--check", patch_file],
        capture_output=True, text=True, cwd=repo_root
    )
    if result.returncode != 0:
        errors.append(f"PATCH FAIL ({patch['file']}): {result.stderr.strip()}")

if errors:
    print("[ERROR] Patch validation failed:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)

print(f"  All {len(patches)} patch(es) passed --check validation.")
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
