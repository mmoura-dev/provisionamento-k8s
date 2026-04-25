# README

## Requisito 6 - Documentação

### Justificativa da ferramenta de provisionamento escolhida
Dentre as ferramentas permitidas para provisionamento, escolhi trabalhar com o Vagrant + VirtualBox.
Essa decisão foi baseada em dois critérios: familiaridade com a ferramenta e
compatibilidade com o ambiente de desenvolvimento.

O primeiro critério é a familiaridade. Entre as opções disponíveis, esta foi a única que já havia
sido utilizada anteriormente. Logo, me sinto mais confortável com ela, pois conheço alguns de seus 
problemas mais comuns como a compatibilidade de versões. Além disso, levei em consideração que a 
familiaridade me pouparia tempo, dado que teria uma semana para o desafio, este fator também foi 
bastante relevante.

Meu segundo critério foi baseado nos meus possíveis ambientes de desenvolvimento. Costumo utilizar
Linux nos PCs pessoais que faço algum tipo de desenvolvimento e atualmente uso um notebook com
recursos consideravelmente limitados. Então, como o desafio pede três máquinas virtuais, considerei
que seria necessário usar um desktop Windows que tenho, mas com a possibilidade de precisar
desenvolver em ambos os ambientes e por experiência sei que não teria problemas com isso usando
Vagrant + VirtualBox.

### Descrição da Arquitetura

#### Nós
Fiz o provisionamento de três nós, um control-plane `k3s-cp-1` e os nós agentes `k3s-agent-1` e
`k3s-agent-2`, nos quais utilizei a versão mais recente do Ubuntu que tinha disponível como box do
Vagrant (o `ubuntu/jammy64`). Sobre provisionamento de recursos, os nós agentes funcionaram bem com
1 core e 1 GB de memória, enquanto o nó control-plane precisou de um upgrade, indo de 2 cores e 2 GB
para 3 cores e 4 GB de memória. Acredito que o upgrade do control-plane tenha sido um pouco além do
necessário, mas como tinha os recursos disponíveis, optei por não gastar mais tempo no problema. 

#### Namespaces e Serviços
Nesse ponto apenas segui o especificado, três serviços, cada um no seu namespace.
| Serviço   | Namespace   | Exposição    | AuthorizationPolicy                                                                                                  |
|-----------|-------------|--------------|----------------------------------------------------------------------------------------------------------------------|
| service-1 | `service-1` | LoadBalancer | Permite apenas JWTs issued por `https://desafio-devops-pleno.rio/*`                                                  |
| service-2 | `service-2` | ClusterIP    | Permite apenas mTLS do `service-1` via `source.principals`                                                           |
| service-3 | `service-3` | LoadBalancer | Bloqueia o tráfego dos outros serviços, mas permite tráfego com JWTs issued por `https://desafio-devops-pleno.rio/*` |


#### Fluxo de Tráfego
![Fluxograma das etapas que a malha de serviço realiza para validação, autenticação e autorização de
requisições externas.](istio-flux.png)

1. Primeiramente as requisições externas vão para o load balancer ingressgateway. O
Gateway avalia o `Host:` header contra os `hosts` declarados no `gateway.yaml`. Se não houver match,
a requisição é descartada com 404 antes de qualquer outra checagem.

2. Depois os VirtualServices (`virtual-service.yaml`) define para onde o tráfego vai, dado um 
conjunto de hosts, destine o tráfego para tais serviços.

3. O RequestAuthentication (`request-authorization.yaml`) é a próxima etapa, a qual se token JWT da
requisição é válido, neste caso usando o JWKS para verificar a assinatura.

4. AuthorizationPolicy (`authorization-policy.yaml`) define os critérios para autorizar a
requisição. Por exemplo, para comunicação externa definimos que os serviços 1 e 3 precisam que os 
JWT sejam issue pelo domínio `https://desafio-devops-pleno.rio/*`.

5. Por fim, o DestinationRule (`destination-rule.yaml`) define como a comunicação entre os proxies
Envoy são feitas, incluindo o modo TLS. O ISTIO_MUTUAL ativa o mTLS com o certificado emitido pelo
Istio CA. Porém, a obrigatoriedade de comunicação mTLS no namespace é definida no PeerAuthentication
(`peer-authentication.yaml`).

