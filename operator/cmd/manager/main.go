package main

import (
	"context"
	"flag"
	"os"

	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	_ "k8s.io/client-go/plugin/pkg/client/auth"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/healthz"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"

	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"

	smv1alpha1 "github.com/openshift/ocp-secrets-management/operator/pkg/apis/secretsmanagement/v1alpha1"
	"github.com/openshift/ocp-secrets-management/operator/pkg/controller"
)

var (
	scheme   = runtime.NewScheme()
	setupLog = ctrl.Log.WithName("setup")
)

func init() {
	utilruntime.Must(clientgoscheme.AddToScheme(scheme))
	utilruntime.Must(smv1alpha1.AddToScheme(scheme))
	utilruntime.Must(apiextensionsv1.AddToScheme(scheme))
}

func main() {
	var metricsAddr string
	var enableLeaderElection bool
	var probeAddr string

	flag.StringVar(&metricsAddr, "metrics-bind-address", ":8080", "The address the metric endpoint binds to.")
	flag.StringVar(&probeAddr, "health-probe-bind-address", ":8081", "The address the probe endpoint binds to.")
	flag.BoolVar(&enableLeaderElection, "leader-elect", false,
		"Enable leader election for controller manager. "+
			"Enabling this will ensure there is only one active controller manager.")
	var developmentMode bool
	flag.BoolVar(&developmentMode, "development", false, "Enable development mode logging.")

	opts := zap.Options{
		Development: developmentMode,
	}
	opts.BindFlags(flag.CommandLine)
	flag.Parse()

	ctrl.SetLogger(zap.New(zap.UseFlagOptions(&opts)))

	mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{
		Scheme: scheme,
		Metrics: metricsserver.Options{
			BindAddress: metricsAddr,
		},
		HealthProbeBindAddress: probeAddr,
		LeaderElection:         enableLeaderElection,
		LeaderElectionID:       "secrets-management.openshift.io",
	})
	if err != nil {
		setupLog.Error(err, "unable to start manager")
		os.Exit(1)
	}

	if err = (&controller.SecretsManagementConfigReconciler{
		Client: mgr.GetClient(),
		Log:    ctrl.Log.WithName("controllers").WithName("SecretsManagementConfig"),
		Scheme: mgr.GetScheme(),
	}).SetupWithManager(mgr); err != nil {
		setupLog.Error(err, "unable to create controller", "controller", "SecretsManagementConfig")
		os.Exit(1)
	}

	// Register runnable to auto-create default SecretsManagementConfig on startup
	if err := mgr.Add(&defaultConfigInitializer{client: mgr.GetClient()}); err != nil {
		setupLog.Error(err, "unable to register default config initializer")
		os.Exit(1)
	}

	if err := mgr.AddHealthzCheck("healthz", healthz.Ping); err != nil {
		setupLog.Error(err, "unable to set up health check")
		os.Exit(1)
	}
	if err := mgr.AddReadyzCheck("readyz", healthz.Ping); err != nil {
		setupLog.Error(err, "unable to set up ready check")
		os.Exit(1)
	}

	setupLog.Info("starting manager")
	if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
		setupLog.Error(err, "problem running manager")
		os.Exit(1)
	}
}

// defaultConfigInitializer ensures a default SecretsManagementConfig CR exists.
// This runs after leader election and cache sync so the operator provides a
// seamless install experience without requiring manual CR creation.
type defaultConfigInitializer struct {
	client client.Client
}

func (d *defaultConfigInitializer) Start(ctx context.Context) error {
	log := ctrl.Log.WithName("setup").WithName("default-config")

	list := &smv1alpha1.SecretsManagementConfigList{}
	if err := d.client.List(ctx, list); err != nil {
		log.Error(err, "Failed to list SecretsManagementConfig resources")
		return nil // non-fatal: controller will still reconcile when CR is created manually
	}

	if len(list.Items) > 0 {
		log.Info("SecretsManagementConfig already exists, skipping default creation")
		return nil
	}

	defaultConfig := &smv1alpha1.SecretsManagementConfig{
		ObjectMeta: metav1.ObjectMeta{
			Name: "cluster",
		},
		Spec: smv1alpha1.SecretsManagementConfigSpec{
			RBAC: smv1alpha1.RBACConfig{
				CreateDefaultRoles: true,
				RolePrefix:         "secrets-management",
			},
			Plugin: smv1alpha1.PluginConfig{
				Replicas: 2,
			},
		},
	}

	if err := d.client.Create(ctx, defaultConfig); err != nil {
		if errors.IsAlreadyExists(err) {
			log.Info("SecretsManagementConfig was created concurrently, skipping")
			return nil
		}
		log.Error(err, "Failed to create default SecretsManagementConfig")
		return nil // non-fatal
	}

	log.Info("Created default SecretsManagementConfig 'cluster'")
	return nil
}

func (d *defaultConfigInitializer) NeedLeaderElection() bool {
	return true
}
