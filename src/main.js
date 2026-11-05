import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import './style.css';

const app = document.querySelector('#app');
const isPublicReview = /^\/p\/[^/]+/.test(window.location.pathname);
const token = isPublicReview ? window.location.pathname.split('/')[2] : null;
let adminPassword = sessionStorage.getItem('forma-admin-password') || '';
let activeViewer = null;

const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const dateText = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
const statusLabel = status => ({ pending: 'Aguardando', approved: 'Aprovado', changes_requested: 'Ajustes solicitados' }[status] || status);
const statusClass = status => ({ pending: 'pending', approved: 'approved', changes_requested: 'changes' }[status] || '');

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (adminPassword) headers['x-admin-password'] = adminPassword;
  const response = await fetch(url, { ...options, headers });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || 'Falha na solicitação.');
  return data;
}

function appShell(content) {
  app.innerHTML = `<div class="app-shell">
    <header class="topbar">
      <a class="brand" href="/"><span class="brand-mark">F</span><span>forma<span class="brand-dot">.</span></span></a>
      <span class="topbar-caption">${isPublicReview ? 'REVISÃO DE MODELO' : 'PAINEL DE APROVAÇÕES'}</span>
      ${isPublicReview ? '' : '<button class="link-button" id="logout">Sair</button>'}
    </header>${content}
    <footer class="footer"><span>FORMA STUDIO · APROVAÇÃO 3D</span><span>Pré-visualização para validação do modelo</span></footer>
  </div>`;
  document.querySelector('#logout')?.addEventListener('click', () => {
    sessionStorage.removeItem('forma-admin-password');
    adminPassword = '';
    renderAdmin();
  });
}

function renderLogin(message = '') {
  appShell(`<main class="login-wrap">
    <div class="login-card">
      <div class="eyebrow">ÁREA DA EQUIPE</div>
      <h1>Entre no seu painel</h1>
      <p>Gerencie modelos enviados para aprovação.</p>
      <form id="login-form" class="stack">
        <label>Senha administrativa<input type="password" name="password" autocomplete="current-password" required placeholder="Sua senha" /></label>
        ${message ? `<div class="notice error">${esc(message)}</div>` : ''}
        <button class="button primary" type="submit">Acessar painel <span>→</span></button>
      </form>
      <div class="fine-print">Configure <code>ADMIN_PASSWORD</code> no servidor antes de publicar.</div>
    </div>
  </main>`);
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    adminPassword = new FormData(event.currentTarget).get('password');
    try {
      await api('/api/admin/projects');
      sessionStorage.setItem('forma-admin-password', adminPassword);
      renderAdmin();
    } catch (error) {
      adminPassword = '';
      renderLogin(error.message);
    }
  });
}

