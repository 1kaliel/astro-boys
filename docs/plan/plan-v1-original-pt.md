# NASA Space Apps 2026 — Plano de execução da equipe

> Documento de trabalho para uma equipe de 6 pessoas — versão 1.0  
> Duração planejada: 48 horas  
> Tema do projeto: harmonização de detecções MODIS/VIIRS, calendário histórico de queimadas e identificação de períodos críticos

## 1. Como usar este documento

Este arquivo é a referência central da equipe durante o hackathon. Atualizem os responsáveis, decisões, links e status no próprio documento ou no quadro de tarefas escolhido.

Legenda:

- `[ ]` não iniciado
- `[~]` em andamento
- `[x]` concluído
- `[!]` bloqueado ou precisa de decisão

Regra operacional: uma tarefa só está concluída quando seu entregável existe, pode ser reproduzido por outra pessoa e atende aos critérios de aceite indicados.

## 2. Objetivo do projeto

Construir um protótipo que transforme detecções históricas de fogo do NASA FIRMS, provenientes de MODIS e VIIRS, em informações comparáveis e úteis para explorar:

1. onde e quando a atividade de fogo ocorreu;
2. como a sazonalidade varia por região;
3. quais períodos apresentam atividade anormal;
4. quando as condições indicam maior probabilidade de um período crítico.

### Escopo mínimo viável

- Uma região piloto e um período histórico claramente definidos.
- Dados MODIS e VIIRS harmonizados em uma unidade comum de análise.
- Uma aplicação navegável com mapa, linha do tempo e calendário regional.
- Uma análise de tendências e anomalias.
- Uma prova de conceito preditiva, com validação temporal e limitações explícitas.
- Documentação suficiente para reproduzir a demonstração.

### Fora do escopo inicial

- Cobertura global com desempenho de produção.
- Afirmações de causalidade ou previsão exata de incêndios individuais.
- Sistema oficial de alerta ou apoio a emergências.
- Substituição de validação científica ou operacional por órgãos competentes.

## 3. Decisões a fechar nas primeiras 60 minutos

- [ ] Escolher a região piloto: `________________________________`.
- [ ] Escolher o período histórico: `________________________________`.
- [ ] Definir a unidade territorial principal: bioma, município, grade regular ou outra.
- [ ] Definir o tamanho da grade espacial, se usada: `________________`.
- [ ] Definir a unidade temporal principal: dia, semana ou mês.
- [ ] Escolher apenas uma infraestrutura principal: local, Google Cloud ou Azure.
- [ ] Nomear uma pessoa responsável pela decisão final de escopo.
- [ ] Confirmar quais requisitos oficiais de submissão e avaliação se aplicam ao desafio escolhido.
- [ ] Confirmar acesso aos dados do NASA FIRMS e, se necessário, credenciais de API.
- [ ] Confirmar as condições atuais de cada Global Offer antes de ativá-la.

Critério de escolha da região piloto: deve ter atividade de fogo suficiente, dados disponíveis, relevância narrativa e tamanho que permita concluir o processamento dentro do hackathon.

## 4. Arquitetura resumida

```text
NASA FIRMS (MODIS + VIIRS)
          |
          v
Coleta, limpeza e rastreabilidade
          |
          v
Harmonização espaço-temporal + validação na sobreposição
          |
          +--------------------+
          |                    |
          v                    v
Calendário histórico     Dados ambientais/meteo
e visualizações          (opcional na PoC)
          |                    |
          +----------+---------+
                     v
          Anomalias + períodos críticos
                     |
                     v
       Aplicação, documentação e apresentação
```

## 5. Bloco 1 — Harmonização dos dados (meta: 6 horas)

### Objetivo

Criar um conjunto de dados comparável entre MODIS e VIIRS, preservando a origem de cada observação e evitando interpretar diferenças de sensor como mudanças reais na atividade de fogo.

### Tarefas

