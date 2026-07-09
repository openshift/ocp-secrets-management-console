package controller

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/go-logr/logr"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	smv1alpha1 "github.com/openshift/ocp-secrets-management/operator/pkg/apis/secretsmanagement/v1alpha1"
)

const (
	// FinalizerName is the finalizer for SecretsManagementConfig
	FinalizerName = "secrets-management.openshift.io/finalizer"

	// PluginNamespace is the namespace where the plugin is deployed
	PluginNamespace = "openshift-secrets-management"

	// PluginName is the name of the console plugin
	PluginName = "ocp-secrets-management"

	// Plugin port
	PluginPort = 9443
)

var (
	// DefaultPluginImage is the default image for the plugin.
	// In production (OLM), this is set via RELATED_IMAGE_PLUGIN environment variable from the bundle CSV.
	// For development, it falls back to the hardcoded default.
	DefaultPluginImage = getPluginImage()
)

// getPluginImage returns the plugin image from environment or default
func getPluginImage() string {
	if img := os.Getenv("RELATED_IMAGE_PLUGIN"); img != "" {
		return img
	}
	return "openshift.io/ocp-secrets-management:latest"
}

// ConsolePlugin GroupVersionKind for OpenShift
var consolePluginGVK = schema.GroupVersionKind{
	Group:   "console.openshift.io",
	Version: "v1",
	Kind:    "ConsolePlugin",
}

// Console Operator GVK for enabling plugins in the cluster console
var consoleOperatorGVK = schema.GroupVersionKind{
	Group:   "operator.openshift.io",
	Version: "v1",
	Kind:    "Console",
}

// CRD names for operator detection
var operatorCRDs = map[string]string{
	"certManager":     "certificates.cert-manager.io",
	"externalSecrets": "externalsecrets.external-secrets.io",
	"secretsStoreCSI": "secretproviderclasses.secrets-store.csi.x-k8s.io",
}

