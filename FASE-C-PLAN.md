# 📋 Fase C: Prova de Conceito Real com Servidor DigiIdle

**Data:** 24 de Novembro de 2026  
**Status:** 🔄 Planejamento  
**Escopo:** 1 conta prova → 10 contas (escalonado)  
**Critério de Sucesso:** Contas totalmente funcionais (login pós-criação)

---

## 🎯 Objetivo

Validar que o sistema de cadastro em lote com proxies funciona **de verdade** contra o servidor DigiIdle:
1. Prova de que cria a conta
2. Prova de que o nick foi definido
3. Prova de que o starter foi escolhido
4. Prova de que é possível fazer login após criação (conta totalmente funcional)

---

## 📊 Estratégia de teste (escalonada)

### Fase C.1: Validar infra de proxy
**Duração:** ~5 min  
**Objetivo:** Garantir que o proxy funciona antes de gastar um account criado

**Passos:**
1. Abrir DesDeck
2. Ir para aba "Cadastro"
3. Abrir modal "Proxies"
4. Colar o proxy Webshare (1 proxy)
5. Clicar "Testar"
6. ✅ **Esperado:** IP de saída diferente do real (prova de que proxy funciona)

**Se falhar:** Debug `proxy:test` antes de continuar

---

### Fase C.2: Teste de 1 conta prova
**Duração:** ~2 min (criação + verificação)  
**Objetivo:** Validar fluxo completo com servidor real, antes de lote

**Configuração:**
- Base: `teste`
- Preset: `numeros`
- Senha: `Teste1234!` (válida, 12 chars)
- Proxy: seu Webshare (1 proxy para 1 tela)
- Starter: Guilmon (fixo, para reproduzibilidade)

**Passos:**
1. Preencher form com dados acima
2. Clicar "Iniciar Lote" (será 1 conta)
3. Monitorar log
4. Aguardar status "confirmada"

**Verificação pós-criação:**
1. Ir para aba de contas normais (webview)
2. Tentar fazer login com `teste1@gmail.com` / `Teste1234!`
3. ✅ **Esperado:** Login bem-sucedido, conta totalmente funcional

**Se falhar em algum ponto:**
- Log do agente dirá qual etapa falhou (criar, nick, starter, verificar)
- Usar console do DevTools (F12) para debug
- Verificar que proxy está sendo aplicado na partição

---

### Fase C.3: Escalar para 10 contas
**Duração:** ~1 min (criação) + 5 min (verificação login)  
**Objetivo:** Validar que sistema funciona em batch e ritmo está OK

**Configuração:**
- Base: `prova`
- Preset: `numeros`
- Senha: `Prova1234!`
- Proxys: 3 Webshare (1 por tela de 4 contas, bloco de 4)
  - Tela 1 (contas 0–3): proxy1
  - Tela 2 (contas 4–7): proxy2
  - Tela 3 (contas 8–9): proxy3
- Starter: Renamon (fixo, diferente da prova anterior)

**Passos:**
1. Preencher form com 3 proxies
2. Testar os 3 proxies antes de iniciar
3. Clicar "Iniciar Lote"
4. Monitorar progresso (deve chegar a 10/10)
5. Aguardar relatório final

**Verificação pós-criação (amostragem):**
1. Testar login: `prova1@gmail.com` (tela 1, proxy1)
2. Testar login: `prova5@gmail.com` (tela 2, proxy2)
3. Testar login: `prova9@gmail.com` (tela 3, proxy3)
4. ✅ **Esperado:** Todos os 3 logins funcionam (prova de que proxies foram aplicados corretamente)

**Métricas:**
- Tempo total (criação + verificação): < 1 min
- Taxa de sucesso: 100% (10/10)
- Sem erros de proxy (sem "proxy não aplicado")

---

## 🔍 O que monitorar

### Durante a criação
- **Log do agente** → etapa ativa, tentativas, timeouts
- **Console DevTools** → erros de HTTP, WS, proxy
- **Network tab** → requisições saindo pelo proxy (IP diferente)

### Após conclusão
- **Relatório de lote**:
  ```
  Tamanho: 10
  Confirmadas: 10 ✅
  Falhadas: 0
  Taxa: 100%
  
  Conta #0: tela 1, prova1, confirmada
  Conta #1: tela 1, prova2, confirmada
  ...
  ```

- **Teste de login** (amostra):
  - Email: `prova1@gmail.com`, Senha: `Prova1234!`
  - Esperado: acesso imediato, conta totalmente funcional

---

## ✅ Critério de Sucesso para Fase C

| Teste | Esperado | Status |
|-------|----------|--------|
| **Proxy funciona** | IP de saída diferente | ⏳ |
| **1 conta prova** | Login bem-sucedido | ⏳ |
| **10 contas** | 10/10 confirmadas | ⏳ |
| **Proxys aplicados** | 3 logins amostra | ⏳ |
| **Relatório detalhado** | Email + nick + tela corretos | ⏳ |

**Resultado final:** ✅ Fase C Passou = Sistema está pronto para produção

---

## 🐛 Troubleshooting comum

### "Erro ao criar: HTTP 400 / 422"
→ Email/senha inválida ou repetida. Mudar base ou email manualmente.

### "Verificação falhou: sessão inválida"
→ Cookie não foi persistido. Aguardar ~2s entre criar e verificar (fluxo já faz isso).

### "Esta tela exige proxy e nenhum foi configurado"
→ Proxy não foi injetado no agente. Verificar que `fila` recebeu `proxys[]` corretamente.

### "Proxy não pôde ser aplicado na partição"
→ `proxyGuard.apply()` falhou. Validar que proxy:test passou antes de usar.

### "Timeout ao definir nick / escolher starter"
→ WS não respondeu ou mock não está configurado. Verificar que wsClient está injetado.

### "IP de saída = IP real (proxy não funcionou)"
→ Proxy:test retornou erro silenciosamente. Re-testar e verificar credenciais.

---

## 📝 Checklist pré-Fase C

- [ ] DesDeck compilado e rodando
- [ ] Proxy Webshare validado manualmente (IP diferente)
- [ ] DevTools console aberto (F12)
- [ ] Network tab monitorando requisições
- [ ] Conta Webshare com 3+ proxies disponíveis
- [ ] Senha forte anotada (cópia/cola)

---

## 🚀 Próximos passos após Fase C passar

1. **Fase D (opcional):** Dashboard de histórico de lotes
2. **Fase E (opcional):** Auto-rotate de proxies se um falhar
3. **Produção:** Usar sistema para criar accounts em batches reais

---

**Data de início:** Quando estiver pronto  
**Tempo estimado:** 10–15 min (C.1 + C.2 + C.3)  
**Dependências:** Proxy Webshare funcional

