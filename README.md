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
