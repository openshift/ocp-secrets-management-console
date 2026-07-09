// Package v1alpha1 contains API Schema definitions for the secrets-management v1alpha1 API group
// +kubebuilder:object:generate=true
// +groupName=secrets-management.openshift.io
package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// FeatureConfig defines settings for a specific UI feature
type FeatureConfig struct {
	// Enabled is the master switch for this feature
	// +kubebuilder:default=true
	Enabled bool `json:"enabled,omitempty"`

	// CheckRBAC determines if the UI should check user RBAC via SelfSubjectAccessReview
	// +kubebuilder:default=true
	CheckRBAC bool `json:"checkRBAC,omitempty"`
}

// FeaturesConfig defines all UI feature toggles
type FeaturesConfig struct {
	// Delete operation settings
	Delete FeatureConfig `json:"delete,omitempty"`

	// Create operation settings (future feature)
	Create FeatureConfig `json:"create,omitempty"`

	// Edit operation settings (future feature)
	Edit FeatureConfig `json:"edit,omitempty"`
}

// RBACConfig defines RBAC settings managed by the operator
type RBACConfig struct {
	// CreateDefaultRoles determines if the operator should create default ClusterRoles
	// +kubebuilder:default=true
	CreateDefaultRoles bool `json:"createDefaultRoles,omitempty"`

	// RolePrefix is the prefix for generated RBAC resource names
	// +kubebuilder:default="secrets-management"
	RolePrefix string `json:"rolePrefix,omitempty"`
}

// ResourceRequirements defines CPU and memory requirements
type ResourceRequirements struct {
	// CPU resource requirement
	CPU string `json:"cpu,omitempty"`

	// Memory resource requirement
	Memory string `json:"memory,omitempty"`
}

// ResourceConfig defines resource requests and limits
type ResourceConfig struct {
	// Requests defines the minimum resources required
	Requests ResourceRequirements `json:"requests,omitempty"`

	// Limits defines the maximum resources allowed
	Limits ResourceRequirements `json:"limits,omitempty"`
}

// PluginConfig defines the console plugin deployment settings
type PluginConfig struct {
	// Image is the container image for the console plugin
	Image string `json:"image,omitempty"`

	// ImagePullPolicy defines when to pull the image
	// +kubebuilder:validation:Enum=Always;IfNotPresent;Never
	// +kubebuilder:default="IfNotPresent"
	ImagePullPolicy string `json:"imagePullPolicy,omitempty"`

	// Replicas is the number of plugin deployment replicas
	// +kubebuilder:default=1
	// +kubebuilder:validation:Minimum=1
	Replicas int32 `json:"replicas,omitempty"`

	// Resources defines the resource requirements for the plugin container
	Resources ResourceConfig `json:"resources,omitempty"`
}

// OperatorConfig defines settings for a specific operator
type OperatorConfig struct {
	// Enabled determines if this operator's resources should be shown in the UI
	// +kubebuilder:default=true
	Enabled bool `json:"enabled,omitempty"`
}

// OperatorsConfig defines per-operator settings
type OperatorsConfig struct {
	// CertManager settings for cert-manager operator
	CertManager OperatorConfig `json:"certManager,omitempty"`

	// ExternalSecrets settings for External Secrets Operator
	ExternalSecrets OperatorConfig `json:"externalSecrets,omitempty"`

	// SecretsStoreCSI settings for Secrets Store CSI Driver
	SecretsStoreCSI OperatorConfig `json:"secretsStoreCSI,omitempty"`
}

// SecretsManagementConfigSpec defines the desired state of SecretsManagementConfig
type SecretsManagementConfigSpec struct {
	// Features defines UI feature toggles
	Features FeaturesConfig `json:"features,omitempty"`

	// RBAC defines RBAC resources managed by the operator
	RBAC RBACConfig `json:"rbac,omitempty"`

	// Plugin defines the console plugin deployment settings
	Plugin PluginConfig `json:"plugin,omitempty"`

	// Operators defines per-operator configuration
	Operators OperatorsConfig `json:"operators,omitempty"`
}

// ClusterRoleStatus represents a ClusterRole created by the operator
type ClusterRoleStatus struct {
	// Name of the ClusterRole
	Name string `json:"name,omitempty"`

	// Operations this role grants (e.g., "view", "delete", "admin")
	Operations []string `json:"operations,omitempty"`

	// Created is the timestamp when the role was created
	Created metav1.Time `json:"created,omitempty"`
}

// RBACStatus represents the status of RBAC resources
type RBACStatus struct {
	// ClusterRoles created by the operator
	ClusterRoles []ClusterRoleStatus `json:"clusterRoles,omitempty"`
}

