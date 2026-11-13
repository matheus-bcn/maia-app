// M.A.I.A — app na nuvem. Login (Supabase Auth), estado ao vivo dos agentes (tabela maia_estado, via Realtime) e
// comandos para o PC dos agentes (tabela maia_comandos: o PC executa e responde). Os dados só aparecem com login: as
// regras do banco (RLS) mostram a cada conta só o que é dela.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://afonvwhjagsszmitmqdc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zoN7zrwIdJ1eLufUCOcmgg_rc3qZYlu';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const $app = document.getElementById('app');
const S = {
  user: null,
  runners: [],
  runner: null,
  estado: null,
  atualizado: 0,
  andar: localGet('maia.andar') || '',
  aba: 'equipe',
  drafts: {},
  aberto: {},
  aprov: null,
  saude: null,
  aviso: '',
  canal: null,
  ultimosAvisos: new Set(),
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

function localGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function localSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* sem storage */ }
}

// ---------------------------------------------------------------- DOM

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const hm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dia = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const cor = (s) => `hsl(${[...s].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360} 55% 45%)`;

function toast(msg, erro = false) {
  const t = h('div', { class: `toast${erro ? ' is-erro' : ''}`, text: msg });
  document.body.append(t);
  setTimeout(() => t.classList.add('is-on'), 10);
  setTimeout(() => { t.classList.remove('is-on'); setTimeout(() => t.remove(), 300); }, 3500);
}

// ---------------------------------------------------------------- login

async function telaLogin(modo = 'entrar', msg = '') {
  const email = h('input', { type: 'email', autocomplete: 'username', placeholder: 'seu@email.com', class: 'in' });
  const senha = h('input', { type: 'password', autocomplete: modo === 'criar' ? 'new-password' : 'current-password', placeholder: 'senha', class: 'in' });
  const status = h('p', { class: 'muted', text: msg });
  const go = h('button', { class: 'btn btn--pri', text: modo === 'criar' ? 'Criar conta' : 'Entrar' });
  const enviar = async () => {
    go.disabled = true;
    status.textContent = 'Aguarde…';
    const r = modo === 'criar' ? await sb.auth.signUp({ email: email.value.trim(), password: senha.value }) : await sb.auth.signInWithPassword({ email: email.value.trim(), password: senha.value });
    go.disabled = false;
    if (r.error) { status.textContent = traduz(r.error.message); return; }
    if (modo === 'criar' && !r.data.session) { telaLogin('entrar', 'Conta criada! Confirme pelo link que chegou no seu e-mail e depois entre.'); return; }
  };
  go.onclick = enviar;
  senha.onkeydown = (e) => e.key === 'Enter' && enviar();
  const esqueci = h('button', { class: 'link', text: 'Esqueci a senha', onclick: async () => {
    if (!email.value.trim()) { status.textContent = 'Digite o e-mail acima primeiro.'; return; }
    const r = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.href.split('#')[0] });
    status.textContent = r.error ? traduz(r.error.message) : 'Enviamos um link para trocar a senha no seu e-mail.';
  } });
  $app.className = 'login';
  $app.replaceChildren(
    h('div', { class: 'login__box' },
      h('img', { src: 'icons/logo-mark@4x.png', alt: '', class: 'login__logo' }),
      h('h1', { text: 'M.A.I.A' }),
      h('p', { class: 'muted', text: 'Seus agentes de qualquer lugar.' }),
      email, senha, go, status,
      h('div', { class: 'login__alt' },
        modo === 'criar' ? h('button', { class: 'link', text: 'Já tenho conta', onclick: () => telaLogin('entrar') }) : h('button', { class: 'link', text: 'Criar conta', onclick: () => telaLogin('criar') }),
        modo === 'entrar' ? esqueci : null),
    ),
  );
  email.focus();
}

function traduz(m) {
  if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/not confirmed/i.test(m)) return 'Confirme o e-mail pelo link que enviamos e tente de novo.';
  if (/at least 6/i.test(m)) return 'A senha precisa de pelo menos 6 caracteres.';
  if (/already registered/i.test(m)) return 'Esse e-mail já tem conta: use "Já tenho conta".';
  return m;
}