// SecretsManagementConfigReconciler reconciles a SecretsManagementConfig object
type SecretsManagementConfigReconciler struct {
	client.Client
	Log    logr.Logger
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=secrets-management.openshift.io,resources=secretsmanagementconfigs,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=secrets-management.openshift.io,resources=secretsmanagementconfigs/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=secrets-management.openshift.io,resources=secretsmanagementconfigs/finalizers,verbs=update
// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=core,resources=services;serviceaccounts;configmaps;namespaces,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=rbac.authorization.k8s.io,resources=clusterroles;clusterrolebindings,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=console.openshift.io,resources=consoleplugins,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=operator.openshift.io,resources=consoles,verbs=get;list;watch;update;patch
// +kubebuilder:rbac:groups=apiextensions.k8s.io,resources=customresourcedefinitions,verbs=get;list;watch
// Permissions for cert-manager / external-secrets / secrets-store-csi so the operator can create ClusterRoles that grant these to the plugin (RBAC escalation rule; use * so we can grant * to admin role)
// +kubebuilder:rbac:groups=cert-manager.io,resources=certificates;issuers;clusterissuers,verbs=*
// +kubebuilder:rbac:groups=external-secrets.io,resources=externalsecrets;secretstores;clustersecretstores;clusterexternalsecrets;pushsecrets;clusterpushsecrets,verbs=*
// +kubebuilder:rbac:groups=secrets-store.csi.x-k8s.io,resources=secretproviderclasses;secretproviderclasspodstatuses,verbs=*
// +kubebuilder:rbac:groups=core,resources=events,verbs=create;patch
// +kubebuilder:rbac:groups=coordination.k8s.io,resources=leases,verbs=get;list;watch;create;update;patch;delete

// Reconcile handles the reconciliation loop for SecretsManagementConfig
func (r *SecretsManagementConfigReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := r.Log.WithValues("secretsmanagementconfig", req.NamespacedName)

	// Fetch the SecretsManagementConfig instance
	config := &smv1alpha1.SecretsManagementConfig{}
	err := r.Get(ctx, req.NamespacedName, config)
	if err != nil {
		if errors.IsNotFound(err) {
			log.Info("SecretsManagementConfig resource not found. Ignoring since object must be deleted")
			return ctrl.Result{}, nil
		}
		log.Error(err, "Failed to get SecretsManagementConfig")
		return ctrl.Result{}, err
	}

	// Add finalizer if not present
	if !controllerutil.ContainsFinalizer(config, FinalizerName) {
		controllerutil.AddFinalizer(config, FinalizerName)
		if err := r.Update(ctx, config); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Handle deletion
	if !config.DeletionTimestamp.IsZero() {
		return r.reconcileDelete(ctx, config)
	}

	// Update phase to Deploying
	if config.Status.Phase == "" || config.Status.Phase == smv1alpha1.PhasePending {
		config.Status.Phase = smv1alpha1.PhaseDeploying
		if err := r.Status().Update(ctx, config); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Reconcile Namespace
	if err := r.reconcileNamespace(ctx, config); err != nil {
		log.Error(err, "Failed to reconcile namespace")
		return r.updateStatusError(ctx, config, err)
	}

	// Reconcile RBAC
	if err := r.reconcileRBAC(ctx, config); err != nil {
		log.Error(err, "Failed to reconcile RBAC")
		return r.updateStatusError(ctx, config, err)
	}

	// Reconcile plugin deployment
	if err := r.reconcilePluginDeployment(ctx, config); err != nil {
		log.Error(err, "Failed to reconcile plugin deployment")
		return r.updateStatusError(ctx, config, err)
	}

	// Reconcile ConsolePlugin
	if err := r.reconcileConsolePlugin(ctx, config); err != nil {
		log.Error(err, "Failed to reconcile ConsolePlugin")
		return r.updateStatusError(ctx, config, err)
	}

	// Enable plugin in the cluster console
	if err := r.reconcileConsolePluginEnabled(ctx, config); err != nil {
		log.Error(err, "Failed to enable console plugin (non-fatal)")
	}

	// Detect installed operators
	if err := r.detectOperators(ctx, config); err != nil {
		log.Error(err, "Failed to detect operators")
		// Don't fail on detection errors, just log
	}

	// Update status to Ready
	config.Status.Phase = smv1alpha1.PhaseReady
	config.Status.ObservedGeneration = config.Generation
	if err := r.Status().Update(ctx, config); err != nil {
		return ctrl.Result{}, err
	}

	// Requeue after 5 minutes to refresh operator detection
	return ctrl.Result{RequeueAfter: 5 * time.Minute}, nil
}

// reconcileDelete handles the deletion of the SecretsManagementConfig
func (r *SecretsManagementConfigReconciler) reconcileDelete(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) (ctrl.Result, error) {
	log := r.Log.WithValues("secretsmanagementconfig", config.Name)
	log.Info("Reconciling deletion")

	// Clean up resources; log errors but do not block finalizer removal so the CR can be deleted
	if err := r.removeConsolePluginEnabled(ctx, config); err != nil {
		log.Error(err, "Failed to remove plugin from console operator (continuing to remove finalizer)")
	}
	if err := r.cleanupConsolePlugin(ctx, config); err != nil {
		log.Error(err, "Failed to cleanup ConsolePlugin (continuing to remove finalizer)")
	}
	if err := r.cleanupPluginDeployment(ctx, config); err != nil {
		log.Error(err, "Failed to cleanup plugin deployment (continuing to remove finalizer)")
	}
	if err := r.cleanupRBAC(ctx, config); err != nil {
		log.Error(err, "Failed to cleanup RBAC (continuing to remove finalizer)")
	}

	// Re-fetch to get latest resourceVersion and avoid update conflicts
	if err := r.Get(ctx, types.NamespacedName{Name: config.Name}, config); err != nil {
		if errors.IsNotFound(err) {
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	// Remove finalizer so the API server can complete deletion
	if controllerutil.ContainsFinalizer(config, FinalizerName) {
		controllerutil.RemoveFinalizer(config, FinalizerName)
		if err := r.Update(ctx, config); err != nil {
			return ctrl.Result{}, err
		}
	}

	return ctrl.Result{}, nil
}

// reconcileNamespace ensures the plugin namespace exists
func (r *SecretsManagementConfigReconciler) reconcileNamespace(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: PluginNamespace,
			Labels: map[string]string{
				"app.kubernetes.io/name":       PluginName,
				"app.kubernetes.io/part-of":    "ocp-secrets-management",
				"app.kubernetes.io/managed-by": "secrets-management-operator",
			},
		},
	}

	existing := &corev1.Namespace{}
	err := r.Get(ctx, types.NamespacedName{Name: PluginNamespace}, existing)
	if err != nil {
		if errors.IsNotFound(err) {
			return r.Create(ctx, ns)
		}
		return err
	}

	return nil
}

// reconcileRBAC ensures the RBAC resources exist
func (r *SecretsManagementConfigReconciler) reconcileRBAC(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	if !config.Spec.RBAC.CreateDefaultRoles {
		return nil
	}

	prefix := config.Spec.RBAC.RolePrefix
	if prefix == "" {
		prefix = "secrets-management"
	}

	// Create view role
	viewRole := r.buildViewClusterRole(prefix)
	if err := r.createOrUpdateClusterRole(ctx, viewRole); err != nil {
		return err
	}

	// Create delete role
	deleteRole := r.buildDeleteClusterRole(prefix)
	if err := r.createOrUpdateClusterRole(ctx, deleteRole); err != nil {
		return err
	}

	// Create admin role
	adminRole := r.buildAdminClusterRole(prefix)
	if err := r.createOrUpdateClusterRole(ctx, adminRole); err != nil {
		return err
	}

	// Update status with created roles, preserving existing Created timestamps
	existingByRole := make(map[string]metav1.Time)
	for _, s := range config.Status.RBAC.ClusterRoles {
		existingByRole[s.Name] = s.Created
	}
	createdAt := func(name string) metav1.Time {
		if t, ok := existingByRole[name]; ok {
			return t
		}
		role := &rbacv1.ClusterRole{}
		if err := r.Get(ctx, types.NamespacedName{Name: name}, role); err == nil && !role.CreationTimestamp.IsZero() {
			return role.CreationTimestamp
		}
		return metav1.Now()
	}
	config.Status.RBAC.ClusterRoles = []smv1alpha1.ClusterRoleStatus{
		{Name: viewRole.Name, Operations: []string{"view"}, Created: createdAt(viewRole.Name)},
		{Name: deleteRole.Name, Operations: []string{"delete"}, Created: createdAt(deleteRole.Name)},
		{Name: adminRole.Name, Operations: []string{"view", "delete", "create", "edit"}, Created: createdAt(adminRole.Name)},
	}

	r.setCondition(config, smv1alpha1.ConditionRBACConfigured, "True", "RolesCreated", "Created 3 ClusterRoles")

	return nil
}

// buildViewClusterRole creates the view ClusterRole
func (r *SecretsManagementConfigReconciler) buildViewClusterRole(prefix string) *rbacv1.ClusterRole {
	return &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{
			Name: fmt.Sprintf("%s-view", prefix),
			Labels: map[string]string{
				"app.kubernetes.io/managed-by": "secrets-management-operator",
				"app.kubernetes.io/part-of":    "ocp-secrets-management",
			},
		},
		Rules: []rbacv1.PolicyRule{
			{
				APIGroups: []string{"cert-manager.io"},
				Resources: []string{"certificates", "issuers", "clusterissuers"},
				Verbs:     []string{"get", "list", "watch"},
			},
			{
				APIGroups: []string{"external-secrets.io"},
				Resources: []string{"externalsecrets", "clusterexternalsecrets", "secretstores", "clustersecretstores", "pushsecrets"},
				Verbs:     []string{"get", "list", "watch"},
			},
			{
				APIGroups: []string{"secrets-store.csi.x-k8s.io"},
				Resources: []string{"secretproviderclasses", "secretproviderclasspodstatuses"},
				Verbs:     []string{"get", "list", "watch"},
			},
		},
	}
}

// buildDeleteClusterRole creates the delete ClusterRole
func (r *SecretsManagementConfigReconciler) buildDeleteClusterRole(prefix string) *rbacv1.ClusterRole {
	return &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{
			Name: fmt.Sprintf("%s-delete", prefix),
			Labels: map[string]string{
				"app.kubernetes.io/managed-by": "secrets-management-operator",
				"app.kubernetes.io/part-of":    "ocp-secrets-management",
			},
		},
		Rules: []rbacv1.PolicyRule{
			{
				APIGroups: []string{"cert-manager.io"},
				Resources: []string{"certificates", "issuers", "clusterissuers"},
				Verbs:     []string{"delete"},
			},
			{
				APIGroups: []string{"external-secrets.io"},
				Resources: []string{"externalsecrets", "clusterexternalsecrets", "secretstores", "clustersecretstores", "pushsecrets"},
				Verbs:     []string{"delete"},
			},
			{
				APIGroups: []string{"secrets-store.csi.x-k8s.io"},
				Resources: []string{"secretproviderclasses"},
				Verbs:     []string{"delete"},
			},
		},
	}
}

// buildAdminClusterRole creates the admin ClusterRole
func (r *SecretsManagementConfigReconciler) buildAdminClusterRole(prefix string) *rbacv1.ClusterRole {
	return &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{
			Name: fmt.Sprintf("%s-admin", prefix),
			Labels: map[string]string{
				"app.kubernetes.io/managed-by": "secrets-management-operator",
				"app.kubernetes.io/part-of":    "ocp-secrets-management",
			},
		},
		Rules: []rbacv1.PolicyRule{
			{
				APIGroups: []string{"cert-manager.io"},
				Resources: []string{"certificates", "issuers", "clusterissuers"},
				Verbs:     []string{"*"},
			},
			{
				APIGroups: []string{"external-secrets.io"},
				Resources: []string{"externalsecrets", "clusterexternalsecrets", "secretstores", "clustersecretstores", "pushsecrets"},
				Verbs:     []string{"*"},
			},
			{
				APIGroups: []string{"secrets-store.csi.x-k8s.io"},
				Resources: []string{"secretproviderclasses", "secretproviderclasspodstatuses"},
				Verbs:     []string{"*"},
			},
		},
	}
}

