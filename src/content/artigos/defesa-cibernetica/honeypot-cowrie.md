---
title: "Construindo e analisando um Honeypot SSH com Cowrie"
description: "Implementação de um honeypot SSH em uma VPS, coleta de logs em JSON e análise de uma atividade externa de reconhecimento."
pubDate: 2026-06-17
updatedDate: 2026-06-19
category: "Cyber Defense"
author: "Matheus Gagliotti"
tags:
  - Cowrie
  - Honeypot
  - SSH
  - Threat Intelligence
  - Threat Hunting
  - Linux
draft: false
featured: true
---

Serviços expostos à internet podem começar a receber conexões não solicitadas mesmo quando utilizam portas diferentes das convencionais.

Para observar esse comportamento em um ambiente controlado, nosso grupo construiu um honeypot SSH utilizando o **Cowrie**, uma ferramenta capaz de simular um shell interativo e registrar as ações executadas durante cada sessão.

O objetivo não era hospedar um sistema vulnerável real, mas criar uma camada de observação isolada, capaz de coletar dados úteis para análise de logs, Threat Hunting e Cyber Threat Intelligence.

> Os endereços IP, credenciais e outros identificadores foram parcialmente omitidos nesta publicação por razões de privacidade e segurança operacional.

## O que é um honeypot?

Um honeypot é um sistema criado para atrair e registrar atividades potencialmente maliciosas.

Ele pode simular serviços, aplicações ou sistemas completos, oferecendo ao visitante um ambiente aparentemente legítimo enquanto registra eventos como:

- origem das conexões;
- tentativas de autenticação;
- usuários e senhas utilizados;
- comandos executados;
- arquivos enviados ou baixados;
- duração e sequência das sessões.

O Cowrie é classificado como um honeypot de média interação voltado principalmente à emulação de serviços SSH e Telnet.

Em vez de fornecer acesso ao sistema operacional verdadeiro, ele apresenta um shell simulado e registra as interações realizadas nesse ambiente.

## Objetivos do laboratório

O projeto teve como objetivos principais:

- implementar um serviço SSH simulado em uma infraestrutura isolada;
- coletar logs de conexões e autenticações;
- registrar comandos executados após o login;
- diferenciar testes controlados de atividades externas;
- analisar comportamentos iniciais de reconhecimento;
- compreender como os dados poderiam ser utilizados em CTI;
- desenvolver experiência prática em Linux, redes e análise de logs.

## Arquitetura da solução

O ambiente foi construído utilizando uma VPS de baixo custo na DigitalOcean.

A arquitetura utilizada foi:

```text
Internet
    |
    v
VPS Ubuntu Server
    |
    +-- SSH administrativo real
    |
    +-- Cowrie 2.9.19
            |
            +-- Serviço SSH simulado
            +-- Porta 2222/TCP
            +-- Shell falso
            +-- Logs estruturados em JSON
```

A porta `2222/TCP` foi utilizada para evitar conflito com o acesso administrativo real da VPS e para observar se serviços em portas não convencionais também receberiam conexões externas.

O Cowrie foi executado por um usuário próprio, sem privilégios administrativos, reduzindo o impacto de uma eventual falha na aplicação.

O principal arquivo utilizado durante a análise foi:

```text
/home/cowrie/cowrie/var/log/cowrie/cowrie.json
```

## Preparação do servidor

Depois de provisionar a VPS Ubuntu, o sistema foi atualizado:

```bash
sudo apt update
sudo apt upgrade
```

Também foram instaladas as dependências necessárias para o Cowrie:

```bash
sudo apt install \
  git \
  python3-venv \
  python3-pip \
  libssl-dev \
  libffi-dev \
  build-essential \
  libpython3-dev \
  authbind \
  virtualenv
```

Um usuário específico foi criado para executar o honeypot:

```bash
sudo adduser --disabled-password cowrie
sudo su - cowrie
```

A separação entre o usuário administrativo e o usuário do honeypot é importante para limitar privilégios e manter o serviço isolado.

## Instalação do Cowrie

O repositório do projeto foi clonado:

```bash
git clone https://github.com/cowrie/cowrie
cd cowrie
```

Em seguida, foi criado um ambiente virtual Python:

```bash
python3 -m venv cowrie-env
source cowrie-env/bin/activate
```

As dependências foram instaladas com `pip`:

```bash
python -m pip install --upgrade pip
python -m pip install --upgrade -r requirements.txt
```

A configuração padrão foi copiada para um arquivo editável:

```bash
cp etc/cowrie.cfg.dist etc/cowrie.cfg
```

Na versão utilizada durante o projeto, foi necessário instalar o Cowrie como pacote editável:

```bash
python -m pip install -e .
```

O serviço foi iniciado diretamente pelo Twisted:

```bash
twistd \
  --umask=0022 \
  --pidfile=var/run/cowrie.pid \
  cowrie
```

A inicialização apresentou as mensagens:

```text
Cowrie Version 2.9.19
CowrieSSHFactory starting on 2222
Ready to accept SSH connections
```

Esses registros confirmaram que o honeypot estava operacional e aguardando conexões.

## Validação controlada

Antes de analisar qualquer atividade externa, foi realizado um teste controlado a partir de um computador autorizado.

A conexão foi feita utilizando o cliente SSH:

```bash
ssh root@IP_DA_VPS -p 2222
```

O Cowrie apresentou um shell falso, semelhante a um servidor Linux real.

Durante a validação, foram executados comandos como:

```bash
clear
ls
pwd
whoami
ls /etc/
ls /etc/os-release
sudo apt update
exit
```

Todos os comandos apareceram posteriormente no arquivo `cowrie.json`.

Essa etapa foi importante para confirmar três pontos:

1. o serviço estava acessível externamente;
2. o shell simulado estava funcionando;
3. os eventos estavam sendo registrados corretamente.

## Coleta e análise dos logs

O Cowrie armazena seus eventos em formato JSON, registrando cada ação com um identificador específico.

Para verificar o volume total do arquivo:

```bash
wc -l var/log/cowrie/cowrie.json
```

Para contar sessões iniciadas:

```bash
grep '"eventid":"cowrie.session.connect"' \
  var/log/cowrie/cowrie.json |
  wc -l
```

Para extrair e contar os endereços IP de origem:

```bash
grep '"eventid":"cowrie.session.connect"' \
  var/log/cowrie/cowrie.json |
  sed -n 's/.*"src_ip":"\([^"]*\)".*/\1/p' |
  sort |
  uniq -c |
  sort -nr
```

Para consultar autenticações aceitas pelo honeypot:

```bash
grep '"eventid":"cowrie.login.success"' \
  var/log/cowrie/cowrie.json
```

Para extrair comandos executados:

```bash
grep '"eventid":"cowrie.command.input"' \
  var/log/cowrie/cowrie.json
```

Também foi utilizada uma pipeline para contar os comandos mais frequentes:

```bash
grep '"eventid":"cowrie.command.input"' \
  var/log/cowrie/cowrie.json |
  sed -n 's/.*"input":"\([^"]*\)".*/\1/p' |
  sort |
  uniq -c |
  sort -nr
```

Esse tipo de processamento permite transformar um arquivo extenso de eventos JSON em informações mais fáceis de interpretar.

## Atividade externa observada

Depois da validação controlada, o honeypot registrou uma origem externa que não fazia parte do teste.

Os dados observados foram:

- duas sessões associadas à mesma origem externa;
- tentativa de utilização do usuário `root`;
- autenticação simulada pelo Cowrie;
- execução dos comandos `ls`, `whoami` e `history`.

Os comandos registrados foram:

```bash
ls
whoami
history
```

Essa sequência é compatível com uma etapa inicial de enumeração.

O comando `ls` procura identificar arquivos disponíveis no diretório atual.

O comando `whoami` verifica qual identidade o sistema atribuiu à sessão.

Já o comando `history` procura descobrir comandos anteriormente executados naquele ambiente.

Esses eventos, isoladamente, não permitem determinar quem estava por trás da conexão nem provar uma intenção específica. Entretanto, demonstram que a origem externa interagiu com o shell e tentou compreender o ambiente apresentado.

## Sobre a origem da conexão

Uma consulta de geolocalização associou o endereço observado a uma conexão residencial brasileira.

Entretanto, geolocalização de IP deve ser interpretada com cautela.

Ela pode indicar:

- o provedor responsável pelo bloco de endereços;
- uma região aproximada;
- o ASN associado à conexão.

Ela não permite identificar com segurança uma pessoa, residência ou localização física exata.

Também existem outras possibilidades, como:

- endereço IP dinâmico;
- VPN;
- proxy;
- equipamento comprometido;
- rede compartilhada;
- infraestrutura utilizada por terceiros.

Por esse motivo, o endereço completo e os detalhes de geolocalização não são publicados neste artigo.

## Aplicação em Cyber Threat Intelligence

Os registros coletados por um honeypot podem ser utilizados para enriquecer atividades de CTI.

Entre os dados potencialmente úteis estão:

- endereços que realizam varreduras ou tentativas de conexão;
- usuários e senhas frequentemente testados;
- horários e frequência das sessões;
- comandos executados após o acesso;
- URLs e arquivos baixados;
- padrões de automação;
- ferramentas ou scripts utilizados.

Esses dados podem apoiar:

- criação de regras de detecção;
- enriquecimento de alertas em SIEM;
- geração de indicadores de comprometimento;
- bloqueios temporários em firewall;
- investigação de campanhas;
- desenvolvimento de hipóteses de Threat Hunting.

Um endereço IP isolado, porém, não deve ser classificado permanentemente como malicioso sem contexto adicional. Endereços podem ser dinâmicos, compartilhados ou pertencer a máquinas comprometidas.

## Lições de segurança

O laboratório reforçou algumas práticas importantes.

### Isolamento

O honeypot deve permanecer separado de ambientes pessoais, acadêmicos ou corporativos.

Ele não deve possuir acesso direto a sistemas críticos ou informações reais.

### Privilégio mínimo

A aplicação deve ser executada por um usuário dedicado e sem privilégios administrativos.

### Monitoramento contínuo

Logs precisam ser revisados e, quando possível, enviados para armazenamento externo ou para um SIEM.

### Credenciais fortes

Serviços SSH reais devem utilizar chaves criptográficas, autenticação multifator quando disponível e políticas adequadas de acesso.

### Atualizações

O sistema operacional, o Cowrie e suas dependências devem permanecer atualizados.

### Portas não convencionais

Alterar a porta padrão pode reduzir parte do ruído automatizado mais simples, mas não representa uma proteção efetiva.

Varreduras completas conseguem encontrar serviços em outras portas. A segurança precisa depender de autenticação, segmentação, monitoramento e controle de acesso.

## Limitações do experimento

A coleta foi realizada durante um período curto.

Além do teste controlado, foi analisada apenas uma origem externa, associada a duas sessões.

Isso significa que os resultados são exploratórios e não podem ser generalizados para representar todo o cenário de ataques contra serviços SSH.

Também não foram observados, durante o período analisado:

- downloads de malware;
- persistência;
- movimentação lateral;
- exploração de vulnerabilidades;
- grande volume de força bruta;
- campanhas coordenadas.

Apesar dessas limitações, o experimento foi suficiente para validar tecnicamente o honeypot e demonstrar a coleta de uma interação externa real.

## Conclusão

A implementação do Cowrie demonstrou como um ambiente simples e isolado pode produzir dados relevantes para segurança defensiva.

O projeto permitiu acompanhar todo o ciclo:

1. provisionamento da infraestrutura;
2. instalação e configuração do honeypot;
3. validação controlada;
4. coleta de eventos;
5. análise dos logs;
6. diferenciação entre teste e atividade externa;
7. interpretação dos comandos;
8. aplicação dos resultados em CTI.

A principal conclusão não é apenas que serviços expostos recebem conexões indesejadas.

O maior valor está na capacidade de registrar, organizar e interpretar essas interações de forma segura, transformando atividade bruta em conhecimento útil para detecção e defesa.

## Créditos

Este artigo foi adaptado de um projeto acadêmico desenvolvido pelo Grupo 7:

- Matheus Ferreira Gagliotti;
- Cauã Massi Gallo de Oliveira;
- Felipe Rodrigues dos Santos;
- Daniel Felipe Cavalcanti Fernandes;
- Yohan Pietro Zilli Nunes.

A adaptação, revisão técnica e publicação no Códigos Filosóficos foram realizadas por Matheus Gagliotti.