- [ ] Registrar região, período, produtos e data/hora de cada download.
- [ ] Baixar uma amostra real de MODIS e VIIRS pelo NASA FIRMS.
- [ ] Preservar arquivos brutos sem alteração.
- [ ] Criar um dicionário de dados com nomes, tipos, unidades e significado dos campos.
- [ ] Padronizar datas, horários, coordenadas, nomes de sensores e valores ausentes.
- [ ] Aplicar o mesmo recorte geográfico e temporal aos dois sensores.
- [ ] Definir filtros de qualidade/confiança e documentar a justificativa.
- [ ] Agregar observações em uma unidade comum de espaço e tempo.
- [ ] Comparar os sensores no período em que ambos possuem cobertura.
- [ ] Gerar relatório curto de validação e registrar limitações.
- [ ] Exportar um dataset harmonizado versionado.

### Método de comparação recomendado

1. Manter uma coluna `sensor_origem` e nunca apagar a proveniência.
2. Fazer a comparação principal em uma grade espacial e intervalo temporal comuns, em vez de exigir correspondência exata ponto a ponto.
3. No período de sobreposição, calcular por célula e intervalo:
   - número de detecções por sensor;
   - presença/ausência de atividade;
   - diferença e razão entre contagens, quando o denominador permitir;
   - correlação temporal por região;
   - concordância de ocorrência, com precisão, revocação e F1 quando apropriado.
4. Executar uma análise de sensibilidade com pelo menos duas resoluções espaciais ou temporais.
5. Tratar MODIS e VIIRS como instrumentos com capacidades diferentes. Não assumir que contagens brutas são diretamente equivalentes.

### Dependências

- Região e período piloto definidos.
- Acesso ao NASA FIRMS e aos produtos escolhidos.
- Limites geográficos da região/municípios/biomas, se usados.
- Ambiente de processamento reproduzível.
- Espaço para dados brutos e processados.

### Entregáveis

- `data/raw/`: arquivos originais com registro da fonte.
- `data/processed/`: dataset harmonizado em CSV, Parquet ou GeoParquet.
- Dicionário de dados.
- Script ou notebook reproduzível de coleta e transformação.
- Relatório de validação com gráficos e métricas de comparação.
- Registro das decisões de resolução, filtros e limitações.

### Critérios de aceite

- [ ] Outra pessoa consegue executar o pipeline usando as instruções do repositório.
- [ ] Toda linha processada mantém sensor, produto e referência temporal identificáveis.
- [ ] Coordenadas, datas, fuso horário e valores ausentes seguem um padrão documentado.
- [ ] O mesmo recorte é aplicado aos dois sensores.
- [ ] A validação usa somente o período de sobreposição adequado.
- [ ] Há pelo menos uma métrica de concordância, uma visualização comparativa e uma análise de sensibilidade.
- [ ] O documento explica que uma detecção ativa não equivale automaticamente a área queimada, número de incêndios ou impacto.
- [ ] O dataset é suficiente para alimentar o Bloco 2 sem processamento manual oculto.

## 6. Bloco 2 — Calendário histórico inteligente (protótipo: 8 horas)

### Objetivo

Permitir que uma pessoa explore a distribuição espacial e temporal da atividade de fogo, compare regiões e identifique padrões sazonais ou mudanças históricas.

### Tarefas

- [ ] Definir as perguntas principais da interface.
- [ ] Criar mapa com escala, legenda, fonte e período visíveis.
- [ ] Adicionar linha do tempo com seleção de intervalo.
- [ ] Criar calendário ou matriz de sazonalidade por região.
- [ ] Criar tendência por ano ou década, respeitando a cobertura dos sensores.
- [ ] Adicionar filtros por bioma e/ou município.
- [ ] Exibir estado vazio, carregamento e mensagem de erro.
- [ ] Mostrar metodologia resumida e limitações dentro da aplicação.
- [ ] Testar o fluxo completo com dados reais.

### Dependências