// createOrUpdateClusterRole creates or updates a ClusterRole
func (r *SecretsManagementConfigReconciler) createOrUpdateClusterRole(ctx context.Context, role *rbacv1.ClusterRole) error {
	existing := &rbacv1.ClusterRole{}
	err := r.Get(ctx, types.NamespacedName{Name: role.Name}, existing)
	if err != nil {
		if errors.IsNotFound(err) {
			return r.Create(ctx, role)
		}
		return err
	}

	existing.Rules = role.Rules
	existing.Labels = role.Labels
	return r.Update(ctx, existing)
}

// reconcilePluginDeployment ensures the plugin deployment exists
func (r *SecretsManagementConfigReconciler) reconcilePluginDeployment(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	// Create ServiceAccount
	if err := r.reconcileServiceAccount(ctx, config); err != nil {
		return err
	}

	// Create Service
	if err := r.reconcileService(ctx, config); err != nil {
		return err
	}

	// Create Deployment
	if err := r.reconcileDeployment(ctx, config); err != nil {
		return err
	}

	return nil
}

// reconcileServiceAccount ensures the plugin ServiceAccount exists
func (r *SecretsManagementConfigReconciler) reconcileServiceAccount(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-plugin", PluginName),
			Namespace: PluginNamespace,
			Labels: map[string]string{
				"app.kubernetes.io/name":       PluginName,
				"app.kubernetes.io/part-of":    "ocp-secrets-management",
				"app.kubernetes.io/managed-by": "secrets-management-operator",
			},
		},
	}

	existing := &corev1.ServiceAccount{}
	err := r.Get(ctx, types.NamespacedName{Name: sa.Name, Namespace: sa.Namespace}, existing)
	if err != nil {
		if errors.IsNotFound(err) {
			return r.Create(ctx, sa)
		}
		return err
	}

	return nil
}

