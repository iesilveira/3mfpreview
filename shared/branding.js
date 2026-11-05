export const DEFAULT_BRANDING = Object.freeze({
  primaryColor: '#0572cf', secondaryColor: '#e62526',
  logoUrl: '', faviconUrl: '', logoAlt: 'Logo',
  browserTitle: 'Aprovação 3D', headerText: '',
  adminCaption: 'PAINEL DE APROVAÇÕES', reviewCaption: 'REVISÃO DE MODELO',
  loginCaption: 'ACESSO ADMINISTRATIVO',
  settingsLabel: 'Personalização', logoutLabel: 'Sair',
  footerLeft: '', footerRight: 'Pré-visualização para validação do modelo'
});
export const ASSET_PATTERN = /^\/api\/branding-assets\/[a-f0-9-]{36}\.(png|jpg|webp|ico)$/;
export function validateBranding(input, current = DEFAULT_BRANDING) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Configuração inválida.');
  const result = { ...DEFAULT_BRANDING, ...current };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(DEFAULT_BRANDING, key)) throw new Error(`Campo desconhecido: ${key}`);
    if (typeof value !== 'string') throw new Error(`Valor inválido: ${key}`);
    const clean = value.trim();
    if (key.endsWith('Color')) {
      if (!/^#[0-9a-f]{6}$/i.test(clean)) throw new Error('Use cores no formato #RRGGBB.');
      result[key] = clean.toLowerCase();
    } else if (key.endsWith('Url')) {
      if (clean && !ASSET_PATTERN.test(clean)) throw new Error('Arquivo de identidade inválido.');
      result[key] = clean;
    } else {
      if (clean.length > 240) throw new Error(`Texto muito longo: ${key} (máximo 240).`);
      result[key] = clean;
    }
  }
  return result;
}
