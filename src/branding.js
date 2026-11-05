import { DEFAULT_BRANDING, validateBranding } from '../shared/branding.js';
export let branding = { ...DEFAULT_BRANDING };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const components = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
const hex = values => '#' + values.map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
const textColor = color => {
  const rgb = components(color).map(v => {
    const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  });
  return .2126*rgb[0] + .7152*rgb[1] + .0722*rgb[2] > .179 ? '#111111' : '#ffffff';
};
export function applyBranding(input) {
  branding = validateBranding(input);
  const style = document.documentElement.style;
  const primary = branding.primaryColor, secondary = branding.secondaryColor;
  for (const [key, value] of Object.entries({
    '--primary':primary, '--secondary':secondary,
    '--primary-dark':hex(components(primary).map(v => v*.82)),
    '--primary-text':textColor(primary), '--secondary-text':textColor(secondary),
    '--accent-soft':primary+'14', '--secondary-soft':secondary+'14',
    '--green':primary, '--green-dark':hex(components(primary).map(v => v*.82)), '--pale':primary+'14'
  })) style.setProperty(key, value);
  document.title = branding.browserTitle || 'Aprovação 3D';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', primary);
  document.querySelectorAll('link[rel~="icon"]').forEach(link => link.remove());
  const icon = document.createElement('link');
  icon.rel = 'icon'; icon.href = branding.faviconUrl || 'data:,';
  document.head.append(icon);
}
export async function loadBranding() {
  const response = await fetch('/api/branding', { credentials:'same-origin', cache:'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar a identidade visual.');
  applyBranding(await response.json());
}
const textFields = [
  ['browserTitle','Título da aba do navegador'],
  ['logoAlt','Descrição acessível da logo'],
  ['headerText','Texto ao lado da logo (vazio para somente logo)'],
  ['adminCaption','Cabeçalho: legenda do painel'],
  ['reviewCaption','Cabeçalho: legenda da revisão do cliente'],
  ['loginCaption','Cabeçalho: legenda do login'],
  ['settingsLabel','Cabeçalho: texto do botão de personalização'],
  ['logoutLabel','Cabeçalho: texto do botão de saída'],
  ['footerLeft','Rodapé: texto esquerdo'], ['footerRight','Rodapé: texto direito']
];
export function openBrandingSettings(api, onSaved) {
  if (document.querySelector('#branding-dialog')) return;
  const previousFocus = document.activeElement;
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop'; modal.id = 'branding-dialog';
  modal.innerHTML = `<section class="modal-card branding-card" role="dialog" aria-modal="true" aria-labelledby="branding-title">
    <div class="modal-head"><h2 id="branding-title">Personalização</h2><button type="button" class="icon-button" data-close aria-label="Fechar">×</button></div>
    <p class="modal-intro">Identidade visual do painel, login e links de revisão. As alterações são salvas no servidor.</p>
    <form class="stack" id="branding-form">
      <fieldset class="branding-fields">
        <div class="form-grid">
          <label>Cor de destaque principal<input name="primaryColor" type="color" value="${escape(branding.primaryColor)}" /><input name="primaryHex" value="${escape(branding.primaryColor)}" pattern="#[0-9a-fA-F]{6}" maxlength="7" required aria-label="Código hexadecimal da cor principal" /></label>
          <label>Cor de destaque secundária<input name="secondaryColor" type="color" value="${escape(branding.secondaryColor)}" /><input name="secondaryHex" value="${escape(branding.secondaryColor)}" pattern="#[0-9a-fA-F]{6}" maxlength="7" required aria-label="Código hexadecimal da cor secundária" /></label>
        </div>
        ${textFields.map(([key,label]) => `<label>${label}<input name="${key}" maxlength="240" value="${escape(branding[key])}" /></label>`).join('')}
        <label>Logo — PNG, JPG ou WebP, até 2 MB<input name="logoFile" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        ${branding.logoUrl ? `<img class="branding-preview" src="${escape(branding.logoUrl)}" alt="Logo atual" />` : '<p class="fine-print">Sem logo: o cabeçalho mantém somente o espaço reservado.</p>'}
        <label class="checkbox-label"><input name="removeLogo" type="checkbox" /> Deixar sem logo</label>
        <label>Favicon — PNG ou ICO, até 2 MB<input name="faviconFile" type="file" accept=".png,.ico,image/png,image/x-icon,image/vnd.microsoft.icon" /></label>
        ${branding.faviconUrl ? `<img class="favicon-preview" src="${escape(branding.faviconUrl)}" alt="Favicon atual" />` : ''}
        <label class="checkbox-label"><input name="removeFavicon" type="checkbox" /> Deixar sem favicon</label>
      </fieldset>
      <div class="notice error hidden" id="branding-error" role="alert"></div>
      <div class="modal-actions"><button class="button secondary" type="button" data-close>Cancelar</button><button class="button primary" type="submit">Salvar personalização</button></div>
    </form>
  </section>`;
  document.body.append(modal);
  let busy = false;
  const close = () => {
    if (busy) return;
    document.removeEventListener('keydown', keyboard);
    modal.remove(); previousFocus?.focus();
  };
  function keyboard(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const focusables = [...modal.querySelectorAll('button,input,textarea,[tabindex]')].filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusables.length) return;
    const first=focusables[0], last=focusables[focusables.length-1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  modal.addEventListener('session-expired', () => {
    busy=false; close(); onSaved();
  });
  document.addEventListener('keydown', keyboard);
  modal.querySelectorAll('[data-close]').forEach(button => button.onclick = close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  const form = modal.querySelector('form');
  for (const prefix of ['primary','secondary']) {
    const color = form.elements[prefix+'Color'], code=form.elements[prefix+'Hex'];
    color.oninput = () => { code.value=color.value; };
    code.oninput = () => { if (/^#[a-f0-9]{6}$/i.test(code.value)) color.value=code.value; };
  }
  form.onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(form);
    const errorBox=modal.querySelector('#branding-error');
    const value = { ...branding };
    for (const [key] of textFields) value[key]=String(data.get(key) || '');
    value.primaryColor=String(data.get('primaryHex'));
    value.secondaryColor=String(data.get('secondaryHex'));
    try { validateBranding(value); } catch(error) {
      errorBox.textContent=error.message; errorBox.classList.remove('hidden'); return;
    }
    busy=true;
    const buttons=[...modal.querySelectorAll('button')];
    buttons.forEach(button => button.disabled=true);
    form.querySelector('fieldset').disabled=true;
    errorBox.classList.add('hidden');
    try {
      for (const kind of ['logo','favicon']) {
        if (data.get('remove'+kind[0].toUpperCase()+kind.slice(1))) { value[kind+'Url']=''; continue; }
        const file=data.get(kind+'File');
        if (file && file.size) {
          if (file.size > 2*1024*1024) throw new Error('Imagem acima do limite de 2 MB.');
          const upload=new FormData(); upload.append('kind',kind); upload.append('asset',file);
          const result=await api('/api/admin/branding/assets',{method:'POST',body:upload});
          value[kind+'Url']=result.url;
        }
      }
      const saved=await api('/api/admin/branding',{
        method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)
      });
      applyBranding(saved); busy=false; close(); onSaved();
    } catch(error) { errorBox.textContent=error.message; errorBox.classList.remove('hidden'); }
    finally {
      busy=false; buttons.forEach(button => button.disabled=false);
      form.querySelector('fieldset').disabled=false;
    }
  };
  modal.querySelector('input')?.focus();
}