// reconcileService ensures the plugin Service exists
func (r *SecretsManagementConfigReconciler) reconcileService(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-plugin", PluginName),
			Namespace: PluginNamespace,
			Labels: map[string]string{
				"app.kubernetes.io/name":       PluginName,
				"app.kubernetes.io/part-of":    "ocp-secrets-management",
				"app.kubernetes.io/managed-by": "secrets-management-operator",
			},
			Annotations: map[string]string{
				"service.alpha.openshift.io/serving-cert-secret-name": fmt.Sprintf("%s-plugin-cert", PluginName),
			},
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{
				"app.kubernetes.io/name": PluginName,
			},
			Ports: []corev1.ServicePort{
				{
					Name:       "https",
					Port:       PluginPort,
					TargetPort: intstr.FromInt(PluginPort),
					Protocol:   corev1.ProtocolTCP,
				},
			},
		},
	}

	existing := &corev1.Service{}
	err := r.Get(ctx, types.NamespacedName{Name: svc.Name, Namespace: svc.Namespace}, existing)
	if err != nil {
		if errors.IsNotFound(err) {
			return r.Create(ctx, svc)
		}
		return err
	}

	// Update service spec and metadata (labels/annotations e.g. for serving-cert)
	existing.Labels = svc.Labels
	existing.Annotations = svc.Annotations
	existing.Spec.Ports = svc.Spec.Ports
	existing.Spec.Selector = svc.Spec.Selector
	return r.Update(ctx, existing)
}

