# stirling-pdf-chart

![Version: 1.1.0](https://img.shields.io/badge/Version-1.1.0-informational?style=flat-square) ![AppVersion: 0.31.1](https://img.shields.io/badge/AppVersion-0.31.1-informational?style=flat-square)

locally hosted web application that allows you to perform various operations on PDF files

**Homepage:** <https://github.com/Stirling-Tools/Stirling-PDF>

## Maintainers

| Name | Email | Url |
| ---- | ------ | --- |
| Stirling-Tools |  | <https://github.com/Stirling-Tools/Stirling-PDF> |

## Source Code

* <https://github.com/Stirling-Tools/Stirling-PDF>

## Chart Repo

Add the following repo to use the chart:

```console
helm repo add stirling-pdf https://docs.stirlingpdf.com/Stirling-PDF/
```

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| affinity | object | `{}` |  |
| commonLabels | object | `{}` | Labels to apply to all resources |
| containerSecurityContext | object | `{}` |  |
| deployment.annotations | object | `{}` | Stirling-pdf Deployment annotations |
| deployment.extraVolumeMounts | list | `[]` | Additional volumes to mount |
| deployment.extraVolumes | list | `[]` | Additional volumes |
| deployment.labels | object | `{}` |  |
| deployment.sidecarContainers | object | `{}` | of the chart's content, send notifications... |
| envs | list | `[]` |  |
| extraArgs | list | `[]` |  |
| image.pullPolicy | string | `"IfNotPresent"` |  |
| image.repository | string | `"frooodle/s-pdf"` |  |
| image.tag | string | `nil` |  |
| ingress | object | `{"annotations":{},"enabled":false,"hosts":[],"ingressClassName":null,"labels":{},"pathType":"ImplementationSpecific"}` | Ingress for load balancer |
| ingress.annotations | object | `{}` | Stirling-pdf Ingress annotations |
| ingress.hosts | list | `[]` | Must be provided if Ingress is enabled |
| ingress.ingressClassName | string | `nil` | See https://kubernetes.io/blog/2020/04/02/improvements-to-the-ingress-api-in-kubernetes-1.18/#specifying-the-class-of-an-ingress |
| ingress.labels | object | `{}` | Stirling-pdf Ingress labels |
| nodeSelector | object | `{}` |  |
| persistence.accessMode | string | `"ReadWriteOnce"` |  |
| persistence.enabled | bool | `false` |  |
| persistence.labels | object | `{}` |  |
| persistence.path | string | `"/tmp"` |  |
| persistence.pv | object | `{"accessMode":"ReadWriteOnce","capacity":{"storage":"8Gi"},"enabled":false,"nfs":{"path":null,"server":null},"pvname":null}` | stirling-pdf data Persistent Volume Storage Class If defined, storageClassName: <storageClass> If set to "-", storageClassName: "", which disables dynamic provisioning If undefined (the default) or set to null, no storageClassName spec is   set, choosing the default provisioner.  (gp2 on AWS, standard on   GKE, AWS & OpenStack) storageClass: "-" volumeName: |
| persistence.size | string | `"8Gi"` |  |
| podAnnotations | object | `{}` | Read more about kube2iam to provide access to s3 https://github.com/jtblin/kube2iam |
| podLabels | object | `{}` | ref: https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/ |
| priorityClassName | string | `""` |  |
| probes.liveness.failureThreshold | int | `3` |  |
| probes.liveness.initialDelaySeconds | int | `5` |  |
| probes.liveness.periodSeconds | int | `10` |  |
| probes.liveness.successThreshold | int | `1` |  |
| probes.liveness.timeoutSeconds | int | `1` |  |
| probes.livenessHttpGetConfig.scheme | string | `"HTTP"` |  |
| probes.readiness.failureThreshold | int | `3` |  |
| probes.readiness.initialDelaySeconds | int | `5` |  |
| probes.readiness.periodSeconds | int | `10` |  |
| probes.readiness.successThreshold | int | `1` |  |
| probes.readiness.timeoutSeconds | int | `1` |  |
| probes.readinessHttpGetConfig.scheme | string | `"HTTP"` |  |
| replicaCount | int | `1` |  |
| resources | object | `{}` |  |
| rootPath | string | `"/"` | Rootpath for the application |
| secret.labels | object | `{}` |  |
| securityContext | object | `{"enabled":true,"fsGroup":1000}` | does not allow this, try setting securityContext: {} |
| service.annotations | object | `{}` |  |
| service.externalPort | int | `8080` |  |
| service.externalTrafficPolicy | string | `"Local"` |  |
| service.ipFamilies | list | `[]` | Can be IPv4 and/or IPv6 |
| service.ipFamilyPolicy | string | `""` | set the ip family policy to configure dual-stack |
| service.labels | object | `{}` |  |
| service.loadBalancerIP | string | `nil` | Only valid if service.type: LoadBalancer |
| service.loadBalancerSourceRanges | list | `[]` | Only valid if service.type: LoadBalancer |
| service.nodePort | string | `nil` |  |
| service.servicename | string | `nil` |  |
| service.targetPort | string | `nil` | from deployment above. Leave empty to use stirling-pdf directly. |
| service.type | string | `"ClusterIP"` |  |
| serviceAccount.annotations | object | `{}` |  |
| serviceAccount.automountServiceAccountToken | bool | `false` |  |
| serviceAccount.create | bool | `true` |  |
| serviceAccount.name | string | `""` |  |
| serviceMonitor.enabled | bool | `false` |  |
| serviceMonitor.labels | object | `{}` |  |
| serviceMonitor.metricsPath | string | `"/metrics"` |  |
| strategy.type | string | `"RollingUpdate"` |  |
| tolerations | list | `[]` |  |
| volumePermissions | object | `{"image":{"pullPolicy":"Always","registry":"docker.io","repository":"bitnami/minideb","tag":"buster"}}` | volumePermissions: Change the owner of the persistent volume mountpoint to RunAsUser:fsGroup |