- Dataset harmonizado do Bloco 1.
- Geometrias e identificadores territoriais consistentes.
- Métrica principal definida: detecções, células ativas, taxa normalizada ou outra.
- Decisão sobre tecnologia de mapa e aplicação.

### Entregáveis

- Aplicação local ou publicada, navegável sem editar código.
- Mapa com linha do tempo sincronizada.
- Calendário regional de sazonalidade.
- Gráfico de tendência histórica.
- Filtro funcional por bioma e/ou município.
- Capturas de tela de reserva para apresentação.

### Critérios de aceite

- [ ] A seleção de região e período atualiza todas as visualizações relevantes.
- [ ] A interface identifica claramente sensor, período, unidade e fonte.
- [ ] O usuário consegue localizar o pico sazonal da região piloto em até dois minutos.
- [ ] Comparações entre décadas não ocultam mudanças de sensor ou cobertura.
- [ ] O mapa não sugere precisão espacial maior que a oferecida pelos dados.
- [ ] A demonstração principal funciona do início ao fim sem preparação manual.
- [ ] Existe um modo de contingência com dados locais e capturas de tela.

## 7. Bloco 3 — Análises avançadas e predição (PoC: 24 horas)

### Objetivo

Demonstrar, com rigor proporcional ao hackathon, detecção de anomalias regionais e estimativa de períodos críticos. O resultado é experimental e não deve ser apresentado como alerta operacional.

### 7.1 Detecção de anomalias

- [ ] Construir uma linha de base sazonal por região e unidade temporal.
- [ ] Comparar o valor observado com o histórico equivalente da mesma estação/período.
- [ ] Calcular uma medida interpretável, como escore-z robusto, percentil ou desvio da mediana.
- [ ] Definir limiar e registrar por que ele foi escolhido.
- [ ] Mostrar anomalias no mapa e/ou calendário.
- [ ] Revisar manualmente exemplos positivos e negativos.

### 7.2 Predição de períodos críticos

- [ ] Definir o alvo antes do treinamento, por exemplo: próxima semana acima do percentil 90 de atividade regional.
- [ ] Definir horizonte de previsão e unidade geográfica.
- [ ] Criar um baseline simples, como climatologia sazonal ou persistência.
- [ ] Construir variáveis somente com informações disponíveis até o momento da previsão.
- [ ] Integrar clima/ambiente apenas se houver tempo e cobertura adequados.
- [ ] Treinar um modelo simples e interpretável antes de testar modelos complexos.
- [ ] Separar treino, validação e teste por tempo, nunca aleatoriamente quando isso causar vazamento temporal.
- [ ] Comparar o modelo ao baseline.
- [ ] Exibir incerteza, limitações e uso pretendido.

Variáveis candidatas:

- histórico recente de atividade de fogo;
- sazonalidade e tendência;
- temperatura;
- precipitação acumulada;
- vento;
- umidade, se disponível e consistente;
- cobertura do solo ou vegetação, se obtida de fonte adequada.

### Dependências

- Bloco 1 aceito e estável.
- Definição inequívoca do alvo e do horizonte.
- Série histórica suficiente para treino e teste temporal.
- Dados meteorológicos/ambientais alinhados no espaço e no tempo, caso usados.
- Orçamento de consultas da API monitorado.

### Entregáveis

- Notebook ou script de anomalias.
- Notebook ou script de treinamento e avaliação.
- Baseline documentado.
- Modelo serializado ou resultados reproduzíveis.
- Tabela de métricas no conjunto de teste.
- Visualização de exemplos, erros e importância das variáveis.
- Cartão do modelo com uso pretendido, limitações e riscos.

### Critérios de aceite

- [ ] O alvo, região, horizonte e período de avaliação estão escritos em linguagem simples.
- [ ] A divisão de dados respeita a ordem temporal.
- [ ] O modelo é comparado a pelo menos um baseline.
- [ ] As métricas correspondem ao problema e incluem desempenho por classe/região quando aplicável.
- [ ] Não há uso de dados futuros nas variáveis de entrada.
- [ ] A demonstração inclui ao menos um acerto e um erro do modelo.
- [ ] O time consegue explicar por que o modelo pode falhar.
- [ ] A interface usa termos como “risco”, “probabilidade” ou “período crítico”, sem prometer a ocorrência exata de um incêndio.

