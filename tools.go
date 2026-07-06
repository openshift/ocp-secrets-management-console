//go:build tools
// +build tools

// Official workaround to track tool dependencies with go modules:
// https://github.com/golang/go/wiki/Modules#how-can-i-track-tool-dependencies-for-a-module
//
// This lets the bundle build (Containerfile.ocp-secrets-management-operator-bundle)
// `go build` a pinned version of yq instead of downloading a binary at build time.

package tools

import (
	_ "github.com/mikefarah/yq/v4"
)
