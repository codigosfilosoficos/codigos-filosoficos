---
title: "Blueprint no TryHackMe: de um instalador exposto ao acesso SYSTEM"
description: "Uma análise do CTF Blueprint: reconhecimento com Nmap, exploração do osCommerce, acesso SYSTEM e lições de defesa."
pubDate: "2026-09-22"
category: "laboratorios"
author: "Matheus Ferreira Gagliotti"
tags:
  - TryHackMe
  - Blueprint
  - CTF
  - osCommerce
  - Windows
  - Blue Team
draft: false
featured: false
---


# Blueprint no TryHackMe: de um instalador exposto ao acesso SYSTEM

Por **Matheus Ferreira Gagliotti** · Códigos Filosóficos · Diário de laboratório  
Laboratório realizado em 18 de setembro de 2026, durante o curso de Defesa Cibernética da FIAP.

![Esquema do laboratório: requisições HTTP da AttackBox à porta 8080 e conexão de retorno do alvo ao listener 9001.](/images/blueprint/00-mapa-blueprint.png)

*Mapa do laboratório — As setas distinguem a requisição web da conexão de retorno. Esquema explicativo; as capturas da execução aparecem nas etapas seguintes.*

> Este artigo apresenta parte da resolução da sala [Blueprint, do TryHackMe](https://tryhackme.com/room/blueprint), em um ambiente de laboratório autorizado. Contém spoilers do caminho de exploração; o valor da flag foi omitido.

Quando executei `whoami` na conexão recebida, a resposta foi `nt authority\system`. O acesso obtido pela aplicação web já tinha privilégios elevados no Windows.

Esse resultado é o ponto central do Blueprint que quero registrar aqui. A investigação começou com uma varredura de portas, passou por um instalador do osCommerce acessível e terminou com a leitura de um arquivo no Desktop do Administrador. Não foi necessária uma etapa adicional de escalada local de privilégios.

Neste relato, reconstruo esse caminho com as capturas do laboratório e examino suas implicações para a defesa: o que permitiu a entrada, o que ampliou seu impacto e quais sinais poderiam ajudar a identificar a atividade.

## Reconhecimento: o que estava exposto

O primeiro passo foi identificar os serviços disponíveis no alvo. Naquela execução, a máquina tinha o endereço `10.64.177.187`:

```bash
sudo nmap -p- -sV 10.64.177.187 -vv
```

A opção `-p-` amplia a varredura para as portas de 1 a 65535; nesse comando, a varredura é TCP. A opção `-sV` procura identificar serviços e versões, enquanto `-vv` aumenta os detalhes exibidos durante a execução. A documentação do Nmap explica a [seleção das portas](https://nmap.org/book/man-port-specification.html) e a [detecção de serviços e versões](https://nmap.org/book/man-version-detection.html).

Foram identificadas 13 portas abertas. Algumas ajudaram a caracterizar o ambiente:

| Porta TCP | Serviço identificado |
| --- | --- |
| 80 | Microsoft IIS 7.5 |
| 443 | Apache 2.4.23, com OpenSSL 1.0.2h e PHP 5.6.28 |
| 8080 | Apache 2.4.23, com OpenSSL 1.0.2h e PHP 5.6.28 |
| 3306 | MariaDB |
| 139 e 445 | Serviços de compartilhamento de arquivos do Windows |
| 135 e portas altas | Serviços RPC do Windows |

![Resultado do Nmap com os serviços identificados na máquina Blueprint.](/images/blueprint/01-nmap-servicos.png)

*Figura 1 — O resultado reúne serviços do Windows e servidores web em portas distintas.*

Havia um detalhe que justificava investigar mais de um endereço no navegador: a porta 80 apresentava IIS, enquanto a 8080 apresentava Apache. Examinar apenas a porta 80 deixaria de fora outra aplicação disponível na mesma máquina.

Essas informações orientam a investigação, mas têm limites. Uma porta aberta não comprova uma vulnerabilidade. A identificação do MariaDB também não demonstra que o banco aceita conexões sem autenticação.

## A porta 8080 revelou o instalador

Ao acessar `http://10.64.177.187:8080/`, encontrei uma listagem de diretórios. Entre os itens estava a pasta `oscommerce-2.3.4`.

![Listagem de diretórios na porta 8080, exibindo a pasta oscommerce-2.3.4.](/images/blueprint/02-listagem-diretorios.png)

*Figura 2 — A listagem tornou visível o caminho da aplicação e forneceu uma indicação de sua versão.*

Seguindo essa estrutura, cheguei ao endereço `http://10.64.177.187:8080/oscommerce-2.3.4/catalog/install/`. A página apresentava o instalador do **osCommerce Online Merchant v2.3.4**.

![Interface de instalação do osCommerce Online Merchant v2.3.4 acessível no navegador.](/images/blueprint/03-instalador-oscommerce.png)

*Figura 3 — O diretório de instalação continuava acessível e a interface identificava a versão do produto.*

A listagem facilitou a descoberta. O problema que merecia investigação era a funcionalidade de instalação disponível naquele caminho. Mesmo que os diretórios não fossem listados, ainda seria necessário verificar se o acesso direto ao instalador estava bloqueado.

## De um campo de configuração à execução de PHP

A referência técnica utilizada foi a [prova de conceito EDB-44374, de Simon Scannell](https://www.exploit-db.com/exploits/44374). O registro descreve a falha nas versões 2.3.4 e 2.3.4.1 do osCommerce.

O mecanismo envolve a geração de um arquivo de configuração pelo instalador. O conteúdo enviado no parâmetro `DB_DATABASE` pode introduzir código PHP nesse arquivo. Ao acessar o arquivo gerado, o servidor executa o código inserido. A etapa vulnerável é acessível sem autenticação quando o diretório de instalação permanece disponível.

No laboratório, a sequência documentada envolveu estes dois caminhos:

```text
POST /oscommerce-2.3.4/catalog/install/install.php?step=4
GET  /oscommerce-2.3.4/catalog/install/includes/configure.php
```

O primeiro pedido envia os dados ao instalador. O segundo aciona o arquivo gerado. Essa relação entre entrada de dados, escrita em disco e execução explica como uma requisição web pode resultar em comandos no sistema operacional.

![Esquema da falha: dados enviados ao instalador entram no arquivo de configuração, que pode executar PHP quando acessado.](/images/blueprint/05-mecanismo-php.png)

*Esquema 1 — A sequência conecta a entrada de dados à geração do arquivo e à execução do PHP. Representação explicativa da falha descrita na referência técnica.*

O script utilizado no teste registrou uma resposta HTTP 200. Esse retorno, isoladamente, apenas mostra que houve uma resposta bem-sucedida à requisição. A confirmação do acesso veio na etapa seguinte.

## A conexão reversa confirmou o acesso

Na AttackBox, preparei um listener na porta TCP 9001:

```bash
nc -lvnp 9001
```

Nesse comando, o Netcat aguarda uma conexão. O código executado no alvo iniciou uma conexão de retorno para a AttackBox e disponibilizou uma sessão em PowerShell. É por isso que esse tipo de acesso recebe o nome de *reverse shell*: a conexão parte da máquina comprometida em direção ao listener.

A captura registra a conexão recebida de `10.64.177.187`. Em seguida, executei:

```powershell
whoami
```

O resultado foi:

```text
nt authority\system
```

![Listener recebendo a conexão do alvo e comando whoami retornando nt authority\system.](/images/blueprint/04-sessao-system.png)

*Figura 4 — A conexão recebida e a resposta de `whoami` confirmam a execução de comandos e a identidade da sessão.*

A conta LocalSystem possui privilégios amplos no computador local, conforme a [documentação da Microsoft](https://learn.microsoft.com/en-us/windows/win32/services/localsystem-account). Nesse caso, o código executado a partir da aplicação alcançou diretamente esse contexto. Isso não equivale a demonstrar controle de outras máquinas ou de um domínio.

Também vale observar a diferença entre as portas mostradas no terminal. O listener estava na porta **9001** da AttackBox. A porta **49524**, exibida junto ao endereço do alvo, era a porta de origem daquela conexão de retorno.

O diretório da sessão era `C:\xampp\htdocs\oscommerce-2.3.4\catalog\install\includes`. Esse caminho corroborou a presença do XAMPP e ligou a sessão à estrutura da aplicação investigada.

## Demonstrando o impacto

Com a sessão aberta, listei o Desktop do Administrador e li o arquivo encontrado:

```powershell
ls C:\Users\Administrator\Desktop
Get-Content C:\Users\Administrator\Desktop\root.txt.txt
```

O nome tinha uma dupla extensão: `root.txt.txt`. Usar o nome completo identificado na listagem evitou depender de uma suposição sobre como a flag estaria armazenada.

A evidência do laboratório registra a leitura desse arquivo. Seu conteúdo foi omitido aqui para preservar a resposta do desafio; o resultado relevante para a análise é o acesso demonstrado ao arquivo no perfil do Administrador.

Até esse ponto, a cadeia estava comprovada pelas capturas: serviço web identificado, instalador acessível, conexão recebida, identidade SYSTEM e leitura do arquivo. A investigação apresentada neste artigo se concentra nesse caminho.

## Como eu investigaria essa atividade na defesa

A mesma sequência permite formular hipóteses de detecção. **Os itens abaixo são propostas para uma continuação defensiva do laboratório; não foram validados com logs nesta execução.**

![Esquema de correlação defensiva entre requisições web, criação de processos e conexões de rede.](/images/blueprint/06-correlacao-defensiva.png)

*Esquema 2 — Uma proposta de investigação para um ambiente instrumentado. Estes registros não foram coletados na execução apresentada.*

| Etapa da atividade | Evidência que eu procuraria |
| --- | --- |
| Uso do instalador | Requisições ao caminho `/catalog/install/`, especialmente à etapa 4 da instalação. |
| Acionamento do arquivo gerado | Acesso a `/catalog/install/includes/configure.php` próximo ao horário da requisição anterior. |
| Execução de comandos | Registros de criação de processos que permitam reconstruir a cadeia entre o serviço web e o PowerShell. |
| Conexão de retorno | Uma conexão de saída associada ao processo envolvido, correlacionada com o horário da exploração. |

Os registros de acesso do servidor web ajudariam a investigar os caminhos requisitados. Para examinar processos e conexões, uma possibilidade seria reproduzir o comportamento em um ambiente Windows compatível e instrumentado com Sysmon.

O Sysmon registra criação de processos no evento **1** e pode registrar conexões de rede no evento **3**. O monitoramento de conexões é desativado por padrão e precisa ser habilitado na configuração. Essa coleta teria de estar preparada antes do teste. As capacidades e condições estão descritas na [documentação oficial do Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon).

A investigação precisaria correlacionar esses dados. Uma execução de PowerShell pode fazer parte da administração normal do ambiente. Seu contexto muda quando aparece ligada a requisições ao instalador, à cadeia de processos do servidor web e a uma conexão de saída inesperada.

## Quais medidas interromperiam essa cadeia?

O caso permite separar a correção do ponto de entrada das medidas que limitariam o impacto de uma exploração:

| Condição observada | Medida de defesa |
| --- | --- |
| Instalador vulnerável acessível | Remover ou bloquear o diretório de instalação após a configuração e corrigir ou substituir a versão vulnerável da aplicação. |
| Código alcançando o contexto SYSTEM | Executar o serviço web com uma conta dedicada e privilégios mínimos, revisando permissões de arquivos e recursos. |
| Listagem de diretórios | Desativar a listagem e revisar quais caminhos realmente precisam estar publicados. |
| Geração de código em um arquivo acessível pela web | Corrigir o tratamento dos dados e restringir as permissões de escrita conforme as necessidades da aplicação. |

Uma conta de serviço com menos privilégios não corrigiria a injeção de PHP. Ela reduziria as permissões disponíveis ao código executado. Da mesma forma, desativar a listagem de diretórios não impediria uma requisição direta a um instalador que continuasse publicado.

Essas diferenças ajudam a avaliar cada controle pelo problema que ele efetivamente resolve.

## O que quero levar deste laboratório

O Blueprint aproxima assuntos que às vezes estudo separadamente: portas e serviços, aplicações web, execução de processos e permissões do Windows. A varredura mostrou onde investigar. A aplicação forneceu o ponto de entrada. O contexto de execução determinou o alcance inicial do acesso.

Registrar esse percurso também exige cuidado com as conclusões. O retorno HTTP 200 não tinha o mesmo valor de evidência que uma conexão interativa. A identidade SYSTEM não significava que eu tivesse realizado uma escalada local. Cada resultado precisava ser descrito pelo que demonstrava.

É esse tipo de relação que quero explorar no Diário de laboratório do Códigos Filosóficos: entender o funcionamento do ataque e transformar essa compreensão em perguntas concretas sobre configuração, monitoramento e defesa.

*As quatro capturas de tela são da execução documentada no relatório da atividade. O mapa e os dois esquemas são representações explicativas elaboradas para este artigo. O relatório também indica como material de apoio o [walkthrough de Blueprint publicado por fsocietyhub](https://fsocietyhub.medium.com/blueprint-tryhackme-pwned-from-oscommerce-rce-to-system-flags-a-ctf-walkthrough-2024-2025-56fc352133cf). A prova de conceito original e as documentações técnicas estão creditadas ao longo do texto.*
