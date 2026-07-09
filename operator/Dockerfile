# Build the manager binary
FROM docker.io/library/golang:1.23 AS builder

WORKDIR /workspace

# Copy the Go Modules manifests
COPY go.mod go.mod
COPY go.sum go.sum

# Cache deps before building and copying source so that we don't need to re-download as much
# and so that source changes don't invalidate our downloaded layer
RUN go mod download

# Copy the go source
COPY cmd/ cmd/
COPY pkg/ pkg/

# Build (multi-arch via BuildKit TARGETOS/TARGETARCH)
ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -a -o manager cmd/manager/main.go

# Use UBI minimal as base image for OpenShift compatibility
FROM registry.access.redhat.com/ubi9/ubi-minimal:latest
WORKDIR /
COPY --from=builder /workspace/manager /bin/ocp-secrets-management-operator
USER 65532:65532

ENTRYPOINT ["/bin/ocp-secrets-management-operator"]