// ---------------------------------------------------------------- dados

async function carregarRunners() {
  const { data, error } = await sb.from('maia_runners').select('id,nome,visto_em').order('visto_em', { ascending: false });
  if (error) throw error;
  S.runners = data ?? [];
  const salvo = localGet('maia.runner');
  S.runner = S.runners.find((r) => r.id === salvo) ?? S.runners[0] ?? null;
}

async function carregarEstado() {
  if (!S.runner) return;
  const { data } = await sb.from('maia_estado').select('dados,atualizado_em').eq('runner_id', S.runner.id).maybeSingle();
  if (data) aplicarEstado(data);
  if (S.canal) sb.removeChannel(S.canal);
  S.canal = sb
    .channel(`estado-${S.runner.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'maia_estado', filter: `runner_id=eq.${S.runner.id}` }, (p) => p.new && aplicarEstado(p.new))
    .subscribe();
}

function aplicarEstado(row) {
  const antes = S.estado;
  S.estado = row.dados;
  S.atualizado = new Date(row.atualizado_em).getTime();
  if (!S.andar || !S.estado.empresas?.some((e) => e.id === S.andar)) S.andar = S.estado.atual || S.estado.empresas?.[0]?.id || '';
  avisos(antes, S.estado);
  render();
}

/** Notifica: novo pedido de aprovação e agente que terminou uma ordem. */
function avisos(antes, agora) {
  if (!antes) return;
  if ((agora.aprovacoes ?? 0) > (antes.aprovacoes ?? 0)) notificar('📝 Novo pedido de aprovação', 'Um agente quer enviar algo e precisa do seu OK.');
  for (const e of agora.empresas ?? []) {
    const ea = antes.empresas?.find((x) => x.id === e.id);
    for (const a of e.agentes ?? []) {
      const aa = ea?.agentes?.find((x) => x.id === a.id);
      if (aa?.running && !a.running && a.runs?.[0]?.origem !== 'rodada') notificar(a.runs?.[0]?.ok === false ? `⚠️ ${a.nome} não conseguiu` : `✅ ${a.nome} terminou`, (a.lastError || a.lastResult || '').slice(0, 140));
    }
  }
}

async function notificar(titulo, corpo) {
  toast(`${titulo}${corpo ? ` — ${corpo}` : ''}`);
  if (!('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(titulo, { body: corpo, icon: 'icons/icon-192.png' });
    else new Notification(titulo, { body: corpo, icon: 'icons/icon-192.png' });
  } catch { /* sem notificação */ }
}

/** Manda um comando para o PC e espera a resposta (até `seg` segundos). */
async function cmd(metodo, caminho, corpo = null, seg = 60) {
  if (!S.runner) throw new Error('nenhum PC ligado');
  const { data, error } = await sb.from('maia_comandos').insert({ runner_id: S.runner.id, metodo, caminho, corpo }).select('id').single();
  if (error) throw error;
  const fim = Date.now() + seg * 1000;
  while (Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 600));
    const { data: c } = await sb.from('maia_comandos').select('situacao,http,resposta').eq('id', data.id).single();
    if (c && c.situacao !== 'novo') {
      const r = c.resposta ?? {};
      if (c.situacao === 'erro' || r.ok === false) throw new Error(r.erro || r.error || `erro ${c.http}`);
      return r;
    }
  }
  throw new Error('o PC não respondeu (está ligado e com o M.A.I.A aberto?)');
}

const online = () => S.atualizado && Date.now() - S.atualizado < 150_000;
const andarAtual = () => S.estado?.empresas?.find((e) => e.id === S.andar) ?? S.estado?.empresas?.[0];
const qs = () => `?empresa=${encodeURIComponent(andarAtual()?.id ?? '')}`;

// ---------------------------------------------------------------- telas

function render() {
  if (!S.user) return;
  $app.className = 'main';
  if (!S.runner) {
    $app.replaceChildren(topo(), h('section', { class: 'vazio' },
      h('h2', { text: 'Ligue o PC dos agentes' }),
      h('p', { text: 'No computador onde o M.A.I.A roda, clique em ☁️ (barra de cima) e entre com este mesmo e-mail e senha. Depois volte aqui.' }),
      h('button', { class: 'btn', text: 'Já liguei, atualizar', onclick: () => iniciar() })));
    return;
  }
  const corpo = S.aba === 'equipe' ? telaEquipe() : S.aba === 'aprov' ? telaAprov() : telaSaude();
  $app.replaceChildren(topo(), abas(), corpo);
}

function topo() {
  const e = andarAtual();
  const sel = S.estado?.empresas?.length > 1
    ? h('select', { class: 'in in--sm', onchange: (ev) => { S.andar = ev.target.value; localSet('maia.andar', S.andar); render(); } },
        ...S.estado.empresas.map((x, i) => h('option', { value: x.id, text: `${i + 1}º · ${x.nome}`, ...(x.id === S.andar ? { selected: true } : {}) })))
    : h('strong', { text: e?.nome ?? 'M.A.I.A' });
  const pcs = S.runners.length > 1 ? h('select', { class: 'in in--sm', onchange: (ev) => { S.runner = S.runners.find((r) => r.id === ev.target.value); localSet('maia.runner', S.runner.id); S.estado = null; carregarEstado(); } },
    ...S.runners.map((r) => h('option', { value: r.id, text: r.nome, ...(r.id === S.runner?.id ? { selected: true } : {}) }))) : null;
  return h('header', { class: 'top' },
    h('img', { src: 'icons/logo-mark@4x.png', alt: '', class: 'top__logo' }),
    h('div', { class: 'top__mid' }, sel, h('span', { class: `dot ${online() ? 'is-on' : ''}`, text: online() ? `${S.runner?.nome ?? 'PC'} online` : 'PC offline' })),
    pcs,
    h('button', { class: 'icon', title: 'Sair', text: '⎋', onclick: async () => { await sb.auth.signOut(); } }),
  );
}

function abas() {
  const n = S.estado?.aprovacoes ?? 0;
  const sd = S.estado?.saude;
  const ab = (id, label) => h('button', { class: `aba${S.aba === id ? ' is-on' : ''}`, onclick: () => { S.aba = id; if (id === 'aprov') S.aprov = null; if (id === 'saude') S.saude = null; render(); } }, label);
  return h('nav', { class: 'abas' },
    ab('equipe', '👥 Equipe'),
    ab('aprov', h('span', {}, '📝 Aprovações', n ? h('b', { class: 'badge', text: String(n) }) : null)),
    ab('saude', h('span', {}, '🩺 Saúde', sd ? h('i', { class: `luz luz--${sd}` }) : null)));
}

function telaEquipe() {
  const e = andarAtual();
  if (!S.estado) return h('p', { class: 'muted pad', text: 'Esperando o PC mandar o estado da equipe…' });
  if (!e) return h('p', { class: 'muted pad', text: 'Nenhum escritório.' });
  const rod = h('label', { class: 'switch' },
    h('input', { type: 'checkbox', ...(e.rodadas ? { checked: true } : {}), onchange: async (ev) => {
      try { await cmd('POST', `/api/equipe/rodadas${qs()}`, { ligadas: ev.target.checked }); toast(ev.target.checked ? 'Rodadas ligadas' : 'Rodadas desligadas'); } catch (err) { toast(err.message, true); ev.target.checked = !ev.target.checked; }
    } }),
    h('span', { text: e.rodadas ? (e.emHorario ? 'Trabalhando sozinhos (no horário)' : 'Rodadas ligadas (fora do horário)') : 'Só trabalham quando você manda' }));
  return h('main', { class: 'lista' },
    !online() ? h('p', { class: 'alerta', text: '⚠️ O PC dos agentes não dá sinal há alguns minutos. As ordens ficam esperando até ele voltar.' }) : null,
    e.pendencias?.length ? h('p', { class: 'alerta', text: `Falta configurar: ${e.pendencias.join(', ')} (no PC: Configurar equipe).` }) : null,
    rod,
    ...(e.agentes ?? []).map((a) => cartao(e, a)));
}

function cartao(e, a) {
  const key = `${e.id}/${a.id}`;
  const status = a.running ? '⚙️ trabalhando' : a.queued ? `📨 ${a.queued} na fila` : 'livre';
  const box = h('textarea', { class: 'in', rows: 2, placeholder: `Ordem para ${a.nome}…`, value: S.drafts[key] ?? '', oninput: (ev) => (S.drafts[key] = ev.target.value) });
  const cont = h('input', { type: 'checkbox', checked: true });
  const enviar = h('button', { class: 'btn btn--pri', text: 'Enviar' });
  enviar.onclick = async () => {
    const texto = box.value.trim();
    if (!texto) return box.focus();
    enviar.disabled = true;
    try {
      await cmd('POST', `/api/equipe/${encodeURIComponent(a.id)}/ordem${qs()}`, { texto, continuar: a.podeContinuar && cont.checked });
      S.drafts[key] = '';
      toast(`Ordem enviada para ${a.nome}`);
    } catch (err) { toast(err.message, true); }
    enviar.disabled = false;
  };
  const parar = a.running || a.queued ? h('button', { class: 'btn', text: 'Parar', onclick: async () => {
    try { await cmd('POST', `/api/equipe/${encodeURIComponent(a.id)}/parar${qs()}`, {}); toast(`${a.nome} parado`); } catch (err) { toast(err.message, true); }
  } }) : null;
  const aberto = !!S.aberto[key];
  return h('article', { class: `card${a.running ? ' is-work' : ''}` },
    h('div', { class: 'card__head', onclick: () => { S.aberto[key] = !aberto; render(); } },
      h('span', { class: 'av', style: `background:${cor(a.nome)}`, text: a.nome.slice(0, 1) }),
      h('div', { class: 'card__tit' }, h('strong', { text: a.nome }), h('span', { class: 'muted', text: `${a.cargo} · ${status}` })),
      h('span', { class: 'muted', text: aberto ? '▲' : '▼' })),
    a.lastError ? h('p', { class: 'erro', text: a.lastError }) : null,
    aberto && a.lastResult ? h('pre', { class: 'res', text: a.lastResult }) : (a.lastResult ? h('p', { class: 'res-curto', text: a.lastResult.split('\n').find((l) => l.trim().length > 3)?.replace(/[*#`]/g, '').slice(0, 140) ?? '' }) : null),
    box,
    h('div', { class: 'row' },
      a.podeContinuar ? h('label', { class: 'chk' }, cont, ' continuar a conversa') : h('span', {}),
      h('span', { class: 'grow' }), parar, enviar),
    aberto && a.runs?.length ? h('ul', { class: 'hist' }, ...a.runs.map((r) => h('li', { class: r.ok ? '' : 'is-erro' }, h('time', { text: dia(r.at) }), ` ${r.origem === 'rodada' ? '⏱️' : r.origem === 'repasse' ? '🤝' : '📨'} ${r.de ? `de ${r.de}: ` : ''}${r.ordem}`))) : null,
  );
}