function renderAdmin() {
  if (!adminPassword) return renderLogin();
  appShell(`<main class="dashboard">
    <section class="welcome-row">
      <div><div class="eyebrow">VISÃO GERAL</div><h1>Projetos para aprovar</h1><p>Envie um modelo e compartilhe um link privado com seu cliente.</p></div>
      <button class="button primary" id="new-project">＋ Novo modelo</button>
    </section>
    <section class="stats" id="stats"></section>
    <section class="content-card">
      <div class="section-heading"><div><h2>Seus projetos</h2><p>Histórico de modelos enviados para revisão</p></div><span class="count" id="count"></span></div>
      <div id="project-list" class="project-list"><div class="loading">Carregando projetos…</div></div>
    </section>
    <div class="modal-backdrop hidden" id="modal">
      <section class="modal-card">
        <div class="modal-head"><div><div class="eyebrow">NOVO ENVIO</div><h2>Preparar revisão</h2></div><button class="icon-button" id="close-modal" aria-label="Fechar">×</button></div>
        <p class="modal-intro">O cliente receberá um link para visualizar o 3D e aprovar ou pedir alterações.</p>
        <form id="upload-form" class="stack">
          <label>Nome do serviço ou peça *<input name="name" required maxlength="120" placeholder="Ex.: Suporte personalizado" /></label>
          <div class="form-grid">
            <label>Nome do cliente<input name="clientName" maxlength="120" placeholder="Nome" /></label>
            <label>E-mail do cliente<input name="clientEmail" type="email" maxlength="180" placeholder="email@exemplo.com" /></label>
          </div>
          <label>Observação para o cliente<textarea name="note" rows="3" maxlength="1200" placeholder="Contexto, acabamento ou detalhes importantes…"></textarea></label>
          <label class="file-drop" id="file-drop"><input type="file" name="model" accept=".3mf,model/3mf" required />
            <span class="file-icon">↥</span><strong>Escolha um arquivo .3mf</strong><span class="file-name">Até 100 MB · cores dependem dos dados do arquivo</span>
          </label>
          <div id="upload-error" class="notice error hidden"></div>
          <div class="modal-actions"><button type="button" class="button secondary" id="cancel-modal">Cancelar</button><button class="button primary" type="submit">Enviar para revisão <span>→</span></button></div>
        </form>
      </section>
    </div>
  </main>`);
  document.querySelector('#new-project').onclick = () => document.querySelector('#modal').classList.remove('hidden');
  document.querySelector('#close-modal').onclick = closeModal;
  document.querySelector('#cancel-modal').onclick = closeModal;
  document.querySelector('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.querySelector('input[type=file]').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) document.querySelector('.file-name').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  });
  document.querySelector('#upload-form').addEventListener('submit', submitUpload);
  loadProjects();
}
function closeModal() { document.querySelector('#modal')?.classList.add('hidden'); }

async function loadProjects() {
  const list = document.querySelector('#project-list');
  try {
    const projects = await api('/api/admin/projects');
    const pending = projects.filter(p => p.status === 'pending').length;
    const approved = projects.filter(p => p.status === 'approved').length;
    document.querySelector('#stats').innerHTML = `
      <div class="stat-card"><span class="stat-label">TOTAL DE PROJETOS</span><strong>${projects.length}</strong><span class="stat-hint">no seu painel</span></div>
      <div class="stat-card"><span class="stat-label">AGUARDANDO</span><strong>${pending}</strong><span class="stat-hint">precisam de retorno</span></div>
      <div class="stat-card"><span class="stat-label">APROVADOS</span><strong>${approved}</strong><span class="stat-hint">liberados pelo cliente</span></div>`;
    document.querySelector('#count').textContent = `${projects.length} ${projects.length === 1 ? 'projeto' : 'projetos'}`;
    if (!projects.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-cube">◇</div><h3>Nenhum modelo enviado ainda</h3><p>Envie seu primeiro arquivo 3MF para iniciar uma aprovação.</p><button class="button secondary" onclick="document.querySelector('#new-project').click()">Criar primeiro envio</button></div>`;
      return;
    }
    list.innerHTML = projects.map(p => `
      <article class="project-row">
        <div class="file-badge">3MF</div>
        <div class="project-info"><strong>${esc(p.name)}</strong><span>${esc(p.clientName || 'Cliente não informado')} · ${dateText(p.createdAt)}</span></div>
        <span class="status-pill ${statusClass(p.status)}"><i></i>${statusLabel(p.status)}</span>
        <div class="row-actions"><button class="button small secondary copy-link" data-token="${esc(p.token)}">Copiar link</button><a class="button small ghost" href="/p/${encodeURIComponent(p.token)}" target="_blank" rel="noopener">Abrir ↗</a></div>
      </article>${p.decisionComment ? `<div class="decision-note"><b>Retorno:</b> ${esc(p.decisionComment)}</div>` : ''}`).join('');
    document.querySelectorAll('.copy-link').forEach(btn => btn.onclick = async () => {
      const url = `${location.origin}/p/${btn.dataset.token}`;
      try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copiado ✓'; }
      catch { window.prompt('Copie o link de revisão:', url); }
      setTimeout(() => { btn.textContent = 'Copiar link'; }, 1800);
    });
  } catch (error) {
    list.innerHTML = `<div class="notice error">${esc(error.message)} <button class="text-button" id="retry">Tentar novamente</button></div>`;
    document.querySelector('#retry').onclick = loadProjects;
  }
}

async function submitUpload(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const button = form.querySelector('button[type=submit]');
  const errorBox = document.querySelector('#upload-error');
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Enviando…';
  errorBox.classList.add('hidden');
  try {
    await api('/api/admin/projects', { method: 'POST', body: data });
    closeModal();
    form.reset();
    document.querySelector('.file-name').textContent = 'Até 100 MB · cores dependem dos dados do arquivo';
    await loadProjects();
    const projects = await api('/api/admin/projects');
    const project = projects[0];
    if (project) {
      const url = `${location.origin}/p/${project.token}`;
      try { await navigator.clipboard.writeText(url); } catch {}
      alert('Modelo enviado! Link de revisão: ' + url);
    }
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Enviar para revisão <span>→</span>';
  }
}

function viewerMarkup(project, isLoading = true) {
  return `<div class="viewer-frame"><div class="viewer-top"><span class="viewer-label"><i></i> VISUALIZADOR 3D</span><span class="viewer-hint">Arraste para girar · scroll para zoom</span></div>
    <div class="viewer-canvas" id="viewer-canvas">${isLoading ? '<div class="viewer-loading"><span class="spinner dark"></span><span>Carregando modelo 3D…</span></div>' : ''}</div>
    <div class="dimensions-bar"><div class="dim-title"><span class="measure-icon">↔</span><div><strong>Dimensões do modelo</strong><small>Caixa delimitadora · mm</small></div></div><div class="dim-values"><span><small>X</small><b id="dim-x">—</b></span><span><small>Y</small><b id="dim-y">—</b></span><span><small>Z</small><b id="dim-z">—</b></span></div></div></div>`;
}

async function renderReview() {
  appShell(`<main class="review-page"><div class="review-loading"><span class="spinner dark"></span> Abrindo revisão segura…</div></main>`);
  try {
    const project = await api(`/api/reviews/${encodeURIComponent(token)}`);
    const final = ['approved', 'changes_requested'].includes(project.status);
    const resultBlock = final ? `<div class="result-banner ${project.status === 'approved' ? 'success' : 'warn'}"><span>${project.status === 'approved' ? '✓' : '↻'}</span><div><strong>${project.status === 'approved' ? 'Este modelo foi aprovado' : 'Ajustes foram solicitados'}</strong><small>Resposta registrada em ${dateText(project.decisionAt)}${project.decisionComment ? ` · ${esc(project.decisionComment)}` : ''}</small></div></div>` : '';
    appShell(`<main class="review-page">
      <div class="review-heading"><div class="eyebrow">REVISÃO DO PROJETO</div><h1>${esc(project.name)}</h1><p>Confira o modelo 3D, as cores e as dimensões antes de aprovar.</p></div>
      <div class="review-grid">
        <section class="model-column">${viewerMarkup(project)}
          <div class="model-meta"><span class="file-badge">3MF</span><div><strong>${esc(project.originalFileName)}</strong><small>Arquivo 3D · ${project.fileSize ? `${(project.fileSize / 1024 / 1024).toFixed(1)} MB` : ''}</small></div><span class="status-pill ${statusClass(project.status)}"><i></i>${statusLabel(project.status)}</span></div>
          ${project.note ? `<div class="note-card"><span class="note-icon">✳</span><div><strong>Observação do serviço</strong><p>${esc(project.note)}</p></div></div>` : ''}
          <div class="disclaimer">A visualização de cor é uma referência digital. O resultado físico pode variar conforme material, impressora e acabamento.</div>
        </section>
        <aside class="approval-column">
          <div class="approval-card">${resultBlock}
            <div class="approval-title"><div class="eyebrow">${final ? 'DECISÃO REGISTRADA' : 'SUA VALIDAÇÃO'}</div><h2>${final ? 'Obrigado pelo retorno.' : 'Está tudo certo?'}</h2><p>${final ? 'A equipe responsável foi informada da sua decisão.' : 'Sua aprovação libera o início do serviço. Se precisar, peça um ajuste.'}</p></div>
            ${!final ? `<form id="decision-form" class="stack">
              <label>Comentário <span class="optional">(opcional para aprovar)</span><textarea name="comment" rows="4" maxlength="1200" placeholder="Escreva detalhes ou ajustes desejados…"></textarea></label>
              <div id="decision-error" class="notice error hidden"></div>
              <button class="button primary full" type="button" id="approve">✓ Aprovar modelo</button>
              <button class="button secondary full" type="button" id="request-changes">Solicitar ajustes</button>
              <div class="secure-note">🔒 Sua decisão fica registrada neste link de revisão.</div>
            </form>` : ''}
          </div>
          <div class="client-card"><span class="client-avatar">${esc((project.clientName || 'C').slice(0,1).toUpperCase())}</span><div><small>PREPARADO PARA</small><strong>${esc(project.clientName || 'Cliente')}</strong></div></div>
          <div class="help-card"><strong>Precisa de ajuda?</strong><span>Entre em contato com quem enviou este modelo antes de aprovar.</span></div>
        </aside>
      </div>
    </main>`);
    initViewer(project.modelUrl);
    if (!final) {
      document.querySelector('#approve').onclick = () => submitDecision('approved');
      document.querySelector('#request-changes').onclick = () => submitDecision('changes_requested');
    }
  } catch (error) {
    appShell(`<main class="not-found"><div class="not-found-icon">?</div><h1>Revisão indisponível</h1><p>${esc(error.message)}</p><a class="button secondary" href="/">Voltar</a></main>`);
  }
}

async function submitDecision(status) {
  const form = document.querySelector('#decision-form');
  const comment = new FormData(form).get('comment') || '';
  const errorBox = document.querySelector('#decision-error');
  const button = document.querySelector(status === 'approved' ? '#approve' : '#request-changes');
  button.disabled = true;
  errorBox.classList.add('hidden');
  try {
    await api(`/api/reviews/${encodeURIComponent(token)}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, comment })
    });
    await renderReview();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('hidden');
    button.disabled = false;
  }
}

function initViewer(url) {
  const container = document.querySelector('#viewer-canvas');
  if (!container) return;
  if (activeViewer) activeViewer.dispose();
  let renderer, controls, resizeObserver;
  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#edf1f1');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100000);
    camera.position.set(180, 150, 180);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x69737b, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(120, 180, 100);
    scene.add(key);
    const grid = new THREE.GridHelper(200, 20, 0xb8c2c3, 0xd1d8d8);
    grid.position.y = -0.02;
    scene.add(grid);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    let model = null;
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    resizeObserver = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);
    activeViewer = { dispose: () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      controls?.dispose();
      renderer?.dispose();
      if (model) model.traverse(o => { o.geometry?.dispose?.(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.()); else o.material?.dispose?.(); });
    }};
    fetch(url).then(r => { if (!r.ok) throw new Error('Não foi possível abrir o arquivo.'); return r.arrayBuffer(); })
      .then(buffer => new ThreeMFLoader().parse(buffer))
      .then(object => {
        model = object;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        scene.add(model);
        const max = Math.max(size.x, size.y, size.z) || 1;
        const scale = 110 / max;
        camera.position.set(size.x * scale * 1.25, size.y * scale * 1.15, size.z * scale * 1.35);
        camera.near = Math.max(max * 0.001, 0.01);
        camera.far = Math.max(max * 100, 1000);
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.minDistance = max * 0.5;
        controls.maxDistance = max * 12;
        grid.scale.setScalar(Math.max(max / 200, 0.01));
        document.querySelector('#dim-x').textContent = `${size.x.toFixed(2)}`;
        document.querySelector('#dim-y').textContent = `${size.y.toFixed(2)}`;
        document.querySelector('#dim-z').textContent = `${size.z.toFixed(2)}`;
      })
      .catch(error => {
        container.innerHTML = `<div class="viewer-error"><span>!</span><strong>Não foi possível exibir este 3MF</strong><small>${esc(error.message)}. Tente exportar novamente no seu fatiador.</small></div>`;
      });
  } catch (error) {
    container.innerHTML = `<div class="viewer-error"><span>!</span><strong>Este navegador não conseguiu iniciar o visualizador 3D.</strong><small>${esc(error.message)}</small></div>`;
  }
}

if (isPublicReview) renderReview();
else renderAdmin();
