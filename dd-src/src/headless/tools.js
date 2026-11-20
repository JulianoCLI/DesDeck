'use strict';
/**
 * Ferramentas Headless (Fase 3)
 * 
 * Versão headless das 4 ferramentas:
 * - Auto Scan: escaneia corpos caídos
 * - Auto Refill: compra itens na loja
 * - Auto Hunt: troca para melhor hunt
 * - Vender Ovos: vende ovos periodicamente
 * 
 * Rodas no HeadlessClient, operando no estado do socket.
 */

class HeadlessTool {
  constructor(client, toolId, config) {
    this.client = client;
    this.toolId = toolId;
    this.config = config;
    this.running = false;
    this.loopTimer = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  loop() {
    if (!this.running) return;
    try {
      this.step();
    } catch (err) {
      console.error(`[tool ${this.toolId}] erro no step:`, err);
    }
    this.loopTimer = setTimeout(() => this.loop(), this.getInterval());
  }

  step() {
    // override
  }

  getInterval() {
    return 60000; // 1 min padrão
  }

  send(type, data) {
    if (!this.client || !this.client.connected) return false;
    return this.client.sendCommand(type, data);
  }

  log(...args) {
    console.log(`[${this.toolId}]`, ...args);
  }
}

// ---- Auto Scan: escaneia corpos caídos
class ToolScan extends HeadlessTool {
  constructor(client, config) {
    super(client, 'scan', config);
    this.corposTentados = new Set();
  }

  getInterval() {
    return Math.max(1000, (this.config.intervaloMs || 15000));
  }

  step() {
    if (!this.config.scanners || !this.config.scanners.length) return;
    if (this.config.__off) return;

    const st = this.client.state;
    if (!st) return;

    // Com VIP o jogo já faz; só sem VIP
    if (this.config.soSemVip && st.vip) return;

    // 'batalha' tem os corpos caídos
    // Roda quando há evento de morte
    // Neste headless, não temos 'campo' (cena), só sabemos por 'batalha'
    // Por isso o scan headless é mais limitado: só escaneia quando vem notificação

    // Placehold: em um client real, isso seria desencadeado por evento 'batalha'
  }

  onCorpoCaido(corpoId, scanner) {
    if (this.corposTentados.has(corpoId)) return; // já tentou
    this.corposTentados.add(corpoId);

    const scanner_pick = this.config.scanners?.[0] || 'scanner-basico';
    if (this.send('ball.throw', { corpo: corpoId, scanner: scanner_pick })) {
      this.log(`scaneou corpo ${corpoId}`);
    }

    // Limpa Set antigos para não crescer infinito
    if (this.corposTentados.size > 1000) {
      const arr = Array.from(this.corposTentados);
      this.corposTentados.clear();
      arr.slice(-500).forEach((id) => this.corposTentados.add(id));
    }
  }
}

// ---- Auto Refill: compra itens na loja
class ToolRefill extends HeadlessTool {
  constructor(client, config) {
    super(client, 'refill', config);
    this.ultimoCompra = 0;
  }

  getInterval() {
    return Math.max(5000, (this.config.intervaloSec || 15) * 1000);
  }

  step() {
    if (this.config.__off) return;
    if (!this.config.regras || !this.config.regras.length) return;

    const st = this.client.state;
    if (!st || !st.itens) return;

    const bits = st.bits || 0;
    const reserva = this.config.reservaBits || 0;

    // Confere cada regra
    for (const regra of this.config.regras) {
      const { item, min, max } = regra;
      if (!item) continue;

      const qtd = st.itens[item] || 0;

      // Se abaixo do mínimo e tem bits (menos reserva), compra
      if (qtd < min && bits > reserva) {
        const comprar = Math.min(max - qtd, Math.floor((bits - reserva) / 100)); // 100 bits por item (placeholder)
        if (comprar > 0) {
          if (this.send('market.comprar', { item, qtd: comprar })) {
            this.log(`comprou ${comprar}x ${item}`);
            this.ultimoCompra = Date.now();
            return; // uma por rodada
          }
        }
      }
    }
  }
}

// ---- Auto Hunt: troca para melhor hunt
class ToolHunt extends HeadlessTool {
  constructor(client, config) {
    super(client, 'hunt', config);
    this.ultimaTroca = 0;
    this.ilhas = {};
  }

  getInterval() {
    const st = this.client.state;
    // Na praça, confere mais rápido
    if (st && st.local === 'praca') return 30000;
    return Math.max(60000, (this.config.intervaloMin || 5) * 60000);
  }

  step() {
    if (this.config.__off) return;

    const st = this.client.state;
    if (!st) return;

    // Guardas: Labirinto, sem Digimon, travel lock, etc.
    if (st.local === 'lab') return; // Labirinto: não tocamos
    if (st.local !== 'hunt' && st.local !== 'praca') return; // Fora do mapa
    if (!st.ativoId) return; // Sem Digimon
    if (st.travaSaidaAte && st.travaSaidaAte > Date.now()) return; // Travel lock
    if (Date.now() - this.ultimaTroca < 60000) return; // Respiro 1min

    // Pede lista de hunts
    // No headless, isso já veio em 'offline.cfg'
    // Neste stub, não temos; em produção seria via socket
    this.log('hunt: precisaria de offlineCfg para mudar (não implementado no stub)');
  }
}

// ---- Vender Ovos: vende periodicamente
class ToolEggs extends HeadlessTool {
  constructor(client, config) {
    super(client, 'eggs', config);
  }

  getInterval() {
    return Math.max(60000, (this.config.intervaloMin || 10) * 60000);
  }

  step() {
    if (this.config.__off) return;

    const st = this.client.state;
    if (!st || !st.ovos || !Array.isArray(st.ovos)) return;
    if (!st.ovos.length) return;

    const tiers = this.config.tiers || ['D', 'C', 'B', 'A'];
    const potencias = this.config.potencias || [1, 2, 3];
    const { shiny, comEnergia, protegido, semTier } = this.config;

    // Filtra ovos a vender
    const paraVender = st.ovos.filter((ovo) => {
      if (!ovo) return false;
      if (ovo.travado) return false; // Travados nunca
      if (protegido && ovo.protegido) return false; // Protegidos
      if (!semTier && ovo.tier && !tiers.includes(ovo.tier)) return false;
      if (!shiny && ovo.shiny) return false;
      if (!comEnergia && ovo.energia) return false;
      if (potencias.length && !potencias.includes(ovo.potencia)) return false;
      return true;
    });

    if (paraVender.length) {
      const ids = paraVender.map((o) => o.id);
      if (this.send('ovo.vender', { ids })) {
        this.log(`vendeu ${ids.length} ovos`);
      }
    }
  }
}

// Factory
function createHeadlessTool(client, toolId, config) {
  if (!config) return null;

  switch (toolId) {
    case 'scan':
      return new ToolScan(client, config);
    case 'refill':
      return new ToolRefill(client, config);
    case 'hunt':
      return new ToolHunt(client, config);
    case 'eggs':
      return new ToolEggs(client, config);
    default:
      return null;
  }
}

module.exports = { HeadlessTool, ToolScan, ToolRefill, ToolHunt, ToolEggs, createHeadlessTool };
