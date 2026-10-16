// patch-bundle-csv restores spec.customresourcedefinitions and spec.install.spec
// in the bundle CSV from the base CSV, since operator-sdk generate bundle
// overwrites them. Also injects plugin image references for OLM.
// Run from operator directory.
package main

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

func main() {
	bundlePath := "bundle/manifests/ocp-secrets-management-operator.clusterserviceversion.yaml"
	basePath := "config/manifests/bases/ocp-secrets-management-operator.clusterserviceversion.yaml"

	// Get plugin image from environment or use default
	pluginImage := os.Getenv("PLUGIN_IMG")
	if pluginImage == "" {
		pluginImage = "openshift.io/ocp-secrets-management:v0.1.0"
	}

	bundleBuf, err := os.ReadFile(bundlePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read bundle CSV: %v\n", err)
		os.Exit(1)
	}
	baseBuf, err := os.ReadFile(basePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read base CSV: %v\n", err)
		os.Exit(1)
	}

	var bundle, base map[string]interface{}
	if err := yaml.Unmarshal(bundleBuf, &bundle); err != nil {
		fmt.Fprintf(os.Stderr, "parse bundle CSV: %v\n", err)
		os.Exit(1)
	}
	if err := yaml.Unmarshal(baseBuf, &base); err != nil {
		fmt.Fprintf(os.Stderr, "parse base CSV: %v\n", err)
		os.Exit(1)
	}

	specB, ok := bundle["spec"].(map[string]interface{})
	if !ok {
		fmt.Fprintf(os.Stderr, "bundle CSV: missing or invalid spec\n")
		os.Exit(1)
	}
	specBase, ok := base["spec"].(map[string]interface{})
	if !ok {
		fmt.Fprintf(os.Stderr, "base CSV: missing or invalid spec\n")
		os.Exit(1)
	}

	// Restore customresourcedefinitions and install.spec from base
	if crd, ok := specBase["customresourcedefinitions"]; ok {
		specB["customresourcedefinitions"] = crd
	}
	install, ok := specBase["install"].(map[string]interface{})
	if ok {
		if installSpec, ok := install["spec"]; ok {
			if specB["install"] == nil {
				specB["install"] = make(map[string]interface{})
			}
			specB["install"].(map[string]interface{})["spec"] = installSpec
		}
	}

	// Inject plugin image reference into operator deployment env vars
	if err := injectPluginImageEnv(specB, pluginImage); err != nil {
		fmt.Fprintf(os.Stderr, "inject plugin image env: %v\n", err)
		os.Exit(1)
	}

	// Add plugin image to relatedImages for air-gapped/mirroring support
	injectRelatedImages(specB, pluginImage)

	out, err := yaml.Marshal(bundle)
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal bundle CSV: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(bundlePath, out, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "write bundle CSV: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("✅ Bundle CSV patched successfully\n")
	fmt.Printf("   Plugin image: %s\n", pluginImage)
}

// injectPluginImageEnv adds RELATED_IMAGE_PLUGIN environment variable to the operator deployment
func injectPluginImageEnv(spec map[string]interface{}, pluginImage string) error {
	install, ok := spec["install"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("spec.install not found or invalid")
	}

	installSpec, ok := install["spec"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("spec.install.spec not found or invalid")
	}

	deployments, ok := installSpec["deployments"].([]interface{})
	if !ok || len(deployments) == 0 {
		return fmt.Errorf("spec.install.spec.deployments not found or empty")
	}

	// Get the first (operator) deployment
	deployment, ok := deployments[0].(map[string]interface{})
	if !ok {
		return fmt.Errorf("deployment is not a map")
	}

	deploymentSpec, ok := deployment["spec"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("deployment.spec not found")
	}

	template, ok := deploymentSpec["template"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("deployment.spec.template not found")
	}

	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("deployment.spec.template.spec not found")
	}

	containers, ok := podSpec["containers"].([]interface{})
	if !ok || len(containers) == 0 {
		return fmt.Errorf("containers not found or empty")
	}

	// Get the manager container
	container, ok := containers[0].(map[string]interface{})
	if !ok {
		return fmt.Errorf("container is not a map")
	}

	// Get or create env array
	env, ok := container["env"].([]interface{})
	if !ok {
		env = []interface{}{}
	}

	// Check if RELATED_IMAGE_PLUGIN already exists
	foundPlugin := false
	for _, e := range env {
		envVar, ok := e.(map[string]interface{})
		if !ok {
			continue
		}
		if name, ok := envVar["name"].(string); ok && name == "RELATED_IMAGE_PLUGIN" {
			// Update existing value
			envVar["value"] = pluginImage
			foundPlugin = true
			break
		}
	}

	// Add if not found
	if !foundPlugin {
		env = append(env, map[string]interface{}{
			"name":  "RELATED_IMAGE_PLUGIN",
			"value": pluginImage,
		})
	}

	container["env"] = env
	return nil
}

// injectRelatedImages adds the plugin image to spec.relatedImages for OLM mirroring
func injectRelatedImages(spec map[string]interface{}, pluginImage string) {
	relatedImages, ok := spec["relatedImages"].([]interface{})
	if !ok {
		relatedImages = []interface{}{}
	}

	// Check if plugin image already exists
	foundPlugin := false
	for _, img := range relatedImages {
		imgMap, ok := img.(map[string]interface{})
		if !ok {
			continue
		}
		if name, ok := imgMap["name"].(string); ok && name == "ocp-secrets-management-plugin" {
			// Update existing value
			imgMap["image"] = pluginImage
			foundPlugin = true
			break
		}
	}

	// Add if not found
	if !foundPlugin {
		relatedImages = append(relatedImages, map[string]interface{}{
			"name":  "ocp-secrets-management-plugin",
			"image": pluginImage,
		})
	}

	spec["relatedImages"] = relatedImages
}