// reconcileDeployment ensures the plugin Deployment exists
func (r *SecretsManagementConfigReconciler) reconcileDeployment(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	// Get image from config or use default
	image := config.Spec.Plugin.Image
	if image == "" {
		image = DefaultPluginImage
	}

	// Get replicas from config or use default
	replicas := config.Spec.Plugin.Replicas
	if replicas == 0 {
		replicas = 1
	}

	// Get image pull policy
	imagePullPolicy := corev1.PullIfNotPresent
	if config.Spec.Plugin.ImagePullPolicy == "Always" {
		imagePullPolicy = corev1.PullAlways
	} else if config.Spec.Plugin.ImagePullPolicy == "Never" {
		imagePullPolicy = corev1.PullNever
	}

	// Build resource requirements (defaults)
	resources := corev1.ResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("10m"),
			corev1.ResourceMemory: resource.MustParse("50Mi"),
		},
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("100m"),
			corev1.ResourceMemory: resource.MustParse("128Mi"),
		},
	}

	parseAndSet := func(fieldName string, val string, setter func(resource.Quantity)) error {
		if val == "" {
			return nil
		}
		q, err := resource.ParseQuantity(val)
		if err != nil {
			return fmt.Errorf("%s: invalid quantity %q: %w", fieldName, val, err)
		}
		setter(q)
		return nil
	}
	if err := parseAndSet("spec.plugin.resources.requests.cpu", config.Spec.Plugin.Resources.Requests.CPU, func(q resource.Quantity) {
		resources.Requests[corev1.ResourceCPU] = q
	}); err != nil {
		return err
	}
	if err := parseAndSet("spec.plugin.resources.requests.memory", config.Spec.Plugin.Resources.Requests.Memory, func(q resource.Quantity) {
		resources.Requests[corev1.ResourceMemory] = q
	}); err != nil {
		return err
	}
	if err := parseAndSet("spec.plugin.resources.limits.cpu", config.Spec.Plugin.Resources.Limits.CPU, func(q resource.Quantity) {
		resources.Limits[corev1.ResourceCPU] = q
	}); err != nil {
		return err
	}
	if err := parseAndSet("spec.plugin.resources.limits.memory", config.Spec.Plugin.Resources.Limits.Memory, func(q resource.Quantity) {
		resources.Limits[corev1.ResourceMemory] = q
	}); err != nil {
		return err
	}

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-plugin", PluginName),
			Namespace: PluginNamespace,
			Labels: map[string]string{
				"app.kubernetes.io/name":       PluginName,
				"app.kubernetes.io/part-of":    "ocp-secrets-management",
				"app.kubernetes.io/managed-by": "secrets-management-operator",
			},
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"app.kubernetes.io/name": PluginName,
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app.kubernetes.io/name":    PluginName,
						"app.kubernetes.io/part-of": "ocp-secrets-management",
					},
				},
				Spec: corev1.PodSpec{
					ServiceAccountName: fmt.Sprintf("%s-plugin", PluginName),
					SecurityContext: &corev1.PodSecurityContext{
						RunAsNonRoot: boolPtr(true),
						SeccompProfile: &corev1.SeccompProfile{
							Type: corev1.SeccompProfileTypeRuntimeDefault,
						},
					},
					Containers: []corev1.Container{
						{
							Name:            "plugin",
							Image:           image,
							ImagePullPolicy: imagePullPolicy,
							Ports: []corev1.ContainerPort{
								{
									ContainerPort: PluginPort,
									Protocol:      corev1.ProtocolTCP,
								},
							},
							Resources: resources,
							SecurityContext: &corev1.SecurityContext{
								AllowPrivilegeEscalation: boolPtr(false),
								Capabilities: &corev1.Capabilities{
									Drop: []corev1.Capability{"ALL"},
								},
							},
							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "plugin-cert",
									MountPath: "/var/cert",
									ReadOnly:  true,
								},
								{
									Name:      "nginx-conf",
									MountPath: "/etc/nginx/nginx.conf",
									SubPath:   "nginx.conf",
									ReadOnly:  true,
								},
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: "plugin-cert",
							VolumeSource: corev1.VolumeSource{
								Secret: &corev1.SecretVolumeSource{
									SecretName:  fmt.Sprintf("%s-plugin-cert", PluginName),
									DefaultMode: int32Ptr(420),
								},
							},
						},
						{
							Name: "nginx-conf",
							VolumeSource: corev1.VolumeSource{
								ConfigMap: &corev1.ConfigMapVolumeSource{
									LocalObjectReference: corev1.LocalObjectReference{
										Name: fmt.Sprintf("%s-nginx-conf", PluginName),
									},
									DefaultMode: int32Ptr(420),
								},
							},
						},
					},
				},
			},
		},
	}

	// Ensure nginx config exists
	if err := r.reconcileNginxConfig(ctx, config); err != nil {
		return err
	}

	existing := &appsv1.Deployment{}
	err := r.Get(ctx, types.NamespacedName{Name: deployment.Name, Namespace: deployment.Namespace}, existing)
	if err != nil {
		if errors.IsNotFound(err) {
			return r.Create(ctx, deployment)
		}
		return err
	}

	// Update deployment spec
	existing.Spec = deployment.Spec
	if err := r.Update(ctx, existing); err != nil {
		return err
	}

	// Update status with deployment info
	config.Status.Plugin = smv1alpha1.PluginStatus{
		DeploymentName:    deployment.Name,
		ServiceName:       fmt.Sprintf("%s-plugin", PluginName),
		ConsolePluginName: PluginName,
		AvailableReplicas: existing.Status.AvailableReplicas,
		Ready:             existing.Status.AvailableReplicas > 0,
	}

	r.setCondition(config, smv1alpha1.ConditionPluginDeployed, "True", "DeploymentReady", "Plugin deployment is ready")

	return nil
}