// PluginStatus represents the status of the console plugin deployment
type PluginStatus struct {
	// DeploymentName is the name of the plugin Deployment
	DeploymentName string `json:"deploymentName,omitempty"`

	// ServiceName is the name of the plugin Service
	ServiceName string `json:"serviceName,omitempty"`

	// ConsolePluginName is the name of the ConsolePlugin CR
	ConsolePluginName string `json:"consolePluginName,omitempty"`

	// AvailableReplicas is the number of available replicas
	AvailableReplicas int32 `json:"availableReplicas,omitempty"`

	// Ready indicates whether the plugin is ready
	Ready bool `json:"ready,omitempty"`
}

// DetectedOperator represents the detection status of an operator
type DetectedOperator struct {
	// Installed indicates whether the operator's CRDs are installed
	Installed bool `json:"installed,omitempty"`

	// Version is the detected operator version
	Version string `json:"version,omitempty"`
}

// DetectedOperatorsStatus represents the status of detected operators
type DetectedOperatorsStatus struct {
	// CertManager detection status
	CertManager DetectedOperator `json:"certManager,omitempty"`

	// ExternalSecrets detection status
	ExternalSecrets DetectedOperator `json:"externalSecrets,omitempty"`

	// SecretsStoreCSI detection status
	SecretsStoreCSI DetectedOperator `json:"secretsStoreCSI,omitempty"`
}

// ConfigPhase represents the phase of the SecretsManagementConfig
// +kubebuilder:validation:Enum=Pending;Deploying;Ready;Degraded;Error
type ConfigPhase string

const (
	// PhasePending indicates the config is pending processing
	PhasePending ConfigPhase = "Pending"

	// PhaseDeploying indicates resources are being deployed
	PhaseDeploying ConfigPhase = "Deploying"

	// PhaseReady indicates everything is ready
	PhaseReady ConfigPhase = "Ready"

	// PhaseDegraded indicates some components are not fully functional
	PhaseDegraded ConfigPhase = "Degraded"

	// PhaseError indicates an error occurred
	PhaseError ConfigPhase = "Error"
)

// ConditionType represents a condition type for SecretsManagementConfig
type ConditionType string

const (
	// ConditionPluginDeployed indicates the plugin deployment status
	ConditionPluginDeployed ConditionType = "PluginDeployed"

	// ConditionRBACConfigured indicates the RBAC configuration status
	ConditionRBACConfigured ConditionType = "RBACConfigured"

	// ConditionConsolePluginRegistered indicates the ConsolePlugin CR status
	ConditionConsolePluginRegistered ConditionType = "ConsolePluginRegistered"
)

// Condition represents an observation of the config's state
type Condition struct {
	// Type of condition
	Type ConditionType `json:"type"`

	// Status of the condition (True, False, Unknown)
	// +kubebuilder:validation:Enum=True;False;Unknown
	Status string `json:"status"`

	// Reason is a machine-readable reason for the condition
	Reason string `json:"reason,omitempty"`

	// Message is a human-readable message for the condition
	Message string `json:"message,omitempty"`

	// LastTransitionTime is the last time the condition transitioned
	LastTransitionTime metav1.Time `json:"lastTransitionTime,omitempty"`
}

// SecretsManagementConfigStatus defines the observed state of SecretsManagementConfig
type SecretsManagementConfigStatus struct {
	// Phase is the overall status of the deployment
	Phase ConfigPhase `json:"phase,omitempty"`

	// ObservedGeneration is the last observed generation of the spec
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`

	// RBAC contains status of RBAC resources
	RBAC RBACStatus `json:"rbac,omitempty"`

	// Plugin contains status of the console plugin deployment
	Plugin PluginStatus `json:"plugin,omitempty"`

	// DetectedOperators contains detection status of operators
	DetectedOperators DetectedOperatorsStatus `json:"detectedOperators,omitempty"`

	// Conditions represent the latest available observations
	Conditions []Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:scope=Cluster,shortName=smc
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Plugin Ready",type=boolean,JSONPath=`.status.plugin.ready`
// +kubebuilder:printcolumn:name="cert-manager",type=boolean,JSONPath=`.status.detectedOperators.certManager.installed`
// +kubebuilder:printcolumn:name="ESO",type=boolean,JSONPath=`.status.detectedOperators.externalSecrets.installed`
// +kubebuilder:printcolumn:name="SSCSI",type=boolean,JSONPath=`.status.detectedOperators.secretsStoreCSI.installed`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// SecretsManagementConfig is the Schema for the secretsmanagementconfigs API
type SecretsManagementConfig struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   SecretsManagementConfigSpec   `json:"spec,omitempty"`
	Status SecretsManagementConfigStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// SecretsManagementConfigList contains a list of SecretsManagementConfig
type SecretsManagementConfigList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []SecretsManagementConfig `json:"items"`
}
