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
| Serviço   | Namespace   | Exposição    | JWT | mTLS | AuthorizationPolicy                                                                                                  |
|-----------|-------------|--------------|-----|------|----------------------------------------------------------------------------------------------------------------------|
| service-1 | `service-1` | LoadBalancer | ✅ | ✅   | Permite apenas JWTs issued por `https://desafio-devops-pleno.rio/*`                                                  |
| service-2 | `service-2` | ClusterIP    | ❌ | ✅   | Permite apenas mTLS do `service-1` via `source.principals`                                                           |
| service-3 | `service-3` | LoadBalancer | ✅ | ✅   | Bloqueia o tráfego dos outros serviços, mas permite tráfego com JWTs issued por `https://desafio-devops-pleno.rio/*` |


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

### Comandos de validação de cada critério de avaliação
| Critério                                                                                        | Peso  |
| ----------------------------------------------------------------------------------------------- | ----- |
| Cluster funcional com os 3 nós em estado `Ready`                                                | Alto  |
| `PeerAuthentication` em modo `STRICT` nos três namespaces                                       | Alto  |
| `VirtualService` e `DestinationRule` configurados corretamente                                  | Alto  |
| `service-1` acessível externamente com JWT e roteando para `service-2` via mTLS                 | Alto  |
| `service-2` acessível apenas pelo `service-1` via `AuthorizationPolicy` com `source.principals` | Alto  |
| `service-3` acessível externamente com JWT e isolado de outros serviços da malha                | Alto  |
| Três cenários de JWT demonstrados para cada serviço externo                                     | Alto  |
| Reprodutibilidade: conseguimos replicar do zero seguindo o README                               | Alto  |
| Qualidade e clareza da documentação (arquitetura, namespaces, políticas de identidade)          | Alto  |
| Justificativa das escolhas técnicas                                                             | Médio |
| Organização do repositório                                                                      | Médio |

### Justificativa de decisões não triviais
- versão do k3s
- CNI
- escopo do PeerAuthentication
- algoritmo JWT
- respostas do nginx

### Descrição da métrica escolhida para o autoscaling
Incluindo script k6 utilizado e demonstração do scale-up/down.