// reconcileNginxConfig ensures the nginx ConfigMap exists
func (r *SecretsManagementConfigReconciler) reconcileNginxConfig(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	nginxConf := `
error_log /dev/stdout info;
events {}
http {
  access_log /dev/stdout;
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  server {
    listen 9443 ssl;
    ssl_certificate /var/cert/tls.crt;
    ssl_certificate_key /var/cert/tls.key;
    root /usr/share/nginx/html;

    # Serve plugin manifest at / so the console gets a valid manifest when fetching basePath
    location = / {
      add_header Content-Type application/json;
      alias /usr/share/nginx/html/plugin-manifest.json;
    }
    location = /plugin-manifest.json {
      add_header Content-Type application/json;
    }

    location /health {
      return 200 'OK';
      add_header Content-Type text/plain;
    }
  }
}
`

	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-nginx-conf", PluginName),
			Namespace: PluginNamespace,
			Labels: map[string]string{
				"app.kubernetes.io/name":       PluginName,
				"app.kubernetes.io/part-of":    "ocp-secrets-management",
				"app.kubernetes.io/managed-by": "secrets-management-operator",
			},
		},
		Data: map[string]string{
			"nginx.conf": nginxConf,
		},
	}

	existing := &corev1.ConfigMap{}
	err := r.Get(ctx, types.NamespacedName{Name: cm.Name, Namespace: cm.Namespace}, existing)
	if err != nil {
		if errors.IsNotFound(err) {
			return r.Create(ctx, cm)
		}
		return err
	}

	existing.Data = cm.Data
	return r.Update(ctx, existing)
}

