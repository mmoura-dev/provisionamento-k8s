# provisionamento-k8s
Desafio de provisionamento de uma infraestrutura Kubernetes com o service mesh Istio.

## Instalando Vagrant
Ubuntu
```bash
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(grep -oP '(?<=UBUNTU_CODENAME=).*' /etc/os-release || lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install vagrant
```
src: https://developer.hashicorp.com/vagrant/install

## Instalando Virtualbox
https://www.virtualbox.org/wiki/Linux_Downloads

## Instalando kubectl
Windows
```posh
winget install -e --id Kubernetes.kubectl
https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/#install-nonstandard-package-tools
```
src: https://kubernetes.io/docs/tasks/tools/#kubectl

## [Opcional] Instalando k9s
https://github.com/derailed/k9s/releases/tag/v0.50.18

## Comando de teste do cluster
kubectl --kubeconfig shared/k3s.yaml -o wide get nodes

## Download do binário do fluxcd
https://github.com/fluxcd/flux2/releases/tag/v2.8.6

## Configuração do fluxcd com repositório no GitHub
https://fluxcd.io/flux/installation/bootstrap/github/

Fork the repo, create a [GitHub fine-grained PAT](https://fluxcd.io/flux/installation/bootstrap/github/#github-pat), create the env below with it:
`export GITHUB_TOKEN=<gh-token>`

Run the bootstrap:
```
flux bootstrap github \
  --token-auth \
  --owner=my-github-username \
  --repository=my-repository-name \
  --branch=main \
  --path=clusters/my-cluster \
  --personal
```
Exemplo:
`flux bootstrap github --token-auth --owner=mmoura-dev --repository=provisionamento-k8s --branch=main --path=clusters/local-k3s --personal`

Debug network:
`kubectl run test-net --rm -it --image=busybox -- sh`

Flux repository structure as monorepo:
```
├── apps
│   ├── base
│   ├── production 
│   └── staging
├── infrastructure
│   ├── base
│   ├── production 
│   └── staging
└── clusters
    ├── production
    └── staging
```


## Instalação do Istio
Tudo feito no tenant infrastructure do flux.

## Conceitos do Istio

### PeerAuthtentication
PeerAuthentication determines whether or not mTLS is allowed or required for connections to an Envoy proxy sidecar.

Example: Policy to require mTLS traffic for all workloads under namespace foo.
```yaml
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: foo
spec:
  mtls:
    mode: STRICT
```

Mode values:
```
UNSET	-> Inherit from parent, if has one. Otherwise treated as PERMISSIVE
DISABLE	-> Connection is not tunneled
PERMISSIVE -> Connection can be either plaintext or mTLS tunnel
STRICT -> Connection is an mTLS tunnel (TLS with client cert must be presented)
```

### Automatic sidecar injection
Sidecars can be automatically added to applicable Kubernetes pods using a mutating webhook admission controller provided by Istio.
When you set the `istio-injection=enabled` label on a namespace and the injection webhook is enabled, any new pods that are created in that namespace will automatically have a sidecar added to them.

<table><thead><tr><th>Resource</th><th>Label</th><th>Enabled value</th><th>Disabled value</th></tr></thead><tbody><tr><td>Namespace</td><td><code>istio-injection</code></td><td><code>enabled</code></td><td><code>disabled</code></td></tr><tr><td>Pod</td><td><code>sidecar.istio.io/inject</code></td><td><code>"true"</code></td><td><code>"false"</code></td></tr></tbody></table>

### VirtualService and DestinationRule
A VirtualService defines a set of traffic routing rules to apply when a host is addressed. Each routing rule defines matching criteria for traffic of a specific protocol. If the traffic is matched, then it is sent to a named destination service (or subset/version of it) defined in the registry.

The following example on Kubernetes, routes all HTTP traffic by default to pods of the reviews service with label “version: v1”. In addition, HTTP requests with path starting with /wpcatalog/ or /consumercatalog/ will be rewritten to /newcatalog and sent to pods with label “version: v2”.
```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: reviews-route
spec:
  hosts:
  - reviews.prod.svc.cluster.local
  http:
  - name: "reviews-v2-routes"
    match:
    - uri:
        prefix: "/wpcatalog"
    - uri:
        prefix: "/consumercatalog"
    rewrite:
      uri: "/newcatalog"
    route:
    - destination:
        host: reviews.prod.svc.cluster.local
        subset: v2
  - name: "reviews-v1-route"
    route:
    - destination:
        host: reviews.prod.svc.cluster.local
        subset: v1
```

A subset/version of a route destination is identified with a reference to a named service subset which must be declared in a corresponding DestinationRule.
Destination indicates the network addressable service to which the request/connection will be sent after processing a routing rule.
```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: reviews-destination
spec:
  host: reviews.prod.svc.cluster.local
  subsets:
  - name: v1
    labels:
      version: v1
  - name: v2
    labels:
      version: v2
```

### RequestAuthentication and AuthorizationPolicy
RequestAuthentication defines what request authentication methods are supported by a workload. It will reject a request if the request contains invalid authentication information, based on the configured authentication rules.

```yaml
apiVersion: security.istio.io/v1
kind: RequestAuthentication
metadata:
  name: httpbin
  namespace: foo
spec:
  selector:
    matchLabels:
      app: httpbin
  jwtRules:
  - issuer: "issuer-foo"
    jwksUri: https://example.com/.well-known/jwks.json
```

A request that does not contain any authentication credentials will be accepted but will not have any authenticated identity. To restrict access to authenticated requests only, this should be accompanied by an authorization rule.
Require JWT for all request for workloads that have label `app:httpbin`:

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: httpbin
  namespace: foo
spec:
  selector:
    matchLabels:
      app: httpbin
  rules:
  - from:
    - source:
        requestPrincipals: ["*"]
```

### Gateway
Gateway describes a load balancer operating at the edge of the mesh receiving incoming or outgoing HTTP/TCP connections.

```yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: service-1-gateway
  namespace: service-1
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 80
        name: http
        protocol: HTTP
      hosts:
        - "service-1.example.com"
```