### Validação científica recomendada

- Validar fora do período usado para criar regras e treinar o modelo.
- Comparar resultados por sensor, região e estação do ano.
- Avaliar sensibilidade à resolução e aos filtros de confiança.
- Verificar autocorrelação espacial e temporal antes de interpretar significância.
- Comparar com fontes independentes quando disponíveis, deixando claro quando não houver validação externa.
- Documentar vieses de cobertura, nuvens, resolução, horário de passagem e diferenças entre sensores.
- Buscar revisão de alguém com experiência em sensoriamento remoto, ciência do fogo ou gestão territorial antes de qualquer uso real.

## 8. Papéis sugeridos para 6 pessoas

Os papéis são principais, não exclusivos. Cada frente deve ter uma pessoa substituta para evitar ponto único de falha.

### Pessoa 1 — Coordenação, produto e submissão

- Controla escopo, decisões, tempo e riscos.
- Mantém o documento e o quadro de tarefas atualizados.
- Confirma requisitos oficiais, licenças, créditos e formulário de submissão.
- Organiza narrativa, roteiro e entrega final.

### Pessoa 2 — Dados FIRMS e rastreabilidade

- Baixa MODIS/VIIRS e preserva dados brutos.
- Mantém dicionário, metadados, licenças e fontes.
- Implementa limpeza e controles de qualidade.

### Pessoa 3 — Geoprocessamento e harmonização

- Define grade/agregação e comparação entre sensores.
- Executa validação no período de sobreposição.
- Gera dataset harmonizado e métricas.

### Pessoa 4 — Aplicação e visualização

- Constrói mapa, filtros, linha do tempo e calendário.
- Integra resultados analíticos.
- Prepara experiência de demonstração e modo offline.

### Pessoa 5 — Anomalias, estatística e validação

- Cria linha de base sazonal e detecção de anomalias.
- Revisa métricas, vieses e alegações científicas.
- Mantém o relatório de limitações.

### Pessoa 6 — Predição, infraestrutura e integração

- Integra Meteomatics ou outra fonte escolhida.
- Cria baseline, modelo e avaliação temporal.
- Cuida da execução, publicação e observabilidade básica.

### Duplas de apoio

- Pessoas 2 + 3: integridade e harmonização dos dados.
- Pessoas 4 + 6: integração da aplicação e publicação.
- Pessoas 1 + 5: narrativa, critérios de aceite e rigor científico.

## 9. Cronograma de 48 horas

As frentes devem trabalhar em paralelo. Os horários abaixo são relativos ao início do hackathon.

| Janela | Foco | Saída obrigatória |
|---|---|---|
| H0–H1 | Alinhamento e decisões | Região, período, escopo, papéis e requisitos pendentes registrados |
| H1–H3 | Coleta e esqueleto técnico | Amostras MODIS/VIIRS, estrutura do projeto e primeiro mapa vazio |
| H3–H6 | Harmonização | Dataset v0, comparação inicial e decisão de resolução |
| H6 | **Checkpoint 1** | Bloco 1 atende aos critérios mínimos ou escopo é reduzido |
| H6–H10 | Calendário + anomalias em paralelo | Mapa com dados, linha do tempo e baseline sazonal |
| H10–H14 | Protótipo navegável | Calendário, tendência e filtros integrados |
| H14 | **Checkpoint 2** | Demonstração do Bloco 2 sem editar código |
| H14–H20 | Preparação da PoC | Alvo, baseline, variáveis e divisão temporal definidos |
| H20–H28 | Modelagem e integração | Primeiro modelo avaliado; anomalias na aplicação |
| H28 | **Checkpoint 3** | Decisão de manter, simplificar ou remover a predição da demo principal |
| H28–H38 | Refinamento científico | Comparação com baseline, análise de erros e cartão do modelo |
| H38 | **Congelamento de funcionalidades** | Nenhuma função nova, salvo correção crítica |
| H38–H43 | Estabilização | Testes, desempenho, modo offline, fontes e documentação |
| H43–H46 | História e apresentação | Slides/roteiro, vídeo se exigido, ensaio cronometrado |
| H46–H47 | Revisão de entrega | Checklist oficial, links, permissões e créditos |
| H47–H48 | Margem de segurança | Envio, confirmação e cópia de todos os artefatos |

