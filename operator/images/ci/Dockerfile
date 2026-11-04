FROM registry.ci.openshift.org/ocp/builder:rhel-9-golang-1.25-openshift-4.21 AS builder
WORKDIR /go/src/github.com/openshift/ocp-secrets-management-console

# Build operator binary
COPY . .
RUN unset GOFLAGS && cd operator && make build

FROM registry.access.redhat.com/ubi9-minimal:latest
COPY --from=builder /go/src/github.com/openshift/ocp-secrets-management-console/operator/bin/manager /bin/ocp-secrets-management-operator

# Run as non-root user
USER 65532:65532

ENTRYPOINT ["/bin/ocp-secrets-management-operator"]
