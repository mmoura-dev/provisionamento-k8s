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

#### Políticas Aplicadas

- **JWT** é validado no ingresso externo via `RequestAuthentication` nos namespaces `service-1` e 
  `service-3`.
- **mTLS** é imposto via `PeerAuthentication` em modo `STRICT` nos três namespaces — nenhuma conexão
  plaintext é aceita.
- **Identidade de serviço** é usada nas `AuthorizationPolicy` pelo campo `source.principals`, que 
  referencia a `ServiceAccount` do pod no formato 
  `cluster.local/ns/<namespace>/sa/<service-account>`.

### Como gerar o token JWT e como o JWKS foi configurado

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
