# File-Based Catalog (FBC)

This directory contains the [file-based catalog](https://olm.operatorframework.io/docs/reference/file-based-catalogs/)
(FBC) for the `console-plugin-operator` package, used to publish the operator to an OLM
catalog (e.g. `redhat-operator-index`) so it can be installed via OperatorHub/Subscriptions.

```
catalogs/
  v4.22/
    Containerfile                                    # builds the FBC image (opm serve /configs)
    catalog/
      console-plugin-operator/
        package.yaml                                 # olm.package: name, icon, defaultChannel
        channel.yaml                                 # olm.channel: entries (versions) per channel
        bundle-v0.1.0.yaml                            # olm.bundle: one file per released bundle version
```

The `.tekton/console-plugin-operator-fbc-4-22-*.yaml` PipelineRuns build and validate
`catalogs/v4.22` on push/PR (triggered when files under `catalogs/v4.22/` change) and publish the
result to `quay.io/redhat-user-workloads/secrets-management-console-tenant/console-plugin-operator-fbc-4-22/...`.

## Adding a new bundle version

1. Build and push the operator bundle image for the release (see
   `operator/Containerfile.ocp-secrets-management-operator-bundle`) and note its pinned
   `@sha256:...` pull spec.
2. Add an entry for the new version to `channel.yaml` (with `replaces` and, typically, a
   `skipRange` pointing at the previous version) — this is *not* done automatically by
   `update-catalog.sh`/`make update-catalog`.
3. Render the bundle into the catalog with `make update-catalog`. `OPERATOR_BUNDLE_IMAGE` is
   **required** — the target fails fast if it is unset. This downloads `opm` locally on demand via
   `make get-opm` (no need to have it on `PATH`):

   ```bash
   make update-catalog \
     OPERATOR_BUNDLE_IMAGE=registry.stage.redhat.io/external-secrets-management/console-plugin-operator-bundle@sha256:<digest> \
     CATALOG_VERSION=v4.22 \
     BUNDLE_FILE_NAME=bundle-vX.Y.Z.yaml \
     REPLICATE_BUNDLE_FILE_IN_CATALOGS=no
   ```

   This runs [`hack/update-catalog.sh`](../hack/update-catalog.sh),
   which: verifies the bundle image is a real bundle (not an index), renders it with
   `opm render --migrate-level=bundle-object-to-csv-metadata` (producing a readable
   `olm.csv.metadata` property instead of opaque base64 `olm.bundle.object` blobs), writes
   `bundle-vX.Y.Z.yaml`, runs `opm validate`, and optionally copies the same bundle file into other
   `catalogs/v*/catalog` directories per `REPLICATE_BUNDLE_FILE_IN_CATALOGS`
   (`no` / `yes` / `4.23,5.0` / `4.22-5.0`).
4. `make catalog` combines `update-catalog` + `catalog-build` into a single command;
   `OPERATOR_BUNDLE_IMAGE` is equally required here.

Other useful targets: `make catalog-validate` (just `opm validate`), `make get-opm` (downloads
`opm` into `bin/tools/opm`, override with `OPM=opm` to use one already on `PATH`).

## Adding a new OCP version directory

Copy `v4.22/` to the new version directory (e.g. `v4.23/`), update the base image tag in its
`Containerfile` (`ose-operator-registry-rhel9:v4.23`), and add matching
`.tekton/console-plugin-operator-fbc-4-23-{push,pull-request}.yaml` PipelineRuns (copy the
existing `v4.22` ones and update the version/paths).