// reconcileConsolePlugin ensures the ConsolePlugin CR exists
func (r *SecretsManagementConfigReconciler) reconcileConsolePlugin(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	existing := &unstructured.Unstructured{}
	existing.SetGroupVersionKind(consolePluginGVK)
	err := r.Get(ctx, types.NamespacedName{Name: PluginName}, existing)
	if err != nil {
		if errors.IsNotFound(err) {
			// Create new ConsolePlugin
			consolePlugin := map[string]interface{}{
				"apiVersion": "console.openshift.io/v1",
				"kind":       "ConsolePlugin",
				"metadata": map[string]interface{}{
					"name": PluginName,
					"labels": map[string]interface{}{
						"app.kubernetes.io/name":       PluginName,
						"app.kubernetes.io/part-of":    "ocp-secrets-management",
						"app.kubernetes.io/managed-by": "secrets-management-operator",
					},
				},
				"spec": map[string]interface{}{
					"displayName": "OCP Secrets Management",
					"backend": map[string]interface{}{
						"type": "Service",
						"service": map[string]interface{}{
							"name":      fmt.Sprintf("%s-plugin", PluginName),
							"namespace": PluginNamespace,
							"port":      int64(PluginPort), // Must be int64 for unstructured
							"basePath":  "/",
						},
					},
				},
			}

			u := &unstructured.Unstructured{}
			u.SetUnstructuredContent(consolePlugin)
			u.SetGroupVersionKind(consolePluginGVK)
			return r.Create(ctx, u)
		}
		return err
	}

	// Update existing - preserve resourceVersion and other metadata
	spec := map[string]interface{}{
		"displayName": "OCP Secrets Management",
		"backend": map[string]interface{}{
			"type": "Service",
			"service": map[string]interface{}{
				"name":      fmt.Sprintf("%s-plugin", PluginName),
				"namespace": PluginNamespace,
				"port":      int64(PluginPort),
				"basePath":  "/",
			},
		},
	}

	// Only update spec, preserve existing metadata
	if err := unstructured.SetNestedField(existing.Object, spec, "spec"); err != nil {
		return err
	}

	// Update labels
	labels := map[string]string{
		"app.kubernetes.io/name":       PluginName,
		"app.kubernetes.io/part-of":    "ocp-secrets-management",
		"app.kubernetes.io/managed-by": "secrets-management-operator",
	}
	existing.SetLabels(labels)

	return r.Update(ctx, existing)
}

// reconcileConsolePluginEnabled ensures the plugin is registered in the Console Operator's enabled plugins list
func (r *SecretsManagementConfigReconciler) reconcileConsolePluginEnabled(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	console := &unstructured.Unstructured{}
	console.SetGroupVersionKind(consoleOperatorGVK)
	if err := r.Get(ctx, types.NamespacedName{Name: "cluster"}, console); err != nil {
		if errors.IsNotFound(err) {
			return nil
		}
		return err
	}

	plugins, found, err := unstructured.NestedStringSlice(console.Object, "spec", "plugins")
	if err != nil {
		return err
	}

	if found {
		for _, p := range plugins {
			if p == PluginName {
				return nil // already registered
			}
		}
	}

	plugins = append(plugins, PluginName)
	if err := unstructured.SetNestedStringSlice(console.Object, plugins, "spec", "plugins"); err != nil {
		return err
	}

	return r.Update(ctx, console)
}

// removeConsolePluginEnabled removes the plugin from the Console Operator's enabled plugins list
func (r *SecretsManagementConfigReconciler) removeConsolePluginEnabled(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	console := &unstructured.Unstructured{}
	console.SetGroupVersionKind(consoleOperatorGVK)
	if err := r.Get(ctx, types.NamespacedName{Name: "cluster"}, console); err != nil {
		if errors.IsNotFound(err) {
			return nil
		}
		return err
	}

	plugins, found, err := unstructured.NestedStringSlice(console.Object, "spec", "plugins")
	if err != nil || !found {
		return err
	}

	filtered := make([]string, 0, len(plugins))
	for _, p := range plugins {
		if p != PluginName {
			filtered = append(filtered, p)
		}
	}

	if len(filtered) == len(plugins) {
		return nil // wasn't in the list
	}

	if err := unstructured.SetNestedStringSlice(console.Object, filtered, "spec", "plugins"); err != nil {
		return err
	}

	return r.Update(ctx, console)
}

// detectOperators checks for installed operator CRDs
func (r *SecretsManagementConfigReconciler) detectOperators(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	for operatorKey, crdName := range operatorCRDs {
		crd := &apiextensionsv1.CustomResourceDefinition{}
		err := r.Get(ctx, types.NamespacedName{Name: crdName}, crd)

		installed := err == nil
		version := ""
		if installed && len(crd.Spec.Versions) > 0 {
			for _, v := range crd.Spec.Versions {
				if v.Served {
					version = v.Name
					break
				}
			}
		}

		switch operatorKey {
		case "certManager":
			config.Status.DetectedOperators.CertManager = smv1alpha1.DetectedOperator{
				Installed: installed,
				Version:   version,
			}
		case "externalSecrets":
			config.Status.DetectedOperators.ExternalSecrets = smv1alpha1.DetectedOperator{
				Installed: installed,
				Version:   version,
			}
		case "secretsStoreCSI":
			config.Status.DetectedOperators.SecretsStoreCSI = smv1alpha1.DetectedOperator{
				Installed: installed,
				Version:   version,
			}
		}
	}

	return nil
}