function telaAprov() {
  if (!S.aprov) {
    cmd('GET', '/api/equipe/aprovacoes').then((r) => { S.aprov = r; render(); }).catch((err) => { S.aprov = { erro: err.message, pendentes: [], decididas: [] }; render(); });
    return h('p', { class: 'muted pad', text: 'Buscando os pedidos no PC…' });
  }
  const p = S.aprov.pendentes ?? [];
  return h('main', { class: 'lista' },
    S.aprov.erro ? h('p', { class: 'alerta', text: S.aprov.erro }) : null,
    !p.length ? h('p', { class: 'muted pad', text: 'Nada esperando aprovação. 🎉' }) : null,
    ...p.map((a) => {
      const para = h('input', { class: 'in', value: a.para });
      const texto = h('textarea', { class: 'in', rows: Math.min(10, a.texto.split('\n').length + 2), value: a.texto });
      const ok = h('button', { class: 'btn btn--pri', text: 'Aprovar e enviar' });
      const no = h('button', { class: 'btn btn--perigo', text: 'Recusar' });
      ok.onclick = async () => {
        if (!confirm(`Enviar para ${para.value}?`)) return;
        ok.disabled = no.disabled = true;
        try { await cmd('POST', `/api/equipe/aprovacoes/aprovar?empresa=${encodeURIComponent(a.empresa)}`, { id: a.id, texto: texto.value, para: para.value }, 90); toast('Aprovado: enviando'); S.aprov = null; render(); } catch (err) { toast(err.message, true); ok.disabled = no.disabled = false; }
      };
      no.onclick = async () => {
        const motivo = prompt('Motivo da recusa (opcional — o agente aprende):', '');
        if (motivo === null) return;
        try { await cmd('POST', `/api/equipe/aprovacoes/recusar?empresa=${encodeURIComponent(a.empresa)}`, { id: a.id, motivo }); toast('Recusado'); S.aprov = null; render(); } catch (err) { toast(err.message, true); }
      };
      return h('article', { class: 'card' },
        h('div', { class: 'card__tit' }, h('strong', { text: `${a.agenteNome} · ${a.canal}` }), h('span', { class: 'muted', text: `${a.empresaNome} · ${dia(a.criadoEm)}` })),
        a.motivo ? h('p', { class: 'motivo', text: a.motivo }) : null,
        h('label', { class: 'lbl', text: 'Para' }), para,
        h('label', { class: 'lbl', text: 'Texto (pode editar)' }), texto,
        h('div', { class: 'row' }, h('span', { class: 'grow' }), no, ok));
    }),
    (S.aprov.decididas ?? []).length ? h('details', { class: 'card' }, h('summary', { text: 'Histórico' }),
      ...S.aprov.decididas.slice(0, 15).map((a) => h('p', { class: 'muted' }, `${dia(a.decididoEm ?? a.criadoEm)} · ${a.agenteNome} → ${a.para}: `, h('b', { text: a.situacao })))) : null);
}

