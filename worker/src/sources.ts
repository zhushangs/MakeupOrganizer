/**
 * Where product pictures should come from first: the brand's own site, the big beauty retailers,
 * department stores and Temptalia (swatches). Used to restrict the first image search to these sites
 * and to sort results so the best sources come first.
 */

/** Brand → official site. Keys are normalized (lowercase, no accents/spaces/punctuation), see normBrand. */
const BRAND_SITES: Record<string, string> = {
  mac: 'maccosmetics.com', maccosmetics: 'maccosmetics.com',
  nars: 'narscosmetics.com', narscosmetics: 'narscosmetics.com',
  makeupforever: 'makeupforever.com',
  natashadenona: 'natashadenona.com',
  ysl: 'yslbeautyus.com', yslbeauty: 'yslbeautyus.com', yvessaintlaurent: 'yslbeautyus.com', saintlaurent: 'yslbeautyus.com',
  charlottetilbury: 'charlottetilbury.com',
  chanel: 'chanel.com',
  hourglass: 'hourglasscosmetics.com',
  fentybeauty: 'fentybeauty.com', fenty: 'fentybeauty.com',
  tomford: 'tomfordbeauty.com', tomfordbeauty: 'tomfordbeauty.com',
  dior: 'dior.com', diorbeauty: 'dior.com',
  anastasiabeverlyhills: 'anastasiabeverlyhills.com', abh: 'anastasiabeverlyhills.com',
  benefit: 'benefitcosmetics.com', benefitcosmetics: 'benefitcosmetics.com',
  lauramercier: 'lauramercier.com',
  givenchy: 'givenchybeauty.com', givenchybeauty: 'givenchybeauty.com',
  colourpop: 'colourpop.com',
  shiseido: 'shiseido.com',
  viseart: 'viseart.com',
  lancome: 'lancome-usa.com',
  bobbibrown: 'bobbibrowncosmetics.com',
  clinique: 'clinique.com',
  esteelauder: 'esteelauder.com',
  itcosmetics: 'itcosmetics.com',
  hudabeauty: 'hudabeauty.com', huda: 'hudabeauty.com',
  tower28: 'tower28beauty.com',
  giorgioarmani: 'giorgioarmanibeauty-usa.com', armanibeauty: 'giorgioarmanibeauty-usa.com', armani: 'giorgioarmanibeauty-usa.com',
  guerlain: 'guerlain.com',
  patmcgrathlabs: 'patmcgrath.com', patmcgrath: 'patmcgrath.com',
  kyliecosmetics: 'kyliecosmetics.com',
  tarte: 'tartecosmetics.com',
  elf: 'elfcosmetics.com', elfcosmetics: 'elfcosmetics.com',
  danessamyricks: 'danessamyricksbeauty.com', danessamyricksbeauty: 'danessamyricksbeauty.com',
  rarebeauty: 'rarebeauty.com',
  urbandecay: 'urbandecay.com',
  burberry: 'burberry.com',
  kvdbeauty: 'kvdbeauty.com', kvd: 'kvdbeauty.com',
  gucci: 'gucci.com',
  canmake: 'canmake.com',
  physiciansformula: 'physiciansformula.com',
  nyx: 'nyxcosmetics.com', nyxprofessionalmakeup: 'nyxcosmetics.com',
  kevynaucoin: 'kevynaucoinbeauty.com',
  kiko: 'kikocosmetics.com', kikomilano: 'kikocosmetics.com',
  toofaced: 'toofaced.com',
  cledepeaubeaute: 'cledepeaubeaute.com', cledepeau: 'cledepeaubeaute.com',
  revlon: 'revlon.com',
  westmanatelier: 'westman-atelier.com',
  ilia: 'iliabeauty.com',
  jouer: 'jouercosmetics.com',
  nudestix: 'nudestix.com',
  pixi: 'pixibeauty.com',
  makeupbymario: 'makeupbymario.com',
  summerfridays: 'summerfridays.com',
  bareminerals: 'bareminerals.com',
  stila: 'stilacosmetics.com',
  kosas: 'kosas.com',
  laneige: 'laneige.com',
  buxom: 'buxomcosmetics.com',
  covergirl: 'covergirl.com',
  lamer: 'cremedelamer.com',
  dermablend: 'dermablend.com',
  burtsbees: 'burtsbees.com',
  loreal: 'lorealparisusa.com', lorealparis: 'lorealparisusa.com',
  thebalm: 'thebalm.com',
  kryolan: 'kryolan.com',
  zoeva: 'zoevacosmetics.com',
  becca: 'beccacosmetics.com',
  sephora: 'sephora.com', sephoracollection: 'sephora.com',
}

const RETAILERS: { site: string; label: string; rank: number }[] = [
  { site: 'sephora.com', label: 'Sephora', rank: 1 },
  { site: 'ulta.com', label: 'Ulta', rank: 1 },
  { site: 'nordstrom.com', label: 'Nordstrom', rank: 2 },
  { site: 'macys.com', label: "Macy's", rank: 2 },
  { site: 'bloomingdales.com', label: "Bloomingdale's", rank: 2 },
  { site: 'saksfifthavenue.com', label: 'Saks', rank: 2 },
  { site: 'neimanmarcus.com', label: 'Neiman Marcus', rank: 2 },
  { site: 'temptalia.com', label: 'Temptalia', rank: 3 },
]
/** rank for pictures from any other site */
export const OTHER_RANK = 4

export const normBrand = (b: string) =>
  b.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '')

export const brandSite = (brand?: string | null) => (brand ? BRAND_SITES[normBrand(brand)] : undefined)

/** The sites the first search is limited to */
export function preferredSites(brand?: string | null): string[] {
  const own = brandSite(brand)
  return [...(own ? [own] : []), ...RETAILERS.map(r => r.site)].filter((s, i, a) => a.indexOf(s) === i)
}

/** Google syntax: "query (site:a.com OR site:b.com)" (subdomains like us.laneige.com match too) */
export const restrictToSites = (query: string, sites: string[]) =>
  `${query} (${sites.map(s => 'site:' + s).join(' OR ')})`

function hostOf(url?: string | null): string {
  try { return url ? new URL(url).hostname.toLowerCase() : '' } catch { return '' }
}
const onSite = (host: string, site: string) => host === site || host.endsWith('.' + site)

/** How good a picture's source is (lower is better) and a short label for it */
export function rankSource(pageUrl: string | null | undefined, imageUrl: string, brand?: string | null): { rank: number; label: string | null } {
  const host = hostOf(pageUrl) || hostOf(imageUrl)
  const own = brandSite(brand)
  if (own && own !== 'sephora.com' && onSite(host, own)) return { rank: 0, label: 'Official' }
  const r = RETAILERS.find(x => onSite(host, x.site))
  if (r) return { rank: r.rank, label: r.label }
  return { rank: OTHER_RANK, label: null }
}