// cleanupRBAC removes RBAC resources
func (r *SecretsManagementConfigReconciler) cleanupRBAC(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	prefix := config.Spec.RBAC.RolePrefix
	if prefix == "" {
		prefix = "secrets-management"
	}

	roleNames := []string{
		fmt.Sprintf("%s-view", prefix),
		fmt.Sprintf("%s-delete", prefix),
		fmt.Sprintf("%s-admin", prefix),
	}

	for _, name := range roleNames {
		role := &rbacv1.ClusterRole{
			ObjectMeta: metav1.ObjectMeta{Name: name},
		}
		if err := r.Delete(ctx, role); err != nil && !errors.IsNotFound(err) {
			return err
		}
	}

	return nil
}

// cleanupPluginDeployment removes plugin deployment resources
func (r *SecretsManagementConfigReconciler) cleanupPluginDeployment(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	// Delete Deployment
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-plugin", PluginName),
			Namespace: PluginNamespace,
		},
	}
	if err := r.Delete(ctx, deployment); err != nil && !errors.IsNotFound(err) {
		return err
	}

	// Delete Service
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-plugin", PluginName),
			Namespace: PluginNamespace,
		},
	}
	if err := r.Delete(ctx, svc); err != nil && !errors.IsNotFound(err) {
		return err
	}

	// Delete ServiceAccount
	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-plugin", PluginName),
			Namespace: PluginNamespace,
		},
	}
	if err := r.Delete(ctx, sa); err != nil && !errors.IsNotFound(err) {
		return err
	}

	// Delete ConfigMap
	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-nginx-conf", PluginName),
			Namespace: PluginNamespace,
		},
	}
	if err := r.Delete(ctx, cm); err != nil && !errors.IsNotFound(err) {
		return err
	}

	return nil
}

// cleanupConsolePlugin removes the ConsolePlugin CR
func (r *SecretsManagementConfigReconciler) cleanupConsolePlugin(ctx context.Context, config *smv1alpha1.SecretsManagementConfig) error {
	u := &unstructured.Unstructured{}
	u.SetGroupVersionKind(consolePluginGVK)
	u.SetName(PluginName)

	if err := r.Delete(ctx, u); err != nil && !errors.IsNotFound(err) {
		return err
	}

	return nil
}

// setCondition sets a condition on the config status
func (r *SecretsManagementConfigReconciler) setCondition(config *smv1alpha1.SecretsManagementConfig, condType smv1alpha1.ConditionType, status, reason, message string) {
	now := metav1.Now()
	condition := smv1alpha1.Condition{
		Type:               condType,
		Status:             status,
		Reason:             reason,
		Message:            message,
		LastTransitionTime: now,
	}

	// Find and update existing condition or append new one
	found := false
	for i, c := range config.Status.Conditions {
		if c.Type == condType {
			if c.Status != status {
				config.Status.Conditions[i] = condition
			}
			found = true
			break
		}
	}
	if !found {
		config.Status.Conditions = append(config.Status.Conditions, condition)
	}
}

// updateStatusError updates the status with an error
func (r *SecretsManagementConfigReconciler) updateStatusError(ctx context.Context, config *smv1alpha1.SecretsManagementConfig, err error) (ctrl.Result, error) {
	config.Status.Phase = smv1alpha1.PhaseError
	if updateErr := r.Status().Update(ctx, config); updateErr != nil {
		return ctrl.Result{}, updateErr
	}
	return ctrl.Result{}, err
}

// SetupWithManager sets up the controller with the Manager
func (r *SecretsManagementConfigReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&smv1alpha1.SecretsManagementConfig{}).
		Owns(&appsv1.Deployment{}).
		Owns(&corev1.Service{}).
		Owns(&corev1.ServiceAccount{}).
		Owns(&corev1.ConfigMap{}).
		Complete(r)
}

// Helper functions
func boolPtr(b bool) *bool {
	return &b
}

func int32Ptr(i int32) *int32 {
	return &i
}