#### Políticas Aplicadas

- **JWT** é validado no ingresso externo via `RequestAuthentication` nos namespaces `service-1` e 
  `service-3`.
- **mTLS** é imposto via `PeerAuthentication` em modo `STRICT` nos três namespaces — nenhuma conexão
  plaintext é aceita.
- **Identidade de serviço** é usada nas `AuthorizationPolicy` pelo campo `source.principals`, que 
  referencia a `ServiceAccount` do pod no formato 
  `cluster.local/ns/<namespace>/sa/<service-account>`.

### Como gerar o token JWT e como o JWKS foi configurado
A ferramenta utilizada para gerar o JWKS e o JWT foi o
[step-cli](https://smallstep.com/docs/step-cli/installation/).

#### Como gerar o JWKS
Gere os arquivos com as chaves pública e privada usando o seguinte comando:
```
step crypto jwk create jwk.pub.json jwk.json --kty EC --crv P-256 --use sig --alg ES256 --kid test-key
```

Transforme o arquivo para o formato comprimido:
```pwsh
$jwk = Get-Content jwk.pub.json -Raw | ConvertFrom-Json
$jwks = @{ keys = @($jwk) } | ConvertTo-Json -Compress
$jwks
```
```bash
cat <<EOF > jwks.json
{
  "keys": [
    $(cat jwk.pub.json)
  ]
}
EOF
JWKS=$(cat jwks.json | jq -c .)
echo $JWKS
```

#### Como configurar a chave JWKS
Por simplicidade, optei por configurar as chaves hardcoded nos yamls RequestAuthentication abaixo,
mas tenho noção que em um ambiente de produção a escolha correta seria expor a chave via um servidor
web.

- `apps\base\service-1\request-authentication.yaml`
- `apps\base\service-3\request-authentication.yaml`

#### Como gerar o token JWT
Pelo mesmo critério da última etapa, optei por usar a flag `--subtle` ao gerar o JWT, ao invés de
configurar a flag de audiência.
```
step crypto jwt sign --key jwk.json --iss "https://desafio-devops-pleno.rio" --sub "user123" --kid test-key --subtle
```

### Passo a passo reproduzível do zero (assumindo máquina limpa)

#### Antes de começar

Instale as seguintes ferramentas na sua máquina:

* [Git 2.53.0](https://git-scm.com/install/)
* [Vagrant 2.4.9](https://developer.hashicorp.com/vagrant/install)
* [VirtualBox 7.2.6](https://www.virtualbox.org/wiki/Downloads)
* [kubectl v1.35.4](https://kubernetes.io/docs/tasks/tools/#kubectl)
* [FluxCD v2.8.6](https://fluxcd.io/flux/installation/)
* [step-cli 0.30.2](https://smallstep.com/docs/step-cli/installation) — para gerar chaves e tokens JWT
* [k6 v1.7.1](https://grafana.com/docs/k6/latest/set-up/install-k6/)
* *(Opcional)* [k9s v0.50.18](https://k9scli.io/topics/install/) — TUI para inspecionar o cluster
* *(Opcional)* [Extensão "REST Client" no VSCode (humao.rest-client)](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)

#### Passo 0: Fork do repositório
Optei pelo uso da ferramenta de GitOps FluxCD integrada com um repositório público no GitHub, como 
forma de demonstrar meu conhecimento da abordagem. Entretanto, um implicação dessa escolha é a 
necessidade de GitHub PAT para que o FluxCD rodando dentro do cluster realize um commit no 
repositório durante sua etapa de bootstrap. Isso leva a necessidade de quem está performando esses
passos de ser dono do repositório, para assim ser capaz de gerar um GitHub PAT com permissão de 
escrita.

> [Faça um fork do repositório aqui!](https://github.com/mmoura-dev/provisionamento-k8s/fork)

#### Passo 1: Clone o repositório localmente
```bash
git clone https://github.com/{SEU_USUARIO}/{SEU_REPOSITORIO}.git
cd {SEU_REPOSITORIO}
```

#### Passo 2: Provisionamento dos nós
Nessa etapa o Vagrant se encarrega de subir as máquinas virtuais no VirtualBox e instalar o k3s nelas.

```bash
vagrant up
```

Valide que os nós foram provisionados corretamente com o seguinte comando:
```bash
kubectl --kubeconfig shared/k3s.yaml -o wide get nodes
```

Exemplo de saída esperada:
```bash
NAME          STATUS   ROLES           AGE     VERSION
k3s-agent-1   Ready    <none>          2m7s    v1.34.6+k3s1
k3s-agent-2   Ready    <none>          75s     v1.34.6+k3s1
k3s-cp-1      Ready    control-plane   3m16s   v1.34.6+k3s1
```

#### Passo 3: Inicialização do FluxCD no cluster
Crie a variável de ambiente stub abaixo para que o comando de bootstrap não trave.

Windows:
```pwsh
$GITHUB_TOKEN="stub"
```

Linux:
```bash
export GITHUB_TOKEN="stub"
```

Execute o bootstrap do FluxCD:
```bash
flux bootstrap github --token-auth --owner=mmoura-dev --repository=provisionamento-k8s --branch=main --path=clusters/local-k3s --personal --kubeconfig=shared/k3s.yaml
```

Valide o bootstrap do FluxCD com o comando abaixo:
```bash
kubectl get kustomizations.kustomize.toolkit.fluxcd.io -A --kubeconfig=shared/k3s.yaml
```

Exemplo de saída esperada:
```bash
NAMESPACE     NAME             AGE   READY   STATUS
flux-system   apps             12m   True    Applied revision: main@sha1:a4bd0f955e3e8bc67a88e6819624e641ece49ca7
flux-system   flux-system      13m   True    Applied revision: main@sha1:a4bd0f955e3e8bc67a88e6819624e641ece49ca7
flux-system   infrastructure   12m   True    Applied revision: main@sha1:a4bd0f955e3e8bc67a88e6819624e641ece49ca7
```

Fim! O FluxCD se encarrega de instalar todo o resto. O próximo passo é a validação dos requisitos.

##### 🐶 k9s
Por ser mais fácil, a partir desse ponto recomendo que a visualização do cluster seja feita usando o
k9s.

```bash
k9s --kubeconfig shared/k3s.yaml
```

### Comandos de validação de cada critério de avaliação

Crie as seguintes variáveis de ambiente com token JWT a qual será utilizada no envio das requisições `curl` e um token inválido para testar a autorização.

Windows:
```pwsh
$JWT_TOKEN="eyJhbGciOiJFUzI1NiIsImtpZCI6InRlc3Qta2V5IiwidHlwIjoiSldUIn0.eyJpYXQiOjE3NzY5NTEzMTcsImlzcyI6Imh0dHBzOi8vZGVzYWZpby1kZXZvcHMtcGxlbm8ucmlvIiwianRpIjoiNmUyYjNkMmQzNTNmZjM5N2Y1YjNhYzZiM2YxNDRiZTI5NDE0NzNjMjBhZWQ0MzA1OGJiNTAzN2IxYTUwYzQwOSIsIm5iZiI6MTc3Njk1MTMxNywic3ViIjoidXNlcjEyMyJ9.pTe_qj7njjnbU6I4rtDYxsIKOsZztFeA2OJkiC-mHTQwMHVEZ4BPTDqM0S1ANnvszULCTgM2HhN22GgjOB50LQ"
$INVALID_JWT="eyJhbGciOiJFUzI1NiIsImtpZCI6InRlc3Qta2V5IiwidHlwIjoiSldUIn0.eyJpYXQiOjE3NzcxNDU1NTQsImlzcyI6Imh0dHBzOi8vZGVzYWZpby1kZXZvcHMtcGxlbm8ucmlvIiwianRpIjoiODQ2MTgzYTVlYmU1YmIxODQ5NTRhMTdkNDMxZjE5NWFlZTliMzE5ZWExNmIyMjVhMDRjY2IwOTE3YTM2ZjE1OCIsIm5iZiI6MTc3NzE0NTU1NCwic3ViIjoidXNlcjEyMyJ9.umqoxykh7YC2EjTTuxIPn3ZuXtJU9Ci840sGIJi_gYiM2zw1BdDvzX7EVFPYuxXDZ2nMkTzlgbaIxqmdq8StBA"
```

Linux:
```bash
export JWT_TOKEN="eyJhbGciOiJFUzI1NiIsImtpZCI6InRlc3Qta2V5IiwidHlwIjoiSldUIn0.eyJpYXQiOjE3NzY5NTEzMTcsImlzcyI6Imh0dHBzOi8vZGVzYWZpby1kZXZvcHMtcGxlbm8ucmlvIiwianRpIjoiNmUyYjNkMmQzNTNmZjM5N2Y1YjNhYzZiM2YxNDRiZTI5NDE0NzNjMjBhZWQ0MzA1OGJiNTAzN2IxYTUwYzQwOSIsIm5iZiI6MTc3Njk1MTMxNywic3ViIjoidXNlcjEyMyJ9.pTe_qj7njjnbU6I4rtDYxsIKOsZztFeA2OJkiC-mHTQwMHVEZ4BPTDqM0S1ANnvszULCTgM2HhN22GgjOB50LQ"
export INVALID_JWT="eyJhbGciOiJFUzI1NiIsImtpZCI6InRlc3Qta2V5IiwidHlwIjoiSldUIn0.eyJpYXQiOjE3NzcxNDU1NTQsImlzcyI6Imh0dHBzOi8vZGVzYWZpby1kZXZvcHMtcGxlbm8ucmlvIiwianRpIjoiODQ2MTgzYTVlYmU1YmIxODQ5NTRhMTdkNDMxZjE5NWFlZTliMzE5ZWExNmIyMjVhMDRjY2IwOTE3YTM2ZjE1OCIsIm5iZiI6MTc3NzE0NTU1NCwic3ViIjoidXNlcjEyMyJ9.umqoxykh7YC2EjTTuxIPn3ZuXtJU9Ci840sGIJi_gYiM2zw1BdDvzX7EVFPYuxXDZ2nMkTzlgbaIxqmdq8StBA"
```

> No Windows a melhor maneira de usar `curl` é por meio do Git Bash, o qual é instalado junto com o
> Git.

#### Cluster funcional com os 3 nós em estado `Ready`
Valide que os nós foram provisionados corretamente com o seguinte comando:
```bash
kubectl --kubeconfig shared/k3s.yaml -o wide get nodes
```

Exemplo de saída esperada:
```bash
NAME          STATUS   ROLES           AGE     VERSION
k3s-agent-1   Ready    <none>          2m7s    v1.34.6+k3s1
k3s-agent-2   Ready    <none>          75s     v1.34.6+k3s1
k3s-cp-1      Ready    control-plane   3m16s   v1.34.6+k3s1
```

#### `service-1` acessível externamente com JWT

##### Requisição com JWT:
```bash
curl --request GET --url http://192.168.56.10/get --header "authorization: Bearer $JWT_TOKEN" --header 'host: service-1.example.com' -w "\n%{http_code}"
```
Código de saída esperado: 200 - OK

##### Requisição com JWT inválido:
```bash
curl --request GET --url http://192.168.56.10/get --header "authorization: Bearer $INVALID_JWT" --header 'host: service-1.example.com' -w "\n%{http_code}"
```
Código de saída esperado: 401 - Unauthorized

##### Requisição sem JWT:
```bash
curl --request GET --url http://192.168.56.10/get --header 'host: service-1.example.com' -w "\n%{http_code}"
```
Código de saída esperado: 403 - Forbidden


#### `service-2` acessível apenas pelo `service-1` via `AuthorizationPolicy` com `source.principals`

##### Requisição direta ao `service-2`:
```bash
curl --request GET --url http://192.168.56.10/get --header "authorization: Bearer $JWT_TOKEN" --header 'host: service-2.example.com' -w "\n%{http_code}"
```
Código de saída esperado: 404 - Not Found

##### Requisição ao `service-2` via proxy do `service-1`:
```bash
curl --request GET --url http://192.168.56.10/proxy/ --header "authorization: Bearer $JWT_TOKEN" --header 'host: service-1.example.com' -w "\n%{http_code}"
```
Código de saída esperado: 200 - OK

##### Requisição ao `service-2` via proxy do `service-1` com JWT inválido:
```bash
curl --request GET --url http://192.168.56.10/proxy/ --header "authorization: Bearer $INVALID_JWT" --header 'host: service-1.example.com' -w "\n%{http_code}"
```
Código de saída esperado: 401 - Unauthorized

##### Requisição ao `service-2` via proxy do `service-1` sem JWT:
```bash
curl --request GET --url http://192.168.56.10/proxy/ --header 'host: service-1.example.com' -w "\n%{http_code}"
```
Código de saída esperado: 403 - Forbidden


#### `service-3` acessível externamente com JWT

##### Requisição com JWT:
```bash
curl --request GET --url http://192.168.56.10/get --header "authorization: Bearer $JWT_TOKEN" --header 'host: service-3.example.com' -w "\n%{http_code}"
```
Código de saída esperado: 200 - OK

##### Requisição com JWT inválido:
```bash
curl --request GET --url http://192.168.56.10/get --header "authorization: Bearer $INVALID_JWT" --header 'host: service-3.example.com' -w "\n%{http_code}"
```
Código de saída esperado: 401 - Unauthorized

##### Requisição sem JWT:
```bash
curl --request GET --url http://192.168.56.10/get --header 'host: service-3.example.com' -w "\n%{http_code}"
```
Código de saída esperado: 403 - Forbidden


#### Três cenários de JWT demonstrados para cada serviço externo

### Justificativa de decisões não triviais
| Decisão                                | Justificativa |
|----------------------------------------|---------------|
| k3s versão `v1.34.6+k3s1`              | Deixei o instalador livre para escolher a versão mais recente ao criar o cluster, para ter o máximo de tempo possível com uma versão em linha. |
| CNI padrão do k3s (Flannel)            | A menos que houvesse incompatibilidade, não havia necessidade de CNI customizado. |
| `PeerAuthentication` por namespace     | Garante STRICT em todo o namespace sem exceção por porta ou workload, conforme requisito. |
| Algoritmo ECDSA P-256 para JWT         | Acredito que algoritmos de curvas elípticas sejam o estado da arte para assinaturas digitais. |
| JWKS inline no `RequestAuthentication` | Elimina dependência de servidor de identidade externo, adequado para ambiente volátil. |
| `httpbin` e `nginx` para os serviços   | Acatei o `httpbin` por simplicidade, mas também precisei usar o `nginx` para fazer o proxy entre o serviço 1 e 2 com mTLS e porque ele tem um helm chart popular para atender o requisito de serviço 2. |
| `ServiceAccount` nomeada por serviço   | Necessária para `source.principals` únicos. |
| GitOps usando Fluxcd                   | Vejo GitOps como o estado da arte para administração de clusters Kubernetes, portanto optei demonstrar meu conhecimento utilizando a ferramenta que domino.|

### Descrição da métrica escolhida para o autoscaling
O arquivo `apps\base\service-3\scaled-object.yaml` configura o KEDA para escalar o serviço 3 com
base em requisições por segundo, considerando dados do último minuto.

O script do k6 utilizado é o `k6.js`, presente na raiz do repositório e pode ser utilizado para
forçar o scale-up do serviço 3 com o seguinte comando `k6 run k6.js`
([crie uma variável de ambiente com o token JWT antes](#comandos-de-validação-de-cada-critério-de-avaliação)).


### Estrutura de um monorepositório FluxCD
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

- A pasta clusters deve haver uma pasta para cada cluster controlado pelo repositório e dentro da
pasta de cada cluster tem as configurações do FluxCD nele e a definição de quais *inquilinos* devem
ser aplicados.

- *Inquilinos* é como o FluxCD se refere a um conjunto de aplicações e suas configurações agrupados
em uma pasta, neste repositório temos dois *inquilinos*, a pasta `apps` e a pasta `infrastructure`.

- A pasta `infrastructure` é uma convenção, um *inquilino* para serviços auxiliares do cluster, os
quais normalmente são gerenciados pelos administradores do cluster. Neste repositório é onde estão
definidos o Istio, Keda e Prometheus/Grafana.

- A pasta `apps` é onde defini os serviços 1, 2 e 3, os quais são a principal carga de trabalho do
cluster.

> A estrutura de uma pasta *inquilina* também segue uma convenção, onde definimos uma pasta `base`
> para tudo aquilo que será comum e uma outra pasta
> para cada cluster onde o inquilino é aplicado. De tal modo que a pasta específica para o cluster
> seja aplicada como uma camada acima da pasta `base`, dessa forma ela é capaz de sobrescrever
> configurações e atender qualquer especificidade daquele ambiente.