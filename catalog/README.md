# File-Based Catalog (FBC)

This directory contains the [file-based catalog](https://olm.operatorframework.io/docs/reference/file-based-catalogs/)
(FBC) for the `ocp-secrets-management-operator` package, used to publish the operator to an OLM
catalog (e.g. `redhat-operator-index`) so it can be installed via OperatorHub/Subscriptions.

Layout mirrors [openshift/external-secrets-operator-release](https://github.com/openshift/external-secrets-operator-release/tree/main/catalogs),
one directory per targeted OpenShift Container Platform (OCP) version:

```
catalog/
  v4.22/
    Containerfile                                    # builds the FBC image (opm serve /configs)
    catalog/
      ocp-secrets-management-operator/
        package.yaml                                 # olm.package: name, icon, defaultChannel
        channel.yaml                                 # olm.channel: entries (versions) per channel
        bundle-v0.1.0.yaml                            # olm.bundle: one file per released bundle version
```

The `.tekton/console-plugin-operator-fbc-4-22-*.yaml` PipelineRuns build and validate
`catalog/v4.22` on push/PR (triggered when files under `catalog/v4.22/` change) and publish the
result to `quay.io/redhat-user-workloads/secrets-management-console-tenant/console-plugin-operator-fbc-4-22/...`.

## Adding a new bundle version

1. Build and push the operator bundle image for the release (see
   `operator/Containerfile.ocp-secrets-management-operator-bundle`) and note its pinned
   `@sha256:...` pull spec.
2. Add an entry for the new version to `channel.yaml` (with `replaces` and, typically, a
   `skipRange` pointing at the previous version) — this is *not* done automatically by
   `update-catalog.sh`/`make update-catalog`.
3. Render the bundle into the catalog with `make update-catalog` (this downloads `opm` locally on
   demand via `make get-opm`, no need to have it on `PATH`):

   ```bash
   make update-catalog \
     OPERATOR_BUNDLE_IMAGE=quay.io/<org>/ocp-secrets-management-operator-bundle@sha256:<digest> \
     CATALOG_DIR=catalog/v4.22/catalog \
     BUNDLE_FILE_NAME=bundle-vX.Y.Z.yaml \
     REPLICATE_BUNDLE_FILE_IN_CATALOGS=no
   ```

   This runs [`hack/update-catalog.sh`](../hack/update-catalog.sh) (adapted from
   [external-secrets-operator-release](https://github.com/openshift/external-secrets-operator-release/blob/main/hack/update_catalog.sh)),
   which: verifies the bundle image is a real bundle (not an index), renders it with
   `opm render --migrate-level=bundle-object-to-csv-metadata` (producing a readable
   `olm.csv.metadata` property instead of opaque base64 `olm.bundle.object` blobs), writes
   `bundle-vX.Y.Z.yaml`, runs `opm validate`, and optionally copies the same bundle file into other
   `catalog/v*/catalog` directories per `REPLICATE_BUNDLE_FILE_IN_CATALOGS`
   (`no` / `yes` / `4.23,4.24` / `4.23-4.25`).
4. `make catalog` combines the above with building the catalog image
   (`OPERATOR_BUNDLE_IMAGE=... make catalog`); with `OPERATOR_BUNDLE_IMAGE` unset it just validates
   and builds the existing catalog contents.

Without a pushed bundle image (e.g. local iteration), `make catalog-render-bundle` renders
`operator/bundle` directly for inspection — but the `image:` field must still be replaced with a
real pull spec before committing, so prefer `make update-catalog` for anything that ships.

Other useful targets: `make catalog-validate` (just `opm validate`), `make get-opm` (downloads
`opm` into `bin/tools/opm`, override with `OPM=opm` to use one already on `PATH`).

## Adding a new OCP version directory

Copy `v4.22/` to the new version directory (e.g. `v4.23/`), update the base image tag in its
`Containerfile` (`ose-operator-registry-rhel9:v4.23`), and add matching
`.tekton/console-plugin-operator-fbc-4-23-{push,pull-request}.yaml` PipelineRuns (copy the
existing `v4.22` ones and update the version/paths).