### Checkpoints de decisão

- **H6:** se a harmonização falhar, reduzir região/período; não avançar com dados sem proveniência.
- **H14:** se o protótipo não estiver navegável, congelar novas visualizações.
- **H28:** a predição só entra na narrativa principal se superar ou acrescentar valor claro ao baseline.
- **H38:** congelar funcionalidades e priorizar confiabilidade, documentação e ensaio.

## 10. Dependências entre blocos

| Origem | Destino | Contrato de passagem |
|---|---|---|
| Decisões iniciais | Bloco 1 | Região, período, unidade espacial e temporal definidos |
| Bloco 1 | Bloco 2 | Dataset versionado, dicionário e métricas estáveis |
| Bloco 1 | Bloco 3 | Série histórica sem vazamento, cobertura e limitações documentadas |
| Meteomatics/ambiente | Bloco 3 | Variáveis alinhadas, unidades verificadas e consultas reproduzíveis |
| Blocos 2 e 3 | Apresentação | URLs/artefatos estáveis, exemplos pré-selecionados e modo offline |

## 11. Fontes de dados e ferramentas

### Fonte principal: NASA FIRMS

- Portal: <https://firms.modaps.eosdis.nasa.gov/>
- Downloads: <https://firms.modaps.eosdis.nasa.gov/download/>
- API: <https://firms.modaps.eosdis.nasa.gov/api/>

Uso planejado: obter detecções de fogo ativo MODIS e VIIRS, mantendo produto, sensor, horário, confiança/qualidade e proveniência. Antes da submissão, conferir documentação, citação e termos do produto efetivamente utilizado.

### Dados ambientais complementares

- Microsoft Planetary Computer: <https://planetarycomputer.microsoft.com/>
- Catálogo: <https://planetarycomputer.microsoft.com/catalog>

Uso planejado: investigar cobertura do solo, vegetação e outros dados ambientais. Esses dados são complementares e não substituem a harmonização MODIS/VIIRS.

### Dados meteorológicos

- Meteomatics Weather API: <https://www.meteomatics.com/en/meteomatics-and-nasa-space-apps-challenge/>

Uso planejado: temperatura, precipitação, vento e outras variáveis relevantes para a PoC. Criar cache local permitido pelos termos e evitar consultas repetidas desnecessárias.

## 12. Global Offers — informações fornecidas pela equipe

> **Status:** os itens abaixo foram copiados pelo usuário da página de Global Offers 2026 na conversa de planejamento. Não foram verificados de forma independente neste documento. Condições, elegibilidade, disponibilidade regional, exigência de cartão e duração podem mudar. A Pessoa 1 deve reconfirmar tudo na página oficial e registrar data/hora antes da ativação.

Página informada: <https://www.spaceappschallenge.org/2026/global-offers/>

