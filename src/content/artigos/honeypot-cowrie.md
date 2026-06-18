---
title: "Construindo e analisando um Honeypot SSH com Cowrie"
description: "Como configurei uma VPS exposta à internet para observar ataques automatizados contra serviços SSH."
pubDate: 2026-06-18
category: "Cyber Thereat inteligence"
author: "Matheus Gagliotti"
tags:
  - Cowrie
  - Honeypot
  - SSH
  - Threat Intelligence
draft: false
featured: true
---

Serviços SSH expostos à internet começam a receber tentativas de acesso em pouco tempo. Para observar esse comportamento de maneira controlada, construí um honeypot utilizando o **Cowrie**.

## O que é um honeypot?

Um honeypot é um sistema preparado para atrair, registrar e estudar atividades potencialmente maliciosas.

Em vez de hospedar informações reais, ele simula um ambiente vulnerável e registra as ações realizadas pelos visitantes.

## Objetivo do projeto

O objetivo do laboratório foi coletar informações como:

- endereços IP de origem;
- usuários e senhas utilizados;
- comandos executados;
- duração das sessões;
- arquivos baixados pelos atacantes;
- padrões de ataques automatizados.

## Ambiente utilizado

O laboratório foi construído com:

- uma VPS Ubuntu;
- Cowrie;
- Python;
- ambiente virtual;
- logs estruturados em JSON;
- ferramentas Linux para análise dos eventos.

## Primeiras observações

Pouco tempo depois de expor o serviço, começaram a aparecer tentativas automatizadas de autenticação.

Entre os comportamentos registrados estavam tentativas de identificar o sistema, listar arquivos, verificar permissões e baixar novos artefatos.

```bash
ls
pwd
whoami
uname -a
```

Esses comandos ajudam o atacante a compreender o ambiente antes de executar outras ações.

## Análise dos registros

O Cowrie armazena eventos em formato JSON, permitindo filtrar sessões, endereços IP, credenciais e comandos.

Exemplo de consulta:

```bash
grep '"eventid":"cowrie.command.input"' \
  var/log/cowrie/cowrie.json
```

Esse formato permite posteriormente integrar os registros com ferramentas de análise, dashboards e plataformas de inteligência de ameaças.

## Conclusão

O experimento demonstrou que qualquer serviço exposto publicamente pode começar a receber tráfego malicioso rapidamente.

Além do aprendizado técnico, o honeypot permite observar técnicas reais utilizadas por bots e atacantes sem colocar um servidor de produção em risco.

Este artigo será atualizado com estatísticas, capturas de tela e novas descobertas obtidas durante o período de monitoramento.
