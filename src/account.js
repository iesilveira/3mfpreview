const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderInitialSetup(_appShell,_api,_onCreated){
  window.location.replace('/install');
}
export async function openAccount(api,onChanged){
  if(document.querySelector('#account-dialog'))return;
  const modal=document.createElement('div'),previous=document.activeElement;
  modal.className='modal-backdrop';modal.id='account-dialog';
  modal.innerHTML=`<section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="account-title">
    <div class="modal-head"><h2 id="account-title">Minha conta</h2><button type="button" class="icon-button" data-close aria-label="Fechar">×</button></div>
    <p>Alterar seus dados encerra todas as sessões da conta.</p><form class="stack">
    <label>E-mail<input type="email" name="email" maxlength="254" required autocomplete="username" /></label>
    <label>Senha atual<input type="password" name="currentPassword" required maxlength="1024" autocomplete="current-password" /></label>
    <label>Nova senha (opcional)<input type="password" name="newPassword" minlength="12" maxlength="1024" autocomplete="new-password" /></label>
    <label>Confirme a nova senha<input type="password" name="confirm" maxlength="1024" autocomplete="new-password" /></label>
    <div class="notice error hidden" role="alert"></div><div class="modal-actions"><button class="button secondary" type="button" data-close>Cancelar</button><button class="button primary" type="submit">Salvar e sair</button></div>
    </form></section>`;
  let busy=true;
  const close=()=>{if(busy)return;document.removeEventListener('keydown',keyboard);modal.remove();previous?.focus();};
  function keyboard(event){
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      const nodes=[...modal.querySelectorAll('button,input')].filter(e=>!e.disabled),first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }
  document.body.append(modal);document.addEventListener('keydown',keyboard);
  modal.querySelectorAll('[data-close]').forEach(button=>button.onclick=close);
  const form=modal.querySelector('form'),box=modal.querySelector('[role=alert]'),buttons=[...modal.querySelectorAll('button')];
  try{const account=await api('/api/admin/account');form.elements.email.value=account.email;}
  catch(error){busy=false;close();if(error.status===401)onChanged();else alert(error.message);return;}
  busy=false;form.elements.email.focus();
  form.onsubmit=async event=>{
    event.preventDefault();const data=new FormData(form);
    if(data.get('newPassword')!==data.get('confirm')){box.textContent='As novas senhas não coincidem.';box.classList.remove('hidden');return;}
    busy=true;buttons.forEach(b=>b.disabled=true);box.classList.add('hidden');
    try{
      await api('/api/admin/account',{method:'PATCH',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:data.get('email'),currentPassword:data.get('currentPassword'),newPassword:data.get('newPassword')})});
      form.reset();busy=false;close();onChanged();
    }catch(error){box.textContent=error.message;box.classList.remove('hidden');}
    finally{busy=false;buttons.forEach(b=>b.disabled=false);}
  };
}