| Oferta informada | Condição copiada | Uso sugerido | Decisão |
|---|---|---|---|
| Microsoft Planetary Computer | Catálogo e API STAC públicos; maioria dos dados sem login; alguns pedidos podem exigir token | Dados ambientais complementares | Prioridade alta |
| Meteomatics Weather API | 1.000 consultas/dia durante o hackathon, conforme texto fornecido | Variáveis meteorológicas para a PoC | Prioridade alta; monitorar cota |
| Google Cloud | US$ 300 por 90 dias para novos clientes elegíveis; cadastro pode exigir cartão | Processamento, armazenamento ou publicação | Escolher somente se elegível |
| Microsoft Azure | US$ 200 por 30 dias para novos clientes elegíveis; verificação pode exigir telefone/cartão | Alternativa de infraestrutura | Não usar junto com GCP sem necessidade |
| GitHub Copilot Free | Até 2.000 sugestões/conclusões por mês e uso limitado de chat/agentes, conforme texto fornecido | Apoio ao desenvolvimento | Opcional |
| Microsoft Teams Free | Reuniões e colaboração dentro dos limites do plano informado | Comunicação do time | Opcional |
| Miro Business | Teste informado de 14 dias; pode exigir pagamento cadastrado | Quadro e arquitetura | Opcional; atenção ao cancelamento |
| Miro Templates | Templates de hackathon informados como gratuitos | Organização | Opcional |
| Domínio/hospedagem | Domínio não premium, hospedagem e SSL por um ano, conforme texto fornecido | Publicação e endereço do projeto | Baixa prioridade |

Links de ativação informados:

- Google Cloud: <https://cloud.google.com/free/docs/free-cloud-features#free-trial>
- Azure: <https://azure.microsoft.com/en-us/free/>
- GitHub Copilot: <https://github.com/features/copilot>
- Miro: <https://miro.com/>
- Templates Miro: <https://miro.com/templates/profile/nasa-space-apps-challenge/>
- Domínio/hospedagem: <https://www.spaceapps.earth/>

### Regra de infraestrutura

Escolher uma opção principal entre execução local, Google Cloud e Azure. O crédito promocional não é requisito técnico do projeto. Não consumir tempo ativando serviços que não resolvam um bloqueio concreto.

## 13. Requisitos oficiais versus planejamento da equipe

### Informações de planejamento já decididas pela equipe

- Projeto organizado em três blocos: harmonização, calendário histórico e análises/predição.
- Metas de 6 horas, 8 horas e 24 horas para os três blocos, respectivamente.
- Equipe de seis pessoas e janela total de 48 horas.
- NASA FIRMS como fonte principal para MODIS e VIIRS.
- Global Offers como recursos opcionais, não como dependências obrigatórias.

### Requisitos oficiais ainda não verificados

Até que a equipe consulte a página do desafio específico e o regulamento vigente, **não tratar nenhum dos itens abaixo como confirmado**:

- formato, campos e prazo exato de submissão;
- duração máxima e formato do vídeo ou apresentação;
- critérios e pesos de avaliação;
- obrigatoriedade de repositório público, demonstração ao vivo ou licença;
- regras sobre uso de IA, serviços de terceiros e dados externos;
- exigências de citação, atribuição e identidade visual;
- composição permitida da equipe e elegibilidade dos participantes;
- disponibilidade real e condições dos Global Offers.

Checklist de verificação oficial:

- [ ] Salvar link e nome exato do desafio escolhido.
- [ ] Copiar os requisitos e critérios oficiais para o repositório.
- [ ] Registrar prazo com fuso horário.
- [ ] Confirmar todos os campos e limites do formulário.
- [ ] Confirmar regras de licenciamento, atribuição e uso de IA.
- [ ] Confirmar formato e limite da mídia de apresentação.
- [ ] Revisar a submissão contra os critérios oficiais em H46.

## 14. Organização do repositório

```text
/
├── README.md
├── data/
│   ├── raw/                 # arquivos originais; não editar
│   ├── interim/             # resultados intermediários
│   └── processed/           # dataset harmonizado e versionado
├── docs/
│   ├── metodologia.md
│   ├── dicionario-dados.md
│   ├── fontes-e-licencas.md
│   └── cartao-modelo.md
├── notebooks/               # exploração e experimentos
├── src/                     # pipeline, análise e aplicação
├── tests/                   # testes de dados e funções críticas
├── artifacts/               # métricas, figuras e capturas de reserva
└── presentation/            # roteiro, slides e mídia final
```

