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