function telaSaude() {
  if (!S.saude) {
    cmd('GET', '/api/equipe/saude?forcar=1', null, 90).then((r) => { S.saude = r; render(); }).catch((err) => { S.saude = { erro: err.message, itens: [] }; render(); });
    return h('p', { class: 'muted pad', text: 'Verificando o PC…' });
  }
  const luz = { ok: '🟢', atencao: '🟡', problema: '🔴', info: '⚪' };
  return h('main', { class: 'lista' },
    S.saude.erro ? h('p', { class: 'alerta', text: S.saude.erro }) : null,
    ...(S.saude.itens ?? []).map((i) => h('article', { class: `card saude saude--${i.nivel}` },
      h('strong', {}, `${luz[i.nivel] ?? ''} ${i.titulo}`), h('span', { text: i.detalhe }),
      i.comoResolver && i.nivel !== 'ok' ? h('span', { class: 'fix', text: `👉 ${i.comoResolver}` }) : null)),
    h('button', { class: 'btn', text: 'Verificar de novo', onclick: () => { S.saude = null; render(); } }),
    'Notification' in window && Notification.permission === 'default'
      ? h('button', { class: 'btn', text: '🔔 Ativar notificações neste aparelho', onclick: () => Notification.requestPermission().then(() => render()) }) : null);
}

// ---------------------------------------------------------------- início

async function iniciar() {
  try {
    await carregarRunners();
    await carregarEstado();
  } catch (err) {
    $app.replaceChildren(topo(), h('p', { class: 'alerta', text: `Não consegui falar com a nuvem: ${err.message}` }));
    return;
  }
  render();
}

setInterval(() => S.user && S.runner && render(), 30_000); // atualiza "online/offline"

sb.auth.onAuthStateChange((_ev, session) => {
  const antes = S.user?.id;
  S.user = session?.user ?? null;
  if (!S.user) { if (S.canal) sb.removeChannel(S.canal); S.estado = null; telaLogin(); return; }
  if (antes !== S.user.id) iniciar();
});
const { data } = await sb.auth.getSession();
if (!data.session) telaLogin();