Convenções mínimas:

- Dados brutos são imutáveis.
- Cada dataset processado recebe versão ou data de geração.
- Segredos e chaves nunca entram no repositório.
- Toda figura da apresentação informa fonte, período e unidade.
- Mudanças que afetam métricas exigem regeneração dos resultados.

## 15. Riscos e planos de contingência

| Risco | Sinal de alerta | Resposta |
|---|---|---|
| Download ou API indisponível | Falhas repetidas em H1–H2 | Usar amostra pré-baixada, registrar período e seguir offline |
| Diferença forte entre sensores | Razões instáveis ou baixa concordância | Mostrar sensores separadamente e limitar comparações agregadas |
| Escopo geográfico excessivo | Pipeline não conclui até H4 | Reduzir região e/ou período imediatamente |
| Cota Meteomatics | Consumo acelerado | Cachear respostas, limitar pontos/tempos e priorizar variáveis |
| Predição fraca | Não supera baseline em H28 | Transformar em análise exploratória; não fazer promessa preditiva |
| Aplicação instável | Falha de rede/publicação | Rodar localmente e usar vídeo/capturas de reserva |
| Falta de requisito oficial | Dúvida após H38 | Pessoa 1 verifica fonte oficial antes do congelamento final |
| Vazamento temporal | Métricas irreais | Refazer divisão cronológica e auditar variáveis |

## 16. Definição de pronto do projeto

- [ ] A demonstração responde a uma pergunta clara e relevante.
- [ ] O pipeline de dados é reproduzível e mantém proveniência.
- [ ] MODIS e VIIRS não são comparados ingenuamente como sensores idênticos.
- [ ] O mapa, calendário, tendências e filtros funcionam com dados reais.
- [ ] Anomalias usam uma linha de base sazonal documentada.
- [ ] A PoC preditiva, se apresentada, usa teste temporal e baseline.
- [ ] Limitações e incertezas aparecem na aplicação e na apresentação.
- [ ] Fontes, créditos e licenças estão registrados.
- [ ] Os requisitos oficiais foram verificados por uma pessoa e revisados por outra.
- [ ] Há demo offline, capturas e cópia dos artefatos finais.
- [ ] O time realizou ao menos dois ensaios cronometrados.
- [ ] A submissão foi enviada e sua confirmação foi salva antes de H48.

## 17. Roteiro sugerido para a apresentação

1. **Problema:** séries históricas de fogo vindas de sensores diferentes não devem ser comparadas sem cuidado.
2. **Método:** harmonizamos espaço, tempo, qualidade e proveniência, e validamos no período de sobreposição.
3. **Experiência:** mapa, linha do tempo, calendário regional e tendências tornam os padrões exploráveis.
4. **Inteligência:** anomalias destacam períodos fora do esperado; a PoC estima períodos críticos e é comparada a um baseline.
5. **Impacto:** a abordagem ajuda a formular perguntas melhores e priorizar análise, sem substituir alertas oficiais ou especialistas.
6. **Transparência:** mostramos incertezas, diferenças entre sensores, limitações e próximos passos de validação.

## 18. Registro rápido de decisões

| Data/hora | Decisão | Motivo | Responsável | Impacto |
|---|---|---|---|---|
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |

## 19. Quadro de status

| Frente | Responsável | Status | Próximo marco | Bloqueio |
|---|---|---|---|---|
| Coordenação/submissão |  | [ ] |  |  |
| Dados FIRMS |  | [ ] |  |  |
| Harmonização |  | [ ] |  |  |
| Aplicação/visualização |  | [ ] |  |  |
| Anomalias/validação |  | [ ] |  |  |
| Predição/infraestrutura |  | [ ] |  |  |

---

**Nota de responsabilidade:** este protótipo é exploratório. Detecções de fogo e estimativas de risco possuem incertezas e não devem ser usadas isoladamente para decisões de emergência, segurança pública ou alocação operacional de recursos.
